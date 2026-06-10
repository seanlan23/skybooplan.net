import type { Activity, DayPlan } from "@/lib/aiPlan.functions";
import type { TripAdvisorStyleDetails } from "@/lib/geminiPro.shared";

export type { TripAdvisorStyleDetails };

export type PoiDetailsData = {
  name: string;
  description?: string;
  fullDescription?: string;
  arrivalTime?: string;
  departureTime?: string;
  timeSlot?: string;
  estimatedCostEur?: number;
  lat?: number;
  lng?: number;
  city?: string;
  destinationName?: string;
  category?: string;
  tripAdvisorStyleDetails?: TripAdvisorStyleDetails;
  day?: number;
};

export function mockPoiRating(name: string): { score: number; reviewCount: number } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  const score = Math.round((4 + (Math.abs(h) % 8) / 10) * 10) / 10;
  const reviewCount = 180 + (Math.abs(h) % 9200);
  return { score, reviewCount };
}

export function poiRecommendationTip(poi: PoiDetailsData): string {
  if (poi.tripAdvisorStyleDetails?.proTip?.trim()) {
    return poi.tripAdvisorStyleDetails.proTip.trim();
  }
  const cat = (poi.category ?? "").toLowerCase();
  if (/food|restaurant|market/.test(cat)) {
    return "Pridi malo pred konicami ali ob odprtju — manj gneče in boljša izbira.";
  }
  if (/nature|beach|park/.test(cat)) {
    return "Vzemi udobno obutev, vodo in zaščito pred soncem; najboljši čas je zgodaj dopoldan.";
  }
  if (/hotel|camp/.test(cat)) {
    return "Rezerviraj vnaprej v sezoni; preveri check-in uro in parkirišče.";
  }
  return "Načrtuj vsaj 60–90 minut za obisk; fotografiranje je običajno dovoljeno, flash pa pogosto ne.";
}

export function resolvePoiRating(poi: PoiDetailsData): number {
  const r = poi.tripAdvisorStyleDetails?.rating;
  if (typeof r === "number" && r >= 3 && r <= 5) return Math.round(r * 10) / 10;
  return mockPoiRating(poi.name).score;
}

export function splitDescriptionParagraphs(text?: string): string[] {
  if (!text?.trim()) return [];
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  const sentences = text.match(/[^.!?…]+[.!?…]+/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (sentences.length <= 2) return [text.trim()];
  const mid = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, mid).join(" "), sentences.slice(mid).join(" ")];
}

export function findActivityPin(day: DayPlan, activity: Activity) {
  const key = activity.name.trim().toLowerCase();
  return day.mapPins?.find((p) => p.name.trim().toLowerCase() === key);
}

function resolveGuideDetails(
  activity?: Activity,
  pin?: NonNullable<DayPlan["mapPins"]>[number],
): TripAdvisorStyleDetails | undefined {
  return activity?.tripAdvisorStyleDetails ?? pin?.tripAdvisorStyleDetails;
}

export function activityToPoiDetails(activity: Activity, day: DayPlan): PoiDetailsData {
  const pin = findActivityPin(day, activity);
  return {
    name: activity.name,
    description: activity.description,
    fullDescription: activity.description,
    arrivalTime: activity.arrivalTime,
    departureTime: activity.departureTime,
    timeSlot: activity.timeSlot,
    estimatedCostEur: activity.estimatedCostEur,
    lat: activity.lat ?? pin?.lat,
    lng: activity.lng ?? pin?.lng,
    city: day.city,
    category: activity.type ?? pin?.category,
    tripAdvisorStyleDetails: resolveGuideDetails(activity, pin),
    day: day.day,
  };
}

export function mapPinToPoiDetails(
  pin: NonNullable<DayPlan["mapPins"]>[number],
  day: DayPlan,
): PoiDetailsData {
  return {
    name: pin.name,
    description: pin.description,
    fullDescription: pin.description,
    arrivalTime: pin.arrivalTime,
    departureTime: pin.departureTime,
    estimatedCostEur: pin.estimatedCostEur,
    lat: pin.lat,
    lng: pin.lng,
    city: day.city,
    category: pin.category,
    tripAdvisorStyleDetails: pin.tripAdvisorStyleDetails,
    day: day.day,
  };
}
