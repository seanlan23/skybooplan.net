export type HotelKind = "hotel" | "apartment" | "other";

export type HotelAmenityKey =
  | "breakfast"
  | "allInclusive"
  | "balcony"
  | "pool"
  | "parking"
  | "freeCancel";

export type HotelAmenities = Record<HotelAmenityKey, boolean>;

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
        /\ball[-\s]?inclusive\b|\bvse\s+vključen|\ball inclusive\b|\bpension\s+completa\b/i.test(text),
      balcony: /\b(balcony|balkon|terrace|terasa|terrasse|balcón|balcone)\b/i.test(text),
      pool: /\b(swimming\s*pool|\bpool\b|bazen|piscine|schwimmbad)\b/i.test(text),
      parking: /\b(parking|parkirišč|parkplatz|aparcamiento)\b/i.test(text),
      freeCancel:
        /\bfree\s+cancellation\b|\bbrezplačn\w*\s+preklic\b|\bkostenlos\s+stornier/i.test(text),
    },
  };
}

/** Booking.com `nflt` tokens for the public search URL. */
export function bookingNfltFor(filters: {
  hotel?: boolean;
  apartment?: boolean;
  breakfast?: boolean;
  allInclusive?: boolean;
  balcony?: boolean;
  pool?: boolean;
  parking?: boolean;
  freeCancel?: boolean;
}): string[] {
  const out: string[] = [];
  if (filters.hotel) out.push("ht_id=204");
  if (filters.apartment) out.push("ht_id=201");
  if (filters.breakfast) out.push("mealplan=1");
  if (filters.allInclusive) out.push("mealplan=9");
  if (filters.balcony) out.push("roomfacility=17");
  if (filters.pool) out.push("hotelfacility=301");
  if (filters.parking) out.push("hotelfacility=2");
  if (filters.freeCancel) out.push("fc=2");
  return out;
}
