import greatCircle from "@turf/great-circle";
import { point } from "@turf/helpers";
import type { DayPlan } from "@/lib/aiPlan.functions";
import {
  detectIslandAccessTransition,
  type IslandAirportAccessDef,
} from "@/lib/islandAirportTransfers";
import { HTTP_API_TIMEOUT_MS, withTimeout } from "@/lib/asyncTimeout";

/** Max distance (km) for Mapbox driving — beyond this, default to flight arc unless explicit road trip. */
const MAX_DRIVING_SEGMENT_KM = 900;

export type RouteMode = "driving" | "flight" | "ferry" | "transit";

export type TripRouteSegment = {
  id: string;
  mode: RouteMode;
  from: [number, number];
  to: [number, number];
  coordinates: [number, number][];
  dayTo: number;
  /** Travel time in seconds (Directions API or estimate). */
  durationSeconds: number;
  /** Human label e.g. "2h 38m". */
  durationLabel: string;
};

export function formatRouteDuration(seconds: number): string {
  const total = Math.max(60, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function estimateFlightDurationSeconds(distanceKm: number): number {
  const cruise = (distanceKm / 780) * 3600;
  return Math.round(cruise + 45 * 60);
}

export function estimateFerryDurationSeconds(distanceKm: number): number {
  return Math.round((distanceKm / 35) * 3600);
}

export function estimateDrivingDurationSeconds(distanceKm: number): number {
  return Math.round((distanceKm / 72) * 3600);
}

export function segmentMidpoint(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0]!;
  return coords[Math.floor(coords.length / 2)]!;
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function collectDayText(day: DayPlan): string {
  const slots = ["morning", "afternoon", "evening"] as const;
  const acts = slots.flatMap((s) => day.activities?.[s]?.map((a) => `${a.name} ${a.description ?? ""}`) ?? []);
  const transportLegs = (day.transportation ?? [])
    .map((t) => `${t.type} ${t.from} ${t.to} ${t.duration}`)
    .join(" ");
  return [
    day.transport?.type,
    day.transport?.description,
    transportLegs,
    day.title,
    day.morning,
    day.afternoon,
    day.evening,
    ...acts,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const FLIGHT_TEXT =
  /letalo|flight|avion|airport|air\s|notranji let|domestic flight|international flight|✈|odlet|prilet/i;
const FERRY_TEXT =
  /trajekt|ferry|boat|catamaran|speedboat|čoln|ladj|pristani|feribot|otok.*trajekt|ferry terminal/i;

/** Infer transport mode from AI day copy + leg distance. Returns null = no line (markers only). */
export function classifyTransportMode(
  day: DayPlan,
  distanceKm: number,
  opts?: { preferDriving?: boolean; cityChanged?: boolean },
): RouteMode | null {
  const preferDriving = opts?.preferDriving ?? false;
  const cityChanged = opts?.cityChanged ?? false;
  const text = collectDayText(day);
  const explicitFlight =
    FLIGHT_TEXT.test(text) ||
    day.inFlightDay ||
    day.category === "transport" ||
    (day.transportation ?? []).some((t) => t.type === "flight");
  const explicitFerry =
    FERRY_TEXT.test(text) || (day.transportation ?? []).some((t) => t.type === "ferry");
  const explicitTrain = (day.transportation ?? []).some((t) => t.type === "train");

  if (preferDriving) {
    if (explicitFlight && distanceKm > 250) return "flight";
    return "driving";
  }

  if (explicitFlight) return "flight";
  if (explicitFerry) return "ferry";
  if (explicitTrain || /vlak|train|rail|sleeper train/i.test(text)) return "transit";

  // Inter-city ground legs (e.g. Puerto Princesa → El Nido): Mapbox driving polyline.
  if (cityChanged && distanceKm >= 0.3) {
    if (distanceKm > MAX_DRIVING_SEGMENT_KM) return "flight";
    return "driving";
  }

  return null;
}

export function buildGreatCircleCoords(
  from: [number, number],
  to: [number, number],
  npoints = 128,
): [number, number][] {
  try {
    const line = greatCircle(point(from), point(to), { npoints });
    const geom = line.geometry;
    if (geom.type === "LineString") {
      return geom.coordinates as [number, number][];
    }
    if (geom.type === "MultiLineString") {
      return geom.coordinates.flat() as [number, number][];
    }
  } catch {
    /* fall through */
  }
  return [from, to];
}

const DIRECTIONS_TIMEOUT_MS = Math.min(HTTP_API_TIMEOUT_MS, 15_000);

type DrivingRouteResult = {
  coordinates: [number, number][];
  durationSeconds: number;
  fromMapboxDirections: boolean;
};

async function fetchMapboxDrivingGeometry(
  waypointStr: string,
  token: string,
  straightFallback: DrivingRouteResult,
  logLabel: string,
): Promise<DrivingRouteResult> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${waypointStr}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const data = await withTimeout(
      (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Mapbox Directions ${res.status}`);
        return res.json() as Promise<{
          routes?: Array<{
            geometry?: { coordinates?: [number, number][] };
            duration?: number;
          }>;
        }>;
      })(),
      DIRECTIONS_TIMEOUT_MS,
      `mapbox:driving:${logLabel}`,
    );

    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (coordinates && coordinates.length >= 2) {
      return {
        coordinates,
        durationSeconds: route.duration ?? straightFallback.durationSeconds,
        fromMapboxDirections: true,
      };
    }
  } catch (err) {
    console.warn(`[tripMapRoutes] Directions fallback (straight line) — ${logLabel}:`, err);
  }

  return straightFallback;
}

export async function fetchDrivingRouteWithWaypoints(
  waypoints: [number, number][],
  token: string,
): Promise<DrivingRouteResult> {
  if (waypoints.length < 2) {
    return { coordinates: waypoints, durationSeconds: 0, fromMapboxDirections: false };
  }

  let totalDist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalDist += haversineKm(waypoints[i - 1]!, waypoints[i]!);
  }
  const straightFallback: DrivingRouteResult = {
    coordinates: [waypoints[0]!, waypoints[waypoints.length - 1]!],
    durationSeconds: estimateDrivingDurationSeconds(totalDist),
    fromMapboxDirections: false,
  };

  const coords = waypoints.map((w) => `${w[0]},${w[1]}`).join(";");
  return fetchMapboxDrivingGeometry(
    coords,
    token,
    straightFallback,
    `${waypoints.length} waypoints`,
  );
}

/** Ordered [lng, lat] waypoints for a single day — activities + POIs in visit order. */
export function buildDayWaypointCoords(
  day: DayPlan,
  dayCoord: [number, number] | null,
): [number, number][] {
  const coords: [number, number][] = [];
  const seen = new Set<string>();

  const add = (lng: number, lat: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat === 0 || lng === 0) return;
    const key = `${lng.toFixed(5)}:${lat.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    coords.push([lng, lat]);
  };

  type MapPin = NonNullable<DayPlan["mapPins"]>[number];
  const pinByName = new Map<string, MapPin>();
  for (const p of day.mapPins ?? []) {
    pinByName.set(p.name.trim().toLowerCase(), p);
  }

  const slots = ["morning", "afternoon", "evening"] as const;
  for (const slot of slots) {
    for (const act of day.activities?.[slot] ?? []) {
      const pin = pinByName.get(act.name.trim().toLowerCase());
      if (pin) add(pin.lng, pin.lat);
    }
  }

  for (const pin of day.mapPins ?? []) {
    add(pin.lng, pin.lat);
  }

  if (coords.length === 0 && dayCoord) {
    coords.push(dayCoord);
  }

  return coords;
}

export async function fetchDrivingRoute(
  from: [number, number],
  to: [number, number],
  token: string,
): Promise<DrivingRouteResult> {
  const distKm = haversineKm(from, to);
  const straightFallback: DrivingRouteResult = {
    coordinates: [from, to],
    durationSeconds: estimateDrivingDurationSeconds(distKm),
    fromMapboxDirections: false,
  };

  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  return fetchMapboxDrivingGeometry(coords, token, straightFallback, `${distKm.toFixed(0)}km`);
}

export type SegmentSpec = {
  id: string;
  mode: RouteMode;
  from: [number, number];
  to: [number, number];
  dayTo: number;
};

export type BuildSegmentOpts = {
  /** Road trip / motorhome — Mapbox driving between days only in this mode. */
  preferDriving?: boolean;
  /** Trip destination IATA — used for island gateway routing (e.g. MPH → Boracay). */
  destinationIata?: string;
  /** Ground transport from home — car / motorhome / train */
  groundTransportMode?: import("@/lib/aiPlan.functions").GroundTransportMode;
};

export function buildIslandAccessSegmentSpecs(
  def: IslandAirportAccessDef,
  direction: "arrival" | "departure",
  hubCoord: [number, number],
  islandCoord: [number, number],
  dayTo: number,
  idPrefix: string,
): SegmentSpec[] {
  const airport: [number, number] = [def.airport.lng, def.airport.lat];
  const port: [number, number] = [def.port.lng, def.port.lat];

  if (direction === "arrival") {
    return [
      {
        id: `${idPrefix}-flight`,
        mode: "flight",
        from: hubCoord,
        to: airport,
        dayTo,
      },
      {
        id: `${idPrefix}-drive`,
        mode: "driving",
        from: airport,
        to: port,
        dayTo,
      },
      {
        id: `${idPrefix}-ferry`,
        mode: "ferry",
        from: port,
        to: islandCoord,
        dayTo,
      },
    ];
  }

  return [
    {
      id: `${idPrefix}-ferry`,
      mode: "ferry",
      from: islandCoord,
      to: port,
      dayTo,
    },
    {
      id: `${idPrefix}-drive`,
      mode: "driving",
      from: port,
      to: airport,
      dayTo,
    },
    {
      id: `${idPrefix}-flight`,
      mode: "flight",
      from: airport,
      to: hubCoord,
      dayTo,
    },
  ];
}

export function buildSegmentSpecs(
  validDays: Array<{ day: DayPlan; coord: [number, number] }>,
  origin: [number, number] | null,
  opts?: BuildSegmentOpts,
): SegmentSpec[] {
  const specs: SegmentSpec[] = [];

  const roadOutbound =
    opts?.groundTransportMode === "car" || opts?.groundTransportMode === "motorhome";
  const segmentDriving = roadOutbound || opts?.preferDriving;

  // One hop only: home → first day (never one long line to final destination).
  if (origin && validDays.length > 0 && validDays[0]!.day.day === 1) {
    const useDriving =
      segmentDriving || opts?.groundTransportMode === "train";
    specs.push({
      id: "origin-day1",
      mode: useDriving ? "driving" : "flight",
      from: origin,
      to: validDays[0]!.coord,
      dayTo: 1,
    });
  }

  for (let i = 1; i < validDays.length; i++) {
    const prev = validDays[i - 1]!;
    const curr = validDays[i]!;
    const dist = haversineKm(prev.coord, curr.coord);

    const prevCity = (prev.day.city ?? "").trim().toLowerCase();
    const currCity = (curr.day.city ?? "").trim().toLowerCase();
    const cityChanged = Boolean(prevCity && currCity && prevCity !== currCity);

    const islandTransition = detectIslandAccessTransition(
      prev.day,
      curr.day,
      opts?.destinationIata,
    );
    if (islandTransition) {
      specs.push(
        ...buildIslandAccessSegmentSpecs(
          islandTransition.def,
          islandTransition.direction,
          islandTransition.direction === "arrival" ? prev.coord : curr.coord,
          islandTransition.direction === "arrival" ? curr.coord : prev.coord,
          curr.day.day,
          `leg-${prev.day.day}-${curr.day.day}`,
        ),
      );
      continue;
    }

    if (segmentDriving) {
      if (dist < 0.3) continue;
      const mode: RouteMode =
        dist > MAX_DRIVING_SEGMENT_KM ? "flight" : "driving";
      specs.push({
        id: `leg-${prev.day.day}-${curr.day.day}`,
        mode,
        from: prev.coord,
        to: curr.coord,
        dayTo: curr.day.day,
      });
      continue;
    }

    if (!cityChanged && dist < 50) {
      continue;
    }

    const mode = classifyTransportMode(curr.day, dist, {
      preferDriving: opts?.preferDriving,
      cityChanged,
    });
    if (!mode) continue;

    specs.push({
      id: `leg-${prev.day.day}-${curr.day.day}`,
      mode,
      from: prev.coord,
      to: curr.coord,
      dayTo: curr.day.day,
    });
  }

  if (origin && validDays.length > 0) {
    const last = validDays[validDays.length - 1]!;
    const dist = haversineKm(last.coord, origin);
    if (dist > 50 || last.day.inFlightDay || FLIGHT_TEXT.test(collectDayText(last.day))) {
      specs.push({
        id: "return-origin",
        mode: segmentDriving && dist <= MAX_DRIVING_SEGMENT_KM ? "driving" : "flight",
        from: last.coord,
        to: origin,
        dayTo: last.day.day,
      });
    }
  }

  return specs;
}

function buildFallbackSegment(spec: SegmentSpec): TripRouteSegment | null {
  const distKm = haversineKm(spec.from, spec.to);
  let coordinates: [number, number][];
  let durationSeconds: number;

  switch (spec.mode) {
    case "flight":
      coordinates = buildGreatCircleCoords(spec.from, spec.to, 128);
      durationSeconds = estimateFlightDurationSeconds(distKm);
      break;
    case "ferry":
      coordinates = buildGreatCircleCoords(spec.from, spec.to, 96);
      durationSeconds = estimateFerryDurationSeconds(distKm);
      break;
    case "transit":
      coordinates = buildGreatCircleCoords(spec.from, spec.to, 80);
      durationSeconds = estimateDrivingDurationSeconds(distKm);
      break;
    default:
      coordinates = [spec.from, spec.to];
      durationSeconds = estimateDrivingDurationSeconds(distKm);
  }

  if (coordinates.length < 2) return null;

  return {
    ...spec,
    coordinates,
    durationSeconds,
    durationLabel: formatRouteDuration(durationSeconds),
  };
}

export async function resolveOneSegment(
  spec: SegmentSpec,
  token: string,
): Promise<TripRouteSegment | null> {
  const distKm = haversineKm(spec.from, spec.to);

  try {
    switch (spec.mode) {
      case "driving": {
        const route = await fetchDrivingRoute(spec.from, spec.to, token);
        if (route.coordinates.length >= 2) {
          return {
            ...spec,
            coordinates: route.coordinates,
            durationSeconds: route.durationSeconds,
            durationLabel: formatRouteDuration(route.durationSeconds),
          };
        }
        break;
      }
      case "flight":
        return {
          ...spec,
          coordinates: buildGreatCircleCoords(spec.from, spec.to, 128),
          durationSeconds: estimateFlightDurationSeconds(distKm),
          durationLabel: formatRouteDuration(estimateFlightDurationSeconds(distKm)),
        };
      case "ferry":
        return {
          ...spec,
          coordinates: buildGreatCircleCoords(spec.from, spec.to, 96),
          durationSeconds: estimateFerryDurationSeconds(distKm),
          durationLabel: formatRouteDuration(estimateFerryDurationSeconds(distKm)),
        };
      case "transit":
        return {
          ...spec,
          coordinates: buildGreatCircleCoords(spec.from, spec.to, 80),
          durationSeconds: estimateDrivingDurationSeconds(distKm),
          durationLabel: formatRouteDuration(estimateDrivingDurationSeconds(distKm)),
        };
      default:
        break;
    }
  } catch (err) {
    console.warn(`[tripMapRoutes] segment ${spec.id} failed:`, err);
  }

  return buildFallbackSegment(spec);
}

export async function resolveSegmentGeometries(
  specs: SegmentSpec[],
  token: string,
): Promise<TripRouteSegment[]> {
  const settled = await Promise.allSettled(
    specs.map((spec) => resolveOneSegment(spec, token)),
  );

  const resolved: TripRouteSegment[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    const spec = specs[i]!;

    if (result.status === "fulfilled" && result.value) {
      resolved.push(result.value);
      continue;
    }

    if (result.status === "rejected") {
      console.warn(`[tripMapRoutes] segment ${spec.id} rejected:`, result.reason);
    }

    const fallback = buildFallbackSegment(spec);
    if (fallback) resolved.push(fallback);
  }

  return resolved;
}

export function segmentsToFeatureCollection(
  segments: TripRouteSegment[],
  mode: RouteMode,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: segments
      .filter((s) => s.mode === mode)
      .map((s) => ({
        type: "Feature" as const,
        properties: { id: s.id, dayTo: s.dayTo, mode: s.mode, isActive: 0 },
        geometry: {
          type: "LineString" as const,
          coordinates: s.coordinates,
        },
      })),
  };
}

export const ROUTE_LAYER_STYLE: Record<
  RouteMode,
  { color: string; width: number; dash?: number[]; opacity: number }
> = {
  driving: { color: "#1d4ed8", width: 4, opacity: 0.92 },
  flight: { color: "#4338ca", width: 3, dash: [2, 2], opacity: 0.92 },
  ferry: { color: "#0e7490", width: 3, dash: [1.5, 2.5], opacity: 0.85 },
  transit: { color: "#475569", width: 2.5, dash: [3, 2], opacity: 0.8 },
};
