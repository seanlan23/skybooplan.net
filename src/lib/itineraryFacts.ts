import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { haversineKm } from "@/lib/geoMath";
import { getIslandStayCatalog } from "@/lib/islandStays";
import { planLangCopy } from "@/lib/planLangCopy";
import { prefersTwoNights } from "@/lib/plannerQuality";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { parseDriveHours } from "@/lib/roadTripLogistics";
import { sameDayActivityCoreKey } from "@/lib/textSanitize";

const SLOTS = ["morning", "afternoon", "evening"] as const;
const HEAVY_TRAVEL_HOURS = 6;
/** Day-trip towns next to a hub (Ayutthaya–Bangkok ~75 km). */
const SATELLITE_MAX_KM = 100;
const SATELLITE_MAX_NIGHTS = 1;

function cityKey(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/\([^)]*\)/g, "")
      .split(",")[0]
      ?.trim()
      .replace(/\s+/g, " ") ?? ""
  );
}

function parseLegHours(raw: string | undefined): number | null {
  const direct = parseDriveHours(raw);
  if (direct != null) return direct;
  if (!raw) return null;
  const range = raw.replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*h/i);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  return null;
}

function isLogisticsActivity(a: Activity): boolean {
  const type = (a.type ?? "").toLowerCase();
  if (type === "transport" || type === "hotel" || type === "stay") return true;
  const blob = `${a.name} ${a.description ?? ""}`;
  return /prevoz|transfer|check-?in|letališč|airport|odhod z otoka/i.test(blob);
}

function keepOnTravelDay(a: Activity): boolean {
  if (isLogisticsActivity(a)) return true;
  const type = (a.type ?? "").toLowerCase();
  return type === "eat" || type === "hotel" || type === "stay";
}

export function travelHoursForDay(day: DayPlan): number {
  let hours = 0;
  for (const leg of day.transportation ?? []) {
    hours += parseLegHours(leg.duration) ?? (leg.type === "flight" ? 1.25 : 1.75);
  }
  if (hours > 0) return hours;
  for (const slot of SLOTS) {
    for (const a of day.activities?.[slot] ?? []) {
      if (!isLogisticsActivity(a)) continue;
      hours += parseLegHours(a.transportDuration) ?? 0;
    }
  }
  return hours;
}

function dayHasStackedTransfer(day: DayPlan): boolean {
  const types = new Set((day.transportation ?? []).map((l) => l.type));
  if (types.has("flight") && (types.has("van") || types.has("ferry"))) return true;
  if (types.has("van") && types.has("ferry")) return true;
  const blob = SLOTS.flatMap((s) => day.activities?.[s] ?? [])
    .map((a) => `${a.name} ${a.description ?? ""}`)
    .join(" ");
  const modes =
    Number(/flight|let |flug/i.test(blob)) +
    Number(/van|kombi|minivan/i.test(blob)) +
    Number(/ferry|trajekt|speedboat|čoln/i.test(blob));
  return modes >= 2 && /prevoz|transfer|odhod|departure/i.test(blob);
}

/** Long move day — destination sightseeing in the morning is fiction. */
export function isHeavyTravelDay(day: DayPlan, prev?: DayPlan): boolean {
  if (travelHoursForDay(day) >= HEAVY_TRAVEL_HOURS) return true;
  if (dayHasStackedTransfer(day)) return true;
  if (!prev) return false;
  const from = cityKey(prev.city ?? "");
  const to = cityKey(day.city ?? "");
  if (!from || !to || from === to) return false;
  const morning = (day.activities?.morning ?? []).some(isLogisticsActivity);
  return morning && (day.inFlightDay || (day.transportation?.length ?? 0) > 0);
}

export function slotsLookLikeHeavyTravel(slots: {
  morning: Activity[];
  afternoon: Activity[];
  evening: Activity[];
}): boolean {
  const fake = {
    transportation: [],
    activities: slots,
  } as unknown as DayPlan;
  return isHeavyTravelDay(fake);
}

/** Drop destination sights while the calendar day is still a transfer. */
export function stripDestinationSightsOnTravelDays(plan: AiTripPlan): number {
  let n = 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    if (!isHeavyTravelDay(day, days[i - 1]) || !day.activities) continue;
    for (const slot of ["morning", "afternoon"] as const) {
      const list = day.activities[slot] ?? [];
      const next = list.filter(keepOnTravelDay);
      if (next.length !== list.length) {
        day.activities[slot] = next;
        n += 1;
      }
    }
  }
  return n;
}

const HEAVY_OUTING =
  /celodnevni|full[- ]day|day[- ]trip|izlet|speedboat|island hop|tour [abcd]\b|boat trip|čoln/i;

const OUTING_STOP = new Set([
  "celodnevni",
  "izlet",
  "odhod",
  "hitri",
  "hitrim",
  "coln",
  "colnom",
  "speedboat",
  "ogled",
  "potapljanje",
  "masko",
  "boat",
  "tour",
  "islands",
  "otoke",
  "otok",
  "island",
  "hop",
  "full",
  "day",
  "trip",
  "koh",
  "the",
  "beach",
  "morning",
  "afternoon",
  "excursion",
  "ausflug",
]);

function outingTokens(day: DayPlan): Set<string> {
  const tokens = new Set<string>();
  for (const slot of SLOTS) {
    for (const a of day.activities?.[slot] ?? []) {
      if (isLogisticsActivity(a) || a.type === "EAT" || a.type === "HOTEL" || a.type === "STAY") continue;
      const blob = `${a.name} ${a.description ?? ""}`;
      if (!HEAVY_OUTING.test(blob)) continue;
      const core = sameDayActivityCoreKey(`${a.name} ${a.description ?? ""}`);
      for (const w of core.split(/\s+/)) {
        if (w.length >= 3 && !OUTING_STOP.has(w)) tokens.add(w);
      }
    }
  }
  return tokens;
}

function tokensOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

function pickReplacementOuting(day: DayPlan, used: Set<string>, lang: string): Activity {
  const catalog = getIslandStayCatalog(day.city ?? day.focusName ?? "", lang);
  const hit = catalog.find((a) => {
    if (a.type === "EAT" || a.type === "HOTEL" || a.type === "BEACH") return false;
    const core = sameDayActivityCoreKey(a.name);
    const words = core.split(/\s+/).filter((w) => w.length >= 3 && !OUTING_STOP.has(w));
    return words.length > 0 && !words.some((w) => used.has(w));
  });
  if (hit) return { ...hit };
  return {
    name: planLangCopy(lang, {
      sl: "Drugačen lokalni izlet z iste baze",
      en: "A different local outing from the same base",
      de: "Anderer lokaler Ausflug von derselben Basis",
    }),
    type: "ACTIVITY",
    description: planLangCopy(lang, {
      sl: "Isti celodnevni izlet dva dni zapored ni smiseln. Izberi drug čoln, drug zaliv ali drugo turo.",
      en: "The same full-day outing two days in a row is a waste. Pick a different boat, bay, or tour.",
      de: "Derselbe Tagesausflug zwei Tage hintereinander lohnt nicht. Nimm ein anderes Boot oder eine andere Tour.",
    }),
  };
}

/**
 * Two consecutive days at the same base with the same heavy outing:
 * rewrite the second day (never empty it).
 */
export function dropDuplicateConsecutiveOutings(plan: AiTripPlan, language?: string): number {
  const lang = language ?? plan.contentLanguage ?? "en";
  let n = 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const day = days[i]!;
    if (cityKey(prev.city ?? "") !== cityKey(day.city ?? "")) continue;
    const prevTokens = outingTokens(prev);
    const todayTokens = outingTokens(day);
    if (!prevTokens.size || !todayTokens.size) continue;
    if (!tokensOverlap(prevTokens, todayTokens)) continue;
    const used = new Set([...prevTokens, ...todayTokens]);
    const replacement = pickReplacementOuting(day, used, lang);
    if (day.activities) {
      for (const slot of SLOTS) {
        day.activities[slot] = (day.activities[slot] ?? []).map((a) => {
          if (isLogisticsActivity(a) || a.type === "EAT" || a.type === "HOTEL" || a.type === "STAY") {
            return a;
          }
          const blob = `${a.name} ${a.description ?? ""}`;
          const core = sameDayActivityCoreKey(blob);
          const words = core.split(/\s+/).filter((w) => w.length >= 3 && !OUTING_STOP.has(w));
          const overlapsYesterday = words.some((w) => prevTokens.has(w));
          if (!HEAVY_OUTING.test(blob) && !overlapsYesterday) return a;
          n += 1;
          return { ...a, ...replacement, type: replacement.type || a.type };
        });
      }
    }
    if (HEAVY_OUTING.test(day.title ?? "")) {
      day.title = replacement.name;
    }
  }
  return n;
}

function kmBetweenCities(a: string, b: string): number | null {
  const ca = lookupRegionCoords(a);
  const cb = lookupRegionCoords(b);
  if (!ca || !cb) return null;
  return haversineKm([ca.lng, ca.lat], [cb.lng, cb.lat]);
}

/**
 * A small town next to a hub should not eat 3 nights while the hub is short.
 * Extra nights extend the previous hub stay — the last satellite night stays.
 */
export function capSatelliteHubStays(plan: AiTripPlan): number {
  const total = plan.days?.length ?? 0;
  if (total < 7) return 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  let n = 0;
  let i = 0;
  while (i < days.length) {
    if (days[i]!.inFlightDay) {
      i += 1;
      continue;
    }
    const key = cityKey(days[i]!.city ?? "");
    if (!key) {
      i += 1;
      continue;
    }
    let j = i;
    while (
      j + 1 < days.length &&
      !days[j + 1]!.inFlightDay &&
      cityKey(days[j + 1]!.city ?? "") === key
    ) {
      j += 1;
    }
    const runLen = j - i + 1;
    const prev = i > 0 ? days[i - 1] : undefined;
    const prevKey = cityKey(prev?.city ?? "");
    const satellite = !prefersTwoNights(days[i]!.city ?? "", total);
    const hub = prev && prefersTwoNights(prev.city ?? "", total);
    const km = prev ? kmBetweenCities(prev.city ?? "", days[i]!.city ?? "") : null;
    if (
      satellite &&
      hub &&
      prevKey &&
      prevKey !== key &&
      km != null &&
      km <= SATELLITE_MAX_KM &&
      runLen > SATELLITE_MAX_NIGHTS
    ) {
      const keepFrom = j - SATELLITE_MAX_NIGHTS + 1;
      for (let k = i; k < keepFrom; k++) {
        const day = days[k]!;
        day.city = prev!.city;
        if (prev!.focusName) day.focusName = prev!.focusName;
        if (Number.isFinite(prev!.lat)) day.lat = prev!.lat;
        if (Number.isFinite(prev!.lng)) day.lng = prev!.lng;
        n += 1;
      }
    }
    i = j + 1;
  }
  return n;
}

export function applyItineraryFacts(plan: AiTripPlan, language?: string): void {
  capSatelliteHubStays(plan);
  dropDuplicateConsecutiveOutings(plan, language);
  stripDestinationSightsOnTravelDays(plan);
}
