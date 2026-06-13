import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { lookupDestination } from "@/lib/destinationCoords";

export type RouteOverviewSegment =
  | { kind: "place"; label: string }
  | { kind: "flight" }
  | { kind: "stay"; label: string }
  | { kind: "transfer" };

function shortPlaceLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const comma = trimmed.indexOf(",");
  return comma > 0 ? trimmed.slice(0, comma).trim() : trimmed;
}

export function resolveRouteOriginLabel(plan: AiTripPlan): string | null {
  const place = plan.originPlace?.trim();
  if (place) return shortPlaceLabel(place);
  if (plan.originIata) {
    return lookupDestination(plan.originIata)?.name ?? plan.originIata;
  }
  return null;
}

export function collectStayCities(days: DayPlan[]): string[] {
  const cities: string[] = [];
  for (const day of days) {
    if (day.inFlightDay) continue;
    const city = day.city?.trim();
    if (!city) continue;
    if (cities[cities.length - 1] !== city) cities.push(city);
  }
  return cities;
}

function usesAirHub(plan: AiTripPlan): boolean {
  const mode = plan.groundTransportMode;
  return mode !== "car" && mode !== "motorhome" && mode !== "train";
}

/** High-level one-line route: origin ✈️ stay₁ 🏨 stay₂ 🏨 … ✈️ origin */
export function buildItineraryRouteOverview(plan: AiTripPlan): RouteOverviewSegment[] {
  const cities = collectStayCities(plan.days);
  if (cities.length === 0) return [];

  const origin = resolveRouteOriginLabel(plan);
  const airHub = usesAirHub(plan);
  const segments: RouteOverviewSegment[] = [];

  if (origin) {
    segments.push({ kind: "place", label: origin });
    segments.push({ kind: airHub ? "flight" : "transfer" });
  }

  for (const city of cities) {
    segments.push({ kind: "stay", label: city });
  }

  if (origin) {
    segments.push({ kind: airHub ? "flight" : "transfer" });
    segments.push({ kind: "place", label: origin });
  }

  return segments;
}
