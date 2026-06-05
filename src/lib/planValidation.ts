import type { AiTripPlan, DayPlan } from "./aiPlan.functions";

/**
 * Pure validators for AI-generated itineraries. Each rule mirrors a
 * constraint we inject into the LLM prompt, so tests can fail loudly if
 * the model — or a future prompt refactor — regresses.
 */

export type PlanViolation = {
  rule:
    | "duplicate_day_number"
    | "duplicate_destination_segment"
    | "non_linear_route"
    | "missing_travel_block"
    | "duplicate_activity";
  message: string;
  dayNumbers: number[];
};

const HAVERSINE_R_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * HAVERSINE_R_KM * Math.asin(Math.sqrt(h));
}

const normalizeCity = (c: string) => c.trim().toLowerCase();

/**
 * Rule: every day must carry a unique `day` number.
 */
export function findDuplicateDayNumbers(plan: AiTripPlan): PlanViolation[] {
  const seen = new Map<number, number[]>();
  for (const d of plan.days) {
    const list = seen.get(d.day) ?? [];
    list.push(d.day);
    seen.set(d.day, list);
  }
  const violations: PlanViolation[] = [];
  for (const [day, list] of seen) {
    if (list.length > 1) {
      violations.push({
        rule: "duplicate_day_number",
        message: `Day ${day} appears ${list.length} times`,
        dayNumbers: [day],
      });
    }
  }
  return violations;
}

/**
 * Rule: a destination city, once left, must not reappear later as a
 * non-contiguous segment. Multi-day stays in the same city are fine; the
 * route must flow A → B → C without teleporting back to A on day 7.
 */
/**
 * Round trips often start and end in the same hub (e.g. Bangkok days 1–3, islands,
 * Bangkok day 14 for the outbound flight). That final return is allowed; mid-trip
 * ping-pong (Bangkok → north → Bangkok → islands) is not.
 */
function isAllowedHubReturn(
  segments: { city: string; startDay: number; endDay: number }[],
  city: string,
  segmentStartDays: number[],
  totalDays: number,
): boolean {
  if (segmentStartDays.length !== 2 || segments.length < 2) return false;
  const hub = segments[0].city;
  if (city !== hub) return false;
  if (segments[0].startDay !== 1) return false;
  const last = segments[segments.length - 1];
  if (last.city !== hub) return false;
  if (last.endDay !== totalDays) return false;
  if (last.endDay - last.startDay + 1 > 2) return false;
  // Require a meaningful stretch away from the hub (not Phuket → Krabi → Phuket).
  const daysAway = last.startDay - segments[0].endDay - 1;
  return daysAway >= 5;
}

export function findDuplicateCitySegments(plan: AiTripPlan): PlanViolation[] {
  const days = [...plan.days].sort((a, b) => a.day - b.day);
  const totalDays = days.length ? days[days.length - 1].day : 0;
  const segments: { city: string; startDay: number; endDay: number }[] = [];
  for (const d of days) {
    const city = normalizeCity(d.city);
    const last = segments[segments.length - 1];
    if (last && last.city === city) {
      last.endDay = d.day;
    } else {
      segments.push({ city, startDay: d.day, endDay: d.day });
    }
  }
  const counts = new Map<string, number[]>();
  for (const s of segments) {
    const list = counts.get(s.city) ?? [];
    list.push(s.startDay);
    counts.set(s.city, list);
  }
  const violations: PlanViolation[] = [];
  for (const [city, starts] of counts) {
    if (starts.length > 1) {
      if (isAllowedHubReturn(segments, city, starts, totalDays)) continue;
      violations.push({
        rule: "duplicate_destination_segment",
        message: `City "${city}" visited in ${starts.length} non-contiguous segments (days ${starts.join(", ")})`,
        dayNumbers: starts,
      });
    }
  }
  return violations;
}

/**
 * Rule: a long hop between consecutive days (>= 250km) must be marked as a
 * transport day. Otherwise the plan is teleporting the traveller.
 */
export function findMissingTravelBlocks(
  plan: AiTripPlan,
  longHopKm = 250,
): PlanViolation[] {
  const days = [...plan.days].sort((a, b) => a.day - b.day);
  const violations: PlanViolation[] = [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1];
    const curr = days[i];
    const km = distanceKm(prev, curr);
    if (km < longHopKm) continue;
    const hasTransport =
      curr.category === "transport" ||
      prev.category === "transport" ||
      !!curr.transport;
    if (!hasTransport) {
      violations.push({
        rule: "missing_travel_block",
        message: `Day ${prev.day} → ${curr.day}: ${Math.round(
          km,
        )}km hop without a transport block`,
        dayNumbers: [prev.day, curr.day],
      });
    }
  }
  return violations;
}

/**
 * Rule: linear flow — the per-day travel distance should not double back.
 * We flag any day whose distance from the trip's overall direction vector
 * shrinks then grows again (a zig-zag) by more than `tolerance` km.
 *
 * Simpler heuristic: a route is non-linear if the *sum* of day-to-day
 * distances exceeds the straight-line span × `slack`. A perfectly linear
 * A→B→C route has total ≈ A→C; backtracking inflates the total.
 */
export function findNonLinearRoute(
  plan: AiTripPlan,
  slack = 2.5,
): PlanViolation[] {
  const days = [...plan.days].sort((a, b) => a.day - b.day);
  if (days.length < 3) return [];
  let total = 0;
  for (let i = 1; i < days.length; i++) {
    total += distanceKm(days[i - 1], days[i]);
  }
  const span = distanceKm(days[0], days[days.length - 1]);
  // If the trip stays in essentially one place (span ~ 0), skip — the
  // linear-flow rule does not apply to single-region trips.
  if (span < 50) return [];
  if (total > span * slack) {
    return [
      {
        rule: "non_linear_route",
        message: `Route total ${Math.round(total)}km exceeds ${slack}× the straight-line span ${Math.round(span)}km — likely backtracking`,
        dayNumbers: days.map((d) => d.day),
      },
    ];
  }
  return [];
}

/**
 * Rule: no sightseeing activity name should repeat across different days.
 */
export function findDuplicateActivities(plan: AiTripPlan): PlanViolation[] {
  const seen = new Map<string, number[]>();
  const collect = (day: DayPlan) => {
    const names: string[] = [];
    const slots = day.activities;
    if (slots) {
      for (const slot of [slots.morning, slots.afternoon, slots.evening]) {
        if (Array.isArray(slot)) {
          for (const a of slot) if (a?.name) names.push(a.name.trim().toLowerCase());
        }
      }
    }
    if (day.focusName) names.push(day.focusName.trim().toLowerCase());
    return names;
  };
  for (const d of plan.days) {
    for (const name of collect(d)) {
      const list = seen.get(name) ?? [];
      list.push(d.day);
      seen.set(name, list);
    }
  }
  const violations: PlanViolation[] = [];
  for (const [name, dayList] of seen) {
    const unique = [...new Set(dayList)];
    if (unique.length > 1) {
      violations.push({
        rule: "duplicate_activity",
        message: `Activity "${name}" repeats on days ${unique.join(", ")}`,
        dayNumbers: unique,
      });
    }
  }
  return violations;
}

export function validateItinerary(plan: AiTripPlan): PlanViolation[] {
  return [
    ...findDuplicateDayNumbers(plan),
    ...findDuplicateCitySegments(plan),
    ...findMissingTravelBlocks(plan),
    ...findNonLinearRoute(plan),
    ...findDuplicateActivities(plan),
  ];
}
