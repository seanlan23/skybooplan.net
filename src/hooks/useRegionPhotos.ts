import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getPlacePhotos } from "@/lib/placePhotos.functions";
import type { TripRegion } from "@/lib/aiPlan.functions";

export type RegionPhotoMap = Map<string, string>;

/** One Google Places photo per region city (fast skeleton preview). */
export function useRegionPhotos(regions: TripRegion[]): {
  photoMap: RegionPhotoMap;
  isLoading: boolean;
} {
  const fetchPhotos = useServerFn(getPlacePhotos);

  const queries = useMemo(
    () =>
      regions.map((r) => ({
        key: r.city,
        query: r.city.trim(),
      })),
    [regions],
  );

  const queryKey = useMemo(
    () => ["region-photos", queries.map((q) => q.query).join("|")],
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
    const map: RegionPhotoMap = new Map();
    if (!data) return map;
    queries.forEach((q, i) => {
      const url = data[i]?.photoUrl;
      if (url) map.set(q.key, url);
    });
    return map;
  }, [data, queries]);

  return { photoMap, isLoading };
}
