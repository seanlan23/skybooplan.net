import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getPlacePhotos } from "@/lib/placePhotos.functions";
import type { AiTripPlan } from "@/lib/aiPlan.functions";

export type DayPhotoMap = Map<number, string>;

/**
 * Resolves a Google Places photo URL for each day in a plan, batched and
 * cached at multiple levels (browser-side via React Query, server-side via
 * the `place_cache` table).
 *
 * Returns a Map keyed by `day.day` with the resolved photo URL (string).
 */
export function usePlacePhotos(plan: AiTripPlan | null): {
  photoMap: DayPhotoMap;
  isLoading: boolean;
} {
  const fetchPhotos = useServerFn(getPlacePhotos);

  const queries = useMemo(() => {
    if (!plan) return [] as Array<{ day: number; query: string }>;
    return plan.days
      .map((d) => {
        if (d.imageUrl) return null;
        const focus = (d.focusName ?? "").trim();
        const city = (d.city ?? "").trim();
        if (!focus && !city) return null;
        const query = focus && city ? `${focus}, ${city}` : focus || city;
        return { day: d.day, query };
      })
      .filter((q): q is { day: number; query: string } => !!q);
  }, [plan]);

  const queryKey = useMemo(
    () => ["place-photos", queries.map((q) => q.query).join("|")],
    [queries],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: queries.length > 0,
    staleTime: 1000 * 60 * 60, // 1h client-side
    queryFn: async () => {
      const res = await fetchPhotos({
        data: { queries: queries.map((q) => q.query) },
      });
      return res.places;
    },
  });

  const photoMap = useMemo(() => {
    const map: DayPhotoMap = new Map();
    if (!plan) return map;
    for (const d of plan.days) {
      if (d.imageUrl) map.set(d.day, d.imageUrl);
    }
    if (!data) return map;
    queries.forEach((q, i) => {
      const url = data[i]?.photoUrl;
      if (url) map.set(q.day, url);
    });
    return map;
  }, [plan, data, queries]);

  return { photoMap, isLoading };
}
