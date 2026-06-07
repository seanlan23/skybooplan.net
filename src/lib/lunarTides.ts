/**
 * Phase 3 — moon phase (global math), optional tide API, bioluminescence / low-tide hints.
 */

export type MoonPhaseInfo = {
  date: string;
  ageDays: number;
  illumination: number;
  phase: number;
  name: string;
  isFullMoon: boolean;
  isNewMoon: boolean;
  bioluminescenceFriendly: boolean;
};

export type TideExtreme = {
  type: "High" | "Low";
  /** ISO local time from API */
  dateTime: string;
  /** HH:mm local */
  timeLocal: string;
  heightM: number;
};

export type DayTideInfo = {
  date: string;
  extremes: TideExtreme[];
  lowTideAfternoon: TideExtreme | null;
};

export type TripAstronomyOpts = {
  departDate: string;
  returnDate?: string;
  lang: string;
  lat?: number;
  lng?: number;
  /** Pre-fetched tide calendar (YYYY-MM-DD → extremes). */
  tideByDate?: Record<string, DayTideInfo>;
  regionCities?: string[];
};

export type TripAstronomyResult = {
  tripHints: string[];
  moonByDate: Record<string, MoonPhaseInfo>;
  bestBioluminescenceDates: string[];
  fullMoonDates: string[];
  tideByDate: Record<string, DayTideInfo>;
};

const SYNODIC_MONTH = 29.530588853;
/** New moon reference: 2000-01-06 18:14 UTC */
const KNOWN_NEW_MOON_JD = 2451550.26;

const COASTAL_CITY_TEST =
  /koh |ko |island|otok|phuket|krabi|lipe|samui|phangan|boracay|palawan|el nido|bali|gili|zanzibar|maldives|seychelles|caribbean|jamaica|barbados|aruba|santorini|capri|cornwall|biarritz|gold coast|byron|phu quoc|mui ne|koh rong|koh chang|railay|ao nang|patong|kata|langkawi|perhentian|tioman|cebu|siargao|moalboal/i;

/** Approximate coords for tide API when hub airport ≠ island. */
const COASTAL_CITY_COORDS: Array<{ test: RegExp; lat: number; lng: number }> = [
  { test: /koh lipe|lipe/i, lat: 6.486, lng: 99.304 },
  { test: /phuket|patong|kata/i, lat: 7.88, lng: 98.392 },
  { test: /krabi|ao nang|railay/i, lat: 8.086, lng: 98.906 },
  { test: /koh samui|samui/i, lat: 9.512, lng: 100.013 },
  { test: /koh phangan|phangan/i, lat: 9.75, lng: 100.033 },
  { test: /koh rong/i, lat: 10.723, lng: 103.254 },
  { test: /el nido|palawan/i, lat: 11.194, lng: 119.404 },
  { test: /boracay/i, lat: 11.967, lng: 121.924 },
  { test: /bali|ubud|seminyak|uluwatu/i, lat: -8.409, lng: 115.189 },
  { test: /gili/i, lat: -8.35, lng: 116.04 },
  { test: /phu quoc/i, lat: 10.289, lng: 103.984 },
  { test: /zanzibar/i, lat: -6.165, lng: 39.199 },
];

export function lookupCoastalCoords(city: string): { lat: number; lng: number } | null {
  const c = city.toLowerCase();
  for (const entry of COASTAL_CITY_COORDS) {
    if (entry.test.test(c)) return { lat: entry.lat, lng: entry.lng };
  }
  return null;
}

function useSl(lang: string): boolean {
  return lang.startsWith("sl");
}

function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function parseIsoDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

