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
  /** Booking review_score=80 — guest rating 8.0+. */
  minReview80?: boolean;
  /** Official 3★ / 4★ / 5★ only (drops 1–2★ and unrated). */
  stars345?: boolean;
  /** Hotel + resort + villa types (single_base / Resort-Mir). */
  resortStay?: boolean;
};

const APARTMENT_TYPE_IDS = new Set([201, 213, 221, 222, 223]);
const HOTEL_TYPE_IDS = new Set([204, 206, 216, 219, 220, 229, 230, 234]);
/** Booking `ht_id` — Hotels, Resorts, Villas. */
const RESORT_STAY_TYPE_IDS = [204, 216, 213] as const;
const RESORT_STAY_TYPE_ID_SET = new Set<number>(RESORT_STAY_TYPE_IDS);

const EXCLUDED_RESORT_STAY =
  /\bhomestays?\b|\bhome[\s-]?stays?\b|\bhostels?\b|\bdormitor(?:y|ies)\b|\bdorms?\b|\bguest[\s-]?houses?\b|\bguesthouses?\b|\bcondos?\b|\bcondominiums?\b|\bapartments?\b|\bapartma\w*\b|\baparthotels?\b|\bmansions?\b|\bbed\s*and\s*breakfasts?\b|\bb\s*&\s*bs?\b|\bbnbs?\b|\bmom'?s\s+home\b|\bmum'?s\s+home\b|\bmoms\s+home\b|\bgostišč\w*|\bpenzions?\b/i;

const ALLOWED_RESORT_STAY = /\b(hotels?|resorts?|boutique|villas?)\b/i;

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
  if (filters.resortStay) {
    for (const id of RESORT_STAY_TYPE_IDS) out.push(`ht_id=${id}`);
  } else if (filters.hotel) {
    out.push("ht_id=204");
  }
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
  if (filters.minReview80) out.push("review_score=80");
  if (filters.stars345) {
    out.push("class=3", "class=4", "class=5", "class_interval=3,4,5");
  }
  return out;
}

/**
 * RapidAPI `/searchHotels` `categories_filter` — same Booking ids, `::` separators.
 * Without this, amenity checkboxes only change the Booking URL and look broken.
 */
export function bookingCategoriesFilterFor(filters: StayFilterFlags): string {
  const parts: string[] = [];
  if (filters.resortStay) {
    for (const id of RESORT_STAY_TYPE_IDS) parts.push(`ht_id::${id}`);
  } else if (filters.hotel) {
    parts.push("ht_id::204");
  }
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
  if (filters.minReview80) parts.push("review_score::80");
  if (filters.stars345) {
    parts.push("class::3", "class::4", "class::5", "class_interval::3");
  }
  return parts.join(",");
}

export function isExcludedResortStayText(text: string): boolean {
  return EXCLUDED_RESORT_STAY.test(text);
}

/** Official 3–5★ hotel / resort / boutique / villa only. Drops unrated and 1–2★. */
export function isAllowedResortStayProperty(input: {
  name: string;
  typeName?: string;
  typeId?: number;
  kind?: HotelKind;
  stars?: number;
}): boolean {
  const stars = input.stars ?? 0;
  if (!Number.isFinite(stars) || stars < 3 || stars > 5) return false;
  if (input.typeId && !RESORT_STAY_TYPE_ID_SET.has(input.typeId)) return false;
  const text = blobOf([input.name, input.typeName]);
  if (isExcludedResortStayText(text)) return false;
  if (input.kind === "hotel") return true;
  return ALLOWED_RESORT_STAY.test(text);
}
