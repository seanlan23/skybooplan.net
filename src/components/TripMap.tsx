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
  haversineKm,
  type RouteMode,
  type TripRouteSegment,
} from "@/lib/tripMapRoutes";
import {
  normalizeMapPoiCategory,
  mapPoiVisual,
  type MapPoiCategory,
  type MapPoiPin,
} from "@/lib/mapPoiCategory";
import {
  findActivityPinFuzzy,
  resolveActivityCoordinates,
  resolveActivityMapCategory,
  shouldShowActivityOnMap,
} from "@/lib/mapPoiResolver";
import { MapCityMarker, MapOriginMarker, MapPoiMarker } from "@/components/MapPoiMarker";
import { normalizeImageUrl } from "@/lib/unsplashPhotos";

import { mapPinToPoiDetails, type PoiDetailsData } from "@/lib/poiDetails.types";
import { useI18n } from "@/lib/i18n";
import {
  buildFinalizedRouteDays,
  buildRouteFetchKey,
  isRouteDrawingReady,
  type RouteDayStop,
} from "@/lib/tripMapRouteState";
import {
  ROUTE_DRAW_DURATION_MS,
  coordsBoundsKey,
  progressAlongRoute,
  resolveActiveDayRoute,
} from "@/lib/tripMapProgressiveDraw";

export type ActivityMapFocus = {
  lat: number;
  lng: number;
  day: number;
  poiName?: string;
};

export type MapFocusTarget = ActivityMapFocus & {
  mode: "drone" | "day";
  /** Bumps on each click so repeated clicks re-trigger fly. */
  key: number;
};

