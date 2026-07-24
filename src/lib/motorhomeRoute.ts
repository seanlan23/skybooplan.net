import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

const CAMP_RE =
  /\b(kamp|avtokamp|campground|campsite|camping|rv\s*park|wohnmobilstellplatz|aire\b|sosta|area di sosta)\b/i;

export function isCampActivityName(name: string, description = ""): boolean {
  return CAMP_RE.test(`${name} ${description}`);
}

/** Collect overnight camp / RV park labels from a day (prefer overnight stay). */
export function collectDayCampLabels(day: DayPlan): string[] {
  const slots = [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
  const out: string[] = [];
  for (const a of slots) {
    if (!isCampActivityName(a.name, a.description ?? "")) continue;
    const label = a.name.replace(/\s+/g, " ").trim();
    if (!label) continue;
    if (out.some((x) => x.toLowerCase() === label.toLowerCase())) continue;
    out.push(label);
  }
  return out;
}

/**
 * Google Maps / overview stops for a motorhome plan:
 * origin → (city or preferred camp each stay night) → destination.
 */
export function collectMotorhomeRoadTripStops(plan: AiTripPlan): string[] {
  const stops: string[] = [];
  const push = (raw: string | undefined | null) => {
    const s = raw?.replace(/\s+/g, " ").trim();
    if (!s) return;
    if (stops[stops.length - 1]?.toLowerCase() === s.toLowerCase()) return;
    stops.push(s);
  };

  push(plan.originPlace?.trim() || plan.originIata?.trim());

  for (const day of plan.days ?? []) {
    if (day.inFlightDay) continue;
    const camps = collectDayCampLabels(day);
    if (camps[0]) {
      // Prefer camp + city for Maps: "Camping X, City"
      const city = day.city?.trim();
      push(city && !camps[0].toLowerCase().includes(city.toLowerCase())
        ? `${camps[0]}, ${city}`
        : camps[0]);
      continue;
    }
    push(day.city?.trim() || day.focusName?.trim());
  }

  push(plan.destinationPlace?.trim());
  return stops;
}
