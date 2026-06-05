import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, MapPin } from "lucide-react";
import { getMapboxToken } from "@/lib/mapbox.functions";
import type { AiTripPlan, DayCategory, DayPlan } from "@/lib/aiPlan.functions";

type Props = {
  plan: AiTripPlan;
  activeDay: number;
  photoMap?: Map<number, string>;
};

const CATEGORY: Record<DayCategory, { icon: string; bg: string }> = {
  stay:      { icon: "🛏", bg: "#c2410c" },
  eat:       { icon: "🍽", bg: "#15803d" },
  activity:  { icon: "🎯", bg: "#0f766e" },
  sight:     { icon: "🏛", bg: "#1d4ed8" },
  transport: { icon: "✈",  bg: "#7c3aed" },
  beach:     { icon: "🏝", bg: "#0891b2" },
  nature:    { icon: "🌿", bg: "#166534" },
};

function catMeta(c?: string) {
  return CATEGORY[(c as DayCategory) ?? "activity"] ?? CATEGORY.activity;
}

/**
 * Strict coordinate validator. Mapbox uses [lng, lat] order; this checks the
 * stored {lat,lng} fields against the valid WGS84 ranges AND rejects the
 * (0,0) "Null Island" sentinel that the AI emits when it doesn't know the
 * coordinates. Without this guard, broken plans render in the Atlantic.
 */
function isValidCoord(lat: unknown, lng: unknown): lat is number {
  if (lat == null || lng == null) return false;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  // Reject Null Island and near-zero rounding errors
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return true;
}

const LOCATION_PREFIXES = [
  /^dan\s+\d+\s*[:\-–]\s*/i,
  /^day\s+\d+\s*[:\-–]\s*/i,
  /^prihod v\s+/i,
  /^arrival in\s+/i,
  /^raziskovanje\s+/i,
  /^exploring\s+/i,
  /^obisk\s+/i,
  /^visit\s+/i,
  /^sprehod po\s+/i,
  /^walk through\s+/i,
  /^transfer to\s+/i,
  /^prevoz do\s+/i,
];

function normalizeLocationText(value: unknown): string {
  if (typeof value !== "string") return "";
  let text = value.trim().replace(/\s+/g, " ");
  for (const pattern of LOCATION_PREFIXES) text = text.replace(pattern, "").trim();
  return text;
}

function uniqueQueries(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const next = normalizeLocationText(value);
    if (!next) return false;
    const key = next.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Great-circle interpolation in degrees → returns N+1 [lng,lat] points. */
function greatCircle(
  a: [number, number],
  b: [number, number],
  n = 64,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lon1, lat1] = [toRad(a[0]), toRad(a[1])];
  const [lon2, lat2] = [toRad(b[0]), toRad(b[1])];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (d === 0) return [a, b];
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    pts.push([toDeg(lon), toDeg(lat)]);
  }
  return pts;
}