export function poiFocusKey(name: string, lat: number, lng: number): string {
  return `${name.trim().toLowerCase()}@${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Match plan click to map pin — coords first (handles name variants). */
export function matchesPoiFocus(
  pin: { name: string; lat: number; lng: number },
  target: { poiName?: string; lat: number; lng: number },
): boolean {
  if (
    Math.abs(pin.lat - target.lat) < 0.00025 &&
    Math.abs(pin.lng - target.lng) < 0.00025
  ) {
    return true;
  }
  if (!target.poiName) return false;
  return (
    poiFocusKey(pin.name, pin.lat, pin.lng) ===
    poiFocusKey(target.poiName, target.lat, target.lng)
  );
}

type Props = {
  plan: AiTripPlan;
  activeDay: number;
  focusTarget?: MapFocusTarget | null;
  /** When true, skip scroll-driven camera moves (click navigation in progress). */
  scrollSpyPaused?: boolean;
  /** City marker click — sync plan list to this day. */
  onDaySelect?: (day: number) => void;
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

const MAP_STYLE_DEFAULT = "mapbox://styles/mapbox/streets-v12";
const MAP_STYLE_SATELLITE = "mapbox://styles/mapbox/satellite-streets-v12";

/** Ensure Mapbox native POI / place labels stay visible on the basemap. */
function enableMapPoiLayers(map: mapboxgl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const id = layer.id;
    if (!/(poi|place-label|road-label|transit-label|landmark|national-park)/i.test(id)) continue;
    try {
      map.setLayoutProperty(id, "visibility", "visible");
      map.setLayerZoomRange(id, 0, 24);
    } catch {
      /* layer may not support layout or zoom range */
    }
  }
}

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
        `${p.day}:${p.name}:${p.lat.toFixed(4)}:${p.lng.toFixed(4)}:${p.category}:${p.unsplashQuery ?? ""}:${p.imageUrl ?? ""}`,
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
  return `${target.mode}:${target.day}:${target.lat}:${target.lng}:${target.poiName ?? ""}:${target.key}`;
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
  if (buildPoiPinsKey(prev.plan) !== buildPoiPinsKey(next.plan)) return false;
  const cityPhotos = (plan: AiTripPlan) =>
    plan.days.map((d) => `${d.day}:${d.imageUrl ?? ""}`).join("|");
  if (cityPhotos(prev.plan) !== cityPhotos(next.plan)) return false;
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

const POI_REVEAL_TRANSITION = "opacity 0.4s ease-out";

type PoiMarkerEntry = {
  id: string;
  marker: mapboxgl.Marker;
  day: number;
  root: Root | null;
  pin: MapPoiPin;
  photoEl?: HTMLDivElement;
};

/** Pick a single marker when several pins share the same coords (e.g. mapPin + activity). */
export function pickFocusedPoiEntryId(
  entries: PoiMarkerEntry[],
  target: { poiName?: string; lat: number; lng: number; day?: number },
): string | null {
  let candidates = entries.filter((e) => matchesPoiFocus(e.pin, target));
  if (target.day != null) {
    const sameDay = candidates.filter((e) => e.day === target.day);
    if (sameDay.length) candidates = sameDay;
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!.id;

  const targetName = target.poiName?.trim().toLowerCase() ?? "";
  let best = candidates[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const entry of candidates) {
    const pinName = entry.pin.name.trim().toLowerCase();
    let score = 0;
    if (targetName && pinName === targetName) score = 100;
    else if (
      targetName &&
      (pinName.includes(targetName) || targetName.includes(pinName))
    ) {
      score = 80;
    } else {
      score = 40;
    }
    if (target.day != null && entry.day === target.day) score += 50;
    score -= haversineKm([entry.pin.lng, entry.pin.lat], [target.lng, target.lat]) * 10;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best.id;
}

function coordsNearPin(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  maxKm = 0.12,
): boolean {
  return haversineKm([a.lng, a.lat], [b.lng, b.lat]) < maxKm;
}
type CityMarkerEntry = {
  id: string;
  marker: mapboxgl.Marker;
  startDay: number;
  endDay: number;
  root: Root;
  stop: CityMapStop;
};

type DurationMarkerEntry = {
  marker: mapboxgl.Marker;
  dayTo: number;
};

function clearPoiRevealTimers(timers: { current: number[] }) {
  for (const id of timers.current) window.clearTimeout(id);
  timers.current = [];
}

function setPoiMarkerHidden(el: HTMLElement, hidden: boolean) {
  el.style.transition = POI_REVEAL_TRANSITION;
  if (hidden) {
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  } else {
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
  }
}

function setPoiMarkersForDay(
  store: { current: PoiMarkerEntry[] },
  activeDay: number,
  visibleForActiveDay: boolean,
) {
  for (const entry of store.current) {
    const el = entry.marker.getElement();
    if (entry.day !== activeDay) {
      setPoiMarkerHidden(el, true);
      entry.marker.getPopup()?.remove();
    } else {
      setPoiMarkerHidden(el, !visibleForActiveDay);
    }
  }
}

/** Marker store id — day-scoped so Ao Nang D6 and Phi Phi ferry D7 never collide. */
function poiMarkerId(pin: { day: number; name: string; lat: number; lng: number }): string {
  return `${pin.day}:${poiFocusKey(pin.name, pin.lat, pin.lng)}`;
}

function setDurationBadgesForDay(
  store: { current: DurationMarkerEntry[] },
  activeDay: number,
  visible: boolean,
) {
  for (const { marker, dayTo } of store.current) {
    const el = marker.getElement();
    el.style.transition = "opacity 0.35s ease";
    el.style.opacity = dayTo === activeDay && visible ? "1" : "0";
    el.style.pointerEvents = dayTo === activeDay && visible ? "auto" : "none";
  }
}

function hideAllTripSegmentLayers(map: mapboxgl.Map) {
  for (const mode of ROUTE_MODES) {
    const layerId = `trip-segments-${mode}-line`;
    if (!map.getLayer(layerId)) continue;
    map.setLayoutProperty(layerId, "visibility", "none");
    map.setPaintProperty(layerId, "line-opacity", 0);
  }
}

/** Wipe every route line — only the active-day layer is redrawn afterward. */
function clearAllRouteDisplay(map: mapboxgl.Map) {
  hideAllTripSegmentLayers(map);
  ensureActiveDayRouteLayer(map);
  setActiveDayRouteData(map, []);
}

function cityMarkerId(stop: CityMapStop): string {
  return `city:${stop.startDay}:${coordKey(stop.coord)}`;
}

function clearPoiMarkerLayer(store: { current: PoiMarkerEntry[] }) {
  store.current.forEach((m) => {
    unmountReactRoot(m.root ?? undefined);
    m.marker.remove();
  });
  store.current = [];
}

/** After setStyle, Mapbox fires `style.load` — not `load` again. */
function whenMapStyleReady(
  map: mapboxgl.Map,
  isReady: { current: boolean },
  fn: () => void,
): () => void {
  if (map.isStyleLoaded() && isReady.current) {
    fn();
    return () => {};
  }
  const onStyle = () => fn();
  map.once("style.load", onStyle);
  return () => {
    map.off("style.load", onStyle);
  };
}

function clearDurationMarkerLayer(store: { current: DurationMarkerEntry[] }) {
  store.current.forEach((m) => m.marker.remove());
  store.current = [];
}

function clearCityMarkerLayer(
  markers: { current: CityMarkerEntry[] },
  durationMarkers?: { current: DurationMarkerEntry[] },
) {
  markers.current.forEach((m) => {
    unmountReactRoot(m.root);
    m.marker.remove();
  });
  markers.current = [];
  if (durationMarkers) {
    durationMarkers.current.forEach((m) => m.marker.remove());
    durationMarkers.current = [];
  }
}

function cityLabelElement(text: string): HTMLDivElement {
  const label = document.createElement("div");
  label.className = "layla-city-label";
  label.textContent = text;
  return label;
}

function createCityMarkerElement(
  stop: CityMapStop,
  isActive: boolean,
  onSelect?: (startDay: number) => void,
  activeDay?: number,
): { el: HTMLDivElement; root: Root } {
  const wrap = document.createElement("div");
  wrap.className = `layla-city-marker mapbox-marker-root${isActive ? " layla-city-marker--active" : ""}`;
  wrap.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect?.(isActive && activeDay != null ? activeDay : stop.startDay);
  });
  wrap.appendChild(cityLabelElement(stop.city));

  const pinHost = document.createElement("div");
  wrap.appendChild(pinHost);

  const badgeStart = isActive && activeDay != null ? activeDay : stop.startDay;
  const badgeEnd = isActive && activeDay != null ? activeDay : stop.endDay;

  const root = createRoot(pinHost);
  root.render(
    <MapCityMarker
      isActive={isActive}
      dayNumber={badgeStart}
      dayEnd={badgeEnd}
      imageUrl={stop.imageUrl}
      city={stop.city}
    />,
  );
  return { el: wrap, root };
}

function routeModeLabel(mode: RouteMode, t: (key: string) => string): string {
  switch (mode) {
    case "flight":
      return t("map.routeFlight");
    case "ferry":
      return t("map.routeFerry");
    case "transit":
      return t("map.routeTransit");
    default:
      return t("map.routeDriving");
  }
}

function segmentBadgeText(
  segment: TripRouteSegment,
  plan: AiTripPlan,
  t: (key: string) => string,
): string {
  const day = plan.days.find((d) => d.day === segment.dayTo);
  const leg = day?.transportation?.find((item) => item.type === segment.mode);
  const duration = leg?.duration?.trim() || segment.durationLabel;
  return `${routeModeLabel(segment.mode, t)} · ${duration}`;
}

function createDurationBadgeElement(segment: TripRouteSegment, label: string): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = `layla-duration-badge${segment.mode === "flight" ? " layla-duration-badge--flight" : ""}`;
  wrap.innerHTML = `${transportIconSvg(segment.mode)}<span>${escapeHtml(label)}</span>`;
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

const POI_PHOTO_MARKER_BASE =
  "w-10 h-10 rounded-full border-2 border-white shadow-md bg-cover bg-center bg-no-repeat";

function poiPhotoMarkerClass(
  isDayActive: boolean,
  isFocused: boolean,
  isDimmed = false,
): string {
  // No Tailwind `scale-*` — scale uses transform and fights Mapbox marker positioning.
  if (isFocused) {
    return `${POI_PHOTO_MARKER_BASE} border-amber-500 ring-[3px] ring-amber-400 ring-offset-2 shadow-lg z-[10]`;
  }
  if (isDimmed) {
    return `${POI_PHOTO_MARKER_BASE} opacity-35`;
  }
  return `${POI_PHOTO_MARKER_BASE}${
    isDayActive ? " ring-2 ring-sky-400/50 ring-offset-1 z-[6]" : " opacity-90"
  }`;
}

function poiLabelElement(name: string): HTMLSpanElement {
  const label = document.createElement("span");
  label.dataset.poiFocusLabel = "1";
  label.className = "layla-poi-label";
  label.textContent = name;
  return label;
}

/** Plain DOM marker — Layla photo circle + always-visible POI name. */
function createPoiMarkerElement(
  pin: MapPoiPin,
  isDayActive: boolean,
): { el: HTMLDivElement; root: Root | null; photoEl?: HTMLDivElement } {
  const el = document.createElement("div");
  el.className =
    "trip-map-poi-marker mapbox-marker-root pointer-events-auto flex shrink-0 cursor-pointer flex-col items-center overflow-visible";
  el.title = pin.name;
  el.appendChild(poiLabelElement(pin.name));

  const imageUrl = pin.imageUrl?.trim();
  if (imageUrl) {
    const photo = document.createElement("div");
    photo.className = poiPhotoMarkerClass(isDayActive, false);
    photo.style.backgroundImage = `url("${imageUrl.replace(/"/g, "%22")}")`;
    photo.setAttribute("role", "img");
    photo.setAttribute("aria-label", pin.name);
    el.appendChild(photo);

    const probe = new Image();
    probe.onerror = () => {
      const visual = mapPoiVisual(pin.category);
      photo.style.backgroundImage = "";
      photo.className = `${poiPhotoMarkerClass(isDayActive, false)} flex items-center justify-center text-base leading-none`;
      photo.style.backgroundColor = visual.bg;
      photo.textContent = visual.emoji;
    };
    probe.src = imageUrl;

    return { el, root: null, photoEl: photo };
  }

  const iconHost = document.createElement("div");
  el.appendChild(iconHost);
  const root = createRoot(iconHost);
  root.render(
    <MapPoiMarker
      category={pin.category}
      isActive={isDayActive}
      showLabel={false}
      name={pin.name}
      imageUrl={pin.imageUrl}
    />,
  );
  return { el, root };
}

