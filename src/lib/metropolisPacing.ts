/**
 * Gateway metropolis cap vs interior / island pacing.
 * Lookup table + cues — not per-destination production branches.
 * Explicit user stay plans always win (caller must skip).
 */

import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { hasExplicitStayPlan } from "@/lib/userStayPlan";

/** Opening stay at an entry transit hub. */
export const OPENING_METRO_MAX_NIGHTS = 3;
/** Return stay at an exit transit hub (buffer + airport). */
export const CLOSING_METRO_MAX_NIGHTS = 2;
/** Same metropolis across the whole trip. */
export const METRO_SHARE_CAP = 0.3;
/** Cultural / mountain centres and islands / nature parks. */
export const INTERIOR_SLOW_MIN_NIGHTS = 3;

const TRANSIT_METROPOLIS_KEYS = new Set(
  [
    "bangkok",
    "kuala lumpur",
    "toronto",
    "tokyo",
    "tokio",
    "manila",
    "jakarta",
    "singapore",
    "seoul",
    "hong kong",
    "delhi",
    "mumbai",
    "dubai",
    "istanbul",
    "mexico city",
    "ciudad de mexico",
    "sao paulo",
    "johannesburg",
    "nairobi",
    "cairo",
    "gaborone",
    "windhoek",
    "hanoi",
    "ho chi minh",
    "saigon",
  ].map(normCity),
);

/** Islands, parks, cultural/mountain bases that need a real stay — not a hit-and-run. */
const INTERIOR_SLOW_RE =
  /\bkoh\b|\bisla\b|\bisland\b|\botok\b|phi phi|yao noi|samui|lanta|phangan|\btao\b|boracay|el nido|panglao|port barton|\blipe\b|holbox|cozumel|ubud|maldives|zanzibar|khao sok|national park|\bnp\b|serengeti|kruger|okavango|railay|chiang mai|doi inthanon|kyoto|nara|takayama|cusco|sacred valley|luang prabang|siem reap|angkor|\bhue\b|hoi an|banaue|sagada|kotor|berat|meteora/i;

function normCity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .split(",")[0]
    ?.trim()
    .replace(/\s+/g, " ") ?? "";
}

export function isTransitMetropolis(city: string): boolean {
  const key = normCity(city);
  if (!key) return false;
  if (TRANSIT_METROPOLIS_KEYS.has(key)) return true;
  for (const hub of TRANSIT_METROPOLIS_KEYS) {
    if (key.includes(hub) || hub.includes(key)) return true;
  }
  return false;
}

export function isInteriorSlowStay(city: string): boolean {
  return INTERIOR_SLOW_RE.test(city);
}

export function metroShareCapNights(totalDays: number): number {
  return Math.max(1, Math.floor(totalDays * METRO_SHARE_CAP));
}

export function metropolisPacingPromptBlock(opts?: { lockUserStayPlan?: boolean }): string {
  if (opts?.lockUserStayPlan) {
    return `- METROPOLE: uporabnikov razpored mest/noči premaga omejitev vstopnih mest.`;
  }
  return `- METROPOLE (vstop/izstop): če je prihod/odhod velika tranzitna metropola (npr. Bangkok, Kuala Lumpur, Toronto, Tokio), na začetku NAJVEČ ${OPENING_METRO_MAX_NIGHTS} noči (tipično 2–3), ob povratku NAJVEČ ${CLOSING_METRO_MAX_NIGHTS} noči (1–2 — zaključek in transfer na letališče). Ista metropola skupaj ≤ ${Math.round(METRO_SHARE_CAP * 100)} % trajanja potovanja.
- NOTRANJOST: sproščene dni daj v ključne regije — kulturni/gorski centri (npr. Chiang Mai) ≥${INTERIOR_SLOW_MIN_NIGHTS} noči (celodnevni izlet kot Doi Inthanon brez hitenja); otoki in naravni parki (npr. Koh Yao Noi, Khao Sok) ≥${INTERIOR_SLOW_MIN_NIGHTS} noči. PREPOVEDANO nategovati vstopni hub, medtem ko ima notranja baza 1–2 noči.`;
}