function tripDateRange(departDate: string, returnDate?: string): string[] {
  const out: string[] = [];
  const start = parseIsoDate(departDate);
  const end = returnDate ? parseIsoDate(returnDate) : start;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function moonPhaseName(ageDays: number, lang: string): string {
  const slo = useSl(lang);
  const p = ageDays / SYNODIC_MONTH;
  if (p < 0.03 || p > 0.97) return slo ? "mlaj" : "new moon";
  if (p < 0.22) return slo ? "prirastajoča luna" : "waxing crescent";
  if (p < 0.28) return slo ? "prva četrt" : "first quarter";
  if (p < 0.47) return slo ? "prirastajoči polmesec" : "waxing gibbous";
  if (p < 0.53) return slo ? "polna luna" : "full moon";
  if (p < 0.72) return slo ? "upadajoči polmesec" : "waning gibbous";
  if (p < 0.78) return slo ? "zadnja četrt" : "last quarter";
  return slo ? "upadajoča luna" : "waning crescent";
}

/** Global moon phase from calendar date (no API). */
export function moonPhaseForDate(isoDate: string, lang = "sl"): MoonPhaseInfo {
  const jd = julianDay(parseIsoDate(isoDate));
  const ageDays = ((jd - KNOWN_NEW_MOON_JD) % SYNODIC_MONTH + SYNODIC_MONTH) % SYNODIC_MONTH;
  const phase = ageDays / SYNODIC_MONTH;
  const illumination = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
  const isFullMoon = ageDays > SYNODIC_MONTH * 0.47 && ageDays < SYNODIC_MONTH * 0.53;
  const isNewMoon = ageDays < SYNODIC_MONTH * 0.05 || ageDays > SYNODIC_MONTH * 0.95;
  const bioluminescenceFriendly = illumination < 0.35;

  return {
    date: isoDate.slice(0, 10),
    ageDays: Math.round(ageDays * 10) / 10,
    illumination: Math.round(illumination * 100) / 100,
    phase,
    name: moonPhaseName(ageDays, lang),
    isFullMoon,
    isNewMoon,
    bioluminescenceFriendly,
  };
}

export function isLowTideDependentPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return (
    /nizk.*plim|low tide|ob plimi|plimovanju|plimovanje/i.test(t) ||
    (/jama|cave|lok|sea arch|podvodn/i.test(t) &&
      /plim|tide|james bond|modra jama|blue cave/i.test(t))
  );
}

export function isBioluminescencePoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return /biolumin|plankton|fosfor|glow.*water|svetl.*vodi|mosquito bay|sok san/i.test(t);
}

export function isCoastalTripCity(city: string): boolean {
  return COASTAL_CITY_TEST.test(city);
}

function formatLocalTime(isoDateTime: string): string {
  try {
    const d = new Date(isoDateTime);
    return d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    const m = /T(\d{2}:\d{2})/.exec(isoDateTime);
    return m?.[1] ?? isoDateTime;
  }
}

function pickAfternoonLow(extremes: TideExtreme[]): TideExtreme | null {
  const lows = extremes.filter((e) => e.type === "Low");
  for (const low of lows) {
    const h = Number(low.timeLocal.split(":")[0]);
    if (h >= 11 && h <= 17) return low;
  }
  return lows[0] ?? null;
}

function dayTideFromExtremes(date: string, extremes: TideExtreme[]): DayTideInfo {
  return {
    date,
    extremes,
    lowTideAfternoon: pickAfternoonLow(extremes),
  };
}

