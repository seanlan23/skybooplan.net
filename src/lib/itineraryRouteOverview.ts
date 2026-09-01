import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { formatAirportLabelForLang, getAirportHub } from "@/lib/airportCatalog";
import { lookupDestination } from "@/lib/destinationCoords";
import { isSingleBasePlan } from "@/lib/tripStyle";

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

/** Nearby-hub picker dumps "LJU · VIE · ZAG" into originPlace — that is not the ticket. */
export function looksLikeMultiAirportLabel(label: string | null | undefined): boolean {
  const text = (label ?? "").trim();
  if (!text) return false;
  if (text.includes(" · ")) return true;
  return [...text.matchAll(/\(([A-Z]{3})\)/g)].length >= 2;
}

export function formatTicketAirportLabel(iata: string, lang?: string): string {
  const code = iata.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return iata.trim();
  const hub = getAirportHub(code);
  if (hub) return formatAirportLabelForLang(hub, lang);
  const dest = lookupDestination(code);
  if (dest?.name) return `${dest.name} (${code})`;
  return code;
}

export function resolveRouteOriginLabel(plan: AiTripPlan, lang?: string): string | null {
  const iata = plan.originIata?.trim().toUpperCase() ?? "";
  const place = plan.originPlace?.trim() ?? "";
  const ticketIata = /^[A-Z]{3}$/.test(iata) ? iata : "";
  if (ticketIata && (!place || looksLikeMultiAirportLabel(place))) {
    return formatTicketAirportLabel(ticketIata, lang);
  }
  if (place && !looksLikeMultiAirportLabel(place)) return shortPlaceLabel(place);
  if (ticketIata) return formatTicketAirportLabel(ticketIata, lang);
  return place ? shortPlaceLabel(place) : null;
}

export function resolveRouteDestinationLabel(plan: AiTripPlan, lang?: string): string | null {
  const iata = plan.destinationIata?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{3}$/.test(iata)) return formatTicketAirportLabel(iata, lang);
  const name = plan.destinationName?.trim() || plan.destinationPlace?.trim() || "";
  if (name && !looksLikeMultiAirportLabel(name)) return shortPlaceLabel(name);
  return null;
}

/** Page title: destination city, never the nearby-airport checklist. */
export function planHeaderDestinationName(plan: AiTripPlan, lang?: string): string {
  const name = plan.destinationName?.trim() || "";
  if (name && !looksLikeMultiAirportLabel(name)) return name;
  return resolveRouteDestinationLabel(plan, lang) ?? name;
}

export function collectStayCities(days?: DayPlan[] | null): string[] {
  const cities: string[] = [];
  for (const day of days ?? []) {
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
export function buildItineraryRouteOverview(
  plan: AiTripPlan,
  lang?: string,
): RouteOverviewSegment[] {
  if (isSingleBasePlan(plan) && usesAirHub(plan)) {
    const origin = resolveRouteOriginLabel(plan, lang);
    const dest = resolveRouteDestinationLabel(plan, lang);
    if (origin && dest) {
      return [
        { kind: "place", label: origin },
        { kind: "flight" },
        { kind: "place", label: dest },
      ];
    }
  }

  const cities = collectStayCities(plan.days ?? []);
  if (cities.length === 0) return [];

  const origin = resolveRouteOriginLabel(plan, lang);
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
