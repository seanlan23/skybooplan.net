import type { Activity, AiTripPlan, DayPlan } from "./aiPlan.functions";
import { isPaceLightDay, isPaceProgramActivity } from "./paceGuard";
import { findThinStayGaps } from "./stayFacts";
import { isHollowProgramTitle } from "./itineraryGuards";
import { DESTINATION_BY_IATA } from "./destinationCoords";
import { isImplausibleLongHaulArrive, parseClockMinutes } from "./flightScheduling";
import { isSmallIsland } from "./islandStays";

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
    | "thin_long_access"
    | "duplicate_activity"
    | "overpacked_day"
    | "same_day_far_pois"
    | "replayed_arrival"
    | "hollow_activity"
    | "impossible_arrival";
  message: string;
  dayNumbers: number[];
};

/** Blocking rules: one Gemini repair, do not rewrite the stay list in code. */
export const ROUTING_BLOCK_RULES = new Set<PlanViolation["rule"]>([
  "duplicate_destination_segment",
  "non_linear_route",
  "same_day_far_pois",
  "overpacked_day",
  "missing_travel_block",
  "thin_long_access",
  "replayed_arrival",
  "hollow_activity",
  "impossible_arrival",
]);

export function blockingRouteViolations(plan: AiTripPlan): PlanViolation[] {
  return validateItinerary(plan).filter((v) => ROUTING_BLOCK_RULES.has(v.rule));
}

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

  const citySegments = segments.filter((s) => s.city === city);
  if (citySegments.length !== 2) return false;

  const [first, returnSeg] = citySegments;
  const lastTripSegment = segments[segments.length - 1];

  // Return hub must be the trip's final geographic stop (buffer before outbound flight).
  if (returnSeg.startDay !== lastTripSegment.startDay) return false;
  if (returnSeg.endDay !== totalDays) return false;

  const returnSpan = returnSeg.endDay - returnSeg.startDay + 1;
  // Safari capitals are flight buffers only — not multi-day city pads.
  const isThinSafariHub =
    /^(gaborone|windhoek|otjiwarongo|johannesburg|nairobi)$/i.test(city);
  const maxHubReturnDays = isThinSafariHub
    ? 2
    : totalDays >= 14
      ? 6
      : totalDays >= 10
        ? 4
        : 2;
  if (returnSpan > maxHubReturnDays) return false;

  const firstSpan = first.endDay - first.startDay + 1;
  if (firstSpan > (isThinSafariHub ? 2 : 4)) return false;

  // Allow day-1 in-flight / red-eye before the hub (Bangkok often starts day 2).
  if (first.startDay > 4) return false;

  const daysAway = returnSeg.startDay - first.endDay - 1;
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
function dayHasTravelBlock(day: DayPlan | undefined): boolean {
  if (!day) return false;
  if (day.category === "transport") return true;
  if (day.transport) return true;
  if ((day.transportation?.length ?? 0) > 0) return true;
  const acts = [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
  if (acts.some((a) => a.type === "TRANSPORT" || !!a.transportType)) return true;
  const blob = acts.map((a) => `${a.name ?? ""} ${a.description ?? ""}`).join(" ");
  return /→|->/.test(blob) && /let|flight|trajekt|ferry|vlak|train|kombi|van|bus/i.test(blob);
}

function isIslandGroupHop(fromCity: string, toCity: string): boolean {
  const a = isSmallIsland(fromCity);
  const b = isSmallIsland(toCity);
  return a !== b || (a && b);
}

function isArrowTransferStub(day: DayPlan): boolean {
  const title = (day.title ?? "").trim();
  if (!/→|->/.test(title)) return false;
  if (/let|flight|trajekt|ferry|vlak|train|kombi|van|bus|speedboat|čoln|boat/i.test(title)) {
    return false;
  }
  return /^.+\s*(?:→|->)\s*\.?\s*$/.test(title) || title.length < 64;
}

export function findMissingTravelBlocks(
  plan: AiTripPlan,
  longHopKm = 250,
): PlanViolation[] {
  const days = [...plan.days].sort((a, b) => a.day - b.day);
  const violations: PlanViolation[] = [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1];
    const curr = days[i];
    if (curr.inFlightDay || prev.inFlightDay) continue;
    const km = distanceKm(prev, curr);
    const cityChanged =
      normalizeCity(prev.city || prev.focusName || "") !==
      normalizeCity(curr.city || curr.focusName || "");
    const islandHop = cityChanged && isIslandGroupHop(prev.city || "", curr.city || "");
    const needsBlock =
      km >= longHopKm ||
      (islandHop && km >= ISLAND_LEAVE_KM) ||
      (cityChanged && isArrowTransferStub(curr));
    if (!needsBlock) continue;
    if (dayHasTravelBlock(curr) || dayHasTravelBlock(prev)) continue;
    violations.push({
      rule: "missing_travel_block",
      message: `Day ${prev.day} → ${curr.day}: ${Math.round(
        km,
      )}km hop without a transport block`,
      dayNumbers: [prev.day, curr.day],
    });
  }
  return violations;
}