async function mapboxGeocode(
  query: string,
  token: string,
  types = "place,locality,region,country,poi",
): Promise<[number, number] | null> {
  try {
    const q = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?types=${types}&limit=1&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.features?.[0]?.center;
    if (Array.isArray(c) && c.length === 2) {
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (isValidCoord(lat, lng)) return [lng, lat];
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeIata(iata: string, token: string): Promise<[number, number] | null> {
  return mapboxGeocode(iata, token, "place,locality,airport,poi");
}

export function TripMap({ plan, activeDay, photoMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Array<{ marker: mapboxgl.Marker; day: number }>>([]);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const tokenFn = useServerFn(getMapboxToken);
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  /** day number → [lng, lat] for days with genuinely valid resolved coords. */
  const [dayCoords, setDayCoords] = useState<Map<number, [number, number]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const ready = useRef(false);
  const hasInitialBoundsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    tokenFn({})
      .then((r) => {
        if (cancelled) return;
        if (!r.token) setError("Mapbox token ni nastavljen.");
        else setToken(r.token);
      })
      .catch(() => !cancelled && setError("Napaka pri nalaganju karte."));
    return () => { cancelled = true; };
  }, [tokenFn]);

  // Geocode origin IATA once token is available
  useEffect(() => {
    if (!token || !plan.originIata) return;
    let cancelled = false;
    geocodeIata(plan.originIata, token).then((c) => {
      if (!cancelled) setOrigin(c);
    });
    return () => { cancelled = true; };
  }, [token, plan.originIata]);

  // Resolve coords for every day. Strategy: the text label (focusName / city)
  // is the source of truth — that's what the user sees on the timeline. We
  // geocode the label and prefer the geocoded coord. AI-provided lat/lng is
  // used only as a fallback (and only when geocoding fails), because the AI
  // sometimes returns coords for a different city than the one it named (e.g.
  // a Day labeled "Boracay" with Puerto Princesa coordinates).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      const next = new Map<number, [number, number]>();
      const geocodeCache = new Map<string, [number, number] | null>();
      const dest = normalizeLocationText(plan.destinationName || plan.destinationIata || "");

      const haversineKm = (a: [number, number], b: [number, number]) => {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(b[1] - a[1]);
        const dLng = toRad(b[0] - a[0]);
        const s =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s));
      };

      const lookup = async (query: string): Promise<[number, number] | null> => {
        if (geocodeCache.has(query)) return geocodeCache.get(query) ?? null;
        const c = await mapboxGeocode(query, token);
        geocodeCache.set(query, c);
        return c;
      };

      let lastValidCoord: [number, number] | null = null;

      for (const d of plan.days) {
        if (cancelled) return;

        const focus = normalizeLocationText(d.focusName);
        const city = normalizeLocationText(d.city);
        const title = normalizeLocationText(d.title);

        const rawLatInvalid = d.lat == null || d.lat === 0;
        const rawLngInvalid = d.lng == null || d.lng === 0;
        if (rawLatInvalid || rawLngInvalid) {
          console.warn(
            `[TripMap] Dan ${d.day} (${city || d.title}): neveljavne AI koordinate — lat=${d.lat}, lng=${d.lng}`,
          );
        }

        const aiCoord = isValidCoord(d.lat, d.lng) ? ([d.lng, d.lat] as [number, number]) : null;
        const queries = uniqueQueries([
          city && dest ? `${city}, ${dest}` : city,
          city,
          focus && city ? `${focus}, ${city}` : focus,
          focus && dest ? `${focus}, ${dest}` : focus,
          title && city ? `${title}, ${city}` : title,
        ]);

        let cityCoord: [number, number] | null = null;
        for (const query of queries) {
          const match = await lookup(query);
          if (!match) continue;
          if (!cityCoord) cityCoord = match;
          if (query.toLowerCase().startsWith(city.toLowerCase())) {
            cityCoord = match;
            break;
          }
        }

        let chosen: [number, number] | null = null;
        if (cityCoord && aiCoord) {
          const distKm = haversineKm(aiCoord, cityCoord);
          chosen = distKm > 75 ? cityCoord : aiCoord;
        } else {
          chosen = aiCoord ?? cityCoord;
        }

        if (focus && cityCoord) {
          const focusCoord = await lookup(`${focus}, ${city || dest}`);
          if (focusCoord && haversineKm(focusCoord, cityCoord) <= 75) {
            chosen = focusCoord;
          }
        }

        if (chosen && isValidCoord(chosen[1], chosen[0])) {
          next.set(d.day, chosen);
          lastValidCoord = chosen;
        } else {
          console.warn(
            `[TripMap] Dan ${d.day} (${city || d.title}): ni veljavnih koordinat — preskakujem marker in polyline` +
              (lastValidCoord
                ? `, fallback na prejšnjo destinacijo [${lastValidCoord[1]}, ${lastValidCoord[0]}]`
                : ""),
          );
        }
      }

      if (!cancelled) setDayCoords(next);
    })();

    return () => { cancelled = true; };
  }, [token, plan.days, plan.destinationIata]);


  /** Ordered list of days that have validated coords — used for routes / bounds. */
  const validDays = useMemo(() => {
    return plan.days
      .map((d) => {
        const c = dayCoords.get(d.day);
        return c ? { day: d, coord: c } : null;
      })
      .filter((x): x is { day: DayPlan; coord: [number, number] } => x !== null);
  }, [plan.days, dayCoords]);

  const activeCoord = useMemo(() => {
    const direct = dayCoords.get(activeDay);
    if (direct) return direct;

    const idx = plan.days.findIndex((d) => d.day === activeDay);
    for (let i = idx - 1; i >= 0; i--) {
      const c = dayCoords.get(plan.days[i].day);
      if (c) return c;
    }
    return validDays[0]?.coord ?? null;
  }, [plan.days, dayCoords, activeDay, validDays]);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    if (!activeCoord) return;
    mapboxgl.accessToken = token;
    const center: [number, number] = activeCoord;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center,
      zoom: 6,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    map.on("load", () => {
      ready.current = true;
    });

    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = [];
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      ready.current = false;
      hasInitialBoundsRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeCoord]);

  // Render / update markers + route line whenever resolved coords or photos change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (validDays.length === 0) return;

    const apply = () => {
      // Route line
      const coords = validDays.map((v) => v.coord);
      const lineData: GeoJSON.Feature = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      };
      const existing = map.getSource("trip-route") as mapboxgl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(lineData as GeoJSON.GeoJSON);
      } else if (coords.length >= 2) {
        map.addSource("trip-route", { type: "geojson", data: lineData });
        map.addLayer({
          id: "trip-route-line",
          type: "line",
          source: "trip-route",
          paint: {
            "line-color": "#111827",
            "line-width": 2.5,
            "line-dasharray": [1.5, 2],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }

      // Reset markers
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = [];
      const seenCities = new Set<string>();

      validDays.forEach(({ day: d, coord }) => {
        const meta = catMeta(d.category);
        const wrap = document.createElement("div");
        wrap.className = "trip-marker-wrap";
        wrap.dataset.day = String(d.day);

        const showLabel = d.city && !seenCities.has(d.city);
        if (showLabel) seenCities.add(d.city);

        const photo = photoMap?.get(d.day);
        const pinStyle = photo
          ? `background-image:url('${photo.replace(/'/g, "%27")}');background-size:cover;background-position:center`
          : `background:${meta.bg}`;
        const pinContent = photo
          ? `<span class="trip-marker-day">${d.day}</span>`
          : `<span class="trip-marker-icon">${meta.icon}</span>
             <span class="trip-marker-day">${d.day}</span>`;

        wrap.innerHTML = `
          ${showLabel ? `<div class="trip-marker-label">${escapeHtml(d.city)}</div>` : ""}
          <div class="trip-marker-pin" style="${pinStyle}">
            ${pinContent}
          </div>
        `;

        const marker = new mapboxgl.Marker({ element: wrap, anchor: "bottom" })
          .setLngLat(coord)
          .setPopup(
            new mapboxgl.Popup({ offset: 28, closeButton: false }).setHTML(
              `<div style="font-weight:600;font-size:13px">Dan ${d.day} · ${escapeHtml(d.city ?? "")}</div>
               <div style="font-size:12px;color:#555;margin-top:2px">${escapeHtml(d.focusName ?? d.title)}</div>`
            )
          )
          .addTo(map);
        markersRef.current.push({ marker, day: d.day });
      });

      if (!hasInitialBoundsRef.current) {
        const bounds = new mapboxgl.LngLatBounds();
        validDays.forEach((v) => bounds.extend(v.coord));
        if (origin) bounds.extend(origin);
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 80, duration: 0, maxZoom: 11 });
          hasInitialBoundsRef.current = true;
        }
      }
    };

    if (map.isStyleLoaded() && ready.current) apply();
    else map.once("load", apply);
  }, [validDays, photoMap, origin]);

  // Draw / update flight polyline (origin → first destination day)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) return;
    const first = validDays[0];
    if (!first) return;

    const drawFlight = () => {
      const coords = greatCircle(origin, first.coord, 64);
      const data: GeoJSON.Feature = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      };
      const existing = map.getSource("flight-route") as mapboxgl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data as GeoJSON.GeoJSON);
      } else {
        map.addSource("flight-route", { type: "geojson", data });
        map.addLayer({
          id: "flight-route-line",
          type: "line",
          source: "flight-route",
          paint: {
            "line-color": "#2563eb",
            "line-width": 2.5,
            "line-opacity": 0.85,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }

      if (!originMarkerRef.current) {
        const wrap = document.createElement("div");
        wrap.className = "trip-marker-wrap is-origin";
        wrap.innerHTML = `
          <div class="trip-marker-label">${escapeHtml(plan.originIata ?? "")}</div>
          <div class="trip-marker-pin" style="background:#2563eb">
            <span class="trip-marker-icon">✈</span>
          </div>
        `;
        originMarkerRef.current = new mapboxgl.Marker({ element: wrap, anchor: "bottom" })
          .setLngLat(origin)
          .addTo(map);
      } else {
        originMarkerRef.current.setLngLat(origin);
      }
    };

    if (map.isStyleLoaded() && ready.current) drawFlight();
    else map.once("load", drawFlight);
  }, [origin, validDays, plan.originIata]);

  // Smooth flyTo on active-day change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const target = validDays.find((v) => v.day.day === activeDay);
    if (!target) return;
    const coord = target.coord;

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const distanceKm = (a: [number, number], b: [number, number]) => {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(b[1] - a[1]);
      const dLng = toRad(b[0] - a[0]);
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };

    const runFly = () => {
      if (activeDay === 1 && origin) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend(origin);
        bounds.extend(coord);
        map.fitBounds(bounds, {
          padding: 100,
          duration: 2000,
          maxZoom: 6.5,
          easing: easeInOutCubic,
        });
        return;
      }

      const c = map.getCenter();
      const dist = distanceKm([c.lng, c.lat], coord);
      const targetZoom =
        dist < 10 ? 13 :
        dist < 50 ? 12.5 :
        dist < 200 ? 12 :
        dist < 800 ? 11 :
        dist < 2000 ? 10 : 9;
      const duration = Math.min(2600, Math.max(900, 700 + Math.sqrt(dist) * 35));
      const curve = dist > 500 ? 1.9 : 1.5;
      const speed = dist > 500 ? 0.7 : 1.0;

      map.flyTo({
        center: coord,
        zoom: targetZoom,
        speed,
        curve,
        duration,
        easing: easeInOutCubic,
        essential: true,
      });
    };
    if (map.isStyleLoaded()) runFly();
    else map.once("load", runFly);

    markersRef.current.forEach(({ marker, day: d }) => {
      marker.getElement().classList.toggle("is-active", d === activeDay);
    });
  }, [activeDay, validDays, origin]);


  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground flex items-center gap-2">
        <MapPin className="h-4 w-4" /> {error}
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border bg-card shadow-sm">
      <div ref={containerRef} className="h-[480px] w-full" />
      {(!token || validDays.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}
