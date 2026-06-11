import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerFn } from "@tanstack/react-start";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, MapPin, Map as MapIcon, Satellite } from "lucide-react";
import { getMapboxToken } from "@/lib/mapbox.functions";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  buildSegmentSpecs,
  resolveSegmentGeometries,
  ROUTE_LAYER_STYLE,
  segmentMidpoint,
  segmentsToFeatureCollection,
  type RouteMode,
  type TripRouteSegment,
} from "@/lib/tripMapRoutes";
import {
  normalizeMapPoiCategory,
  inferMapPoiCategoryFromText,
  type MapPoiCategory,
  type MapPoiPin,
} from "@/lib/mapPoiCategory";
import { MapCityMarker, MapOriginMarker, MapPoiMarker } from "@/components/MapPoiMarker";
import { normalizeImageUrl } from "@/lib/unsplashPhotos";

import { mapPinToPoiDetails, type PoiDetailsData } from "@/lib/poiDetails.types";
import { useI18n } from "@/lib/i18n";
import {
  buildFinalizedRouteDays,
  buildRouteFetchKey,
  isRouteDrawingReady,
} from "@/lib/tripMapRouteState";

export type MapFocusTarget = {
  lat: number;
  lng: number;
  day: number;
  mode: "drone" | "day";
  /** Bumps on each click so repeated clicks re-trigger fly. */
  key: number;
};

type Props = {
  plan: AiTripPlan;
  activeDay: number;
  focusTarget?: MapFocusTarget | null;
  /** When true, skip scroll-driven camera moves (click navigation in progress). */
  scrollSpyPaused?: boolean;
  onOpenPoiDetails?: (poi: PoiDetailsData) => void;
  /** Gemini stream still producing days — defer route drawing until finalized. */
  streaming?: boolean;
  expectedDayCount?: number;
  /** Route playback — fly with tighter zoom; does not remount the map. */
  isPlaying?: boolean;
};

type CityMapStop = {
  city: string;
  coord: [number, number];
  startDay: number;
  endDay: number;
  dayCount: number;
  imageUrl?: string;
};

const EMPTY_TRIP_SEGMENTS: TripRouteSegment[] = [];

const MAP_STYLE_DEFAULT = "mapbox://styles/mapbox/outdoors-v12";
const MAP_STYLE_SATELLITE = "mapbox://styles/mapbox/satellite-streets-v12";

