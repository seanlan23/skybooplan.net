/**
 * Dumb itinerary map: Mapbox renderer only.
 * Camera follows active-day city center. Pins/routes never own the camera.
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
import { buildGreatCircleCoords } from "@/lib/geoMath";
import { fetchDrivingDirections } from "@/lib/mapboxDirections";
import {
  buildMapDay,
  cameraForMapDay,
  type MapDay,
  type MapDayPin,
} from "@/lib/itineraryMapModel";

export type ActivityMapFocus = {
  lat: number;
  lng: number;
  day: number;
  poiName?: string;
};

/** Highlight-only focus — must never move the camera. */
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
  /** Pin highlight only — ignored for camera. */
  highlightPoiName?: string | null;
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
const CAMERA_MS = 2800;

type MarkerEntry = { marker: mapboxgl.Marker; root: Root; id: string };

function clearMarkers(list: MarkerEntry[]) {
  for (const entry of list) {
    entry.root.unmount();
    entry.marker.remove();
  }
  list.length = 0;
}

function paintRoute(
  map: mapboxgl.Map,
  coordinates: [number, number][],
  mode: string,
) {
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features:
      coordinates.length >= 2
        ? [
            {
              type: "Feature",
              properties: { mode },
              geometry: { type: "LineString", coordinates },
            },
          ]
        : [],
  };

  const src = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
  } else if (coordinates.length >= 2) {
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
        "line-dasharray": mode === "flight" ? [1.5, 1.2] : [1, 0],
      },
    });
  }

  if (map.getLayer(ROUTE_LAYER)) {
    map.setPaintProperty(ROUTE_LAYER, "line-opacity", coordinates.length >= 2 ? 0.85 : 0);
    if (coordinates.length >= 2) {
      map.setPaintProperty(
        ROUTE_LAYER,
        "line-dasharray",
        mode === "flight" ? [1.5, 1.2] : [1, 0],
      );
    }
  }
}

function TripMapInner({
  plan,
  activeDay,
  highlightPoiName,
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
  const onDaySelectRef = useRef(onDaySelect);
  onDaySelectRef.current = onDaySelect;
  const onOpenPoiDetailsRef = useRef(onOpenPoiDetails);
  onOpenPoiDetailsRef.current = onOpenPoiDetails;
  const tokenRef = useRef<string | null>(null);

  const tokenFn = useServerFn(getMapboxToken);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [isSatellite, setIsSatellite] = useState(false);
  const [styleEpoch, setStyleEpoch] = useState(0);

  const dayView = useMemo(() => buildMapDay(plan, activeDay), [plan, activeDay]);

  const camera = useMemo(
    () => (dayView ? cameraForMapDay(dayView, { playing: isPlaying }) : null),
    [dayView, isPlaying],
  );

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
      tokenRef.current = res.token;
    });
    return () => {
      cancelled = true;
    };
  }, [tokenFn]);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_STREETS,
      center: dayView
        ? ([dayView.center.lng, dayView.center.lat] as [number, number])
        : [14.5, 46.05],
      zoom: 3,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      readyRef.current = true;
      setBooting(false);
      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          /* noop */
        }
      });
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

  // Camera: active day city center only
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !camera) return;

    const key = `${activeDay}:${camera.center[0].toFixed(4)},${camera.center[1].toFixed(4)}:${camera.zoom}:${isPlaying ? "p" : "s"}`;
    if (lastCameraKeyRef.current === key) return;
    lastCameraKeyRef.current = key;

    map.stop();
    map.easeTo({
      center: camera.center,
      zoom: camera.zoom,
      duration: CAMERA_MS,
      essential: true,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  }, [camera, activeDay, isPlaying, styleEpoch]);

  // Markers + inbound leg
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    clearMarkers(markersRef.current);
    let cancelled = false;

    async function drawLeg(view: MapDay) {
      if (!view.legIn) {
        paintRoute(map!, [], "drive");
        return;
      }
      const from: [number, number] = [view.legIn.from.lng, view.legIn.from.lat];
      const to: [number, number] = [view.legIn.to.lng, view.legIn.to.lat];
      const mode = view.legIn.mode;

      if (mode === "flight") {
        if (!cancelled) {
          paintRoute(map!, buildGreatCircleCoords(from, to, 96), "flight");
        }
        return;
      }

      const tok = tokenRef.current;
      if (tok) {
        const result = await fetchDrivingDirections(from, to, tok);
        if (cancelled) return;
        if (result.fromMapbox) {
          paintRoute(map!, result.coordinates, mode);
          return;
        }
      }
      // Ferry / Directions miss → short arc (still not a camera fitBounds)
      if (!cancelled) {
        paintRoute(
          map!,
          mode === "ferry" ? buildGreatCircleCoords(from, to, 48) : [from, to],
          mode,
        );
      }
    }

    if (!dayView) {
      paintRoute(map, [], "drive");
      return;
    }

    void drawLeg(dayView);

    {
      const el = document.createElement("div");
      el.className = "layla-city-marker layla-city-marker--active";
      const root = createRoot(el);
      root.render(
        <MapCityMarker
          isActive
          dayNumber={dayView.day}
          imageUrl={plan.days.find((d) => d.day === dayView.day)?.imageUrl}
          city={dayView.cityLabel}
        />,
      );
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onDaySelectRef.current?.(dayView.day);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([dayView.center.lng, dayView.center.lat])
        .addTo(map);
      markersRef.current.push({ marker, root, id: `city-${dayView.day}` });
    }

    for (const pin of dayView.pins) {
      const el = document.createElement("div");
      const root = createRoot(el);
      const focused = Boolean(
        highlightPoiName &&
          matchesPoiFocus(pin, {
            poiName: highlightPoiName,
            lat: pin.lat,
            lng: pin.lng,
          }),
      );
      // Prefer name match when highlight is set
      const nameFocused =
        Boolean(highlightPoiName) &&
        pin.name.trim().toLowerCase() === highlightPoiName!.trim().toLowerCase();
      root.render(
        <MapPoiMarker
          category={pin.category}
          isActive
          isFocused={nameFocused || focused}
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
      markersRef.current.push({ marker, root, id: pin.id });
    }

    return () => {
      cancelled = true;
      clearMarkers(markersRef.current);
    };
  }, [dayView, plan, highlightPoiName, styleEpoch]);

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
  if (prev.streaming !== next.streaming) return false;
  if ((prev.highlightPoiName ?? "") !== (next.highlightPoiName ?? "")) return false;
  if (prev.plan.days.length !== next.plan.days.length) return false;
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

export type { MapDay, MapDayPin };
