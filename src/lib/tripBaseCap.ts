import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { haversineKm } from "@/lib/geoMath";
import {
  collectOvernightHotelStays,
  hotelsFromSleepNights,
  overnightPlacesMatch,
} from "@/lib/overnightHotelStays";
import { isSmallIsland } from "@/lib/islandStays";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { isSingleBasePlan } from "@/lib/tripStyle";
import { hasExplicitStayPlan } from "@/lib/userStayPlan";

export type TripStayBaseCap = {
  maxBases: number;
  minNights: number;
  maxNights: number;
  minBases: number;
};

type CityRun = {
  city: string;
  start: number;
  end: number;
  nights: number;
};

/**
 * Overnight hotel-base budget by calendar length.
 * 14–17 days: 3–4 bases, each 3–5 nights (no 6–8 hotel hops).
 */
export function tripStayBaseCap(calendarDays: number): TripStayBaseCap {
  if (calendarDays <= 0) {
    return { maxBases: 0, minNights: 2, maxNights: 5, minBases: 0 };
  }
  if (calendarDays <= 9) {
    return { maxBases: 2, minNights: 2, maxNights: 5, minBases: 1 };
  }
  if (calendarDays <= 13) {
    return { maxBases: 3, minNights: 3, maxNights: 5, minBases: 2 };
  }
  if (calendarDays <= 17) {
    return { maxBases: 4, minNights: 3, maxNights: 5, minBases: 3 };
  }
  if (calendarDays <= 18) {
    return { maxBases: 5, minNights: 3, maxNights: 5, minBases: 3 };
  }
  return { maxBases: 6, minNights: 2, maxNights: 5, minBases: 3 };
}

function sortedDays(plan: AiTripPlan): DayPlan[] {
  return [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
}

function validCoord(lat?: number, lng?: number): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 0.01 &&
    Math.abs(lng) > 0.01
  );
}

function runCoords(run: CityRun, days: DayPlan[]): { lat: number; lng: number } | null {
  const looked = lookupRegionCoords(run.city);
  if (looked) return looked;
  for (let i = run.start; i <= run.end; i++) {
    const d = days[i];
    if (d && validCoord(d.lat, d.lng)) return { lat: d.lat, lng: d.lng };
  }
  return null;
}

function runDistanceKm(a: CityRun, b: CityRun, days: DayPlan[]): number {
  const ca = runCoords(a, days);
  const cb = runCoords(b, days);
  if (!ca || !cb) return 280;
  return haversineKm([ca.lng, ca.lat], [cb.lng, cb.lat]);
}

function lastCalendarDayNum(days: DayPlan[]): number {
  return Math.max(0, ...days.map((d) => d.day));
}

function isHomeOriginCity(city: string, plan: AiTripPlan): boolean {
  const token = city.trim();
  if (!token) return false;
  if (plan.originPlace && overnightPlacesMatch(token, plan.originPlace)) return true;
  const iata = plan.originIata?.trim();
  if (iata && token.toUpperCase().includes(iata.toUpperCase())) return true;
  return false;
}

function rebaseLastDayToLastHotel(plan: AiTripPlan, days: DayPlan[]): void {
  if (plan.groundTransportMode) return;
  const last = days[days.length - 1];
  if (!last || !isHomeOriginCity(last.city, plan)) return;
  const stays = collectOvernightHotelStays({
    days,
    originPlace: plan.originPlace,
    groundTransportMode: plan.groundTransportMode,
    accommodationMode: plan.accommodationMode,
  });
  const lastStay = stays[stays.length - 1];
  if (!lastStay?.city) return;
  if (overnightPlacesMatch(last.city, lastStay.city)) return;
  last.city = lastStay.city;
  if (!last.focusName?.trim() || !overnightPlacesMatch(last.focusName, lastStay.city)) {
    last.focusName = lastStay.city;
  }
}