function coordKey(c: [number, number]): string {
  return `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
}

function boundsToKey(bounds: mapboxgl.LngLatBounds): string {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return `${sw.lng.toFixed(5)},${sw.lat.toFixed(5)},${ne.lng.toFixed(5)},${ne.lat.toFixed(5)}`;
}

function dayCoordsSignature(dayCoords: Map<number, [number, number]>): string {
  return [...dayCoords.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, c]) => `${day}:${coordKey(c)}`)
    .join(";");
}

function planDaysGeoSignature(days: DayPlan[]): string {
  return days
    .map((d) => {
      const pins = (d.mapPins ?? [])
        .filter((p) => isValidCoord(p.lat, p.lng))
        .map((p) => coordKey([p.lng, p.lat]))
        .join("|");
      const dayCoord =
        isValidCoord(d.lat, d.lng) ? coordKey([d.lng, d.lat]) : "";
      return `${d.day}:${dayCoord}:${pins}`;
    })
    .join(";");
}

function buildTripMapPlanKey(plan: AiTripPlan): string {
  return [
    plan.destinationName,
    plan.destinationIata,
    plan.destinationPlace,
    plan.originIata,
    plan.originPlace,
    plan.groundTransportMode,
    plan.accommodationMode,
    plan.centerLat,
    plan.centerLng,
    planDaysGeoSignature(plan.days),
  ].join("::");
}

/** Stable string key for POI marker layer — avoids re-running effects on array identity churn. */
function buildPoiPinsKey(plan: AiTripPlan): string {
  return collectPlanPoiPins(plan)
    .map(
      (p) =>
        `${p.day}:${p.name}:${p.lat.toFixed(4)}:${p.lng.toFixed(4)}:${p.category}:${p.imageUrl ?? ""}`,
    )
    .join("|");
}

function buildCityStopsKey(stops: CityMapStop[]): string {
  return stops
    .map(
      (s) =>
        `${s.city}:${coordKey(s.coord)}:${s.startDay}-${s.endDay}:${s.dayCount}:${s.imageUrl ?? ""}`,
    )
    .join("|");
}

function buildRouteDataKey(segments: TripRouteSegment[]): string {
  return segments
    .map((s) => {
      const mid = segmentMidpoint(s.coordinates);
      return `${s.mode}:${s.durationLabel}:${coordKey(mid)}`;
    })
    .join("|");
}

function focusTargetSignature(target?: MapFocusTarget | null): string {
  if (!target) return "";
  return `${target.mode}:${target.day}:${target.lat}:${target.lng}:${target.key}`;
}

function tripMapPropsAreEqual(prev: Props, next: Props): boolean {
  if (prev.activeDay !== next.activeDay) return false;
  if (prev.scrollSpyPaused !== next.scrollSpyPaused) return false;
  if (prev.streaming !== next.streaming) return false;
  if (prev.expectedDayCount !== next.expectedDayCount) return false;
  if (prev.isPlaying !== next.isPlaying) return false;
  if (focusTargetSignature(prev.focusTarget) !== focusTargetSignature(next.focusTarget)) {
    return false;
  }
  if (buildTripMapPlanKey(prev.plan) !== buildTripMapPlanKey(next.plan)) return false;
  return true;
}

function isMapLogisticsDay(day: DayPlan, totalDays: number): boolean {
  if (day.inFlightDay) return true;
  const city = (day.city ?? "").toLowerCase();
  if (/samut prakan|suvarnabhumi|don muang/i.test(city)) return true;
  if (day.day === totalDays && /logistika|odhod|departure|letališč/i.test(day.title.toLowerCase())) {
    return true;
  }
  return false;
}

function buildCityStops(
  validDays: Array<{ day: DayPlan; coord: [number, number] }>,
  totalDays: number,
  oneStopPerDay = false,
): CityMapStop[] {
  const stops: CityMapStop[] = [];

  for (const { day, coord } of validDays) {
    if (isMapLogisticsDay(day, totalDays)) continue;

    const city = normalizeLocationText(day.city) || normalizeLocationText(day.focusName) || `Day ${day.day}`;
    const last = stops[stops.length - 1];

    if (
      !oneStopPerDay &&
      last &&
      last.city.toLowerCase() === city.toLowerCase()
    ) {
      last.endDay = day.day;
      last.dayCount += 1;
    } else {
      stops.push({
        city,
        coord,
        startDay: day.day,
        endDay: day.day,
        dayCount: 1,
        imageUrl: normalizeImageUrl(day.imageUrl),
      });
    }
  }

  return stops;
}

function transportIconSvg(mode: RouteMode): string {
  if (mode === "flight") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;
  }
  if (mode === "ferry") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.5 0 2.5 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;
}

function unmountReactRoot(root: Root | undefined) {
  if (!root) return;
  queueMicrotask(() => root.unmount());
}

type PoiMarkerEntry = { marker: mapboxgl.Marker; day: number; root: Root; pin: MapPoiPin };
type CityMarkerEntry = {
  marker: mapboxgl.Marker;
  startDay: number;
  endDay: number;
  root: Root;
  stop: CityMapStop;
};

function clearPoiMarkerLayer(store: { current: PoiMarkerEntry[] }) {
  store.current.forEach((m) => {
    unmountReactRoot(m.root);
    m.marker.remove();
  });
  store.current = [];
}

function clearCityMarkerLayer(
  markers: { current: CityMarkerEntry[] },
  durationMarkers: { current: mapboxgl.Marker[] },
) {
  markers.current.forEach((m) => {
    unmountReactRoot(m.root);
    m.marker.remove();
  });
  markers.current = [];
  durationMarkers.current.forEach((m) => m.remove());
  durationMarkers.current = [];
}

function cityLabelElement(text: string): HTMLDivElement {
  const label = document.createElement("div");
  label.className =
    "mb-1 whitespace-nowrap rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900 shadow-sm";
  label.textContent = text;
  return label;
}

function createCityMarkerElement(
  stop: CityMapStop,
  isActive: boolean,
): { el: HTMLDivElement; root: Root } {
  const wrap = document.createElement("div");
  wrap.className = `trip-map-city-marker flex flex-col items-center cursor-pointer transition-opacity duration-300 ease-out${
    isActive ? "" : " opacity-90"
  }`;
  wrap.appendChild(cityLabelElement(stop.city));

  const pinHost = document.createElement("div");
  pinHost.className = "flex h-10 w-10 shrink-0 items-center justify-center";
  wrap.appendChild(pinHost);

  const root = createRoot(pinHost);
  root.render(
    <MapCityMarker
      isActive={isActive}
      dayCount={stop.dayCount}
      imageUrl={stop.imageUrl}
      city={stop.city}
    />,
  );
  return { el: wrap, root };
}

function createDurationBadgeElement(segment: TripRouteSegment): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "layla-duration-badge";
  wrap.innerHTML = `${transportIconSvg(segment.mode)}<span>${escapeHtml(segment.durationLabel)}</span>`;
  return wrap;
}

function createOriginMarkerElement(label: string): { el: HTMLDivElement; root: Root } {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col items-center cursor-pointer";
  wrap.appendChild(cityLabelElement(label));

  const pinHost = document.createElement("div");
  wrap.appendChild(pinHost);

  const root = createRoot(pinHost);
  root.render(<MapOriginMarker />);
  return { el: wrap, root };
}

function createPoiMarkerElement(
  pin: MapPoiPin,
  isActive: boolean,
): { el: HTMLDivElement; root: Root } {
  const el = document.createElement("div");
  el.className =
    "trip-map-poi-marker pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden";
  const root = createRoot(el);
  root.render(
    <MapPoiMarker
      category={pin.category}
      isActive={isActive}
      name={pin.name}
      imageUrl={pin.imageUrl}
    />,
  );
  return { el, root };
}

function collectPlanPoiPins(plan: AiTripPlan): MapPoiPin[] {
  const pins: MapPoiPin[] = [];
  const seen = new Set<string>();

  const pushPin = (day: number, pin: {
    name: string;
    lat: number;
    lng: number;
    category?: string;
    description?: string;
    arrivalTime?: string;
    departureTime?: string;
    estimatedCostEur?: number;
    imageUrl?: string;
  }) => {
    if (!isValidCoord(pin.lat, pin.lng)) return;
    const key = `${pin.lat.toFixed(4)}:${pin.lng.toFixed(4)}:${day}`;
    if (seen.has(key)) return;
    seen.add(key);
    pins.push({
      day,
      name: pin.name,
      lat: pin.lat,
      lng: pin.lng,
      category: normalizeMapPoiCategory(pin.category) as MapPoiCategory,
      description: pin.description,
      arrivalTime: pin.arrivalTime,
      departureTime: pin.departureTime,
      estimatedCostEur: pin.estimatedCostEur,
      imageUrl: normalizeImageUrl(pin.imageUrl),
    });
  };

  for (const day of plan.days) {
    for (const pin of day.mapPins ?? []) {
      pushPin(day.day, pin);
    }

    const slots = day.activities;
    if (!slots) continue;
    for (const act of [...slots.morning, ...slots.afternoon, ...slots.evening]) {
      if (act.lat == null || act.lng == null) continue;
      pushPin(day.day, {
        name: act.name,
        lat: act.lat,
        lng: act.lng,
        category: inferMapPoiCategoryFromText(`${act.name} ${act.description ?? ""}`),
        description: act.description,
        arrivalTime: act.arrivalTime,
        departureTime: act.departureTime,
        estimatedCostEur: act.estimatedCostEur,
        imageUrl: act.imageUrl,
      });
    }
  }
  return pins;
}

const CINEMATIC_CAMERA = {
  duration: 3800,
  speed: 0.6,
  curve: 1.4,
} as const;

function buildMarkerPopupHtml(opts: {
  title: string;
  description?: string;
  time?: string;
  cost?: string;
  showDetailsButton?: boolean;
}): string {
  const desc = opts.description?.trim();
  const time = opts.time?.trim();
  const cost = opts.cost?.trim();
  const descShort = desc
    ? desc.length > 140
      ? `${desc.slice(0, 137).trim()}…`
      : desc
    : "";
  return `
    <div class="rounded-2xl bg-white shadow-xl border border-slate-100/80 overflow-hidden p-4 min-w-[210px] max-w-[280px]">
      <div class="flex items-start gap-2.5 mb-3">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-base leading-none" aria-hidden="true">📍</span>
        <h4 class="font-bold text-slate-900 text-[15px] leading-snug pt-0.5">${escapeHtml(opts.title)}</h4>
      </div>
      <div class="flex flex-wrap gap-2">
        ${time ? `<span class="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-semibold tabular-nums"><span aria-hidden="true">🕐</span>${escapeHtml(time)}</span>` : ""}
        ${cost ? `<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-full px-3 py-1 text-xs font-semibold"><span aria-hidden="true">💶</span>${escapeHtml(cost)}</span>` : ""}
      </div>
      ${descShort ? `<p class="mt-3 text-sm text-slate-600 leading-relaxed line-clamp-2">${escapeHtml(descShort)}</p>` : ""}
      ${opts.showDetailsButton ? `<button type="button" data-poi-details-btn class="mt-3 w-full rounded-full bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-4 py-2 transition-colors cursor-pointer">Več informacij</button>` : ""}
    </div>
  `;
}

function attachMarkerPopup(
  marker: mapboxgl.Marker,
  html: string,
  onDetails?: () => void,
) {
  const popup = new mapboxgl.Popup({
    offset: 12,
    closeButton: true,
    closeOnClick: true,
    className: "trip-map-popup trip-map-popup--premium",
    maxWidth: "none",
    anchor: "bottom",
  }).setHTML(html);

  if (onDetails) {
    popup.on("open", () => {
      const btn = popup.getElement()?.querySelector("[data-poi-details-btn]");
      btn?.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          onDetails();
        },
        { once: true },
      );
    });
  }

  marker.setPopup(popup);
}

const ACTIVE_DAY_SOURCE = "active-day-route";
const ACTIVE_DAY_LAYER = "active-day-route-line";
const ROUTE_LINE_COLOR = "#4338ca";
const ROUTE_LINE_WIDTH = 5;

function setActiveDayRouteData(map: mapboxgl.Map, coordinates: [number, number][]) {
  const src = map.getSource(ACTIVE_DAY_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features:
      coordinates.length >= 2
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates },
            },
          ]
        : [],
  });
}

function ensureActiveDayRouteLayer(map: mapboxgl.Map) {
  if (map.getSource(ACTIVE_DAY_SOURCE)) return;

  map.addSource(ACTIVE_DAY_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: ACTIVE_DAY_LAYER,
    type: "line",
    source: ACTIVE_DAY_SOURCE,
    paint: {
      "line-color": ROUTE_LINE_COLOR,
      "line-width": ROUTE_LINE_WIDTH,
      "line-opacity": 0.92,
    },
    layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
  });
}

function animateRouteProgressiveDraw(
  map: mapboxgl.Map,
  fullCoords: [number, number][],
  duration = 3200,
  cancelRef?: { current: number },
) {
  if (fullCoords.length < 2) return;

  if (cancelRef?.current) {
    cancelAnimationFrame(cancelRef.current);
    cancelRef.current = 0;
  }

  const start = performance.now();
  const tick = (now: number) => {
    const t = easeOutCubic(Math.min(1, (now - start) / duration));
    const n = Math.max(2, Math.ceil(t * fullCoords.length));
    setActiveDayRouteData(map, fullCoords.slice(0, n));
    if (t < 1) {
      const id = requestAnimationFrame(tick);
      if (cancelRef) cancelRef.current = id;
    } else if (cancelRef) {
      cancelRef.current = 0;
    }
  };
  setActiveDayRouteData(map, fullCoords.slice(0, 2));
  const id = requestAnimationFrame(tick);
  if (cancelRef) cancelRef.current = id;
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

const ROUTE_MODES: RouteMode[] = ["driving", "flight", "ferry", "transit"];

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateRouteLayers(
  map: mapboxgl.Map,
  modes: RouteMode[],
  activeDay: number,
  duration = 1200,
) {
  const start = performance.now();
  const frame = (now: number) => {
    const t = easeOutCubic(Math.min(1, (now - start) / duration));
    for (const mode of modes) {
      const layerId = `trip-segments-${mode}-line`;
      if (!map.getLayer(layerId)) continue;
      const style = ROUTE_LAYER_STYLE[mode];
      map.setPaintProperty(layerId, "line-opacity", t * style.opacity);
    }
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      applyActiveDayRouteHighlight(map, activeDay);
    }
  };
  requestAnimationFrame(frame);
}

function applyActiveDayRouteHighlight(map: mapboxgl.Map, activeDay: number) {
  for (const mode of ROUTE_MODES) {
    const layerId = `trip-segments-${mode}-line`;
    if (!map.getLayer(layerId)) continue;
    const style = ROUTE_LAYER_STYLE[mode];
    map.setPaintProperty(layerId, "line-width", [
      "case",
      ["==", ["to-number", ["get", "dayTo"]], activeDay],
      style.width + 1,
      style.width,
    ]);
    map.setPaintProperty(layerId, "line-opacity", [
      "case",
      ["==", ["to-number", ["get", "dayTo"]], activeDay],
      Math.min(1, style.opacity + 0.12),
      style.opacity * 0.55,
    ]);
  }
}

function ensureRouteLayer(
  map: mapboxgl.Map,
  mode: RouteMode,
  fc: GeoJSON.FeatureCollection,
  visible: boolean,
) {
  const sourceId = `trip-segments-${mode}`;
  const layerId = `${sourceId}-line`;
  const style = ROUTE_LAYER_STYLE[mode];
  const existing = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;

  if (existing) {
    existing.setData(fc);
    if (fc.features.length === 0 && map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    } else if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "visible");
    }
    return fc.features.length > 0;
  }

  if (fc.features.length === 0) return false;

  map.addSource(sourceId, { type: "geojson", data: fc });
  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": style.color,
      "line-width": style.width,
      "line-opacity": visible ? style.opacity : 0,
      ...(style.dash ? { "line-dasharray": style.dash } : {}),
    },
    layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
  });
  return true;
}

function flyToPoiDrone(map: mapboxgl.Map, center: [number, number]) {
  map.flyTo({
    center,
    zoom: 13,
    pitch: 45,
    bearing: -15,
    duration: 2500,
    speed: 0.85,
    curve: 1.25,
    essential: true,
    padding: { top: 48, bottom: 48, left: 48, right: 48 },
  });
}

function flyToActiveDay(
  map: mapboxgl.Map,
  center: [number, number],
) {
  map.flyTo({
    center,
    zoom: 9.5,
    duration: CINEMATIC_CAMERA.duration,
    speed: CINEMATIC_CAMERA.speed,
    curve: CINEMATIC_CAMERA.curve,
    essential: true,
    padding: { top: 56, bottom: 56, left: 56, right: 56 },
  });
}

function flyToPlaybackDay(map: mapboxgl.Map, center: [number, number]) {
  map.flyTo({
    center,
    zoom: 12,
    essential: true,
    duration: 2200,
    speed: 0.9,
    curve: 1.2,
    padding: { top: 48, bottom: 48, left: 48, right: 48 },
  });
}

function resolveActiveDayCoord(
  activeDay: number,
  plan: AiTripPlan,
  dayCoords: Map<number, [number, number]>,
  cityStops: CityMapStop[],
): [number, number] | null {
  const day = plan.days.find((d) => d.day === activeDay);

  for (const pin of day?.mapPins ?? []) {
    if (isValidCoord(pin.lat, pin.lng)) return [pin.lng, pin.lat];
  }

  const geocoded = dayCoords.get(activeDay);
  if (geocoded) return geocoded;

  if (day && isValidCoord(day.lat, day.lng)) return [day.lng, day.lat];

  const stop = cityStops.find((s) => activeDay >= s.startDay && activeDay <= s.endDay);
  if (stop) return stop.coord;

  const byDay = validDayCoordForDay(activeDay, plan, dayCoords);
  return byDay;
}

function validDayCoordForDay(
  dayNum: number,
  plan: AiTripPlan,
  dayCoords: Map<number, [number, number]>,
): [number, number] | null {
  const c = dayCoords.get(dayNum);
  if (c) return c;
  const d = plan.days.find((x) => x.day === dayNum);
  if (d && isValidCoord(d.lat, d.lng)) return [d.lng, d.lat];
  return null;
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

function TripMapInner({
  plan,
  activeDay,
  focusTarget,
  scrollSpyPaused = false,
  onOpenPoiDetails,
  streaming = false,
  expectedDayCount = 0,
  isPlaying = false,
}: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onOpenPoiDetailsRef = useRef(onOpenPoiDetails);
  onOpenPoiDetailsRef.current = onOpenPoiDetails;
  const activeDayRef = useRef(activeDay);
  activeDayRef.current = activeDay;
  const appliedStyleRef = useRef<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [mapStyleEpoch, setMapStyleEpoch] = useState(0);
  const markersRef = useRef<CityMarkerEntry[]>([]);
  const durationMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const poiMarkersRef = useRef<PoiMarkerEntry[]>([]);
  const originMarkerRef = useRef<{ marker: mapboxgl.Marker; root: Root } | null>(null);
  const tokenFn = useServerFn(getMapboxToken);
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  /** day number → [lng, lat] for days with genuinely valid resolved coords. */
  const [dayCoords, setDayCoords] = useState<Map<number, [number, number]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const ready = useRef(false);
  const routeAnimatedRef = useRef(false);
  const initialBoundsFitRef = useRef(false);
  const lastFlyTargetKeyRef = useRef("");
  const segmentGenRef = useRef(0);
  const [tripSegments, setTripSegments] = useState<TripRouteSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [showBootLoader, setShowBootLoader] = useState(true);
  const routeDrawAnimRef = useRef(0);

  const planContentKey = useMemo(() => buildTripMapPlanKey(plan), [plan]);

  const planDaysTextKey = useMemo(
    () => plan.days.map((d) => `${d.title} ${d.city}`).join("|"),
    [planContentKey],
  );

  const preferDriving = useMemo(
    () =>
      plan.groundTransportMode === "car" ||
      plan.groundTransportMode === "motorhome" ||
      plan.accommodationMode === "motorhome" ||
      /route\s*66|road\s*trip|roadtrip/i.test(planDaysTextKey),
    [plan.groundTransportMode, plan.accommodationMode, planDaysTextKey],
  );

  const visibleRouteModes = useMemo((): RouteMode[] => ROUTE_MODES, []);

  const poiPinsKey = useMemo(() => buildPoiPinsKey(plan), [planContentKey]);
  const poiPins = useMemo(() => collectPlanPoiPins(plan), [planContentKey]);

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

  // Geocode origin (home city or IATA hub)
  useEffect(() => {
    if (!token) return;
    const label = plan.originPlace?.trim() || plan.originIata;
    if (!label) return;
    let cancelled = false;
    const geocode =
      plan.originPlace?.trim()
        ? mapboxGeocode(plan.originPlace, token, "place,locality,region")
        : geocodeIata(plan.originIata!, token);
    geocode.then((c) => {
      if (!cancelled) setOrigin(c);
    });
    return () => {
      cancelled = true;
    };
  }, [token, plan.originIata, plan.originPlace]);

  /** Days with resolved coords (geocoding). Strategy: the text label (focusName / city)
   * is the source of truth — that's what the user sees on the timeline. We
   * geocode the label and prefer the geocoded coord. AI-provided lat/lng is
   * used only as a fallback (and only when geocoding fails), because the AI
   * sometimes returns coords for a different city than the one it named (e.g.
   * a Day labeled "Boracay" with Puerto Princesa coordinates).
   */
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

        // Gemini / catalog plans ship exact city coords — use them first.
        if (isValidCoord(d.lat, d.lng)) {
          next.set(d.day, [d.lng, d.lat]);
          continue;
        }

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
  }, [token, planContentKey, plan.destinationIata, plan.destinationName]);


  /** Days with resolved coords (geocoding). */
  const dayCoordsKey = useMemo(() => dayCoordsSignature(dayCoords), [dayCoords]);

  const validDays = useMemo(() => {
    return plan.days
      .map((d) => {
        const c = dayCoords.get(d.day);
        return c ? { day: d, coord: c } : null;
      })
      .filter((x): x is { day: DayPlan; coord: [number, number] } => x !== null);
  }, [planContentKey, dayCoordsKey]);

  const originLabel = plan.originPlace?.trim() || plan.originIata || "";
  const destinationLabel =
    plan.destinationPlace?.trim() ||
    plan.destinationIata ||
    plan.destinationName ||
    "";

  const finalizedRouteDays = useMemo(
    () => buildFinalizedRouteDays(plan.days, dayCoords),
    [planContentKey, dayCoordsKey],
  );

  const routeReady = useMemo(
    () =>
      isRouteDrawingReady({
        streaming,
        expectedDayCount,
        totalPlanDays: plan.days.length,
        finalizedCount: finalizedRouteDays.length,
      }),
    [streaming, expectedDayCount, plan.days.length, finalizedRouteDays.length],
  );

  const routeFetchKey = useMemo(
    () =>
      buildRouteFetchKey({
        origin,
        originLabel,
        destinationLabel,
        finalizedDays: finalizedRouteDays,
      }),
    [origin, originLabel, destinationLabel, finalizedRouteDays],
  );

  const routeData = useMemo(
    () => (routeReady ? tripSegments : EMPTY_TRIP_SEGMENTS),
    [routeReady, tripSegments],
  );

  const planDaysGeoKey = useMemo(
    () => planDaysGeoSignature(plan.days),
    [planContentKey],
  );

  /** City stop geometry only — stable across re-renders. */
  const cityStopCoords = useMemo(
    () => buildCityStops(validDays, plan.days.length, preferDriving),
    [validDays, plan.days.length, preferDriving],
  );

  const activeDayCoord = useMemo((): [number, number] | null => {
    return resolveActiveDayCoord(activeDay, plan, dayCoords, cityStopCoords);
  }, [activeDay, planContentKey, dayCoordsKey, planDaysGeoKey, cityStopCoords]);

  const activeDayCoordKey = activeDayCoord ? coordKey(activeDayCoord) : "";

  const tripRouteBounds = useMemo((): mapboxgl.LngLatBounds | null => {
    if (routeData.length === 0 && finalizedRouteDays.length === 0) return null;
    const bounds = new mapboxgl.LngLatBounds();
    routeData.forEach((s) => s.coordinates.forEach((c) => bounds.extend(c)));
    finalizedRouteDays.forEach((v) => bounds.extend(v.coord));
    if (origin) bounds.extend(origin);
    return bounds.isEmpty() ? null : bounds;
  }, [routeData, finalizedRouteDays, origin]);

  const tripRouteBoundsKey = useMemo(
    () => (tripRouteBounds ? boundsToKey(tripRouteBounds) : ""),
    [tripRouteBounds],
  );

  // Mapbox Directions — only when origin/destination or finalized day coords change.
  useEffect(() => {
    if (!token || !routeFetchKey || !routeReady) {
      if (!routeReady) setTripSegments([]);
      return;
    }

    let cancelled = false;
    segmentGenRef.current += 1;
    const gen = segmentGenRef.current;
    routeAnimatedRef.current = false;
    initialBoundsFitRef.current = false;
    lastFlyTargetKeyRef.current = "";
    setSegmentsLoading(true);

    (async () => {
      const specs = buildSegmentSpecs(finalizedRouteDays, origin, {
        preferDriving,
        destinationIata: plan.destinationIata,
        groundTransportMode: plan.groundTransportMode,
      });
      const resolved = await resolveSegmentGeometries(specs, token);
      if (!cancelled && gen === segmentGenRef.current) {
        setTripSegments(resolved);
        setSegmentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    token,
    routeFetchKey,
    routeReady,
    origin,
    preferDriving,
    plan.destinationIata,
    plan.groundTransportMode,
  ]);

  // Intra-city: markers only — no Mapbox Directions between POIs.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getSource(ACTIVE_DAY_SOURCE)) {
      (map.getSource(ACTIVE_DAY_SOURCE) as mapboxgl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }, [activeDay, planContentKey]);

  // Click-to-zoom: drone view on selected activity.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget || focusTarget.mode !== "drone") return;

    const run = () => {
      if (!isValidCoord(focusTarget.lat, focusTarget.lng)) return;
      flyToPoiDrone(map, [focusTarget.lng, focusTarget.lat]);
    };

    if (map.isStyleLoaded() && ready.current) run();
    else map.once("load", run);
  }, [focusTarget]);

  // Road trips: one marker per day (don't merge consecutive days into one stop).
  const roadTripMode = preferDriving;

  const cityStops = useMemo(
    () => buildCityStops(validDays, plan.days.length, roadTripMode),
    [validDays, plan.days.length, roadTripMode],
  );

  const cityStopsKey = useMemo(() => buildCityStopsKey(cityStops), [cityStops]);

  const routeDataKey = useMemo(() => buildRouteDataKey(routeData), [routeData]);

  useEffect(() => {
    if (token && (cityStops.length > 0 || !segmentsLoading)) {
      setShowBootLoader(false);
    }
  }, [token, cityStops.length, segmentsLoading]);

  const mapCenter = useMemo((): [number, number] | null => {
    if (isValidCoord(plan.centerLat, plan.centerLng)) {
      return [plan.centerLng, plan.centerLat];
    }
    for (const d of plan.days) {
      if (isValidCoord(d.lat, d.lng)) return [d.lng, d.lat];
    }
    const first = validDays[0]?.coord;
    return first ?? null;
  }, [plan.centerLat, plan.centerLng, plan.days, validDays]);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    const center: [number, number] = mapCenter ?? [12.5, 41.9];
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE_DEFAULT,
      center,
      zoom: mapCenter ? 6 : 2,
      attributionControl: false,
    });
    appliedStyleRef.current = MAP_STYLE_DEFAULT;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    map.on("load", () => {
      ready.current = true;
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      clearCityMarkerLayer(markersRef, durationMarkersRef);
      clearPoiMarkerLayer(poiMarkersRef);
      if (originMarkerRef.current) {
        unmountReactRoot(originMarkerRef.current.root);
        originMarkerRef.current.marker.remove();
        originMarkerRef.current = null;
      }
      for (const mode of ROUTE_MODES) {
        const layerId = `trip-segments-${mode}-line`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(`trip-segments-${mode}`)) map.removeSource(`trip-segments-${mode}`);
      }
      if (map.getLayer(ACTIVE_DAY_LAYER)) map.removeLayer(ACTIVE_DAY_LAYER);
      if (map.getSource(ACTIVE_DAY_SOURCE)) map.removeSource(ACTIVE_DAY_SOURCE);
      map.remove();
      mapRef.current = null;
      ready.current = false;
      routeAnimatedRef.current = false;
      initialBoundsFitRef.current = false;
      lastFlyTargetKeyRef.current = "";
    };
  }, [token]);

  // Swap basemap style in-place — overlays are restored via mapStyleEpoch effects.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token) return;

    const nextStyle = isSatellite ? MAP_STYLE_SATELLITE : MAP_STYLE_DEFAULT;
    if (appliedStyleRef.current === nextStyle) return;

    const switchStyle = () => {
      if (!mapRef.current) return;
      appliedStyleRef.current = nextStyle;
      routeAnimatedRef.current = true;
      map.setStyle(nextStyle);
      map.once("style.load", () => {
        ready.current = true;
        setMapStyleEpoch((epoch) => epoch + 1);
      });
    };

    if (ready.current && map.isStyleLoaded()) switchStyle();
    else map.once("load", switchStyle);
  }, [isSatellite, token]);

  // POI sightseeing markers from AI-generated pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let disposed = false;

    const apply = () => {
      if (disposed) return;
      clearPoiMarkerLayer(poiMarkersRef);
      if (poiPins.length === 0) return;

      for (const pin of poiPins) {
        const isActive = pin.day === activeDayRef.current;
        const { el, root } = createPoiMarkerElement(pin, isActive);
        const lngLat: [number, number] = [pin.lng, pin.lat];
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);

        const dayPlan = plan.days.find((d) => d.day === pin.day);
        const time =
          pin.arrivalTime && pin.departureTime
            ? `${pin.arrivalTime} – ${pin.departureTime}`
            : pin.arrivalTime ?? pin.departureTime;
        const cost =
          pin.estimatedCostEur != null && pin.estimatedCostEur >= 0
            ? `€${pin.estimatedCostEur}`
            : undefined;

        const poiDetails: PoiDetailsData | null = dayPlan
          ? {
              ...mapPinToPoiDetails(
                {
                  name: pin.name,
                  lat: pin.lat,
                  lng: pin.lng,
                  category: pin.category,
                  description: pin.description,
                  arrivalTime: pin.arrivalTime,
                  departureTime: pin.departureTime,
                  estimatedCostEur: pin.estimatedCostEur,
                },
                dayPlan,
              ),
              day: dayPlan.day,
            }
          : null;

        const openDetails = onOpenPoiDetailsRef.current;
        attachMarkerPopup(
          marker,
          buildMarkerPopupHtml({
            title: pin.name,
            description: pin.description,
            time,
            cost,
            showDetailsButton: Boolean(openDetails && poiDetails),
          }),
          poiDetails && openDetails ? () => openDetails(poiDetails) : undefined,
        );

        poiMarkersRef.current.push({ marker, day: pin.day, root, pin });
      }
    };

    const onReady = () => apply();

    if (map.isStyleLoaded() && ready.current) {
      apply();
    } else {
      map.once("load", onReady);
    }

    return () => {
      disposed = true;
      map.off("load", onReady);
      clearPoiMarkerLayer(poiMarkersRef);
    };
  }, [poiPinsKey, mapStyleEpoch]);

  // Highlight active POI markers without rebuilding the whole layer.
  useEffect(() => {
    for (const { root, pin, day } of poiMarkersRef.current) {
      root.render(
        <MapPoiMarker
          category={pin.category}
          isActive={day === activeDay}
          name={pin.name}
          imageUrl={pin.imageUrl}
        />,
      );
    }
  }, [activeDay]);

  // Realistic multi-modal route layers (driving / flight / ferry / transit).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeData.length) return;

    const drawRoutes = () => {
      let hasAnyLayer = false;
      const shouldAnimate = !routeAnimatedRef.current;

      for (const mode of visibleRouteModes) {
        const fc = segmentsToFeatureCollection(routeData, mode);
        if (ensureRouteLayer(map, mode, fc, !shouldAnimate)) {
          hasAnyLayer = true;
        }
      }

      if (hasAnyLayer) {
        if (shouldAnimate) {
          routeAnimatedRef.current = true;
          animateRouteLayers(map, visibleRouteModes, activeDay);
        }
      }
    };

    if (map.isStyleLoaded() && ready.current) drawRoutes();
    else map.once("load", drawRoutes);
  }, [routeData, origin, visibleRouteModes, mapStyleEpoch, activeDay]);

  // Fit the full trip once when route geometry is first available.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tripRouteBounds || !tripRouteBoundsKey || initialBoundsFitRef.current) return;

    const fit = () => {
      if (initialBoundsFitRef.current || !tripRouteBounds) return;
      initialBoundsFitRef.current = true;
      map.fitBounds(tripRouteBounds, { padding: 64, duration: 1600, maxZoom: 7.5 });
    };

    if (map.isStyleLoaded() && ready.current) fit();
    else map.once("load", fit);
  }, [tripRouteBoundsKey, tripRouteBounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeData.length) return;
    if (!map.isStyleLoaded() || !ready.current) return;
    applyActiveDayRouteHighlight(map, activeDay);
  }, [activeDay, routeData, mapStyleEpoch]);

  // Origin airport marker (start of international flight leg).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) {
      if (originMarkerRef.current) {
        unmountReactRoot(originMarkerRef.current.root);
        originMarkerRef.current.marker.remove();
        originMarkerRef.current = null;
      }
      return;
    }

    const apply = () => {
      if (!originMarkerRef.current) {
        const label = plan.originPlace ?? plan.originIata ?? "Origin";
        const { el, root } = createOriginMarkerElement(label);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat(origin)
          .addTo(map);
        originMarkerRef.current = { marker, root };
      } else {
        originMarkerRef.current.marker.setLngLat(origin);
      }
    };

    if (map.isStyleLoaded() && ready.current) apply();
    else map.once("load", apply);
  }, [origin, plan.originIata, plan.originPlace, mapStyleEpoch]);

  // Layla-style city markers + duration badges (rebuild when stops/segments change).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let disposed = false;

    const apply = () => {
      if (disposed) return;
      clearCityMarkerLayer(markersRef, durationMarkersRef);
      if (cityStops.length === 0) return;

      for (const stop of cityStops) {
        const isActive =
          activeDayRef.current >= stop.startDay && activeDayRef.current <= stop.endDay;
        const { el, root } = createCityMarkerElement(stop, isActive);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat(stop.coord)
          .addTo(map);

        const dayPlan = plan.days.find((d) => d.day === stop.startDay);
        const budget =
          dayPlan && typeof dayPlan.dailyBudgetEur === "number" && dayPlan.dailyBudgetEur > 0
            ? `€${Math.round(dayPlan.dailyBudgetEur)} / dan`
            : undefined;
        const timeParts = [
          dayPlan?.drivingDurationHours,
          stop.dayCount > 1 ? `Dan ${stop.startDay}–${stop.endDay}` : `Dan ${stop.startDay}`,
        ].filter(Boolean);

        attachMarkerPopup(
          marker,
          buildMarkerPopupHtml({
            title: stop.city,
            description: dayPlan?.title ?? dayPlan?.focusName,
            time: timeParts.join(" · "),
            cost: budget,
          }),
        );

        markersRef.current.push({
          marker,
          startDay: stop.startDay,
          endDay: stop.endDay,
          root,
          stop,
        });
      }

      for (const segment of routeData) {
        const mid = segmentMidpoint(segment.coordinates);
        const badge = createDurationBadgeElement(segment);
        const m = new mapboxgl.Marker({ element: badge, anchor: "center" })
          .setLngLat(mid)
          .addTo(map);
        durationMarkersRef.current.push(m);
      }
    };

    const onReady = () => apply();

    if (map.isStyleLoaded() && ready.current) {
      apply();
    } else {
      map.once("load", onReady);
    }

    return () => {
      disposed = true;
      map.off("load", onReady);
      clearCityMarkerLayer(markersRef, durationMarkersRef);
    };
  }, [cityStopsKey, routeDataKey, mapStyleEpoch]);

  // Highlight active city marker without rebuilding DOM.
  useEffect(() => {
    for (const { root, stop, startDay, endDay, marker } of markersRef.current) {
      const isActive = activeDay >= startDay && activeDay <= endDay;
      root.render(
        <MapCityMarker
          isActive={isActive}
          dayCount={stop.dayCount}
          imageUrl={stop.imageUrl}
          city={stop.city}
        />,
      );
      marker.getElement().className = `trip-map-city-marker flex flex-col items-center cursor-pointer transition-opacity duration-300 ease-out${
        isActive ? "" : " opacity-90"
      }`;
    }
  }, [activeDay]);

  // Reset fly dedupe when playback starts so day 1 always animates.
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      lastFlyTargetKeyRef.current = "";
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Scroll-driven / playback camera — only when active day or its coordinates change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (scrollSpyPaused && !isPlaying) return;
    if (!isPlaying && focusTarget?.mode === "drone" && focusTarget.day === activeDay) return;
    if (!activeDayCoord) return;

    const flyKey = `${isPlaying ? "play" : "scroll"}:${activeDay}:${activeDayCoordKey}`;
    if (lastFlyTargetKeyRef.current === flyKey) return;
    lastFlyTargetKeyRef.current = flyKey;

    const runFly = () => {
      if (isPlaying) flyToPlaybackDay(map, activeDayCoord);
      else flyToActiveDay(map, activeDayCoord);
    };

    const schedule = () => {
      if (map.isStyleLoaded()) runFly();
      else map.once("load", runFly);
    };

    if (ready.current) schedule();
    else map.once("load", schedule);
  }, [activeDay, activeDayCoord, activeDayCoordKey, focusTarget, scrollSpyPaused, isPlaying]);

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground flex items-center gap-2">
        <MapPin className="h-4 w-4" /> {error}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[280px] rounded-2xl overflow-hidden border border-border bg-card shadow-sm">
      <div ref={containerRef} className="h-full w-full min-h-[280px]" />
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setIsSatellite((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white transition-colors"
          title={isSatellite ? t("aiplan.mapStreets" as never) : t("aiplan.mapSatellite" as never)}
          aria-pressed={isSatellite}
        >
          {isSatellite ? (
            <>
              <MapIcon className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{t("aiplan.mapStreets" as never)}</span>
            </>
          ) : (
            <>
              <Satellite className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{t("aiplan.mapSatellite" as never)}</span>
            </>
          )}
        </button>
      </div>
      {showBootLoader && (!token || (cityStops.length === 0 && segmentsLoading)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      )}
    </div>
  );
}

/** Memoized map shell — re-renders only when plan/geo/active day change. */
export const TripMap = memo(TripMapInner, tripMapPropsAreEqual);

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}