/** Long-access island / coast prelude too thin — model must rebalance or skip. */
export function findThinLongAccessStays(plan: AiTripPlan): PlanViolation[] {
  return findThinStayGaps(plan.days ?? []).map((gap) => ({
    rule: "thin_long_access" as const,
    message:
      gap.kind === "coast_prelude"
        ? `"${gap.city}" has ${gap.have} hotel night(s) before ${gap.nextCity}; coast prelude needs ≥${gap.need}. Rebalance nights or skip the long-access place — do not leave a 1-night coast stop.`
        : `"${gap.city}" has ${gap.have} hotel night(s); long-access stays need ≥${gap.need}. Skip the place or give it enough nights — do not steal nights from the previous coast base.`,
    dayNumbers: gap.dayNumbers,
  }));
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
const LEAVE_REGION_KM = 500;
const ISLAND_LEAVE_KM = 70;
const NEAR_REGION_KM = 450;
const ORIGIN_FAR_KM = 1500;

function isHeavyRegionLeave(from: StayBase, next: StayBase): boolean {
  const km = distanceKm(from, next);
  if (km >= LEAVE_REGION_KM) return true;
  return isIslandGroupHop(from.city, next.city) && km >= ISLAND_LEAVE_KM;
}

function findReturnToAbandoned(
  from: StayBase,
  next: StayBase,
  abandoned: StayBase[],
  entryHub: StayBase,
  isLastBase: boolean,
): StayBase | undefined {
  if (
    isLastBase &&
    normalizeCity(next.city) === normalizeCity(entryHub.city) &&
    abandoned.every((a) => distanceKm(a, next) >= LEAVE_REGION_KM)
  ) {
    return undefined;
  }

  const backToCoast =
    isSmallIsland(from.city) && !isSmallIsland(next.city)
      ? abandoned.find(
          (a) => !isSmallIsland(a.city) && distanceKm(a, next) < NEAR_REGION_KM,
        )
      : undefined;
  if (backToCoast) return backToCoast;

  return abandoned.find((a) => {
    const toOld = distanceKm(a, next);
    if (toOld >= NEAR_REGION_KM) return false;
    return toOld + 40 < distanceKm(from, next);
  });
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function isOriginOrInFlightDay(day: DayPlan, destDays: DayPlan[]): boolean {
  if (day.inFlightDay || day.journeyPhase === "outbound") return true;
  if (!Number.isFinite(day.lat) || !Number.isFinite(day.lng) || destDays.length < 2) {
    return false;
  }
  const core = destDays.filter((d) => d.day !== day.day);
  if (core.length < 2) return false;
  const mid = {
    lat: median(core.map((d) => d.lat)),
    lng: median(core.map((d) => d.lng)),
  };
  return distanceKm(day, mid) > ORIGIN_FAR_KM;
}

type StayBase = {
  city: string;
  lat: number;
  lng: number;
  dayNumbers: number[];
  hub: boolean;
};

function destinationBases(plan: AiTripPlan): StayBase[] {
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  const dest = days.filter((d) => !isOriginOrInFlightDay(d, days));
  const runs: StayBase[] = [];
  for (const d of dest) {
    const city = (d.city || d.focusName || "").trim();
    if (!city || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue;
    const last = runs[runs.length - 1];
    if (last && normalizeCity(last.city) === normalizeCity(city)) {
      last.dayNumbers.push(d.day);
      continue;
    }
    runs.push({
      city,
      lat: d.lat,
      lng: d.lng,
      dayNumbers: [d.day],
      hub: runs.length === 0,
    });
  }
  return runs;
}

/**
 * South → north → south (or east → west → east) on long hops: landing
 * back near an abandoned non-hub cluster. Hub return at the end is allowed.
 */
export function findAbandonedRegionReturn(plan: AiTripPlan): PlanViolation[] {
  const bases = destinationBases(plan);
  if (bases.length < 4) return [];
  const abandoned: StayBase[] = [];
  let cluster: StayBase[] = [bases[0]!];
  for (let i = 1; i < bases.length; i++) {
    const next = bases[i]!;
    const from = cluster[cluster.length - 1]!;
    const back =
      !next.hub &&
      findReturnToAbandoned(from, next, abandoned, bases[0]!, i === bases.length - 1);
    if (back) {
      return [
        {
          rule: "non_linear_route",
          message: `Zigzag: "${from.city}" → "${next.city}" returns to the abandoned "${back.city}" region. One heading — do not bounce back after a long hop or island crossing.`,
          dayNumbers: [...from.dayNumbers, ...next.dayNumbers],
        },
      ];
    }
    if (!isHeavyRegionLeave(from, next)) {
      cluster.push(next);
      continue;
    }
    for (const left of cluster) {
      if (!left.hub) abandoned.push(left);
    }
    cluster = [next];
  }
  return [];
}

export function findNonLinearRoute(
  plan: AiTripPlan,
  slack = 2.5,
): PlanViolation[] {
  const zigzag = findAbandonedRegionReturn(plan);
  if (zigzag.length) return zigzag;

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

function hopPairKey(from: string, to: string): string {
  return `${normalizeCity(from)}>${normalizeCity(to)}`;
}

function listedIntercityHops(day: DayPlan): Array<{ from: string; to: string }> {
  const hops: Array<{ from: string; to: string }> = [];
  for (const leg of day.transportation ?? []) {
    if ((leg.from ?? "").trim() && (leg.to ?? "").trim()) {
      hops.push({ from: leg.from, to: leg.to });
    }
  }
  const acts = [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
  const blob = [
    day.title ?? "",
    day.morning ?? "",
    ...acts.map((a) => `${a.name ?? ""} ${a.description ?? ""}`),
  ].join(" ");
  for (const m of blob.matchAll(
    /([A-Za-zÁÉÍÓÚÄÖÜČŠŽ][\wÁÉÍÓÚÄÖÜáéíóúäöüčšž.'’ -]{2,40}?)\s*(?:\([A-Z]{3}\))?\s*(?:→|->)\s*([A-Za-zÁÉÍÓÚÄÖÜČŠŽ][\wÁÉÍÓÚÄÖÜáéíóúäöüčšž.'’ -]{2,40}?)(?:\s*\([A-Z]{3}\))?/g,
  )) {
    hops.push({ from: m[1]!.trim(), to: m[2]!.trim() });
  }
  for (const m of blob.matchAll(
    /(?:let|flight|trajekt|ferry)[^.]{0,48}?\b(?:iz|from)\s+(.+?)\s+(?:v|do|to)\s+(.+)/gi,
  )) {
    hops.push({ from: m[1]!.trim(), to: m[2]!.trim() });
  }
  return hops;
}

/** Same intercity hop on two consecutive days (arrival replayed on the stay day). */
export function findReplayedArrivals(plan: AiTripPlan): PlanViolation[] {
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  const out: PlanViolation[] = [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const curr = days[i]!;
    const prevHops = listedIntercityHops(prev);
    const currHops = listedIntercityHops(curr);
    if (!currHops.length) continue;
    const prevKeys = new Set(prevHops.map((h) => hopPairKey(h.from, h.to)));
    const sameCity =
      normalizeCity(prev.city || prev.focusName || "") ===
      normalizeCity(curr.city || curr.focusName || "");
    const replayed = currHops.filter((h) => {
      if (prevKeys.has(hopPairKey(h.from, h.to))) return true;
      if (!sameCity) return false;
      const dest = curr.city || curr.focusName || "";
      return (
        dest &&
        normalizeCity(h.to).includes(normalizeCity(dest).slice(0, 6)) &&
        normalizeCity(h.from) !== normalizeCity(dest)
      );
    });
    if (!replayed.length) continue;
    const hop = replayed[0]!;
    out.push({
      rule: "replayed_arrival",
      message: `Day ${curr.day} repeats the ${hop.from} → ${hop.to} hop from day ${prev.day}. One transfer between bases; the next day is local only.`,
      dayNumbers: [prev.day, curr.day],
    });
  }
  return out;
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

const SAME_DAY_FAR_KM = 180;

function dayActivities(day: DayPlan): Activity[] {
  return [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
}

function isTransportLike(a: Activity): boolean {
  if (a.type === "TRANSPORT" || a.transportType) return true;
  return /→|->/.test(`${a.name ?? ""} ${a.description ?? ""}`);
}

/** More program items than a human day (or a transfer day) can hold. */
export function findOverpackedDays(plan: AiTripPlan): PlanViolation[] {
  const totalDays = plan.days?.length ?? 0;
  const out: PlanViolation[] = [];
  for (const day of plan.days ?? []) {
    const program = dayActivities(day).filter((a) => isPaceProgramActivity(a));
    const light = isPaceLightDay(day, { arrivalDay: 1, totalDays });
    const cap = light ? 2 : 4;
    if (program.length > cap) {
      out.push({
        rule: "overpacked_day",
        message: `Day ${day.day} has ${program.length} program items (cap ${cap}${light ? ", light/transfer day" : ""})`,
        dayNumbers: [day.day],
      });
    }
  }
  return out;
}

/** Two sights on the same day more than ~3h apart, with no transfer on that day. */
export function findSameDayFarPois(plan: AiTripPlan): PlanViolation[] {
  const out: PlanViolation[] = [];
  for (const day of plan.days ?? []) {
    const acts = dayActivities(day);
    if (acts.some((a) => isTransportLike(a))) continue;
    const pinned = acts.filter(
      (a) => typeof a.lat === "number" && typeof a.lng === "number",
    );
    for (let i = 0; i < pinned.length; i++) {
      for (let j = i + 1; j < pinned.length; j++) {
        const km = distanceKm(
          { lat: pinned[i]!.lat!, lng: pinned[i]!.lng! },
          { lat: pinned[j]!.lat!, lng: pinned[j]!.lng! },
        );
        if (km > SAME_DAY_FAR_KM) {
          out.push({
            rule: "same_day_far_pois",
            message: `Day ${day.day}: "${pinned[i]!.name}" and "${pinned[j]!.name}" are ${Math.round(km)}km apart with no transfer`,
            dayNumbers: [day.day],
          });
          i = pinned.length;
          break;
        }
      }
    }
  }
  return out;
}

/** Drop the outlier (farthest from the day's city) when two POIs are a same-day teleport. */
export function dropSameDayFarPois(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    if (!day.activities) continue;
    const acts = dayActivities(day);
    if (acts.some((a) => isTransportLike(a))) continue;
    const hub = { lat: day.lat, lng: day.lng };
    if (!Number.isFinite(hub.lat) || !Number.isFinite(hub.lng)) continue;
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      const list = day.activities[slot] ?? [];
      const next = list.filter((a) => {
        if (typeof a.lat !== "number" || typeof a.lng !== "number") return true;
        if (isTransportLike(a) || !isPaceProgramActivity(a)) return true;
        const km = distanceKm(hub, { lat: a.lat, lng: a.lng });
        if (km > SAME_DAY_FAR_KM) {
          removed += 1;
          return false;
        }
        return true;
      });
      if (next.length !== list.length) day.activities[slot] = next;
    }
  }
  return removed;
}

/** Title-only stubs on a stay day (transfer/arrival days may be empty). */
export function findHollowActivities(plan: AiTripPlan): PlanViolation[] {
  const totalDays = plan.days?.length ?? 0;
  const out: PlanViolation[] = [];
  for (const day of plan.days ?? []) {
    if (day.inFlightDay || day.category === "transport") continue;
    if (day.day === 1 || day.day === totalDays) continue;
    if (isPaceLightDay(day, { arrivalDay: 1, totalDays })) continue;
    const acts = dayActivities(day);
    if (!acts.length) continue;
    const hollow = acts.filter((a) => isHollowProgramTitle(a.name ?? "", a.description));
    const program = acts.filter(
      (a) => isPaceProgramActivity(a) && !isHollowProgramTitle(a.name ?? "", a.description),
    );
    if (!hollow.length && program.length) continue;
    out.push({
      rule: "hollow_activity",
      message: hollow.length
        ? `Day ${day.day} has hollow titles (${hollow.map((a) => a.name).join(", ")}). A stay day needs a real name + description — not “Morning in …” / “Visit …”.`
        : `Day ${day.day} has no real morning/afternoon programme. Fill named sights with descriptions, or mark the day as a transfer.`,
      dayNumbers: [day.day],
    });
  }
  return out;
}

export function findImpossibleArrivals(plan: AiTripPlan): PlanViolation[] {
  const day = [...(plan.days ?? [])].sort((a, b) => a.day - b.day)[0];
  if (!day) return [];
  const origin = plan.originIata
    ? DESTINATION_BY_IATA[plan.originIata.toUpperCase()]
    : undefined;
  if (!origin || !Number.isFinite(day.lat) || !Number.isFinite(day.lng)) return [];
  const blob = JSON.stringify(day.activities ?? {});
  const depart = blob.match(
    /(?:mednarodni let|international flight|odhod)[^0-9]{0,40}(\d{1,2}[:.]\d{2})/i,
  );
  const hotel = blob.match(
    /(?:hotel|check-?in|prevoz do hotela|transfer)[^0-9]{0,40}(\d{1,2}[:.]\d{2})/i,
  );
  if (!depart || !hotel) return [];
  const departMin = parseClockMinutes(depart[1]);
  const arriveMin = parseClockMinutes(hotel[1]);
  if (departMin == null || arriveMin == null) return [];
  if (
    !isImplausibleLongHaulArrive(departMin, arriveMin, origin, {
      lat: day.lat,
      lng: day.lng,
    })
  ) {
    return [];
  }
  return [
    {
      rule: "impossible_arrival",
      message: `Day ${day.day}: hotel/transfer at ${hotel[1]} is only ${Math.round((arriveMin - departMin) / 60)}h after the international departure ${depart[1]} — long-haul needs 10+ hours plus timezone. Empty the destination programme until a plausible landing.`,
      dayNumbers: [day.day],
    },
  ];
}

export function validateItinerary(plan: AiTripPlan): PlanViolation[] {
  return [
    ...findDuplicateDayNumbers(plan),
    ...findDuplicateCitySegments(plan),
    ...findMissingTravelBlocks(plan),
    ...findThinLongAccessStays(plan),
    ...findNonLinearRoute(plan),
    ...findReplayedArrivals(plan),
    ...findHollowActivities(plan),
    ...findImpossibleArrivals(plan),
    ...findDuplicateActivities(plan),
    ...findOverpackedDays(plan),
    ...findSameDayFarPois(plan),
  ];
}