function buildRuns(days: DayPlan[]): CityRun[] {
  const lastNum = lastCalendarDayNum(days);
  const runs: CityRun[] = [];
  for (let i = 0; i < days.length; i++) {
    const city = (days[i]!.city || days[i]!.focusName || "").trim();
    if (!city) continue;
    const prev = runs[runs.length - 1];
    if (prev && overnightPlacesMatch(prev.city, city)) {
      prev.end = i;
      if (days[i]!.day !== lastNum) prev.nights += 1;
      continue;
    }
    runs.push({
      city,
      start: i,
      end: i,
      nights: days[i]!.day === lastNum ? 0 : 1,
    });
  }
  return runs;
}

function hotelRunCount(runs: CityRun[]): number {
  return runs.filter((r) => r.nights > 0).length;
}

function dropAbsorbedHotelHop(day: DayPlan, fromCity: string, toCity: string): void {
  if (!day.transportation?.length) return;
  day.transportation = day.transportation.filter((leg) => {
    const hop =
      (overnightPlacesMatch(leg.from, fromCity) && overnightPlacesMatch(leg.to, toCity)) ||
      (overnightPlacesMatch(leg.from, toCity) && overnightPlacesMatch(leg.to, fromCity));
    return !hop;
  });
  if (day.transportation.length === 0) {
    day.transportation = undefined;
    day.drivingDistanceKm = undefined;
    day.drivingDurationHours = undefined;
  }
}

const MOVE_ACT_RE =
  /let\b|flight|trajekt|ferry|prevoz na letališč|airport transfer|check-?out|odjava|odhod iz hotela/i;

function runHasNamedSights(run: CityRun, days: DayPlan[]): boolean {
  for (let i = run.start; i <= run.end; i++) {
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const a of days[i]?.activities?.[slot] ?? []) {
        if (MOVE_ACT_RE.test(`${a.name ?? ""} ${a.type ?? ""}`)) continue;
        if ((a.name ?? "").trim().length >= 8) return true;
      }
    }
  }
  return false;
}

function runIsIsland(run: CityRun, days: DayPlan[]): boolean {
  if (isSmallIsland(run.city)) return true;
  for (let i = run.start; i <= run.end; i++) {
    if ((days[i]?.transportation ?? []).some((leg) => leg.type === "ferry")) return true;
  }
  return false;
}

function stampSleepCity(day: DayPlan, city: string, sample: DayPlan | undefined): void {
  const fromCity = day.city;
  day.city = city;
  if (!day.focusName?.trim() || overnightPlacesMatch(day.focusName, fromCity)) {
    day.focusName = city;
  }
  const coords = lookupRegionCoords(city);
  if (coords) {
    day.lat = coords.lat;
    day.lng = coords.lng;
  } else if (sample && validCoord(sample.lat, sample.lng)) {
    day.lat = sample.lat;
    day.lng = sample.lng;
  }
  dropAbsorbedHotelHop(day, fromCity, city);
}

function applyMerge(days: DayPlan[], from: CityRun, into: CityRun, lastRun: CityRun): void {
  const keepLastCity = from === lastRun || into === lastRun;
  const city = keepLastCity ? lastRun.city : into.city;
  const keep = keepLastCity ? lastRun : into;
  const loser = keepLastCity ? (from === lastRun ? into : from) : from;
  const sample = days
    .slice(keep.start, keep.end + 1)
    .find((d) => overnightPlacesMatch(d.city, city) && validCoord(d.lat, d.lng));
  for (let i = loser.start; i <= loser.end; i++) {
    stampSleepCity(days[i]!, city, sample ?? days[keep.start]);
  }
}

function pickMerge(
  runs: CityRun[],
  days: DayPlan[],
  maxNights: number,
): { from: number; into: number } | null {
  if (runs.length < 2) return null;
  let best: { score: number; from: number; into: number } | null = null;
  for (let i = 0; i < runs.length; i++) {
    const from = runs[i]!;
    if (from.nights <= 0 && i !== runs.length - 1) continue;
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= runs.length) continue;
      const into = runs[j]!;
      const combined = from.nights + into.nights;
      const over = combined > maxNights ? 1000 + (combined - maxNights) * 80 : 0;
      const pairBonus =
        from.nights <= 2 && into.nights <= 2 && combined <= maxNights ? -90 : 0;
      const bothSights =
        runHasNamedSights(from, days) && runHasNamedSights(into, days) ? 180 : 0;
      const score =
        over +
        from.nights * 45 +
        Math.min(runDistanceKm(from, into, days), 900) +
        pairBonus +
        bothSights;
      if (!best || score < best.score) best = { score, from: i, into: j };
    }
  }
  return best;
}