type PaceDay = Pick<
  DayPlan,
  "day" | "city" | "focusName" | "title" | "inFlightDay" | "lat" | "lng" | "activities"
>;

function dayNum(day: PaceDay, index: number): number {
  return typeof day.day === "number" && day.day >= 1 ? day.day : index + 1;
}

function isHotelNight(day: PaceDay, index: number, totalDays: number): boolean {
  if (day.inFlightDay) return false;
  return dayNum(day, index) < totalDays;
}

type Run = { city: string; start: number; end: number };

function cityRuns(days: PaceDay[]): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < days.length; i++) {
    if (days[i]!.inFlightDay) continue;
    const city = (days[i]!.city ?? days[i]!.focusName ?? "").trim();
    if (!city) continue;
    const last = runs[runs.length - 1];
    if (last && last.city.toLowerCase() === city.toLowerCase() && last.end === i - 1) {
      last.end = i;
    } else {
      runs.push({ city, start: i, end: i });
    }
  }
  return runs;
}

function hotelNightsInRun(days: PaceDay[], run: Run, totalDays: number): number {
  let n = 0;
  for (let i = run.start; i <= run.end; i++) {
    if (isHotelNight(days[i]!, i, totalDays)) n += 1;
  }
  return n;
}

function lastHotelIndex(days: PaceDay[], run: Run, totalDays: number): number {
  for (let i = run.end; i >= run.start; i--) {
    if (isHotelNight(days[i]!, i, totalDays)) return i;
  }
  return -1;
}

function firstHotelIndex(days: PaceDay[], run: Run, totalDays: number): number {
  for (let i = run.start; i <= run.end; i++) {
    if (isHotelNight(days[i]!, i, totalDays)) return i;
  }
  return -1;
}

function stampDay(day: PaceDay, city: string, sample: PaceDay | undefined): void {
  day.city = city;
  if (day.focusName && day.focusName !== city) day.focusName = city;
  const coords = lookupRegionCoords(city);
  if (coords) {
    day.lat = coords.lat;
    day.lng = coords.lng;
  } else if (sample && Number.isFinite(sample.lat) && Number.isFinite(sample.lng)) {
    day.lat = sample.lat;
    day.lng = sample.lng;
  }
  if (day.activities) {
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      day.activities[slot] = (day.activities[slot] ?? []).filter((a) => {
        const type = (a.type ?? "").toLowerCase();
        if (type === "eat" || type === "hotel" || type === "stay") return true;
        return /hotel|check-?in|prijava|nočitev|večerja|dinner|lunch|kosilo/i.test(
          `${a.name ?? ""} ${a.description ?? ""}`,
        );
      });
    }
  }
}

function rebuildHotels(plan: AiTripPlan, days: PaceDay[], totalDays: number): void {
  const runs = cityRuns(days);
  plan.hotels = runs
    .map((run) => ({
      city: run.city,
      nights: hotelNightsInRun(days, run, totalDays),
    }))
    .filter((h) => h.nights > 0);
}

function metroNights(days: PaceDay[], city: string, totalDays: number): number {
  const key = normCity(city);
  let n = 0;
  for (let i = 0; i < days.length; i++) {
    if (!isHotelNight(days[i]!, i, totalDays)) continue;
    if (normCity(days[i]!.city ?? days[i]!.focusName ?? "") === key) n += 1;
  }
  return n;
}

function sampleOf(days: PaceDay[], city: string, except: number): PaceDay | undefined {
  const key = city.toLowerCase();
  return days.find(
    (d, i) => i !== except && (d.city ?? "").toLowerCase() === key,
  );
}

/**
 * Trim gateway hub stays and feed interior slow bases.
 * No-op when the user spelled nights-per-city, or the trip is a single city.
 */
