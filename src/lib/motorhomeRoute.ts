import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

const CAMP_NAME_RE =
  /\b(kamp|avtokamp|campground|campsite|camping|rv\s*park|wohnmobilstellplatz|aire\b|sosta|area di sosta)\b/i;

/** Activity titles that must never become Google Maps waypoints. */
const ACTIVITY_STOP_RE =
  /\b(vožnja|jutranja|popoldne|večer|ladj|čoln|boat|ferry|trajekt|stroll|sprehod|ogled|tour|dinner|kosilo|zajtrk|breakfast|lunch|snorkel|plavanje|swim|hike|pohod|cooking|razred|class|sunset|sončni)\b/i;

export function isCampActivityName(name: string, description = ""): boolean {
  // Name must look like a camp — description alone is not enough
  // ("return to camp after boat ride" must not promote the boat ride).
  if (!CAMP_NAME_RE.test(name)) return false;
  if (ACTIVITY_STOP_RE.test(name)) return false;
  void description;
  return true;
}

/** True when a string is safe to pass as a Google/Apple Maps place query. */
export function isPlausibleMapPlaceLabel(label: string): boolean {
  const s = label.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 90) return false;
  if (ACTIVITY_STOP_RE.test(s)) return false;
  // Reject long sentence-like activity blurbs.
  if ((s.match(/,/g) ?? []).length >= 2) return false;
  if (/\s(z|in|to|for|with|pri|na)\s/i.test(s) && s.split(/\s+/).length >= 6) {
    // Allow "Camping X, City" (short) but not "Morning boat ride to Venice, Venice"
    if (!CAMP_NAME_RE.test(s)) return false;
  }
  return true;
}

/** Collect overnight camp / RV park labels from a day (prefer overnight stay). */
export function collectDayCampLabels(day: DayPlan): string[] {
  const slots = [
    ...(day.activities?.evening ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.morning ?? []),
  ];
  const out: string[] = [];
  for (const a of slots) {
    if (!isCampActivityName(a.name, a.description ?? "")) continue;
    const label = a.name.replace(/\s+/g, " ").trim();
    if (!label || !isPlausibleMapPlaceLabel(label)) continue;
    if (out.some((x) => x.toLowerCase() === label.toLowerCase())) continue;
    out.push(label);
  }
  return out;
}

/**
 * Google Maps / overview stops for a motorhome plan:
 * origin → (city or preferred camp each stay night) → destination.
 * Never emits activity sentences (boat rides, walks, meals).
 */
export function collectMotorhomeRoadTripStops(plan: AiTripPlan): string[] {
  const stops: string[] = [];
  const push = (raw: string | undefined | null) => {
    const s = raw?.replace(/\s+/g, " ").trim();
    if (!s || !isPlausibleMapPlaceLabel(s)) return;
    if (stops[stops.length - 1]?.toLowerCase() === s.toLowerCase()) return;
    stops.push(s);
  };

  push(plan.originPlace?.trim() || plan.originIata?.trim());

  for (const day of plan.days ?? []) {
    if (day.inFlightDay) continue;
    const city = day.city?.trim() || day.focusName?.trim() || "";
    const camps = collectDayCampLabels(day);
    if (camps[0]) {
      // Prefer camp + city for Maps: "Camping X, City"
      const campStop =
        city && !camps[0].toLowerCase().includes(city.toLowerCase())
          ? `${camps[0]}, ${city}`
          : camps[0];
      if (isPlausibleMapPlaceLabel(campStop)) {
        push(campStop);
        continue;
      }
    }
    push(city);
  }

  push(plan.destinationPlace?.trim());
  return stops;
}