function dayCityName(day: DayPlan): string {
  return (day.city ?? day.focusName ?? "").trim();
}

/** True when the pin is just the city name (useless as a stop label). */
function isGenericCityPinName(name: string, city: string): boolean {
  const n = name.trim().toLowerCase();
  const c = city.trim().toLowerCase();
  return Boolean(n && c && n === c);
}

function collectPlanPoiPins(plan: AiTripPlan): MapPoiPin[] {
  const pins: MapPoiPin[] = [];
  const COLOCATE_KM = 0.12;

  const pushResolved = (day: DayPlan, source: {
    name: string;
    lat: number;
    lng: number;
    category: MapPoiCategory;
    description?: string;
    arrivalTime?: string;
    departureTime?: string;
    estimatedCostEur?: number;
    imageUrl?: string;
    unsplashQuery?: string;
  }) => {
    if (!isValidCoord(source.lat, source.lng)) return;
    const city = dayCityName(day);
    if (isGenericCityPinName(source.name, city)) return;

    const existing = pins.find(
      (p) =>
        p.day === day.day &&
        haversineKm([p.lng, p.lat], [source.lng, source.lat]) < COLOCATE_KM,
    );
    if (existing) {
      const sourceName = source.name.trim();
      const existingName = existing.name.trim();
      const preferSourceName =
        sourceName.length > existingName.length ||
        (isGenericCityPinName(existingName, city) && !isGenericCityPinName(sourceName, city));
      if (preferSourceName) {
        existing.name = source.name;
        existing.description = source.description ?? existing.description;
      }
      existing.imageUrl = normalizeImageUrl(source.imageUrl) ?? existing.imageUrl;
      existing.unsplashQuery = source.unsplashQuery?.trim() || existing.unsplashQuery;
      existing.category = source.category;
      existing.arrivalTime = source.arrivalTime ?? existing.arrivalTime;
      existing.departureTime = source.departureTime ?? existing.departureTime;
      existing.estimatedCostEur = source.estimatedCostEur ?? existing.estimatedCostEur;
      return;
    }

    pins.push({
      day: day.day,
      name: source.name,
      lat: source.lat,
      lng: source.lng,
      category: source.category,
      description: source.description,
      arrivalTime: source.arrivalTime,
      departureTime: source.departureTime,
      estimatedCostEur: source.estimatedCostEur,
      imageUrl: normalizeImageUrl(source.imageUrl),
      unsplashQuery: source.unsplashQuery,
    });
  };

  for (const day of plan.days) {
    for (const pin of day.mapPins ?? []) {
      if (!isValidCoord(pin.lat, pin.lng)) continue;
      const coords = resolveActivityCoordinates(
        { name: pin.name, lat: pin.lat, lng: pin.lng },
        day,
      );
      if (!coords) continue;
      pushResolved(day, {
        name: pin.name,
        lat: coords.lat,
        lng: coords.lng,
        category: normalizeMapPoiCategory(pin.category),
        description: pin.description,
        arrivalTime: pin.arrivalTime,
        departureTime: pin.departureTime,
        estimatedCostEur: pin.estimatedCostEur,
        imageUrl: pin.imageUrl,
        unsplashQuery: pin.unsplashQuery,
      });
    }

    const slots = day.activities;
    if (!slots) continue;
    for (const act of [...slots.morning, ...slots.afternoon, ...slots.evening]) {
      if (!shouldShowActivityOnMap(act)) continue;
      const coords = resolveActivityCoordinates(act, day);
      if (!coords) continue;
      const fuzzyPin = findActivityPinFuzzy(day, act);
      pushResolved(day, {
        name: act.name,
        lat: coords.lat,
        lng: coords.lng,
        category: resolveActivityMapCategory(act, fuzzyPin),
        description: act.description,
        arrivalTime: act.arrivalTime,
        departureTime: act.departureTime,
        estimatedCostEur: act.estimatedCostEur,
        imageUrl: act.imageUrl ?? fuzzyPin?.imageUrl,
        unsplashQuery: act.unsplashQuery ?? fuzzyPin?.unsplashQuery,
      });
    }
  }
  return pins;
}

