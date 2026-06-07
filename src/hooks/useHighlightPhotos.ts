import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getPlacePhotos } from "@/lib/placePhotos.functions";
import type { SkeletonHighlight } from "@/lib/aiPlan.functions";

export type HighlightPhotoKey = string;

/** Google Places photo per attraction (name + city). */
export function useHighlightPhotos(
  highlights: Array<SkeletonHighlight & { city: string }>,
): {
  photoMap: Map<HighlightPhotoKey, string>;
  isLoading: boolean;
} {
  const fetchPhotos = useServerFn(getPlacePhotos);

  const queries = useMemo(
    () =>
      highlights.map((h) => ({
        key: `${h.day}:${h.name}`,
        query: `${h.name}, ${h.city}`.trim(),
      })),
    [highlights],
  );

  const queryKey = useMemo(
    () => ["highlight-photos", queries.map((q) => q.query).join("|")],
    [queries],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: queries.length > 0,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const res = await fetchPhotos({
        data: { queries: queries.map((q) => q.query) },
      });
      return res.places;
    },
  });

  const photoMap = useMemo(() => {
    const map = new Map<HighlightPhotoKey, string>();
    if (!data) return map;
    queries.forEach((q, i) => {
      const url = data[i]?.photoUrl;
      if (url) map.set(q.key, url);
    });
    return map;
  }, [data, queries]);

  return { photoMap, isLoading };
}
