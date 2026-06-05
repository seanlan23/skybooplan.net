/**
 * Pure selection logic for the HotelsSection component.
 *
 * Decides — given the result of the primary city search and an optional
 * regional hub fallback search — which list of hotels to render, which
 * city name to display, and whether to show the empty state.
 *
 * Kept free of React / network dependencies so it can be unit tested
 * deterministically. The component must never invent ("mock") hotels;
 * if both queries return zero results, the empty state is shown.
 */

export type HotelLike = {
  id: string;
  name: string;
  // Real Booking API hotels never carry lat/lng — these fields exist only
  // so guard tests can reject any future regression that smuggles a
  // synthesized (0, 0) location through this layer.
  lat?: number;
  lng?: number;
};

export type QueryState<T> = {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  data?: { hotels: T[] } | undefined;
};

export type HotelSelection<T> = {
  hotels: T[];
  sourceCity: string;
  usedFallback: boolean;
  isLoading: boolean;
  isError: boolean;
  showEmpty: boolean;
  fallbackAttempted: boolean;
};

export function shouldUseFallback(
  primary: QueryState<unknown>,
  city: string,
  regionFallback: string | undefined,
): boolean {
  if (!primary.isSuccess) return false;
  if ((primary.data?.hotels?.length ?? 0) > 0) return false;
  if (!regionFallback) return false;
  return regionFallback.trim().toLowerCase() !== city.trim().toLowerCase();
}

export function selectHotelSource<T extends HotelLike>(
  primary: QueryState<T>,
  fallback: QueryState<T>,
  city: string,
  regionFallback: string | undefined,
): HotelSelection<T> {
  const fallbackAttempted = shouldUseFallback(primary, city, regionFallback);

  const fallbackHotels = fallback.data?.hotels ?? [];
  const usedFallback = fallbackAttempted && fallbackHotels.length > 0;

  const hotels = usedFallback ? fallbackHotels : primary.data?.hotels ?? [];
  const sourceCity = usedFallback ? regionFallback! : city;

  const isLoading =
    primary.isLoading || (fallbackAttempted && fallback.isLoading);
  const isError =
    primary.isError && (!fallbackAttempted || fallback.isError);

  const showEmpty = !isLoading && hotels.length === 0;

  return {
    hotels,
    sourceCity,
    usedFallback,
    isLoading,
    isError,
    showEmpty,
    fallbackAttempted,
  };
}