export function paceMetropolisStays(plan: AiTripPlan): number {
  if (hasExplicitStayPlan(plan.wishes)) return 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  const totalDays = Math.max(
    days.length,
    ...days.map((d, i) => dayNum(d, i)),
  );
  if (days.length < 3 || totalDays < 5) return 0;

  let moved = 0;
  const give = (fromIdx: number, toCity: string) => {
    const day = days[fromIdx]!;
    stampDay(day, toCity, sampleOf(days, toCity, fromIdx));
    moved += 1;
  };

  const trimOpening = (maxNights: number) => {
    const runs = cityRuns(days);
    const opening = runs[0];
    const next = runs[1];
    if (!opening || !next || !isTransitMetropolis(opening.city)) return false;
    if (hotelNightsInRun(days, opening, totalDays) <= maxNights) return false;
    const idx = lastHotelIndex(days, opening, totalDays);
    if (idx < 0) return false;
    give(idx, next.city);
    return true;
  };

  const trimClosing = (maxNights: number) => {
    const runs = cityRuns(days);
    if (runs.length < 2) return false;
    const closing = runs[runs.length - 1]!;
    const prev = runs[runs.length - 2]!;
    if (!isTransitMetropolis(closing.city)) return false;
    if (normCity(closing.city) === normCity(runs[0]!.city) && runs.length === 1) {
      return false;
    }
    if (hotelNightsInRun(days, closing, totalDays) <= maxNights) return false;
    const idx = firstHotelIndex(days, closing, totalDays);
    if (idx < 0) return false;
    give(idx, prev.city);
    return true;
  };

  const padInterior = () => {
    const runs = cityRuns(days);
    if (runs.length < 2) return false;
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r]!;
      if (isTransitMetropolis(run.city)) continue;
      if (!isInteriorSlowStay(run.city)) continue;
      if (hotelNightsInRun(days, run, totalDays) >= INTERIOR_SLOW_MIN_NIGHTS) continue;
      const prev = runs[r - 1];
      const next = runs[r + 1];
      const donor =
        prev && isTransitMetropolis(prev.city) && hotelNightsInRun(days, prev, totalDays) > 1
          ? prev
          : next && isTransitMetropolis(next.city) && hotelNightsInRun(days, next, totalDays) > 1
            ? next
            : prev && hotelNightsInRun(days, prev, totalDays) > INTERIOR_SLOW_MIN_NIGHTS
              ? prev
              : next && hotelNightsInRun(days, next, totalDays) > INTERIOR_SLOW_MIN_NIGHTS
                ? next
                : undefined;
      if (!donor) continue;
      const fromEnd = donor === prev;
      const idx = fromEnd
        ? lastHotelIndex(days, donor, totalDays)
        : firstHotelIndex(days, donor, totalDays);
      if (idx < 0) continue;
      give(idx, run.city);
      return true;
    }
    return false;
  };

  for (let i = 0; i < 24 && trimOpening(OPENING_METRO_MAX_NIGHTS); i++) {
    /* opening hub → next base */
  }
  for (let i = 0; i < 24 && trimClosing(CLOSING_METRO_MAX_NIGHTS); i++) {
    /* previous base ← closing hub */
  }
  for (let i = 0; i < 24 && padInterior(); i++) {
    /* feed Chiang Mai / islands / parks */
  }

  const openingCity = cityRuns(days)[0]?.city;
  if (openingCity && isTransitMetropolis(openingCity)) {
    const cap = metroShareCapNights(totalDays);
    for (let i = 0; i < 24 && metroNights(days, openingCity, totalDays) > cap; i++) {
      const openingN = hotelNightsInRun(days, cityRuns(days)[0]!, totalDays);
      const closing = cityRuns(days).at(-1);
      const closingIsSame =
        closing && normCity(closing.city) === normCity(openingCity) && cityRuns(days).length > 1;
      if (openingN > 1 && trimOpening(Math.min(OPENING_METRO_MAX_NIGHTS, openingN - 1))) {
        continue;
      }
      if (
        closingIsSame &&
        hotelNightsInRun(days, closing, totalDays) > 1 &&
        trimClosing(Math.min(CLOSING_METRO_MAX_NIGHTS, hotelNightsInRun(days, closing, totalDays) - 1))
      ) {
        continue;
      }
      break;
    }
  }

  if (moved) rebuildHotels(plan, days, totalDays);
  return moved;
}