/** Shared camera timing — synced with route draw (~2s). */
const MAP_CAMERA_DURATION_MS = 2000;
const DAY_VIEW_PADDING = 56;

function padBoundsIfPoint(bounds: mapboxgl.LngLatBounds) {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  if (Math.abs(ne.lng - sw.lng) < 0.002 && Math.abs(ne.lat - sw.lat) < 0.002) {
    const c = bounds.getCenter();
    bounds.extend([c.lng + 0.06, c.lat + 0.045]);
    bounds.extend([c.lng - 0.06, c.lat - 0.045]);
  }
}

function fitActiveDayView(
  map: mapboxgl.Map,
  opts: {
    boundsPoints: [number, number][];
    fallbackCenter: [number, number] | null;
  },
) {
  const bounds = new mapboxgl.LngLatBounds();
  for (const c of opts.boundsPoints) bounds.extend(c);
  if (bounds.isEmpty() && opts.fallbackCenter) {
    bounds.extend(opts.fallbackCenter);
  }
  if (bounds.isEmpty()) return;

  padBoundsIfPoint(bounds);
  map.stop();
  map.fitBounds(bounds, {
    padding: DAY_VIEW_PADDING,
    duration: MAP_CAMERA_DURATION_MS,
    essential: true,
  });
}

function flyToDayCenter(map: mapboxgl.Map, center: [number, number]) {
  map.stop();
  map.flyTo({
    center,
    zoom: 14,
    speed: 0.8,
    curve: 1.5,
    easing: (t) => t,
    essential: true,
  });
}

function flyToPoiFocus(map: mapboxgl.Map, center: [number, number]) {
  flyToDayCenter(map, center);
}

function applyPoiMarkerVisualState(
  entry: PoiMarkerEntry,
  state: { isDayActive: boolean; isFocused: boolean; isDimmed: boolean },
) {
  const { marker, pin, root, photoEl } = entry;
  const el = marker.getElement();
  const isDayActiveOnly = state.isDayActive && !state.isFocused && !state.isDimmed;

  el.style.zIndex = state.isFocused ? "20" : state.isDimmed ? "1" : "5";

  if (photoEl) {
    const hasEmojiFallback = Boolean(photoEl.textContent?.trim());
    photoEl.className = hasEmojiFallback
      ? `${poiPhotoMarkerClass(isDayActiveOnly, state.isFocused, state.isDimmed)} flex items-center justify-center text-base leading-none`
      : poiPhotoMarkerClass(isDayActiveOnly, state.isFocused, state.isDimmed);
    if (hasEmojiFallback && state.isFocused) {
      photoEl.style.backgroundColor = mapPoiVisual(pin.category).bg;
    }
  } else if (root) {
    root.render(
      <MapPoiMarker
        category={pin.category}
        isActive={isDayActiveOnly}
        isFocused={state.isFocused}
        isDimmed={state.isDimmed}
        showLabel={false}
        name={pin.name}
        imageUrl={pin.imageUrl}
      />,
    );
  }

  let labelEl = el.querySelector<HTMLElement>("[data-poi-focus-label]");
  if (!labelEl) {
    labelEl = poiLabelElement(pin.name);
    el.prepend(labelEl);
  }
  labelEl.textContent = pin.name;
  labelEl.className = state.isFocused ? "layla-poi-label layla-poi-label--focused" : "layla-poi-label";
  labelEl.style.display = "";
}

