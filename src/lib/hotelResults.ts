export type HotelResultSort = "top" | "priceAsc" | "priceDesc" | "ratingDesc";

export type HotelResultFilters = {
  maxPerNight: number;
  minRating: number;
  stars: number[];
  hotel?: boolean;
  apartment?: boolean;
  breakfast?: boolean;
  allInclusive?: boolean;
  balcony?: boolean;
  pool?: boolean;
  parking?: boolean;
  freeCancel?: boolean;
};

export function stayNights(checkIn: string, checkOut?: string): number {
  if (!checkOut || checkOut <= checkIn) return 1;
  const a = Date.parse(`${checkIn}T12:00:00Z`);
  const b = Date.parse(`${checkOut}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

export function perNightPrice(stayTotal: number, nights: number): number {
  if (stayTotal <= 0) return 0;
  return Math.round(stayTotal / Math.max(1, nights));
}

export function reviewBand(rating: number): 9 | 8 | 7 | 6 | 0 {
  if (rating >= 9) return 9;
  if (rating >= 8) return 8;
  if (rating >= 7) return 7;
  if (rating >= 6) return 6;
  return 0;
}

export function applyHotelFilters<
  T extends {
    price: number;
    rating: number;
    stars?: number;
    kind?: "hotel" | "apartment" | "other";
    amenities?: {
      breakfast?: boolean;
      allInclusive?: boolean;
      balcony?: boolean;
      pool?: boolean;
      parking?: boolean;
      freeCancel?: boolean;
    };
  },
>(hotels: T[], nights: number, filters: HotelResultFilters): T[] {
  return hotels.filter((h) => {
    const nightly = perNightPrice(h.price, nights);
    if (nightly > 0 && nightly > filters.maxPerNight) return false;
    if (filters.minRating > 0 && h.rating < filters.minRating) return false;
    if (filters.stars.length > 0 && !filters.stars.includes(h.stars ?? 0)) return false;
    if (filters.hotel || filters.apartment) {
      const matchKind =
        (filters.hotel && h.kind === "hotel") ||
        (filters.apartment && h.kind === "apartment");
      if (!matchKind) return false;
    }
    if (filters.breakfast && !h.amenities?.breakfast) return false;
    if (filters.allInclusive && !h.amenities?.allInclusive) return false;
    if (filters.balcony && !h.amenities?.balcony) return false;
    if (filters.pool && !h.amenities?.pool) return false;
    if (filters.parking && !h.amenities?.parking) return false;
    if (filters.freeCancel && !h.amenities?.freeCancel) return false;
    return true;
  });
}

export function sortHotels<
  T extends { price: number; rating: number; reviews?: number },
>(hotels: T[], sort: HotelResultSort): T[] {
  const list = [...hotels];
  if (sort === "priceAsc") return list.sort((a, b) => a.price - b.price || b.rating - a.rating);
  if (sort === "priceDesc") return list.sort((a, b) => b.price - a.price || b.rating - a.rating);
  if (sort === "ratingDesc") return list.sort((a, b) => b.rating - a.rating || a.price - b.price);
  return list.sort((a, b) => {
    const ar = a.rating * Math.log10((a.reviews ?? 0) + 10);
    const br = b.rating * Math.log10((b.reviews ?? 0) + 10);
    return br - ar || a.price - b.price;
  });
}

export function priceExtent(prices: number[], fallbackMax = 400): { min: number; max: number } {
  const vals = prices.filter((p) => p > 0);
  if (vals.length === 0) return { min: 0, max: fallbackMax };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

export function priceHistogram(prices: number[], buckets = 12): number[] {
  const { min, max } = priceExtent(prices);
  const span = Math.max(1, max - min);
  const counts = Array.from({ length: buckets }, () => 0);
  for (const p of prices) {
    if (p <= 0) continue;
    const i = Math.min(buckets - 1, Math.floor(((p - min) / span) * buckets));
    counts[i] += 1;
  }
  return counts;
}
