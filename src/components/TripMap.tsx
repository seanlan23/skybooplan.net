/**
 * Itinerary map — single camera owner, active-day pins only.
 * Routes may draw; they never drive fitBounds/zoom.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerFn } from "@tanstack/react-start";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, MapPin, Map as MapIcon, Satellite } from "lucide-react";
import { getMapboxToken } from "@/lib/mapbox.functions";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { MapCityMarker, MapPoiMarker } from "@/components/MapPoiMarker";
import { mapPinToPoiDetails, type PoiDetailsData } from "@/lib/poiDetails.types";
import { useI18n } from "@/lib/i18n";
import { buildGreatCircleCoords } from "@/lib/tripMapRoutes";
import {
  buildDayMapView,
  cameraForDayView,
  isValidMapCoord,
  type DayMapPin,
  type DayMapView,
} from "@/lib/tripMapModel";

export type ActivityMapFocus = {
  lat: number;
  lng: number;
  day: number;
  poiName?: string;
};

export type MapFocusTarget = ActivityMapFocus & {
  mode: "drone" | "day";
  key: number;
};

export function poiFocusKey(name: string, lat: number, lng: number): string {
  return `${name.trim().toLowerCase()}@${lat.toFixed(5)},${lng.toFixed(5)}`;
}

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
  scrollSpyPaused?: boolean;
  onDaySelect?: (day: number) => void;
  onOpenPoiDetails?: (poi: PoiDetailsData) => void;
  streaming?: boolean;
  expectedDayCount?: number;
  isPlaying?: boolean;
};

const STYLE_STREETS = "mapbox://styles/mapbox/streets-v12";
const STYLE_SATELLITE = "mapbox://styles/mapbox/satellite-streets-v12";
const ROUTE_SOURCE = "skyboo-day-route";
const ROUTE_LAYER = "skyboo-day-route-line";
const CAMERA_MS = 1600;

type MarkerEntry = { marker: mapboxgl.Marker; root: Root; id: string };

function clearMarkers(list: MarkerEntry[]) {
  for (const entry of list) {
    entry.root.unmount();
    entry.marker.remove();
  }
  list.length = 0;
}

function setRouteLine(
  map: mapboxgl.Map,
  view: DayMapView | null,
) {
  const coords =
    view?.inboundRoute != null
      ? buildGreatCircleCoords(
          view.inboundRoute.from,
          view.inboundRoute.to,
          view.inboundRoute.mode === "flight" ? 96 : 64,
        )
      : [];

  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features:
      coords.length >= 2
        ? [
            {
              type: "Feature",
              properties: { mode: view?.inboundRoute?.mode ?? "driving" },
              geometry: { type: "LineString", coordinates: coords },
            },
          ]
        : [],
  };

  const src = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
  } else if (coords.length >= 2) {
    map.addSource(ROUTE_SOURCE, { type: "geojson", data });
    map.addLayer({
      id: ROUTE_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0ea5e9",
        "line-width": 3.5,
        "line-opacity": 0.85,
        "line-dasharray": [1.5, 1.2],
      },
    });
  }

  if (map.getLayer(ROUTE_LAYER)) {
    map.setPaintProperty(ROUTE_LAYER, "line-opacity", coords.length >= 2 ? 0.85 : 0);
  }
}

function TripMapInner({
  plan,
  activeDay,
  focusTarget,
  scrollSpyPaused = false,
  onDaySelect,
  onOpenPoiDetails,
  isPlaying = false,
}: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<MarkerEntry[]>([]);
  const readyRef = useRef(false);
  const lastCameraKeyRef = useRef("");
  const scrollSpyPausedRef = useRef(scrollSpyPaused);
  scrollSpyPausedRef.current = scrollSpyPaused;
  const onDaySelectRef = useRef(onDaySelect);
  onDaySelectRef.current = onDaySelect;
  const onOpenPoiDetailsRef = useRef(onOpenPoiDetails);
  onOpenPoiDetailsRef.current = onOpenPoiDetails;

  const tokenFn = useServerFn(getMapboxToken);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [isSatellite, setIsSatellite] = useState(false);
  const [styleEpoch, setStyleEpoch] = useState(0);

  const dayView = useMemo(
    () => buildDayMapView(plan, activeDay),
    [plan, activeDay],
  );

  const camera = useMemo(() => {
    if (!dayView) return null;
    const drone =
      focusTarget?.mode === "drone" &&
      focusTarget.day === activeDay &&
      isValidMapCoord(focusTarget.lat, focusTarget.lng)
        ? { lat: focusTarget.lat, lng: focusTarget.lng }
        : null;
    return cameraForDayView(dayView, { playing: isPlaying, focus: drone });
  }, [dayView, focusTarget, activeDay, isPlaying]);

  // Token
  useEffect(() => {
    let cancelled = false;
    void tokenFn().then((res) => {
      if (cancelled) return;
      if (!res?.token) {
        setError("Mapbox token missing");
        setBooting(false);
        return;
      }
      setToken(res.token);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenFn, t]);

  // Create map once
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_STREETS,
      center: dayView?.center ?? [14.5, 46.05],
      zoom: 3,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      readyRef.current = true;
      setBooting(false);
      setStyleEpoch((n) => n + 1);
    });

    return () => {
      readyRef.current = false;
      clearMarkers(markersRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per token
  }, [token]);

  const appliedStyleRef = useRef(STYLE_STREETS);

  // Style toggle (skip initial streets — map already loads that style)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const next = isSatellite ? STYLE_SATELLITE : STYLE_STREETS;
    if (appliedStyleRef.current === next) return;
    appliedStyleRef.current = next;
    map.setStyle(next);
    map.once("style.load", () => {
      setStyleEpoch((n) => n + 1);
    });
  }, [isSatellite]);

  // Single camera owner
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !camera) return;
    if (
      scrollSpyPausedRef.current &&
      !isPlaying &&
      focusTarget?.mode !== "day" &&
      focusTarget?.mode !== "drone"
    ) {
      return;
    }

    const key = `${activeDay}:${camera.center[0].toFixed(4)},${camera.center[1].toFixed(4)}:${camera.zoom}:${focusTarget?.key ?? 0}:${isPlaying ? "p" : "s"}`;
    if (lastCameraKeyRef.current === key) return;
    lastCameraKeyRef.current = key;

    map.stop();
    map.flyTo({
      center: camera.center,
      zoom: camera.zoom,
      duration: CAMERA_MS,
      essential: true,
    });
  }, [camera, activeDay, focusTarget, isPlaying, styleEpoch]);

  // Markers + route for active day only
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    clearMarkers(markersRef.current);
    setRouteLine(map, dayView);

    if (!dayView) return;

    // City pin
    {
      const el = document.createElement("div");
      el.className = "layla-city-marker layla-city-marker--active";
      const root = createRoot(el);
      root.render(
        <MapCityMarker
          isActive
          dayNumber={dayView.day}
          imageUrl={plan.days.find((d) => d.day === dayView.day)?.imageUrl}
          city={dayView.city}
        />,
      );
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onDaySelectRef.current?.(dayView.day);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(dayView.center)
        .addTo(map);
      markersRef.current.push({ marker, root, id: `city-${dayView.day}` });
    }

    const focusedName =
      focusTarget?.mode === "drone" && focusTarget.day === activeDay
        ? focusTarget.poiName
        : undefined;

    for (const pin of dayView.pins) {
      const el = document.createElement("div");
      const root = createRoot(el);
      const focused = Boolean(
        focusedName &&
          matchesPoiFocus(pin, {
            poiName: focusedName,
            lat: focusTarget!.lat,
            lng: focusTarget!.lng,
          }),
      );
      root.render(
        <MapPoiMarker
          category={pin.category}
          isActive
          isFocused={focused}
          name={pin.name}
          imageUrl={pin.imageUrl}
        />,
      );
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const day = plan.days.find((d) => d.day === dayView.day);
        if (!day) return;
        onOpenPoiDetailsRef.current?.(
          mapPinToPoiDetails(
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
            day,
          ),
        );
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      markersRef.current.push({ marker, root, id: `poi-${pin.name}` });
    }

    return () => {
      clearMarkers(markersRef.current);
    };
  }, [dayView, plan, focusTarget, activeDay, styleEpoch]);

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
      {booting && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      )}
    </div>
  );
}

function propsEqual(prev: Props, next: Props): boolean {
  if (prev.activeDay !== next.activeDay) return false;
  if (prev.isPlaying !== next.isPlaying) return false;
  if (prev.scrollSpyPaused !== next.scrollSpyPaused) return false;
  if (prev.streaming !== next.streaming) return false;
  const pf = prev.focusTarget;
  const nf = next.focusTarget;
  if ((pf?.key ?? 0) !== (nf?.key ?? 0)) return false;
  if ((pf?.mode ?? "") !== (nf?.mode ?? "")) return false;
  if (prev.plan.days.length !== next.plan.days.length) return false;
  // Cheap geo signature — rebuild when day centers / pins change
  const sig = (p: AiTripPlan) =>
    p.days
      .map((d) => {
        const pins = (d.mapPins ?? [])
          .slice(0, 6)
          .map((x) => `${x.name}:${x.lat}:${x.lng}`)
          .join("|");
        return `${d.day}:${d.city}:${d.lat}:${d.lng}:${pins}:${d.imageUrl ?? ""}`;
      })
      .join(";");
  return sig(prev.plan) === sig(next.plan);
}

export const TripMap = memo(TripMapInner, propsEqual);

// Re-export model helpers used by tests / callers
export type { DayMapPin, DayMapView };