function openFocusedPoiPopup(
  map: mapboxgl.Map,
  entries: PoiMarkerEntry[],
  target: MapFocusTarget,
  focusedId: string | null,
) {
  for (const entry of entries) {
    entry.marker.getPopup()?.remove();
  }
  if (!focusedId) return;
  const entry = entries.find((e) => e.id === focusedId);
  if (!entry || !matchesPoiFocus(entry.pin, target)) return;
  entry.marker.addTo(map);
}
function buildMarkerPopupHtml(opts: {
  title: string;
  description?: string;
  time?: string;
  cost?: string;
  imageUrl?: string;
  showDetailsButton?: boolean;
  detailsButtonLabel?: string;
}): string {
  const desc = opts.description?.trim();
  const time = opts.time?.trim();
  const cost = opts.cost?.trim();
  const imageUrl = opts.imageUrl?.trim();
  const descShort = desc
    ? desc.length > 140
      ? `${desc.slice(0, 137).trim()}…`
      : desc
    : "";
  const hero = imageUrl
    ? `<div class="mb-3 -mx-4 -mt-4 h-28 overflow-hidden bg-slate-100"><img src="${escapeHtml(imageUrl)}" alt="" class="h-full w-full object-cover" loading="lazy" /></div>`
    : "";
  const avatar = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="" class="h-8 w-8 shrink-0 rounded-full object-cover border border-white shadow-sm" loading="lazy" />`
    : `<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-base leading-none" aria-hidden="true">📍</span>`;
  return `
    <div class="rounded-2xl bg-white shadow-xl border border-slate-100/80 overflow-hidden p-4 min-w-[210px] max-w-[280px]">
      ${hero}
      <div class="flex items-start gap-2.5 mb-3">
        ${avatar}
        <h4 class="font-bold text-slate-900 text-[15px] leading-snug pt-0.5">${escapeHtml(opts.title)}</h4>
      </div>
      <div class="flex flex-wrap gap-2">
        ${time ? `<span class="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 rounded-full px-3 py-1 text-xs font-semibold tabular-nums"><span aria-hidden="true">🕐</span>${escapeHtml(time)}</span>` : ""}
        ${cost ? `<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-full px-3 py-1 text-xs font-semibold"><span aria-hidden="true">💶</span>${escapeHtml(cost)}</span>` : ""}
      </div>
      ${descShort ? `<p class="mt-3 text-sm text-slate-600 leading-relaxed line-clamp-2">${escapeHtml(descShort)}</p>` : ""}
      ${opts.showDetailsButton ? `<button type="button" data-poi-details-btn class="mt-3 w-full rounded-full bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-4 py-2 transition-colors cursor-pointer">${escapeHtml(opts.detailsButtonLabel ?? "More info")}</button>` : ""}
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
const ROUTE_LINE_COLOR = "#1d4ed8";
const ROUTE_LINE_WIDTH = 4;

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

function setActiveDayRouteLineStyle(map: mapboxgl.Map, mode: RouteMode) {
  if (!map.getLayer(ACTIVE_DAY_LAYER)) return;
  const style = ROUTE_LAYER_STYLE[mode];
  map.setPaintProperty(ACTIVE_DAY_LAYER, "line-color", style.color);
  map.setPaintProperty(ACTIVE_DAY_LAYER, "line-width", style.width);
  map.setPaintProperty(ACTIVE_DAY_LAYER, "line-opacity", style.opacity);
  if (style.dash) {
    map.setPaintProperty(ACTIVE_DAY_LAYER, "line-dasharray", style.dash);
  } else {
    map.setPaintProperty(ACTIVE_DAY_LAYER, "line-dasharray", [1, 0]);
  }
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
  duration = ROUTE_DRAW_DURATION_MS,
  cancelRef?: { current: number },
  generationRef?: { current: number },
  generation?: number,
) {
  if (fullCoords.length < 2) return;

  if (cancelRef?.current) {
    cancelAnimationFrame(cancelRef.current);
    cancelRef.current = 0;
  }

  const start = performance.now();
  const tick = (now: number) => {
    if (generationRef && generation !== generationRef.current) return;
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

function runActiveDayRouteDraw(
  map: mapboxgl.Map,
  coords: [number, number][],
  opts: {
    activeDay: number;
    lineStyle: RouteMode;
    poiMarkersRef: { current: PoiMarkerEntry[] };
    durationMarkersRef: { current: DurationMarkerEntry[] };
    routeDrawAnimRef: { current: number };
    routeDrawGenerationRef: { current: number };
    poiRevealTimersRef: { current: number[] };
  },
) {
  const {
    activeDay,
    lineStyle,
    poiMarkersRef,
    durationMarkersRef,
    routeDrawAnimRef,
    routeDrawGenerationRef,
    poiRevealTimersRef,
  } = opts;

  clearPoiRevealTimers(poiRevealTimersRef);
  if (routeDrawAnimRef.current) {
    cancelAnimationFrame(routeDrawAnimRef.current);
    routeDrawAnimRef.current = 0;
  }

  clearAllRouteDisplay(map);
  setActiveDayRouteLineStyle(map, lineStyle);
  setPoiMarkersForDay(poiMarkersRef, activeDay, false);
  setDurationBadgesForDay(durationMarkersRef, activeDay, false);

  if (coords.length < 2) {
    const timer = window.setTimeout(() => {
      setPoiMarkersForDay(poiMarkersRef, activeDay, true);
      setDurationBadgesForDay(durationMarkersRef, activeDay, true);
    }, 350);
    poiRevealTimersRef.current.push(timer);
    return;
  }

  const generation = ++routeDrawGenerationRef.current;
  animateRouteProgressiveDraw(
    map,
    coords,
    ROUTE_DRAW_DURATION_MS,
    routeDrawAnimRef,
    routeDrawGenerationRef,
    generation,
  );

  for (const entry of poiMarkersRef.current) {
    if (entry.day !== activeDay) continue;
    const ratio = progressAlongRoute(coords, [entry.pin.lng, entry.pin.lat]);
    const delay = Math.round(ratio * ROUTE_DRAW_DURATION_MS * 0.92);
    const timer = window.setTimeout(() => {
      setPoiMarkerHidden(entry.marker.getElement(), false);
    }, delay);
    poiRevealTimersRef.current.push(timer);
  }

  const badgeTimer = window.setTimeout(() => {
    setDurationBadgesForDay(durationMarkersRef, activeDay, true);
  }, Math.round(ROUTE_DRAW_DURATION_MS * 0.88));
  poiRevealTimersRef.current.push(badgeTimer);
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
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
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
  onDaySelect,
  onOpenPoiDetails,
  streaming = false,
  expectedDayCount = 0,
  isPlaying = false,
}: Props) {
  const { t, formatMoney } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onOpenPoiDetailsRef = useRef(onOpenPoiDetails);
  onOpenPoiDetailsRef.current = onOpenPoiDetails;
  const onDaySelectRef = useRef(onDaySelect);
  onDaySelectRef.current = onDaySelect;
  const scrollSpyPausedRef = useRef(scrollSpyPaused);
  scrollSpyPausedRef.current = scrollSpyPaused;
  const activeDayRef = useRef(activeDay);
  activeDayRef.current = activeDay;
  const focusTargetRef = useRef(focusTarget);
  focusTargetRef.current = focusTarget;
  const appliedStyleRef = useRef<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [mapStyleEpoch, setMapStyleEpoch] = useState(0);
  const markersRef = useRef<CityMarkerEntry[]>([]);
  const durationMarkersRef = useRef<DurationMarkerEntry[]>([]);
  const poiMarkersRef = useRef<PoiMarkerEntry[]>([]);
  const poiRevealTimersRef = useRef<number[]>([]);
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
  const [overviewReady, setOverviewReady] = useState(false);
  const lastFlyTargetKeyRef = useRef("");
  const lastPoiFocusCenterRef = useRef<[number, number] | null>(null);
  const segmentGenRef = useRef(0);
  const [tripSegments, setTripSegments] = useState<TripRouteSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [showBootLoader, setShowBootLoader] = useState(true);
  const routeDrawAnimRef = useRef(0);
  const routeDrawGenerationRef = useRef(0);

  const planContentKey = useMemo(() => buildTripMapPlanKey(plan), [plan]);

  /** Photo-only updates must rebuild pins — geo key alone stays stable after Unsplash merge. */
  const planPhotosKey = useMemo(
    () =>
      plan.days
        .map((d) => {
          const pinImgs = (d.mapPins ?? []).map((p) => `${p.name}:${p.imageUrl ?? ""}`).join(",");
          const slots = d.activities;
          const actImgs = slots
            ? [...slots.morning, ...slots.afternoon, ...slots.evening]
                .map((a) => `${a.name}:${a.imageUrl ?? ""}`)
                .join(",")
            : "";
          return `${d.day}:${d.imageUrl ?? ""}:${pinImgs}:${actImgs}`;
        })
        .join("|"),
    [plan],
  );

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

  const poiPinsKey = useMemo(
    () => buildPoiPinsKey(plan),
    [planContentKey, planPhotosKey],
  );
  const poiPins = useMemo(
    () => collectPlanPoiPins(plan),
    [planContentKey, planPhotosKey],
  );

  useEffect(() => {
    let cancelled = false;
    tokenFn({})
      .then((r) => {
        if (cancelled) return;
        if (!r.token) setError(t("map.tokenMissing"));
        else setToken(r.token);
      })
      .catch(() => !cancelled && setError(t("map.loadError")));
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
  }, [planContentKey, planPhotosKey, dayCoordsKey, plan.days, dayCoords]);

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
    () => buildCityStops(validDays, plan.days.length, true),
    [validDays, plan.days.length],
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
    setOverviewReady(false);
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

  // Click-to-zoom: smooth fly between selected activities.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget || focusTarget.mode !== "drone") return;

    let onSettled: (() => void) | null = null;

    const run = () => {
      if (!isValidCoord(focusTarget.lat, focusTarget.lng)) return;
      const center: [number, number] = [focusTarget.lng, focusTarget.lat];
      lastFlyTargetKeyRef.current = `drone:${focusTarget.key}`;
      flyToPoiFocus(map, center);
      lastPoiFocusCenterRef.current = center;

      onSettled = () => {
        if (onSettled) map.off("moveend", onSettled);
        onSettled = null;
        const focusedId = pickFocusedPoiEntryId(poiMarkersRef.current, focusTarget);
        openFocusedPoiPopup(map, poiMarkersRef.current, focusTarget, focusedId);
      };
      map.once("moveend", onSettled);
    };

    const cancelReady = whenMapStyleReady(map, ready, run);

    return () => {
      if (onSettled) map.off("moveend", onSettled);
      cancelReady();
    };
  }, [focusTarget]);

  useEffect(() => {
    if (focusTarget?.mode !== "drone") {
      lastPoiFocusCenterRef.current = null;
    }
  }, [focusTarget?.mode]);

  // Collapse consecutive same-city days into one Layla pin (badge "1–4"),
  // so Phuket×4 identical labels never stack on top of each other.
  const cityStops = useMemo(
    () => buildCityStops(validDays, plan.days.length, false),
    [validDays, plan.days.length, planPhotosKey],
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
      enableMapPoiLayers(map);
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      clearPoiRevealTimers(poiRevealTimersRef);
      if (routeDrawAnimRef.current) {
        cancelAnimationFrame(routeDrawAnimRef.current);
        routeDrawAnimRef.current = 0;
      }
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
        enableMapPoiLayers(map);
        setMapStyleEpoch((epoch) => epoch + 1);
      });
    };

    if (ready.current && map.isStyleLoaded()) switchStyle();
    else map.once("style.load", switchStyle);
  }, [isSatellite, token]);

  // POI sightseeing markers from AI-generated pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let disposed = false;

    const apply = () => {
      if (disposed) return;

      const existingById = new Map(poiMarkersRef.current.map((e) => [e.id, e]));
      const nextEntries: PoiMarkerEntry[] = [];

      for (const pin of poiPins) {
        const id = poiMarkerId(pin);
        const existing = existingById.get(id);
        if (existing) {
          existing.marker.setLngLat([pin.lng, pin.lat]);
          existing.pin = pin;
          existing.day = pin.day;
          const labelEl = existing.marker
            .getElement()
            .querySelector<HTMLElement>("[data-poi-focus-label]");
          if (labelEl) labelEl.textContent = pin.name;
          // Refresh photo/icon if enrichment arrived after first paint.
          if (existing.photoEl && pin.imageUrl) {
            existing.photoEl.style.backgroundImage = `url("${pin.imageUrl.replace(/"/g, "%22")}")`;
            existing.photoEl.textContent = "";
          } else if (existing.root) {
            existing.root.render(
              <MapPoiMarker
                category={pin.category}
                isActive={pin.day === activeDayRef.current}
                showLabel={false}
                name={pin.name}
                imageUrl={pin.imageUrl}
              />,
            );
          }
          nextEntries.push(existing);
          continue;
        }

        const isDayActive = pin.day === activeDayRef.current;
        const { el, root, photoEl } = createPoiMarkerElement(pin, isDayActive);
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);

        const dayPlan = plan.days.find((d) => d.day === pin.day);
        const time =
          pin.arrivalTime && pin.departureTime
            ? `${pin.arrivalTime} – ${pin.departureTime}`
            : pin.arrivalTime ?? pin.departureTime;
        const cost =
          pin.estimatedCostEur != null && pin.estimatedCostEur >= 0
            ? formatMoney(pin.estimatedCostEur)
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
                  imageUrl: pin.imageUrl,
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
            imageUrl: pin.imageUrl,
            showDetailsButton: Boolean(openDetails && poiDetails),
            detailsButtonLabel: t("poi.moreInfo"),
          }),
          poiDetails && openDetails ? () => openDetails(poiDetails) : undefined,
        );

        setPoiMarkerHidden(el, true);
        nextEntries.push({ id, marker, day: pin.day, root, pin, photoEl });
      }

      for (const entry of poiMarkersRef.current) {
        if (!nextEntries.some((n) => n.id === entry.id)) {
          unmountReactRoot(entry.root ?? undefined);
          entry.marker.remove();
        }
      }

      poiMarkersRef.current = nextEntries;
      // Reveal active-day pins immediately (style swap can race the route-draw effect).
      setPoiMarkersForDay(poiMarkersRef, activeDayRef.current, true);
    };

    const cancelReady = whenMapStyleReady(map, ready, apply);

    return () => {
      disposed = true;
      cancelReady();
      clearPoiMarkerLayer(poiMarkersRef);
    };
  }, [poiPinsKey, mapStyleEpoch, plan.days, t, formatMoney]);

  // Highlight focused POI — only active-day pins stay visible (never leak D7 onto D6).
  useEffect(() => {
    const inPoiFocus = focusTarget?.mode === "drone";
    const focusCoords = inPoiFocus && focusTarget ? focusTarget : null;
    const focusedId = focusCoords
      ? pickFocusedPoiEntryId(poiMarkersRef.current, focusCoords)
      : null;
    const focusedEntry = poiMarkersRef.current.find((e) => e.id === focusedId);

    for (const entry of poiMarkersRef.current) {
      const el = entry.marker.getElement();
      const isDayActive = entry.day === activeDay;
      const isFocused = entry.id === focusedId;
      // Drone focus may briefly show the clicked pin even if scroll day differs.
      const allowVisible = isDayActive || isFocused;

      if (!allowVisible) {
        setPoiMarkerHidden(el, true);
        entry.marker.getPopup()?.remove();
        continue;
      }

      const isColocatedDup = Boolean(
        inPoiFocus &&
          focusedEntry &&
          !isFocused &&
          entry.day === focusedEntry.day &&
          coordsNearPin(entry.pin, focusedEntry.pin),
      );

      if (isColocatedDup) {
        setPoiMarkerHidden(el, true);
        continue;
      }

      setPoiMarkerHidden(el, false);
      const isDimmed = Boolean(inPoiFocus && !isFocused);
      applyPoiMarkerVisualState(entry, { isDayActive, isFocused, isDimmed });
    }
  }, [activeDay, focusTarget]);

  // Realistic multi-modal route layers (driving / flight / ferry / transit).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeData.length) return;

    const drawRoutes = () => {
      ensureActiveDayRouteLayer(map);
      let hasAnyLayer = false;

      for (const mode of visibleRouteModes) {
        const fc = segmentsToFeatureCollection(routeData, mode);
        if (ensureRouteLayer(map, mode, fc, false)) {
          hasAnyLayer = true;
        }
      }

      if (hasAnyLayer) {
        hideAllTripSegmentLayers(map);
        routeAnimatedRef.current = true;
      }
    };

    return whenMapStyleReady(map, ready, drawRoutes);
  }, [routeData, origin, visibleRouteModes, mapStyleEpoch]);

  // Fit the full trip once when route geometry is first available.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tripRouteBounds || !tripRouteBoundsKey || initialBoundsFitRef.current) return;

    const fit = () => {
      if (initialBoundsFitRef.current || !tripRouteBounds) return;
      setOverviewReady(false);
      map.fitBounds(tripRouteBounds, {
        padding: 80,
        duration: 2400,
        maxZoom: 7.2,
        essential: true,
      });
      const onSettled = () => {
        initialBoundsFitRef.current = true;
        setOverviewReady(true);
        lastFlyTargetKeyRef.current = "";
        map.off("moveend", onSettled);
      };
      map.once("moveend", onSettled);
    };

    return whenMapStyleReady(map, ready, fit);
  }, [tripRouteBoundsKey, tripRouteBounds]);

  // Single-city / no route bounds — allow day camera immediately.
  useEffect(() => {
    if (!tripRouteBoundsKey) setOverviewReady(true);
  }, [tripRouteBoundsKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tripRouteBoundsKey && !overviewReady && !isPlaying) return;
    if (
      scrollSpyPausedRef.current &&
      !isPlaying &&
      focusTargetRef.current?.mode !== "day"
    ) {
      return;
    }

    let cancelled = false;

    const runDayView = () => {
      if (cancelled || !map.isStyleLoaded() || !ready.current) return;

      clearPoiRevealTimers(poiRevealTimersRef);
      if (routeDrawAnimRef.current) {
        cancelAnimationFrame(routeDrawAnimRef.current);
        routeDrawAnimRef.current = 0;
      }
      routeDrawGenerationRef.current += 1;
      clearAllRouteDisplay(map);

      const dayFocusKey =
        focusTargetRef.current?.mode === "day" ? focusTargetRef.current.key : 0;
      const skipDayCamera = focusTargetRef.current?.mode === "drone";

      void (async () => {
        const dayPlan = plan.days.find((d) => d.day === activeDay);
        const activeRoute = await resolveActiveDayRoute({
          activeDay,
          dayPlan,
          routeData,
          dayCoords,
          origin,
          finalizedDays: finalizedRouteDays,
          token,
          preferDriving,
        });
        if (cancelled) return;

        const { coordinates: coords, boundsPoints, lineStyle, drawRoute } = activeRoute;
        const focusKey = focusTargetRef.current?.key ?? 0;
        const camKey = streaming
          ? `${isPlaying ? "play" : "scroll"}:${activeDay}:${dayFocusKey}:${focusKey}`
          : `${isPlaying ? "play" : "scroll"}:${activeDay}:${dayFocusKey}:${coordsBoundsKey(coords)}:${drawRoute}:${focusKey}`;
        if (!skipDayCamera && lastFlyTargetKeyRef.current !== camKey) {
          lastFlyTargetKeyRef.current = camKey;
          const center = boundsPoints[0] ?? activeDayCoord;
          if (isPlaying && center) {
            flyToDayCenter(map, center);
          } else {
            fitActiveDayView(map, {
              boundsPoints,
              fallbackCenter: activeDayCoord,
            });
          }
        }

        runActiveDayRouteDraw(map, drawRoute ? coords : [], {
          activeDay,
          lineStyle,
          poiMarkersRef,
          durationMarkersRef,
          routeDrawAnimRef,
          routeDrawGenerationRef,
          poiRevealTimersRef,
        });
      })();
    };

    const cancelReady = whenMapStyleReady(map, ready, runDayView);

    return () => {
      cancelled = true;
      cancelReady();
      routeDrawGenerationRef.current += 1;
      clearPoiRevealTimers(poiRevealTimersRef);
      if (routeDrawAnimRef.current) {
        cancelAnimationFrame(routeDrawAnimRef.current);
        routeDrawAnimRef.current = 0;
      }
      // Don't leave active-day POIs stuck at opacity 0 after a cancelled route-draw.
      setPoiMarkersForDay(poiMarkersRef, activeDayRef.current, true);
      setDurationBadgesForDay(durationMarkersRef, activeDayRef.current, true);
    };
  }, [
    activeDay,
    routeData,
    mapStyleEpoch,
    overviewReady,
    tripRouteBoundsKey,
    isPlaying,
    dayCoordsKey,
    origin,
    finalizedRouteDays,
    poiPinsKey,
    token,
    planContentKey,
    preferDriving,
    activeDayCoord,
    activeDayCoordKey,
    scrollSpyPaused,
    streaming,
  ]);

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

    return whenMapStyleReady(map, ready, apply);
  }, [origin, plan.originIata, plan.originPlace, mapStyleEpoch]);

  // Layla-style city markers — sync in place to avoid jump on day change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let disposed = false;

    const apply = () => {
      if (disposed) return;

      const existingById = new Map(markersRef.current.map((m) => [m.id, m]));
      const nextEntries: CityMarkerEntry[] = [];

      for (const stop of cityStops) {
        const id = cityMarkerId(stop);
        const existing = existingById.get(id);
        if (existing) {
          existing.marker.setLngLat(stop.coord);
          existing.stop = stop;
          existing.startDay = stop.startDay;
          existing.endDay = stop.endDay;
          const isActive =
            activeDayRef.current >= stop.startDay && activeDayRef.current <= stop.endDay;
          const label = existing.marker.getElement().querySelector(".layla-city-label");
          if (label) label.textContent = stop.city;
          const badgeStart = isActive ? activeDayRef.current : stop.startDay;
          const badgeEnd = isActive ? activeDayRef.current : stop.endDay;
          existing.root.render(
            <MapCityMarker
              isActive={isActive}
              dayNumber={badgeStart}
              dayEnd={badgeEnd}
              imageUrl={stop.imageUrl}
              city={stop.city}
            />,
          );
          nextEntries.push(existing);
          continue;
        }

        const isActive =
          activeDayRef.current >= stop.startDay && activeDayRef.current <= stop.endDay;
        const { el, root } = createCityMarkerElement(
          stop,
          isActive,
          (day) => {
            onDaySelectRef.current?.(day);
          },
          activeDayRef.current,
        );
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat(stop.coord)
          .addTo(map);

        const dayPlan = plan.days.find((d) => d.day === stop.startDay);
        const budget =
          dayPlan && typeof dayPlan.dailyBudgetEur === "number" && dayPlan.dailyBudgetEur > 0
            ? t("map.budgetPerDay").replace(
                "{amount}",
                formatMoney(Math.round(dayPlan.dailyBudgetEur)),
              )
            : undefined;
        const timeParts = [
          dayPlan?.drivingDurationHours,
          stop.dayCount > 1
            ? t("map.dayRange").replace("{start}", String(stop.startDay)).replace("{end}", String(stop.endDay))
            : t("map.daySingle").replace("{n}", String(stop.startDay)),
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

        nextEntries.push({
          id,
          marker,
          startDay: stop.startDay,
          endDay: stop.endDay,
          root,
          stop,
        });
      }

      for (const entry of markersRef.current) {
        if (!nextEntries.some((n) => n.id === entry.id)) {
          unmountReactRoot(entry.root);
          entry.marker.remove();
        }
      }

      markersRef.current = nextEntries;
    };

    const cancelReady = whenMapStyleReady(map, ready, apply);

    return () => {
      disposed = true;
      cancelReady();
      clearCityMarkerLayer(markersRef);
    };
  }, [cityStopsKey, mapStyleEpoch, plan.days, t, formatMoney]);

  // Duration badges on route midpoints — separate layer so route fetch does not rebuild city pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let disposed = false;

    const apply = () => {
      if (disposed) return;
      clearDurationMarkerLayer(durationMarkersRef);

      for (const segment of routeData) {
        const mid = segmentMidpoint(segment.coordinates);
        const badge = createDurationBadgeElement(
          segment,
          segmentBadgeText(segment, plan, t as (key: string) => string),
        );
        badge.style.opacity = "0";
        badge.style.pointerEvents = "none";
        badge.style.transition = "opacity 0.35s ease";
        const m = new mapboxgl.Marker({ element: badge, anchor: "center" })
          .setLngLat(mid)
          .addTo(map);
        durationMarkersRef.current.push({ marker: m, dayTo: segment.dayTo });
      }
    };

    const cancelReady = whenMapStyleReady(map, ready, apply);

    return () => {
      disposed = true;
      cancelReady();
      clearDurationMarkerLayer(durationMarkersRef);
    };
  }, [routeDataKey, mapStyleEpoch, plan, t]);

  // Highlight active city marker; badge shows the day you're reading (not the whole stay range).
  useEffect(() => {
    // Only hide city pin when a POI marker for this day is actually visible (opacity > 0).
    // Otherwise route-draw hide/reveal left a blank map (no city, no POIs).
    const visiblePoiForDay = poiMarkersRef.current.some((entry) => {
      if (entry.day !== activeDay) return false;
      const op = entry.marker.getElement().style.opacity;
      return op === "" || op === "1";
    });
    for (const { root, stop, startDay, endDay, marker } of markersRef.current) {
      const isActive = activeDay >= startDay && activeDay <= endDay;
      const el = marker.getElement();
      const hideCity = visiblePoiForDay && isActive;
      el.style.opacity = hideCity ? "0" : "";
      el.style.pointerEvents = hideCity ? "none" : "";
      el.className = `layla-city-marker${isActive && !hideCity ? " layla-city-marker--active" : ""}`;
      // Active: "6". Inactive multi-night stay: "6–7". Never imply next-day content while reading D6.
      const badgeStart = isActive ? activeDay : stop.startDay;
      const badgeEnd = isActive ? activeDay : stop.endDay;
      root.render(
        <MapCityMarker
          isActive={isActive && !hideCity}
          dayNumber={badgeStart}
          dayEnd={badgeEnd}
          imageUrl={stop.imageUrl}
          city={stop.city}
        />,
      );
    }
  }, [activeDay, poiPins, poiPinsKey]);

  // Reset fly dedupe when playback starts so day 1 always animates.
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      lastFlyTargetKeyRef.current = "";
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground flex items-center gap-2">
        <MapPin className="h-4 w-4" /> {error}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 rounded-xl sm:rounded-2xl overflow-hidden border border-border bg-card shadow-sm">
      <div ref={containerRef} className="h-full w-full min-h-0" />
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
