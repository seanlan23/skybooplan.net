/** Map POI categories — shared by Gemini schema + TripMap markers. */
export const MAP_POI_CATEGORIES = [
  "sightseeing",
  "nature",
  "beach",
  "food",
  "entertainment",
  "hotel",
  "airport",
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
  if (/airport|letališč|✈|flight|odlet|prilet/.test(t)) return "airport";
  if (/hotel|hostel|resort|nastanitev|check-in|check out/.test(t)) return "hotel";
  if (/beach|plaž|snorkel|otok|island|bay cruise|morje/.test(t)) return "beach";
  if (/restaurant|food|market|tržnica|street food|večerja|kosilo|breakfast|kavarna|🍜|dinner|lunch/.test(t)) {
    return "food";
  }
  if (/park|zoo|show|nightlife|bar|club|festival|theme park|zabav/.test(t)) return "entertainment";
  if (/trek|waterfall|jungle|national park|gora|hike|narav|rainforest|safari/.test(t)) return "nature";
  if (/temple|museum|palace|old town|fort|cathedral|pagoda|znamenit|sight|obisk|tour|heritage|🏛/.test(t)) {
    return "sightseeing";
  }
  return "sightseeing";
}

export type MapPoiVisual = {
  emoji: string;
  bg: string;
  ring: string;
};

export function mapPoiVisual(category: MapPoiCategory): MapPoiVisual {
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
      return { emoji: "🏨", bg: "#92400e", ring: "#fbbf24" };
    case "airport":
      return { emoji: "✈️", bg: "#1d4ed8", ring: "#93c5fd" };
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
};
