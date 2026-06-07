import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  fetchPhotosForDay,
  type DayPhotoItem,
  type FetchPhotosForDayResult,
} from "@/lib/dayPhotos.functions";

export type DayPhotoMap = Map<number, string>;

function collectDayActivities(day: DayPlan): Activity[] {
  const slots = ["morning", "afternoon", "evening"] as const;
  return slots.flatMap((s) => day.activities?.[s] ?? []);
}

function buildFetchInput(plan: AiTripPlan, day: DayPlan) {
  const activities = collectDayActivities(day);
  const mapPins = day.mapPins ?? [];
  const seen = new Set<string>();
  const actPayload: Array<{ name: string; imageSearchQuery?: string }> = [];
  for (const a of activities) {
    const key = a.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    actPayload.push({
      name: a.name.trim(),
      imageSearchQuery: a.imageSearchQuery?.trim() || undefined,
    });
  }
  const pinPayload: Array<{ name: string; imageSearchQuery?: string }> = [];
  for (const p of mapPins) {
    const key = p.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    pinPayload.push({
      name: p.name.trim(),
      imageSearchQuery: p.imageSearchQuery?.trim() || undefined,
    });
  }
  return {
    dayNumber: day.day,
    destinationName: plan.destinationName,
    city: day.city,
    focusName: day.focusName || day.title,
    activities: actPayload,
    mapPins: pinPayload.length > 0 ? pinPayload : undefined,
  };
}

/**
 * Two-stage photo loading: itinerary text first, then per-day Google/Unsplash fetch.
 */
export function useLazyDayPhotos(plan: AiTripPlan | null) {
  const fetchDayFn = useServerFn(fetchPhotosForDay);
  const [bundles, setBundles] = useState<Map<number, FetchPhotosForDayResult>>(new Map());
  const [loadingDays, setLoadingDays] = useState<Set<number>>(new Set());
  const doneRef = useRef<Set<number>>(new Set());
  const inflightRef = useRef<Set<number>>(new Set());

  // Reset cached photos when plan changes.
  const planKey = plan
    ? `${plan.destinationName}:${plan.days.map((d) => d.day).join(",")}`
    : "";
  useEffect(() => {
    doneRef.current = new Set();
    inflightRef.current = new Set();
    setBundles(new Map());
    setLoadingDays(new Set());
  }, [planKey]);

  const loadDay = useCallback(
    async (dayNumber: number) => {
      if (!plan) return;
      if (doneRef.current.has(dayNumber) || inflightRef.current.has(dayNumber)) return;

      const day = plan.days.find((d) => d.day === dayNumber);
      if (!day) return;

      inflightRef.current.add(dayNumber);
      setLoadingDays((prev) => new Set(prev).add(dayNumber));

      try {
        const result = await fetchDayFn({ data: buildFetchInput(plan, day) });
        doneRef.current.add(dayNumber);
        setBundles((prev) => {
          const next = new Map(prev);
          next.set(dayNumber, result);
          return next;
        });
      } catch (err) {
        console.warn(`[useLazyDayPhotos] day ${dayNumber} failed:`, err);
        doneRef.current.add(dayNumber);
      } finally {
        inflightRef.current.delete(dayNumber);
        setLoadingDays((prev) => {
          const next = new Set(prev);
          next.delete(dayNumber);
          return next;
        });
      }
    },
    [plan, fetchDayFn],
  );

  // Staggered prefetch after plan loads — one day every 120ms.
  useEffect(() => {
    if (!plan?.days.length) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    plan.days.forEach((d, i) => {
      timers.push(setTimeout(() => void loadDay(d.day), i * 120));
    });
    return () => timers.forEach(clearTimeout);
  }, [plan, loadDay]);

  const photoMap = useMemo((): DayPhotoMap => {
    const map: DayPhotoMap = new Map();
    if (!plan) return map;
    for (const d of plan.days) {
      const bundle = bundles.get(d.day);
      if (bundle?.heroImageUrl) map.set(d.day, bundle.heroImageUrl);
      else if (d.imageUrl) map.set(d.day, d.imageUrl);
    }
    return map;
  }, [plan, bundles]);

  const getActivityPhoto = useCallback(
    (dayNumber: number, activityName: string): DayPhotoItem | undefined => {
      const bundle = bundles.get(dayNumber);
      if (!bundle) return undefined;
      const key = activityName.trim().toLowerCase();
      return bundle.items.find((i) => i.name.trim().toLowerCase() === key);
    },
    [bundles],
  );

  const isDayPhotosLoading = useCallback(
    (dayNumber: number) => loadingDays.has(dayNumber) && !bundles.has(dayNumber),
    [loadingDays, bundles],
  );

  return {
    photoMap,
    loadDay,
    getActivityPhoto,
    isDayPhotosLoading,
    bundles,
  };
}