/** Fetch high/low tide extremes from World Tides API (optional WORLD_TIDES_API_KEY). */
export async function fetchTideCalendar(
  lat: number,
  lng: number,
  departDate: string,
  returnDate?: string,
): Promise<Record<string, DayTideInfo>> {
  const key = process.env.WORLD_TIDES_API_KEY?.trim();
  if (!key) return {};

  const dates = tripDateRange(departDate, returnDate);
  if (dates.length === 0) return {};

  const days = Math.min(dates.length, 14);
  try {
    const url =
      `https://www.worldtides.info/api/v3?extremes` +
      `&lat=${lat}&lon=${lng}` +
      `&date=${departDate}` +
      `&days=${days}` +
      `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return {};

    const data = (await res.json()) as {
      extremes?: Array<{ date: string; type: string; height: number }>;
    };
    const byDate = new Map<string, TideExtreme[]>();

    for (const e of data.extremes ?? []) {
      const type = e.type === "High" ? "High" : "Low";
      const dateTime = e.date;
      const dateKey = dateTime.slice(0, 10);
      const entry: TideExtreme = {
        type,
        dateTime,
        timeLocal: formatLocalTime(dateTime),
        heightM: Math.round(e.height * 100) / 100,
      };
      const list = byDate.get(dateKey) ?? [];
      list.push(entry);
      byDate.set(dateKey, list);
    }

    const out: Record<string, DayTideInfo> = {};
    for (const [date, extremes] of byDate) {
      out[date] = dayTideFromExtremes(date, extremes);
    }
    return out;
  } catch {
    return {};
  }
}

/** Trip-level moon / tide / bioluminescence hints for banner and LLM. */
export function buildTripAstronomy(opts: TripAstronomyOpts): TripAstronomyResult {
  const dates = tripDateRange(opts.departDate, opts.returnDate);
  const lang = opts.lang;
  const slo = useSl(lang);
  const moonByDate: Record<string, MoonPhaseInfo> = {};
  const bestBioluminescenceDates: string[] = [];
  const fullMoonDates: string[] = [];
  const tripHints: string[] = [];

  for (const d of dates) {
    const moon = moonPhaseForDate(d, lang);
    moonByDate[d] = moon;
    if (moon.bioluminescenceFriendly) bestBioluminescenceDates.push(d);
    if (moon.isFullMoon) fullMoonDates.push(d);
  }

  const coastal =
    opts.regionCities?.some(isCoastalTripCity) ||
    (opts.lat != null && opts.lng != null);

  if (bestBioluminescenceDates.length > 0 && coastal) {
    const sample = bestBioluminescenceDates.slice(0, 3).join(", ");
    tripHints.push(
      slo
        ? `Temnejše noči (mlaj) ${sample} — boljši večeri za bioluminiscenco; izogibaj se polni luni.`
        : `Darker nights (new moon) ${sample} — better evenings for bioluminescence; avoid full-moon nights.`,
    );
  }

  if (fullMoonDates.length > 0 && coastal) {
    tripHints.push(
      slo
        ? `Polna luna ${fullMoonDates.join(", ")} — svetlejše noči (slabša bioluminiscenca), odlično za večerne plaže in fotografijo.`
        : `Full moon ${fullMoonDates.join(", ")} — brighter nights (poorer bioluminescence), great for beach evenings and photos.`,
    );
  }

  const tideByDate = opts.tideByDate ?? {};
  const hasTides = Object.keys(tideByDate).length > 0;
  if (hasTides && coastal) {
    tripHints.push(
      slo
        ? "Časi plime vključeni za obalne aktivnosti (jame, lagune) — nizka plima običajno dopoldan ali popoldan."
        : "Tide times included for coastal activities (caves, lagoons) — low tide usually morning or afternoon.",
    );
  } else if (coastal) {
    tripHints.push(
      slo
        ? "Za natančne čase plime preveri lokalno tabelo — jame in lagune so dostopne ob nizki plimi."
        : "Check local tide tables for exact times — caves and lagoons are accessible at low tide.",
    );
  }

  return {
    tripHints: [...new Set(tripHints)].slice(0, 4),
    moonByDate,
    bestBioluminescenceDates,
    fullMoonDates,
    tideByDate,
  };
}

export type SkeletonAstronomy = {
  tideByRegion?: Record<string, Record<string, DayTideInfo>>;
};

/** Prefetch tide calendars for coastal skeleton regions (server-side). */
export async function attachSkeletonAstronomy(
  regions: Array<{ city: string; lat?: number; lng?: number }>,
  departDate: string,
  returnDate?: string,
): Promise<SkeletonAstronomy> {
  const tideByRegion: Record<string, Record<string, DayTideInfo>> = {};

  for (const region of regions) {
    if (!isCoastalTripCity(region.city)) continue;
    if (region.lat == null || region.lng == null) continue;
    if (tideByRegion[region.city]) continue;

    const tides = await fetchTideCalendar(
      region.lat,
      region.lng,
      departDate,
      returnDate,
    );
    if (Object.keys(tides).length > 0) {
      tideByRegion[region.city] = tides;
    }
  }

  return Object.keys(tideByRegion).length > 0 ? { tideByRegion } : {};
}

type ActivityLike = {
  name: string;
  description: string;
  type?: string;
};

type DaySlots<T extends ActivityLike> = {
  morning: T[];
  afternoon: T[];
  evening: T[];
};

/** Repeated moon-hint sentences appended by island-stay / astronomy enrichers. */
const MOON_HINT_SPAM_PATTERNS = [
  / ?Polna luna v teh dneh[^.!?]*[.!?]?/gi,
  / ?Polna luna \([^)]+\) — odlična večerna fotografija[^.!?]*[.!?]?/gi,
  / ?Polna luna — plankton je manj viden[^.!?]*[.!?]?/gi,
  / ?Temnejše noči — primeren čas za nočni čoln[^.!?]*[.!?]?/gi,
  / ?Mešan urnik lun:[^.!?]*[.!?]?/gi,
  / ?Full moon during your stay[^.!?]*[.!?]?/gi,
  / ?Full moon \([^)]+\) — great beach evening photos[^.!?]*[.!?]?/gi,
  / ?Full moon — plankton less visible[^.!?]*[.!?]?/gi,
  / ?Darker moon nights — good window[^.!?]*[.!?]?/gi,
  / ?Mixed moon:[^.!?]*[.!?]?/gi,
];

/** Remove duplicated full-moon / bioluminescence footnotes from activity copy. */
export function stripMoonHintSpam(text: string): string {
  let out = text;
  for (const p of MOON_HINT_SPAM_PATTERNS) {
    out = out.replace(p, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** One trip-level moon note for collapsed island / bay-cruise blocks. */
export function buildIslandStayMoonNote(
  dates: string[],
  lang: string,
): string | null {
  const fullMoonDates = dates.filter((d) => moonPhaseForDate(d, lang).isFullMoon);
  if (fullMoonDates.length === 0) return null;
  const slo = useSl(lang);
  const label = fullMoonDates.slice(0, 3).join(", ");
  return slo
    ? `Polna luna v teh dneh (${label}) — odlična večerna fotografija na plaži/decku; bioluminiscenca na morju bo šibka.`
    : `Full moon during these days (${label}) — great evening photos on deck/beach; sea bioluminescence will be weak.`;
}

/** Annotate low-tide / bioluminescence activities; move low-tide sights to afternoon when possible. */
export function annotateDayAstronomy<T extends ActivityLike>(
  slots: DaySlots<T>,
  isoDate: string,
  lang: string,
  tide?: DayTideInfo | null,
): DaySlots<T> {
  const moon = moonPhaseForDate(isoDate, lang);
  const slo = useSl(lang);
  const annotate = (a: T): T => {
    let desc = a.description ?? "";
    if (isBioluminescencePoi(a.name, desc)) {
      if (moon.bioluminescenceFriendly) {
        const note = slo
          ? ` Temna luna (${moon.name}) — odličen večer za bioluminiscenco.`
          : ` Dark moon (${moon.name}) — excellent night for bioluminescence.`;
        if (!desc.includes(note.trim())) desc += note;
      } else if (moon.isFullMoon) {
        const note = slo
          ? ` Polna luna — plankton je manj viden; izberi drug večer ali temnejšo plažo.`
          : ` Full moon — plankton less visible; pick another evening or a darker beach.`;
        if (!/polna luna|full moon/i.test(desc)) desc += note;
      }
    } else if (
      moon.isFullMoon &&
      /sunset|sončni zahod|walking street|plaž|beach|večer na plaži/i.test(`${a.name} ${desc}`)
    ) {
      const note = slo
        ? ` Polna luna (${moon.name}) — odlična večerna fotografija na plaži; bioluminiscenca na morju bo šibka.`
        : ` Full moon (${moon.name}) — great beach evening photos; sea bioluminescence will be weak.`;
      if (!/polna luna|full moon/i.test(desc)) desc += note;
    }
    if (isLowTideDependentPoi(a.name, desc) && tide?.lowTideAfternoon) {
      const note = slo
        ? ` Nizka plima ~${tide.lowTideAfternoon.timeLocal} — načrtuj obisk v tem oknu.`
        : ` Low tide ~${tide.lowTideAfternoon.timeLocal} — plan visit in this window.`;
      if (!/nizka plima|low tide ~/i.test(desc)) desc += note;
    } else if (isLowTideDependentPoi(a.name, desc)) {
      const note = slo
        ? ` Dostop ob nizki plimi — preveri dnevno tabelo plime.`
        : ` Accessible at low tide — check daily tide table.`;
      if (!/tabelo plime|tide table/i.test(desc)) desc += note;
    }
    return { ...a, description: desc };
  };

  let morning = slots.morning.map(annotate);
  let afternoon = slots.afternoon.map(annotate);
  let evening = slots.evening.map(annotate);

  if (tide?.lowTideAfternoon) {
    const toMove = [...morning, ...evening].filter((a) =>
      isLowTideDependentPoi(a.name, a.description),
    );
    if (toMove.length > 0 && afternoon.length < 2) {
      morning = morning.filter(
        (a) => !isLowTideDependentPoi(a.name, a.description),
      );
      evening = evening.filter(
        (a) => !isLowTideDependentPoi(a.name, a.description),
      );
      afternoon = [...afternoon, ...toMove.map(annotate)];
    }
  }

  return { morning, afternoon, evening };
}
