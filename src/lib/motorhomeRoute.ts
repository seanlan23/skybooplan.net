import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

const CAMP_NAME_RE =
  /\b(kamp|avtokamp|campground|campsite|camping|rv\s*park|wohnmobilstellplatz|aire\b|sosta|area di sosta)\b/i;

/** Activity titles that must never become Google Maps waypoints. */
const ACTIVITY_STOP_RE =
  /\b(vožnja|jutranja|popoldne|večer|ladj|čoln|boat|ferry|trajekt|stroll|sprehod|ogled|tour|dinner|kosilo|zajtrk|breakfast|lunch|snorkel|plavanje|swim|hike|pohod|cooking|razred|class|sunset|sončni)\b/i;

/** Country-only labels — not a Maps pin (would swallow the return-home stop). */
const COUNTRY_ONLY_RE =
  /^(italy|italija|italia|croatia|hrvaška|hrvatska|spain|španija|spanija|france|francija|germany|nemčija|austria|avstrija|slovenia|slovenija|greece|grčija|portugal|portugalska|netherlands|nizozemska|switzerland|švica)$/i;

export function isCampActivityName(name: string, description = ""): boolean {
  // Name must look like a camp — description alone is not enough
  // ("return to camp after boat ride" must not promote the boat ride).
  if (!CAMP_NAME_RE.test(name)) return false;
  if (ACTIVITY_STOP_RE.test(name)) return false;
  void description;
  return true;
}

export function isCountryOnlyPlaceLabel(label: string): boolean {
  return COUNTRY_ONLY_RE.test(label.replace(/\s+/g, " ").trim());
}

/** True when a string is safe to pass as a Google/Apple Maps place query. */
export function isPlausibleMapPlaceLabel(label: string): boolean {
  const s = label.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 90) return false;
  if (isCountryOnlyPlaceLabel(s)) return false;
  if (ACTIVITY_STOP_RE.test(s)) return false;
  // Reject long sentence-like activity blurbs.
  if ((s.match(/,/g) ?? []).length >= 2) return false;
  if (/\s(z|in|to|for|with|pri|na)\s/i.test(s) && s.split(/\s+/).length >= 6) {
    // Allow "Camping X, City" (short) but not "Morning boat ride to Venice, Venice"
    if (!CAMP_NAME_RE.test(s)) return false;
  }
  return true;
}

function samePlace(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
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
 * origin → overnight bases → origin (return home).
 * Never emits activity sentences or bare country names (e.g. "Italija").
 */
export function collectMotorhomeRoadTripStops(plan: AiTripPlan): string[] {
  const stops: string[] = [];
  const push = (raw: string | undefined | null) => {
    const s = raw?.replace(/\s+/g, " ").trim();
    if (!s || !isPlausibleMapPlaceLabel(s)) return;
    if (stops[stops.length - 1] && samePlace(stops[stops.length - 1]!, s)) return;
    stops.push(s);
  };

  const origin = (plan.originPlace?.trim() || plan.originIata?.trim() || "").replace(/\s+/g, " ");
  push(origin);

  for (const day of plan.days ?? []) {
    if (day.inFlightDay) continue;
    const city = day.city?.trim() || day.focusName?.trim() || "";
    // Last-day return to origin is handled once at the end — skip duplicate mid-list.
    if (origin && city && samePlace(city, origin)) continue;

    const camps = collectDayCampLabels(day);
    if (camps[0]) {
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

  // Destination is often just "Italy" / "Croatia" — never use that as a pin.
  const dest = plan.destinationPlace?.trim();
  if (dest && !isCountryOnlyPlaceLabel(dest) && !(origin && samePlace(dest, origin))) {
    push(dest);
  }

  // Always close the loop home (Mežica → … → Mežica).
  if (origin) push(origin);

  return stops;
}
