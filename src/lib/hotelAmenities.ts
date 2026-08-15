export type HotelKind = "hotel" | "apartment" | "other";

export type HotelAmenityKey =
  | "breakfast"
  | "allInclusive"
  | "balcony"
  | "pool"
  | "parking"
  | "freeCancel";

export type HotelAmenities = Record<HotelAmenityKey, boolean>;

export type StayFilterFlags = {
  hotel?: boolean;
  apartment?: boolean;
  cabin?: boolean;
  nature?: boolean;
  jacuzzi?: boolean;
  breakfast?: boolean;
  allInclusive?: boolean;
  balcony?: boolean;
  pool?: boolean;
  parking?: boolean;
  freeCancel?: boolean;
};

const APARTMENT_TYPE_IDS = new Set([201, 213, 221, 222, 223]);
const HOTEL_TYPE_IDS = new Set([204, 206, 219, 220, 229, 230, 234]);

function blobOf(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function inferHotelKind(typeId?: number, typeName?: string, name?: string): HotelKind {
  if (typeId && APARTMENT_TYPE_IDS.has(typeId)) return "apartment";
  if (typeId && HOTEL_TYPE_IDS.has(typeId)) return "hotel";
  const text = blobOf([typeName, name]);
  if (/\b(apartment|apartma|apartments?|aparthotel|condo|flat|studio)\b/i.test(text)) {
    return "apartment";
  }
  if (/\b(hotel|resort|motel|ryokan)\b/i.test(text)) return "hotel";
  return "other";
}

export function inferHotelAmenities(input: {
  name?: string;
  typeName?: string;
  typeId?: number;
  label?: string;
  badges?: string;
}): { kind: HotelKind; amenities: HotelAmenities } {
  const text = blobOf([input.name, input.typeName, input.label, input.badges]);
  const kind = inferHotelKind(input.typeId, input.typeName, input.name);

  return {
    kind,
    amenities: {
      breakfast: /\b(breakfast|zajtrk|frühstück|fruehstueck|petit[- ]déjeuner|colazione|desayuno)\b/i.test(
        text,
      ),
      allInclusive:
        /\ball[-\s]?inclusive\b|\ballinclusive\b|\bvse\s+vklju[čc]en|\bpension\s+completa\b|\btutto\s+incluso\b/i.test(
          text,
        ),
      balcony: /\b(balcony|balkon|terrace|terasa|terrasse|balcón|balcone)\b/i.test(text),
      pool: /\b(swimming\s*pool|\bpool\b|bazen|piscine|schwimmbad)\b/i.test(text),
      parking: /\b(parking|parkirišč|parkplatz|aparcamiento)\b/i.test(text),
      freeCancel:
        /\bfree\s+cancellation\b|\bbrezplačn\w*\s+preklic\b|\bkostenlos\s+stornier/i.test(text),
    },
  };
}

/** Booking.com `nflt` tokens for the public search URL. */
export function bookingNfltFor(filters: StayFilterFlags): string[] {
  const out: string[] = [];
  if (filters.hotel) out.push("ht_id=204");
  if (filters.apartment) out.push("ht_id=201");
  // Holiday homes / chalets / lodges — country-wide cabin search.
  if (filters.cabin) out.push("ht_id=208", "ht_id=223", "ht_id=228");
  // Farm stays + country houses when the guest asked for nature / countryside.
  if (filters.nature) out.push("ht_id=221", "ht_id=230");
  if (filters.breakfast) out.push("mealplan=1");
  if (filters.allInclusive) out.push("mealplan=9");
  if (filters.balcony) out.push("roomfacility=17");
  if (filters.pool) out.push("hotelfacility=301");
  if (filters.parking) out.push("hotelfacility=2");
  if (filters.jacuzzi) out.push("hotelfacility=46");
  if (filters.freeCancel) out.push("fc=2");
  return out;
}

/**
 * RapidAPI `/searchHotels` `categories_filter` — same Booking ids, `::` separators.
 * Without this, amenity checkboxes only change the Booking URL and look broken.
 */
export function bookingCategoriesFilterFor(filters: StayFilterFlags): string {
  const parts: string[] = [];
  if (filters.hotel) parts.push("ht_id::204");
  if (filters.apartment) parts.push("ht_id::201");
  if (filters.cabin) parts.push("ht_id::208", "ht_id::223", "ht_id::228");
  if (filters.nature) parts.push("ht_id::221", "ht_id::230");
  if (filters.breakfast) parts.push("mealplan::1");
  if (filters.allInclusive) parts.push("mealplan::9");
  if (filters.balcony) parts.push("roomfacility::17");
  if (filters.pool) parts.push("hotelfacility::301");
  if (filters.parking) parts.push("hotelfacility::2");
  if (filters.jacuzzi) parts.push("hotelfacility::46");
  if (filters.freeCancel) parts.push("free_cancellation::1");
  return parts.join(",");
}
