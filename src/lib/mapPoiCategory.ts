/** Map POI categories — shared by Gemini schema + TripMap markers. */
export const MAP_POI_CATEGORIES = [
  "sightseeing",
  "nature",
  "beach",
  "food",
  "entertainment",
  "hotel",
  "airport",
  "train",
  "ferry",
  "transport",
] as const;

export type MapPoiCategory = (typeof MAP_POI_CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(MAP_POI_CATEGORIES);

export function normalizeMapPoiCategory(value: unknown): MapPoiCategory {
  if (typeof value === "string" && CATEGORY_SET.has(value)) {
    return value as MapPoiCategory;
  }
  return "sightseeing";
}

export function inferMapPoiCategoryFromText(text: string): MapPoiCategory {
  const t = text.toLowerCase();

  // Transport modes before airport (avoids "letališče" in train descriptions → plane icon).
  if (/\b(vlak|train|rail|železnic)\b/.test(t) && !/\b(notranji let|domestic flight|international flight)\b/.test(t)) {
    return "train";
  }
  if (/\b(trajekt|ferry|prom)\b/.test(t)) return "ferry";
  if (
    /\b(kombi|van|avtobus|bus|taxi|prevoz s kombijem)\b/.test(t) &&
    !/\b(tempelj|palace|beach|wat |museum|znamenit)\b/.test(t)
  ) {
    return "transport";
  }

  if (
    /\b(notranji let|mednarodni let|domestic flight|international flight|airport transfer|letališč)\b/i.test(
      t,
    ) ||
    /\([a-z]{3}\)\s*(?:→|->|—)\s*\([a-z]{3}\)/i.test(t) ||
    (/\b(odlet|prilet|flight)\b/.test(t) && !/\b(vlak|train)\b/.test(t))
  ) {
    return "airport";
  }

  if (/hotel|hostel|resort|nastanitev|check-in|check out/.test(t)) return "hotel";
  // Campgrounds before generic sightseeing — motorhome nights.
  if (
    /\b(kamp|avtokamp|campground|campsite|camping|rv\s*park|wohnmobilstellplatz|aire\b|sosta)\b/.test(
      t,
    )
  ) {
    return "hotel";
  }
  if (/beach|plaž|snorkel|otok|island|bay cruise|morje|kayak|sup\b/.test(t)) return "beach";
  if (/restaurant|food|market|tržnica|street food|večerja|kosilo|breakfast|kavarna|🍜|dinner|lunch/.test(t)) {
    return "food";
  }
  if (/park|zoo|show|nightlife|bar|club|festival|theme park|zabav|drum circle|safari/.test(t)) {
    return "entertainment";
  }
  if (/trek|waterfall|jungle|national park|gora|hike|narav|rainforest|kanal|khlong/.test(t)) {
    return "nature";
  }
  if (/temple|museum|palace|old town|fort|cathedral|pagoda|znamenit|sight|obisk|tour|heritage|🏛|wat /.test(t)) {
    return "sightseeing";
  }
  return "sightseeing";
}

/** Resolve marker icon from activity metadata — prefer transportType over fuzzy text. */
export function resolveMapPoiCategory(input: {
  name: string;
  description?: string;
  type?: string;
  transportType?: string;
  pinCategory?: string;
}): MapPoiCategory {
  const { name, description = "", type, transportType, pinCategory } = input;
  const text = `${name} ${description}`;

  if (transportType === "train") return "train";
  if (transportType === "ferry") return "ferry";
  if (transportType === "flight") return "airport";
  if (transportType === "bus" || transportType === "van" || transportType === "taxi") {
    return "transport";
  }

  const typeUp = (type ?? "").toUpperCase();
  if (typeUp === "TRANSPORT" || typeUp === "AIRPORT" || typeUp === "FLIGHT") {
    return inferMapPoiCategoryFromText(text);
  }

  if (pinCategory) {
    const normalized = normalizeMapPoiCategory(pinCategory);
    if (normalized !== "sightseeing") return normalized;
  }

  return inferMapPoiCategoryFromText(text);
}

export type MapPoiVisual = {
  emoji: string;
  bg: string;
  ring: string;
};

export function mapPoiVisual(category: MapPoiCategory, nameHint = ""): MapPoiVisual {
  if (
    category === "hotel" &&
    /\b(kamp|avtokamp|campground|campsite|camping|rv\s*park|wohnmobilstellplatz)\b/i.test(nameHint)
  ) {
    return { emoji: "⛺", bg: "#166534", ring: "#86efac" };
  }
  switch (category) {
    case "sightseeing":
      return { emoji: "🏛️", bg: "#1e3a8a", ring: "#60a5fa" };
    case "nature":
      return { emoji: "🌳", bg: "#14532d", ring: "#4ade80" };
    case "beach":
      return { emoji: "🏖️", bg: "#0e7490", ring: "#22d3ee" };
    case "food":
      return { emoji: "🍜", bg: "#9a3412", ring: "#fb923c" };
    case "entertainment":
      return { emoji: "🎡", bg: "#5b21b6", ring: "#c084fc" };
    case "hotel":
      // Campsites share hotel category but get a tent glyph in copy elsewhere;
      // keep hotel emoji for Booking nights, camp detection is text-based.
      return { emoji: "🏨", bg: "#92400e", ring: "#fbbf24" };
    case "airport":
      return { emoji: "✈️", bg: "#1d4ed8", ring: "#93c5fd" };
    case "train":
      return { emoji: "🚆", bg: "#334155", ring: "#94a3b8" };
    case "ferry":
      return { emoji: "⛴️", bg: "#0e7490", ring: "#67e8f9" };
    case "transport":
      return { emoji: "🚌", bg: "#b45309", ring: "#fcd34d" };
    default:
      return { emoji: "📍", bg: "#1e293b", ring: "#94a3b8" };
  }
}

export type MapPoiPin = {
  day: number;
  name: string;
  lat: number;
  lng: number;
  category: MapPoiCategory;
  description?: string;
  arrivalTime?: string;
  departureTime?: string;
  estimatedCostEur?: number;
  imageUrl?: string;
  unsplashQuery?: string;
};
