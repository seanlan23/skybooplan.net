import { lookupRegionCoords } from "@/lib/regionCoords";

/**
 * Stay facts (catalog) — never overnight a hub day-trip; long-access islands need enough nights.
 * Keep this file free of aiPlan / curatedRoutes imports (used while building blueprints).
 */

export type HubDayTripOnly = {
  match: RegExp;
  hubCity: string;
  /** Shown on the one sightseeing day after the overnight is moved to the hub. */
  placeName: string;
};

export type LongAccessMinNights = {
  match: RegExp;
  minNights: number;
};

/** Short train/bus hop from a hub — sleep at the hub, visit as a day trip. */
export const HUB_DAY_TRIP_ONLY: HubDayTripOnly[] = [
  { match: /ayutthaya/i, hubCity: "Bangkok", placeName: "Ayutthaya" },
];

/** Door-to-door 6–8h (boat + van + flight). Two nights wastes the transfer. */
export const LONG_ACCESS_MIN_NIGHTS: LongAccessMinNights[] = [
  { match: /koh\s*lipe|\blipe\b/i, minNights: 4 },
];

/** Coast base before a long-access island — Railay/Phi Phi need a real Krabi stay. */
const COAST_PRELUDE: Array<{ coast: RegExp; island: RegExp; minNights: number }> = [
  {
    coast: /krabi|ao nang|aonang|phuket|railay/i,
    island: /koh\s*lipe|\blipe\b/i,
    minNights: 3,
  },
];

export function hubDayTripOnly(city: string): HubDayTripOnly | null {
  const t = city.trim();
  if (!t) return null;
  return HUB_DAY_TRIP_ONLY.find((f) => f.match.test(t)) ?? null;
}

export function coastPreludeMinNights(city: string, nextCity?: string): number {
  if (!nextCity?.trim()) return 1;
  const hit = COAST_PRELUDE.find((f) => f.coast.test(city) && f.island.test(nextCity));
  return hit?.minNights ?? 1;
}

export function minStayNights(city: string, nextCity?: string): number {
  const t = city.trim();
  if (!t) return 1;
  const islandMin = LONG_ACCESS_MIN_NIGHTS.find((f) => f.match.test(t))?.minNights ?? 1;
  return Math.max(islandMin, coastPreludeMinNights(t, nextCity));
}

export function stayFactsPromptBlock(slo: boolean): string {
  if (slo) {
    return [
      "- Ayutthaya: SAMO dnevni izlet iz Bangkoka (vlak ~1,5 h). PREPOVEDANO hotel / nočitev v Ayutthayi — spi v Bangkoku.",
      "- Koh Lipe: če je na poti, ≥4 nočitve (pristop 6–8 h). PREPOVEDANO 1–2 noči; raje izpusti otok, kot da greš samo čez vikend.",
      "- Krabi / Ao Nang pred Koh Lipe: ≥3 nočitve (Railay, Phra Nang, Phi Phi). PREPOVEDANO 1 noč v Krabiju in 7 noči na Lipeju.",
    ].join("\n");
  }
  return [
    "- Ayutthaya: Bangkok day trip only (train ~1.5h). Never overnight there — sleep in Bangkok.",
    "- Koh Lipe: if included, ≥4 nights (6–8h access). Never 1–2 nights; skip the island rather than a weekend hop.",
    "- Krabi / Ao Nang before Koh Lipe: ≥3 nights (Railay, Phra Nang, Phi Phi). Never 1 night in Krabi and 7 on Lipe.",
  ].join("\n");
}

type StayDay = {
  day?: number;
  city?: string;
  title?: string;
  focusName?: string;
  lat?: number;
  lng?: number;
};

function stampCity<T extends StayDay>(day: T, city: string): void {
  day.city = city;
  const coords = lookupRegionCoords(city);
  if (coords) {
    day.lat = coords.lat;
    day.lng = coords.lng;
  }
}

/** Move hotel nights off a day-trip-only city onto its hub. */
export function relabelHubDayTripOvernights<T extends StayDay>(
  days: T[],
  language?: string,
): number {
  const slo = !language || language === "sl" || language.startsWith("sl");
  let n = 0;
  let firstInRun = true;
  for (const day of days) {
    const fact = hubDayTripOnly(day.city ?? "");
    if (!fact) {
      firstInRun = true;
      continue;
    }
    stampCity(day, fact.hubCity);
    if (firstInRun) {
      day.title = slo
        ? `Dnevni izlet v ${fact.placeName}`
        : `Day trip to ${fact.placeName}`;
      day.focusName = fact.placeName;
      firstInRun = false;
    }
    n += 1;
  }
  return n;
}

type CityRun = { city: string; start: number; end: number };

function cityRuns<T extends StayDay>(days: T[]): CityRun[] {
  const runs: CityRun[] = [];
  for (let i = 0; i < days.length; i++) {
    const city = (days[i]?.city ?? "").trim();
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

function hotelNightsInRun<T extends StayDay>(days: T[], run: CityRun): number {
  const lastCal = days.length - 1;
  let nights = run.end - run.start + 1;
  if (run.end === lastCal) nights -= 1;
  return Math.max(0, nights);
}

/**
 * If a long-access island is already on the plan, grow it to min nights
 * without stealing the coast prelude (Krabi ≥3 before Lipe). Surplus island
 * days go back to a starved coast base.
 */
export function ensureLongAccessMinNights<T extends StayDay>(days: T[]): number {
  if (days.length < 3) return 0;
  let moved = 0;
  const lastCal = days.length - 1;

  const grow = () => {
    const runs = cityRuns(days);
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r]!;
      const need = minStayNights(run.city);
      if (need < 4) continue;
      let have = hotelNightsInRun(days, run);
      if (have >= need) continue;

      const stealFrom = (neighbor: CityRun | undefined, fromEnd: boolean, keep: number) => {
        if (!neighbor) return;
        while (have < need) {
          const span = neighbor.end - neighbor.start + 1;
          if (span <= keep) break;
          const idx = fromEnd ? neighbor.end : neighbor.start;
          if (idx === lastCal) break;
          if (idx < 0 || idx >= days.length) break;
          stampCity(days[idx]!, run.city);
          moved += 1;
          have += 1;
          if (fromEnd) neighbor.end -= 1;
          else neighbor.start += 1;
        }
      };

      const prev = runs[r - 1];
      const preludeKeep = Math.max(2, coastPreludeMinNights(prev?.city ?? "", run.city));
      stealFrom(prev, true, preludeKeep);
      stealFrom(runs[r + 1], false, 2);
      if (have < need && preludeKeep < 3) {
        stealFrom(prev, true, 1);
      }
    }
  };

  const giveBackPrelude = () => {
    const runs = cityRuns(days);
    for (let r = 1; r < runs.length; r++) {
      const prev = runs[r - 1]!;
      const cur = runs[r]!;
      const need = coastPreludeMinNights(prev.city, cur.city);
      if (need < 3) continue;
      let have = hotelNightsInRun(days, prev);
      const islandMin = minStayNights(cur.city);
      let islandHave = hotelNightsInRun(days, cur);
      while (have < need && islandHave > islandMin) {
        const idx = cur.start;
        if (idx === lastCal || idx < 0 || idx >= days.length) break;
        stampCity(days[idx]!, prev.city);
        moved += 1;
        have += 1;
        islandHave -= 1;
        cur.start += 1;
        prev.end += 1;
      }
    }
  };

  grow();
  giveBackPrelude();
  return moved;
}