function rebuildHotels(plan: AiTripPlan, days: DayPlan[]): void {
  plan.days = days;
  const sleepHotels = hotelsFromSleepNights({
    days,
    originPlace: plan.originPlace,
    groundTransportMode: plan.groundTransportMode,
    accommodationMode: plan.accommodationMode,
  });
  if (!sleepHotels.length) return;
  plan.hotels = sleepHotels
    .filter((h) => h.city)
    .map((h) => ({
      city: h.city!,
      nights: h.nights,
      from_date: h.from_date,
      to_date: h.to_date,
    }));
}

function shouldSkipBaseCap(plan: AiTripPlan): boolean {
  if (isSingleBasePlan(plan)) return true;
  if (plan.accommodationMode === "motorhome") return true;
  if (plan.groundTransportMode) return true;
  if (hasExplicitStayPlan(plan.wishes)) return true;
  return false;
}

/**
 * Collapse a chain of 2-night hops into 3–4 multi-night bases.
 * Distant POIs stay as activities (day trips); hotel rows merge.
 * Idempotent. Returns the number of absorbed runs.
 */
export function enforceTripBaseCap(
  plan: AiTripPlan,
  opts?: { calendarDays?: number },
): number {
  if (shouldSkipBaseCap(plan)) return 0;
  const days = sortedDays(plan);
  if (days.length < 4) return 0;

  rebaseLastDayToLastHotel(plan, days);

  const calendarDays = Math.max(opts?.calendarDays ?? 0, days.length, lastCalendarDayNum(days));
  if (calendarDays < 14) return 0;
  const cap = tripStayBaseCap(calendarDays);
  if (cap.maxBases <= 0) return 0;

  let absorbed = 0;
  const mergeOnce = (forceOverMax: boolean): boolean => {
    const runs = buildRuns(days);
    const fromTo = pickMerge(runs, days, forceOverMax ? 99 : cap.maxNights);
    if (!fromTo) return false;
    applyMerge(days, runs[fromTo.from]!, runs[fromTo.into]!, runs[runs.length - 1]!);
    absorbed += 1;
    return true;
  };

  for (let i = 0; i < 24 && hotelRunCount(buildRuns(days)) > cap.maxBases; i++) {
    if (mergeOnce(false)) continue;
    if (!mergeOnce(true)) break;
  }

  for (let i = 0; i < 12; i++) {
    const runs = buildRuns(days);
    if (hotelRunCount(runs) <= cap.minBases) break;
    const short = runs.find((r) => r.nights > 0 && r.nights < cap.minNights);
    if (!short) break;
    const idx = runs.indexOf(short);
    const neighbor = (idx > 0 ? runs[idx - 1] : undefined) ?? runs[idx + 1];
    if (!neighbor) break;
    applyMerge(days, short, neighbor, runs[runs.length - 1]!);
    absorbed += 1;
  }

  for (let i = 0; i < 8; i++) {
    const runs = buildRuns(days);
    if (runs.length < 3) break;
    let folded = false;
    for (let r = 1; r < runs.length - 1; r++) {
      const prev = runs[r - 1]!;
      const cur = runs[r]!;
      const next = runs[r + 1]!;
      if (runIsIsland(cur, days)) continue;
      const dPrevNext = runDistanceKm(prev, next, days);
      const dPrevCur = runDistanceKm(prev, cur, days);
      const dCurNext = runDistanceKm(cur, next, days);
      if (dPrevCur < 50 || dCurNext < 50) continue;
      if (dPrevNext >= Math.min(dPrevCur, dCurNext) * 0.85) continue;
      const into = dCurNext <= dPrevCur ? next : prev;
      applyMerge(days, cur, into, runs[runs.length - 1]!);
      absorbed += 1;
      folded = true;
      break;
    }
    if (!folded) break;
  }

  rebuildHotels(plan, days);
  return absorbed;
}
