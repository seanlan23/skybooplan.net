import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { isAiPlaceholderText, isWrongCityPoi } from "@/lib/tripContent";
import {
  dedupeSameDayActivities,
  sameDayActivityCoreKey,
  sanitizeLegacyTemplateLeak,
  stripTruncatedCopyFromPlan,
} from "@/lib/textSanitize";
import { annotateHitAndRunStays, annotateOverlongDriveStages, stealNightForHitAndRun } from "@/lib/plannerQuality";
import {
  annotateBalkanRoadTips,
  forceLastRoadDayHome,
  repairImplausibleDriveTimes,
  splitOverlongDriveStages,
  stripDriveStatsOnAirDays,
  stripHomeboundPaidStays,
  stripSightseeingOnBrutalDriveDays,
} from "@/lib/roadTripLogistics";
import { applyIslandHopLogistics } from "@/lib/islandHopLogistics";
import { enrichIslandAirportTransfers } from "@/lib/islandAirportTransfers";
import { scrubImpossibleIslandDayTrips } from "@/lib/islandHopGuard";
import { isSmallIsland } from "@/lib/islandStays";
import { scrubBangkokSightsOnIslandTransferDays } from "@/lib/bangkokMustSee";
import { alignSummaryTripLength } from "@/lib/planTeaser";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { haversineKm } from "@/lib/geoMath";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import {
  earliestDestLocalMinutes,
  isLongHaulKm,
  parseClockMinutes,
} from "@/lib/flightScheduling";
import { lookupLeg } from "@/lib/curatedRoutes.legs";
import { relabelHubDayTripOvernights } from "@/lib/stayFacts";
import { stripCrossStayLeaks } from "@/lib/stayLeakGuard";
import { stripUnrenderablePlanCopy } from "@/lib/twoStagePlan";

type DaySlots = NonNullable<DayPlan["activities"]>;
type Slot = keyof DaySlots;

const SLOTS: Slot[] = ["morning", "afternoon", "evening"];

/** Enricher-pool generics that must never ship in final plans / PDFs (all plan languages). */
export function isEnricherPlaceholderActivity(a: {
  name?: string;
  description?: string;
}): boolean {
  const name = (a.name ?? "").trim();
  const desc = (a.description ?? "").trim();
  if (!name) return true;
  // Name-only: do not treat a short real description ("Po Emberá…") as scaffolding.
  if (isAiPlaceholderText(name)) return true;
  const blob = `${name} ${desc}`;
  return (
    /glavni dopoldanski ogled/i.test(blob) ||
    /mesto ali znamenitost,?\s*ki jo je najbolje obiskati zjutraj/i.test(blob) ||
    /main morning sight\s*[—-]\s*visit while/i.test(blob) ||
    /hauptbesichtigung am vormittag/i.test(blob) ||
    /ort oder sehenswürdigkeit am besten früh/i.test(blob) ||
    /visite principale du matin/i.test(blob) ||
    /visita principal de la mañana/i.test(blob) ||
    /principale visita del mattino/i.test(blob) ||
    /^jutranji ogled\s*\/\s*sprehod$/i.test(name) ||
    /^morning sight or stroll$/i.test(name) ||
    /^morgendliche besichtigung oder spaziergang$/i.test(name) ||
    /^visite ou promenade matinale$/i.test(name) ||
    /^visita o paseo matutino$/i.test(name) ||
    /^visita o passeggiata mattutina$/i.test(name) ||
    /^pavza v kavarni$/i.test(name) ||
    /jutranji sprehod\s*\/\s*kava pred ogledom/i.test(name) ||
    /jutranji sprehod do prve znamenitosti/i.test(name) ||
    /jutranji sprehod\s*\/\s*lokalni ritm/i.test(name) ||
    /^jutranji sprehod\b/i.test(name) ||
    /lahkoten sprehod v okolici (vaše )?namestitve/i.test(blob) ||
    /spoznavanje s prvim okoljem/i.test(blob) ||
    /light stroll around (your |the )?accommodation/i.test(blob) ||
    /check-in,?\s*osvežitev(\s+in\s+kratek\s+odmor)?/i.test(name) ||
    /osvežitev in kratek odmor/i.test(name) ||
    /če imaš še energijo/i.test(name) ||
    /if you (?:still )?have (?:the )?energy/i.test(name) ||
    /^morning walk & coffee$/i.test(name) ||
    /^morning stroll \/ local pace$/i.test(name) ||
    /^morning stroll in /i.test(name) ||
    /^večernji sprehod in lokalna večerja$/i.test(name) ||
    /^evening stroll & local dinner$/i.test(name) ||
    /^café break$/i.test(name) ||
    /^kaffeepause$/i.test(name) ||
    /^pause café$/i.test(name) ||
    /2[–-]3\s*stavki|what to see|why it matters|practical tip/i.test(blob) ||
    /kaj vidiš.*zakaj je vredno/i.test(blob) ||
    isHollowProgramTitle(name, desc)
  );
}

/** Title-only stubs Gemini ships instead of a real stop. */
export function isHollowProgramTitle(name: string, description?: string): boolean {
  const n = name.trim();
  const d = (description ?? "").trim();
  if (!n) return true;
  if (
    /^(morning|afternoon|evening)\s+in\s+/i.test(n) ||
    /^(dopoldne|dopoldan|popoldne|popoldan|večer)\s+v\s+/i.test(n) ||
    /^(last morning|zadnje jutro)\s+in\s+/i.test(n) ||
    /^(travel to|potovanje (na|v)|morning in)\s+/i.test(n)
  ) {
    return true;
  }
  if (/^(dan|day)\s+\d+$/i.test(n)) return true;
  if (/^.+\s*(?:→|->)\s*\.?\s*$/.test(n)) return true;
  if (d.length >= 40) return false;
  return /^(city exploration|temple visit|boat tour|old town walk|nature excursion|snorkeling trip|shopping and sightseeing|visit\s+\w[\w\s]{1,40})$/i.test(
    n,
  );
}

const MEAL_HEAD_RE =
  /^(zajtrk|kosilo|večerja|breakfast|lunch|dinner|mittagessen|abendessen|frühstück|déjeuner|dîner|cena|colazione|pranzo)\b/i;

const GENERIC_MEAL_PLACE_RE =
  /\b(area|območj\w*|okrožj\w*|četrti|sosesk\w*|središč\w*|cent(er|re)|downtown|viertel|neighbourhood|neighborhood|ulic[ae]|streets?|alley|yokocho|lane|tržnic\w*|markets?|plaz[ae]|district|barrio|quartier)\b/i;

const MEAL_CUISINE_RE =
  /\b(izakaya|sushi|ramen|yakitori|okonomiyaki|monjayaki|oyakodon|tempura|pizza|pasta|tapas|meze|pho|barbecue|seafood|izkušnja|experience|erlebnis)\b/i;

function mealVenueTail(name: string): string {
  const colon = name.match(/^[^:]{1,48}:\s*(.+)$/);
  if (colon?.[1]) return colon[1].trim();
  const prep = name.match(/\b(?:at|bei|chez|da)\s+(.+)$/i);
  if (prep?.[1]) return prep[1].trim();
  return "";
}

/** True when the meal names a bookable venue, not “izakaya in this neighbourhood”. */
function hasConcreteVenueName(name: string): boolean {
  if (/['"«»][^'"«»]{2,}['"»]/.test(name)) return true;
  const tail = mealVenueTail(name);
  if (!tail) return false;
  if (/['"«»][^'"«»]{2,}['"»]/.test(tail)) return true;
  if (GENERIC_MEAL_PLACE_RE.test(tail)) {
    const rest = tail
      .replace(GENERIC_MEAL_PLACE_RE, " ")
      .replace(MEAL_CUISINE_RE, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/\b[A-Z]{2,}\b/.test(rest)) return true;
    return false;
  }
  if (/\b(izkušnja|experience|erlebnis)\b/i.test(tail)) return false;
  if (
    MEAL_CUISINE_RE.test(tail) &&
    /\b(v|in|im|at|na)\s+\w+/i.test(tail) &&
    !/['"«»]/.test(tail)
  ) {
    return false;
  }
  const rest = tail
    .replace(MEAL_CUISINE_RE, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length >= 3;
}

/**
 * Generic meal cards without a venue name — drop worldwide.
 * Keep "Večerja: Ichiran Ramen" / "Dinner at Sukiyabashi Jiro"; strip "Abendessen in Kyoto".
 */
export function isGenericMealActivity(a: {
  name?: string;
  description?: string;
  type?: string;
}): boolean {
  const name = (a.name ?? "").trim();
  if (!name) return false;
  const isMeal = a.type === "EAT" || MEAL_HEAD_RE.test(name);
  if (!isMeal) return false;
  if (isEnricherPlaceholderActivity(a)) return true;
  if (hasConcreteVenueName(name)) return false;
  return true;
}

/** Airport / first-arrival logistics (not sightseeing near an airport). */
export function isAirportArrivalLogistics(a: {
  name?: string;
  description?: string;
  type?: string;
}): boolean {
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  if (
    /pool|emerald|hot spring|waterfall|slap|beach|plaž|temple|tempelj|museum|muzej|casco|viejo|canal|prekop/i.test(
      t,
    )
  ) {
    return false;
  }
  // Departure / return logistics are never "phantom arrivals".
  if (
    /check-?out|rückflug|return flight|flight home|povratek|odhod iz hotela|hotel check-out|airport transfer|flughafentransfer|prevoz na letališč|transfer to (the )?airport|abflug|mednarodni\s*(povratni\s*)?let|international\s*(return\s*)?flight|internationaler\s*(rück)?flug|airport check-in|check-in am flughafen|bodi na letališč|1 uro pred odletom|1 hour before departure/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /prihod na (mednarodno )?letališč|airport arrival|ankunft am flughafen|tocumen|\(pty\)|\(jfk\)|\(syd\)|arrival hall|prevzem prtljage|baggage claim/i.test(
      t,
    ) ||
    (/prevoz do (hotela|centra)|transfer to (the )?hotel|check-in,?\s*(osvežitev|refresh)|namestitev po prihodu/i.test(
      t,
    ) &&
      /letališč|airport|taxi|grab|uber|transfer/i.test(t)) ||
    ((a.type === "TRANSPORT" || a.type === "STAY") &&
      /prihod|arrival|letališč|airport/i.test(t) &&
      !/check-?in/i.test(t))
  );
}

function isEveningMeal(a: Activity): boolean {
  if (a.type === "EAT") return true;
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  return /večerja|dinner|cena\b|dîner|abendessen|kosilo zvečer|evening meal/i.test(t);
}

function activityFingerprint(day: DayPlan): string {
  const acts = day.activities;
  if (!acts) return `${(day.city ?? "").toLowerCase()}|`;
  const names = SLOTS.flatMap((slot) =>
    (acts[slot] ?? [])
      .map((a) => sameDayActivityCoreKey(a.name ?? "") || (a.name ?? "").toLowerCase().trim())
      .filter(Boolean),
  ).sort();
  return `${(day.city ?? "").toLowerCase()}|${names.join("|")}`;
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

function dayNameTokens(day: DayPlan): string[] {
  const acts = day.activities;
  if (!acts) return [];
  return SLOTS.flatMap((slot) =>
    (acts[slot] ?? [])
      .map((a) => sameDayActivityCoreKey(a.name ?? "") || (a.name ?? "").toLowerCase().trim())
      .filter((k) => k.length >= 4),
  );
}

function thinLocalDay(day: DayPlan, lang: string): DayPlan {
  const slo = !lang || lang.startsWith("sl");
  const city = day.city || day.focusName || (slo ? "destinacija" : "destination");
  return {
    ...day,
    title: slo ? `${city} — prosti / lokalni dan` : `${city} — free / local day`,
    travelHack: slo
      ? "Dan je bil podvojen v osnutku — zamenjan z lahkotnim lokalnim programom."
      : "Day was duplicated in the draft — replaced with a light local schedule.",
    morning: "",
    afternoon: "",
    evening: "",
    mapPins: [],
    activities: {
      morning: [],
      afternoon: [
        {
          name: slo ? `Lokalni pomembnejši ogled v ${city}` : `Key local sight in ${city}`,
          type: "SIGHT",
          description: slo
            ? `En konkreten ogled (muzej, trg ali park) — drugačen od prejšnjega dne.`
            : `One concrete sight (museum, square, or park) — different from the previous day.`,
          bullets: slo
            ? [`Izberi eno znamenitost, ki je še nisi videl.`, `Vrni se pred večerjo.`]
            : [`Pick one sight you have not done yet.`, `Be back before dinner.`],
        },
      ],
      evening: [
        {
          name: slo ? `Večerja v ${city}` : `Dinner in ${city}`,
          type: "EAT",
          description: slo
            ? `Ena sproščena lokalna večerja — brez drugega večernega bloka.`
            : `One relaxed local dinner — no second evening meal block.`,
          bullets: slo
            ? [`Rezerviraj mizo, če je sezona.`]
            : [`Book a table in high season.`],
        },
      ],
    },
  };
}

function stayCityKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

function sameStayCity(a: string, b: string): boolean {
  const left = stayCityKey(a);
  const right = stayCityKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const ca = lookupRegionCoords(a);
  const cb = lookupRegionCoords(b);
  if (ca && cb) {
    return haversineKm([ca.lng, ca.lat], [cb.lng, cb.lat]) < 20;
  }
  return false;
}

function cityHopCoords(name: string): { lat: number; lng: number } | null {
  const region = lookupRegionCoords(name);
  if (region) return region;
  const token = stayCityKey(name);
  if (!token) return null;
  for (const hub of Object.values(DESTINATION_BY_IATA)) {
    const n = stayCityKey(hub.name);
    if (n === token) return { lat: hub.lat, lng: hub.lng };
    if (n.length >= 4 && (n.includes(token) || token.includes(n))) {
      return { lat: hub.lat, lng: hub.lng };
    }
  }
  return null;
}

/** Above this, A→B is air — not a van/taxi “prevoz”. */
const MAX_GROUND_CITY_CHANGE_KM = 750;

function cityChangeIsAir(from: string, to: string, km: number | null): boolean {
  const leg = lookupLeg(from, to);
  if (leg && /flight/.test(leg.type)) return true;
  return km != null && km > MAX_GROUND_CITY_CHANGE_KM;
}

function isMoveActivity(a: Activity): boolean {
  if (a.type === "TRANSPORT" || a.transportType) return true;
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  if (
    /→|->/.test(t) &&
    /\b(vlak|train|let|flight|ferry|trajekt|avtobus|bus|kombi|van|prevoz|transfer|shinkansen)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // "Prevoz iz Tuluma do Chiquilá" — Gemini often omits the arrow.
  return (
    /\b(prevoz|transfer|trajekt|ferry|avtobus|bus|kombi|van|vlak|train|let|flight)\b/i.test(t) &&
    /\b(iz|from)\b.+\b(do|to|v)\b/i.test(t)
  );
}

function blobNamesCityHop(blob: string, from: string, to: string): boolean {
  const fromKey = stayCityKey(from);
  const toKey = stayCityKey(to);
  if (fromKey.length < 4 || toKey.length < 4) return false;
  const parts = blob.split(/\s*(?:→|->|—|–)\s*/);
  if (parts.length >= 2) {
    return stayCityKey(parts[0]!).includes(fromKey) && stayCityKey(parts.slice(1).join(" ")).includes(toKey);
  }
  const key = stayCityKey(blob);
  const iFrom = key.indexOf(fromKey);
  const iTo = key.indexOf(toKey);
  return iFrom >= 0 && iTo >= 0 && iFrom < iTo;
}

function isNamedCityHop(
  a: { name?: string; description?: string; type?: string; transportType?: string },
  from: string,
  to: string,
): boolean {
  if (!isMoveActivity(a as Activity) && a.transportType !== "flight") return false;
  return blobNamesCityHop(`${a.name ?? ""} ${a.description ?? ""}`, from, to);
}

function dayHasNamedCityHop(day: DayPlan, from: string, to: string): boolean {
  if (
    day.transportation?.some((leg) => blobNamesCityHop(`${leg.from} → ${leg.to}`, from, to))
  ) {
    return true;
  }
  for (const slot of SLOTS) {
    for (const a of day.activities?.[slot] ?? []) {
      if (isNamedCityHop(a, from, to)) return true;
    }
  }
  return blobNamesCityHop(day.title ?? "", from, to);
}

function stripNamedCityHop(day: DayPlan, from: string, to: string): number {
  if (!day.activities) return 0;
  let removed = 0;
  for (const slot of SLOTS) {
    const list = day.activities[slot] ?? [];
    const next = list.filter((a) => {
      if (!isNamedCityHop(a, from, to)) return true;
      removed += 1;
      return false;
    });
    day.activities[slot] = next;
  }
  if (removed) resyncDaySlotProse(day);
  return removed;
}

function dayHasIntercityMove(day: DayPlan, from: string, to: string): boolean {
  if (day.transportation?.some((leg) => !sameStayCity(leg.from, leg.to))) return true;
  for (const slot of SLOTS) {
    for (const a of day.activities?.[slot] ?? []) {
      if (isMoveActivity(a) || isNonPoiActivity(a)) {
        if (blobNamesCityHop(`${a.name} ${a.description ?? ""}`, from, to)) return true;
        if (isMoveActivity(a)) return true;
      }
    }
  }
  const blob = `${day.title ?? ""} ${day.morning ?? ""} ${day.afternoon ?? ""}`;
  return (
    /→|->/.test(blob) &&
    /\b(vlak|train|let|flight|ferry|trajekt|prevoz|transfer)\b/i.test(blob)
  );
}

function resyncDaySlotProse(day: DayPlan): void {
  if (!day.activities) return;
  const join = (list: Activity[]) =>
    list
      .map((a) => (a.description ? `${a.name}: ${a.description}` : a.name))
      .filter(Boolean)
      .join("\n\n");
  day.morning = join(day.activities.morning ?? []);
  day.afternoon = join(day.activities.afternoon ?? []);
  day.evening = join(day.activities.evening ?? []);
}

/**
 * Overnight city change without a train/flight/ferry is a teleport.
 * Restore A→B as TRANSPORT — do not invent a clock or ticket price.
 */
export function ensureCityChangeTransfer(plan: AiTripPlan): number {
  const days = plan.days ?? [];
  const slo = !plan.contentLanguage || plan.contentLanguage.startsWith("sl");
  let added = 0;
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const cur = days[i]!;
    if (cur.inFlightDay) continue;
    const from = (prev.city || prev.focusName || "").trim();
    const to = (cur.city || cur.focusName || "").trim();
    if (!from || !to || sameStayCity(from, to)) continue;
    const fromC = cityHopCoords(from);
    const toC = cityHopCoords(to);
    const km =
      fromC && toC ? haversineKm([fromC.lng, fromC.lat], [toC.lng, toC.lat]) : null;
    const byAir = cityChangeIsAir(from, to, km);
    const airLeg = byAir ? lookupLeg(from, to) : null;
    const airName = slo ? `Notranji let ${from} → ${to}` : `Domestic flight ${from} → ${to}`;
    const airDesc = airLeg?.howTo
      ? airLeg.howTo
      : slo
        ? `Notranji let ${from} → ${to}.`
        : `Domestic flight ${from} → ${to}.`;

    // Flight already happened on the previous calendar day (city label lags a night).
    if (dayHasNamedCityHop(prev, from, to)) {
      stripNamedCityHop(cur, from, to);
      continue;
    }

    if (dayHasIntercityMove(cur, from, to)) {
      if (!byAir || !cur.activities) continue;
      const lastBlob = [
        cur.title ?? "",
        ...SLOTS.flatMap((s) =>
          (cur.activities?.[s] ?? []).map((a) => `${a.name} ${a.description ?? ""}`),
        ),
      ].join(" ");
      if (
        i === days.length - 1 &&
        /mednarodni (povratni )?let|international return flight|internationaler rückflug/i.test(
          lastBlob,
        )
      ) {
        continue;
      }
      let upgraded = 0;
      for (const slot of SLOTS) {
        cur.activities[slot] = (cur.activities[slot] ?? []).map((a) => {
          if (!isMoveActivity(a) && a.type !== "TRANSPORT") return a;
          if (a.transportType === "flight") return a;
          const blob = `${a.name ?? ""} ${a.description ?? ""}`;
          if (/trajekt|ferry|chiquilá|pak bara|letališč|airport|check-out|hotela/i.test(blob)) {
            return a;
          }
          const key = stayCityKey(blob);
          const fromKey = stayCityKey(from);
          const toKey = stayCityKey(to);
          if (fromKey.length < 4 || toKey.length < 4) return a;
          if (!key.includes(fromKey) || !key.includes(toKey)) return a;
          if (!/prevoz|transfer/i.test(blob)) return a;
          upgraded += 1;
          return {
            ...a,
            name: airName,
            type: "TRANSPORT" as const,
            transportType: "flight" as const,
            description: airDesc,
          };
        });
      }
      if (upgraded) {
        resyncDaySlotProse(cur);
        added += upgraded;
      }
      continue;
    }
    if (!cur.activities) {
      cur.activities = { morning: [], afternoon: [], evening: [] };
    }
    cur.activities.morning = [
      {
        name: byAir ? airName : `${from} → ${to}`,
        type: "TRANSPORT",
        ...(byAir ? { transportType: "flight" as const } : {}),
        description: byAir
          ? airDesc
          : slo
            ? `Prevoz ${from} → ${to}.`
            : `Transfer ${from} → ${to}.`,
      },
      ...(cur.activities.morning ?? []),
    ];
    resyncDaySlotProse(cur);
    added += 1;
  }
  return added;
}

function hopArrivesAt(blob: string, destCity: string): boolean {
  const dest = stayCityKey(destCity);
  if (dest.length < 4) return false;
  const arrow = blob.match(/(.+?)\s*(?:→|->)\s*(.+)/);
  if (arrow) return stayCityKey(arrow[2] ?? "").includes(dest);
  const izV = blob.match(
    /(?:let|flight|trajekt|ferry|vlak|train)[^.]{0,40}?\b(?:iz|from)\s+(.+?)\s+(?:v|do|to)\s+(.+)/i,
  );
  if (izV) return stayCityKey(izV[2] ?? "").includes(dest);
  return /let|flight|trajekt|ferry|vlak|train/i.test(blob) && stayCityKey(blob).includes(dest);
}

function dayHasInboundTo(day: DayPlan, destCity: string): boolean {
  if (
    day.transportation?.some(
      (leg) => sameStayCity(leg.to, destCity) && !sameStayCity(leg.from, destCity),
    )
  ) {
    return true;
  }
  for (const slot of SLOTS) {
    for (const a of day.activities?.[slot] ?? []) {
      if (a.type !== "TRANSPORT" && !a.transportType) continue;
      if (hopArrivesAt(`${a.name ?? ""} ${a.description ?? ""}`, destCity)) return true;
    }
  }
  return hopArrivesAt(day.title ?? "", destCity);
}

/** Same-city day must not replay yesterday's inbound hop. Outbound on the last night stays. */
export function stripReplayedIntercityHops(plan: AiTripPlan): number {
  const days = plan.days ?? [];
  let removed = 0;
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const curr = days[i]!;
    const dest = (curr.city || curr.focusName || "").trim();
    if (!dest || !sameStayCity(prev.city || prev.focusName || "", dest)) continue;
    if (!dayHasInboundTo(prev, dest)) continue;

    let dayRemoved = 0;
    if (curr.transportation?.length) {
      const next = curr.transportation.filter((leg) => {
        const inbound = sameStayCity(leg.to, dest) && !sameStayCity(leg.from, dest);
        if (inbound) {
          dayRemoved += 1;
          return false;
        }
        return true;
      });
      if (next.length !== curr.transportation.length) {
        curr.transportation = next.length ? next : undefined;
      }
    }

    if (curr.activities) {
      for (const slot of SLOTS) {
        const list = curr.activities[slot] ?? [];
        curr.activities[slot] = list.filter((a) => {
          const blob = `${a.name ?? ""} ${a.description ?? ""}`;
          const hop =
            a.type === "TRANSPORT" ||
            !!a.transportType ||
            /let|flight|trajekt|ferry/i.test(blob);
          if (!hop || !hopArrivesAt(blob, dest)) return true;
          dayRemoved += 1;
          return false;
        });
      }
    }
    if (dayRemoved) resyncDaySlotProse(curr);
    removed += dayRemoved;
  }
  return removed;
}

function activityClockMin(a: Activity): number | null {
  return (
    parseClockMinutes(a.arrivalTime) ??
    parseClockMinutes(a.departureTime) ??
    parseClockMinutes(`${a.name ?? ""} ${a.description ?? ""}`)
  );
}

function isOriginAirportLeg(a: Activity, originIata?: string): boolean {
  const blob = `${a.name ?? ""} ${a.description ?? ""}`;
  if (originIata && new RegExp(`\\b${originIata}\\b`, "i").test(blob)) return true;
  return /mednarodni let|international (return )?flight|odhod iz|departure from/i.test(blob);
}

/** Europe→Asia same-day 08:55 hotel is a lie — strip dest programme before physics allows landing. */
export function stripImplausibleLongHaulProgram(plan: AiTripPlan): number {
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  if (!days.length) return 0;
  const originHub = plan.originIata
    ? DESTINATION_BY_IATA[plan.originIata.toUpperCase()]
    : undefined;
  const arrival = days.find((d) => !d.inFlightDay) ?? days[0]!;
  const from = originHub
    ? { lat: originHub.lat, lng: originHub.lng }
    : days[0]!.inFlightDay
      ? { lat: days[0]!.lat, lng: days[0]!.lng }
      : null;
  const to = { lat: arrival.lat, lng: arrival.lng };
  if (!from || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) return 0;
  const km = haversineKm([from.lng, from.lat], [to.lng, to.lat]);
  if (!isLongHaulKm(km)) return 0;

  let departMin: number | null = null;
  for (const day of [days[0]!, arrival]) {
    for (const slot of SLOTS) {
      for (const a of day.activities?.[slot] ?? []) {
        if (!isOriginAirportLeg(a, plan.originIata)) continue;
        const t = activityClockMin(a);
        if (t != null) {
          departMin = t;
          break;
        }
      }
      if (departMin != null) break;
    }
    if (departMin != null) break;
  }

  const earliest =
    departMin != null
      ? earliestDestLocalMinutes(departMin, from, to)
      : arrival.day === 1
        ? 16 * 60
        : null;
  if (earliest == null) return 0;

  let removed = 0;
  if (!arrival.activities) return 0;
  for (const slot of SLOTS) {
    const slotFloor = slot === "morning" ? 0 : slot === "afternoon" ? 12 * 60 : 17 * 60;
    arrival.activities[slot] = (arrival.activities[slot] ?? []).filter((a) => {
      if (isOriginAirportLeg(a, plan.originIata)) return true;
      const clock = activityClockMin(a);
      const tooEarly = clock != null ? clock < earliest - 90 : slotFloor < earliest - 90;
      if (!tooEarly) return true;
      removed += 1;
      return false;
    });
  }
  if (removed) resyncDaySlotProse(arrival);
  return removed;
}

/** Drop Paris sights on Lyon days (and other city-locked landmarks). */
export function stripWrongCityDayActivities(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    const city = day.city || day.focusName || "";
    if (day.activities) {
      for (const slot of SLOTS) {
        const list = day.activities[slot] ?? [];
        const next = list.filter((a) => {
          if (isMoveActivity(a)) return true;
          const drop = isWrongCityPoi(a.name ?? "", a.description ?? "", city);
          if (drop) removed += 1;
          return !drop;
        });
        day.activities[slot] = next;
      }
    }
    if (day.mapPins?.length) {
      const nextPins = day.mapPins.filter((p) => {
        const drop = isWrongCityPoi(p.name ?? "", p.description ?? "", city);
        if (drop) removed += 1;
        return !drop;
      });
      day.mapPins = nextPins;
    }
    if (day.title && isWrongCityPoi(day.title, "", city)) {
      day.title = city || day.title;
      removed += 1;
    }
    if (day.focusName && city && isWrongCityPoi(day.focusName, "", city)) {
      day.focusName = city;
      removed += 1;
    }
    for (const prose of ["morning", "afternoon", "evening"] as const) {
      const text = day[prose];
      if (text && isWrongCityPoi(text, "", city)) {
        day[prose] = "";
        removed += 1;
      }
    }
  }
  return removed;
}

/** Strip leftover template sentences from day prose + activity copy. */
export function scrubForbiddenTemplateCopy(plan: AiTripPlan): number {
  let fixed = 0;
  const clean = (raw: string | undefined, assign: (v: string) => void) => {
    if (typeof raw !== "string" || !raw) return;
    const next = sanitizeLegacyTemplateLeak(raw);
    if (next !== raw) {
      assign(next);
      fixed += 1;
    }
  };
  for (const day of plan.days ?? []) {
    clean(day.morning, (v) => {
      day.morning = v;
    });
    clean(day.afternoon, (v) => {
      day.afternoon = v;
    });
    clean(day.evening, (v) => {
      day.evening = v;
    });
    clean(day.travelHack, (v) => {
      day.travelHack = v;
    });
    clean(day.transportationTips, (v) => {
      day.transportationTips = v;
    });
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      for (const a of day.activities[slot] ?? []) {
        clean(a.name, (v) => {
          a.name = v;
        });
        clean(a.description, (v) => {
          a.description = v;
        });
        if (a.bullets) {
          a.bullets = a.bullets.map((b) => sanitizeLegacyTemplateLeak(b));
        }
      }
    }
  }
  return fixed;
}

/** Drop enricher / prompt placeholder activities from every day. */
export function stripPlaceholderActivities(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    if (day.mapPins?.length) {
      const nextPins = day.mapPins.filter((p) => {
        const drop = isEnricherPlaceholderActivity(p);
        if (drop) removed += 1;
        return !drop;
      });
      day.mapPins = nextPins;
    }
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      const list = day.activities[slot] ?? [];
      const next = list.filter((a) => {
        const drop = isEnricherPlaceholderActivity(a);
        if (drop) removed += 1;
        return !drop;
      });
      day.activities[slot] = next;
    }
  }
  return removed;
}

type NamedEvening = { name: string; description: string };

const NAMED_EVENINGS: Array<{
  city: RegExp;
  sl: NamedEvening;
  en: NamedEvening;
  de: NamedEvening;
}> = [
  {
    city: /paris|pariz/i,
    sl: {
      name: "Večerja: Le Comptoir du Relais",
      description:
        "Majhen bistro v 6. okrožju (Odéon). Rezervacija priporočena; sicer pridi pred 19:00. Po večerji kratek sprehod do Seine.",
    },
    en: {
      name: "Dinner: Le Comptoir du Relais",
      description:
        "Small bistro in the 6th (Odéon). Book ahead, or arrive before 19:00. Walk to the Seine after.",
    },
    de: {
      name: "Abendessen: Le Comptoir du Relais",
      description:
        "Kleines Bistro im 6. Arrondissement (Odéon). Reservieren oder vor 19:00 da sein. Danach kurz zur Seine.",
    },
  },
  {
    city: /lyon/i,
    sl: {
      name: "Večerja: Café Comptoir Abel",
      description:
        "Klasičen bouchon pri Ainay. Quenelle in salade lyonnaise; zvečer je polno, rezerviraj.",
    },
    en: {
      name: "Dinner: Café Comptoir Abel",
      description:
        "Classic bouchon near Ainay. Quenelle and salade lyonnaise — book, evenings fill up.",
    },
    de: {
      name: "Abendessen: Café Comptoir Abel",
      description:
        "Klassischer Bouchon bei Ainay. Quenelle und Salade lyonnaise — reservieren, abends voll.",
    },
  },
  {
    city: /rome|rim|roma/i,
    sl: {
      name: "Večerja: Da Enzo al 29",
      description:
        "Trastevere, via dei Vascellari. Kratka karta, rezervacija nujna. Po večerji sprehod ob Tiberi.",
    },
    en: {
      name: "Dinner: Da Enzo al 29",
      description:
        "Trastevere, via dei Vascellari. Short menu, book ahead. Walk the Tiber after.",
    },
    de: {
      name: "Abendessen: Da Enzo al 29",
      description:
        "Trastevere, Via dei Vascellari. Kurze Karte, reservieren. Danach am Tiber entlang.",
    },
  },
  {
    city: /barcelona|barcelon/i,
    sl: {
      name: "Večerja: Cal Pep",
      description:
        "Barceloneta / Born — tapas pri pultu. Pridi zgodaj ali stoj v vrsti; ni rezervacij za pult.",
    },
    en: {
      name: "Dinner: Cal Pep",
      description:
        "Barceloneta / Born — tapas at the counter. Come early or queue; no bar reservations.",
    },
    de: {
      name: "Abendessen: Cal Pep",
      description:
        "Barceloneta / Born — Tapas an der Theke. Früh kommen oder anstehen; keine Theken-Reservierung.",
    },
  },
];

function eveningLang(plan: AiTripPlan): "sl" | "en" | "de" {
  const code = (plan.contentLanguage ?? "en").slice(0, 2).toLowerCase();
  if (code === "sl" || code === "de") return code;
  return "en";
}

function isHomeboundDay(day: DayPlan): boolean {
  const blob = [
    day.title,
    day.category,
    ...SLOTS.flatMap((s) => (day.activities?.[s] ?? []).map((a) => a.name ?? "")),
  ].join(" ");
  return /odhod iz|return flight|mednarodni povratni|hotel check-out|prevoz na letališč|international return/i.test(
    blob,
  );
}

function namedEveningForCity(city: string, lang: "sl" | "en" | "de"): NamedEvening | null {
  const hit = NAMED_EVENINGS.find((row) => row.city.test(city));
  return hit ? hit[lang] : null;
}

/**
 * After generic evening meals are stripped, put back one real venue when we know the city.
 * Unknown cities stay empty — better than “cocktails in an elegant bar”.
 */
export function fillNamedEveningIfEmpty(
  plan: AiTripPlan,
  onlyDays?: Set<DayPlan>,
): number {
  let filled = 0;
  const lang = eveningLang(plan);
  for (const day of plan.days ?? []) {
    if (onlyDays && !onlyDays.has(day)) continue;
    if (!day.activities || isHomeboundDay(day)) continue;
    const evening = day.activities.evening ?? [];
    if (evening.some((a) => a.type === "EAT" || /večerja|dinner|abendessen|dîner|cena/i.test(a.name ?? ""))) {
      continue;
    }
    const venue = namedEveningForCity(day.city || day.focusName || "", lang);
    if (!venue) continue;
    day.activities.evening = [
      ...evening,
      { name: venue.name, type: "EAT", description: venue.description },
    ];
    filled += 1;
  }
  return filled;
}

/** Drop venue-less meal fillers worldwide (all languages). Do not invent a replacement restaurant. */
export function stripGenericMealActivities(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    if (!day.activities) continue;
    const total = SLOTS.reduce((n, s) => n + (day.activities?.[s]?.length ?? 0), 0);
    let dropping = 0;
    for (const slot of SLOTS) {
      dropping += (day.activities[slot] ?? []).filter((a) => isGenericMealActivity(a)).length;
    }
    if (dropping === 0) continue;
    if (dropping >= total) continue;
    for (const slot of SLOTS) {
      const list = day.activities[slot] ?? [];
      day.activities[slot] = list.filter((a) => {
        if (!isGenericMealActivity(a)) return true;
        removed += 1;
        return false;
      });
    }
  }
  return removed;
}

/** Fix common truncated logistics fragments left by the model. */
export function repairIncompleteLogisticsCopy(plan: AiTripPlan): number {
  let fixed = 0;
  const scrub = (raw: string | undefined): string | undefined => {
    if (typeof raw !== "string" || !raw) return raw;
    let t = raw;
    const before = t;
    t = t
      // "(ca. – €15–35)" and bare "ca. – 15-20 Min" (FRA→EZE)
      .replace(/\(\s*ca\.?\s*[–—-]\s*€/gi, "(ca. €")
      .replace(/\bca\.?\s*[–—-]\s*(?=€|\d)/gi, "ca. ")
      .replace(/Terminal-?\s*vs\.?\s*$/gi, "Terminal- vs. Off-site-Parkplatz.")
      .replace(/\btrain\s*\/\s*taxi\b/gi, "Zug / Taxi")
      .replace(/\bmit train\b/gi, "mit Zug")
      // Spam filler appended after real dinner copy
      .replace(
        /\s*Abendessen im Viertel:\s*Abendessen abseits der Haupttouristenstraßen[^.]*\.?/gi,
        "",
      )
      .replace(
        /\s*Dinner in the (?:neighbourhood|neighborhood):\s*Dinner away from the main tourist streets[^.]*\.?/gi,
        "",
      );
    // Drop dangling ellipsis leftovers that repairTruncatedCopy missed mid-phrase.
    t = t.replace(/\s*[–—-]\s*höchstens…\s*$/iu, ".")
      .replace(/\s*[–—-]\s*optional light evening…\s*$/i, ".")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (t !== before) fixed += 1;
    return t;
  };
  for (const day of plan.days ?? []) {
    day.transportationTips = scrub(day.transportationTips) ?? day.transportationTips;
    day.travelHack = scrub(day.travelHack) ?? day.travelHack;
    day.localWarnings = scrub(day.localWarnings) ?? day.localWarnings;
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      for (const a of day.activities[slot] ?? []) {
        a.name = scrub(a.name) ?? a.name;
        a.description = scrub(a.description) ?? a.description;
        if (a.bullets?.length) {
          a.bullets = a.bullets.map((b) => scrub(b) ?? b);
        }
      }
    }
  }
  return fixed;
}

/**
 * Drop nonsense "FLIGHT" legs that are walks/sights (FRA→EZE: FLIGHT · Spaziergang durch Recoleta).
 */
export function sanitizeTransportationLegs(plan: AiTripPlan): number {
  let removed = 0;
  const nonAirPlace =
    /spaziergang|stroll|walk|paseo|passeggiata|promenade|friedhof|cemetery|museum|park\b|plaza|caminito|recoleta|malba|viertel|neighbourhood|neighborhood|straße|street|mercado|market|garten|garden|temple|tempel|kirche|church|cathedral/i;
  const groundAirportTransfer =
    /ankunft|arrival|prihod|transfer|prevoz|taxi|uber|shuttle|von\s+flughafen|from\s+(the\s+)?airport|zum\s+hotel|to\s+(the\s+)?hotel/i;
  for (const day of plan.days ?? []) {
    if (!day.transportation?.length) continue;
    const next: NonNullable<DayPlan["transportation"]> = [];
    for (const leg of day.transportation) {
      if (leg.type !== "flight") {
        next.push(leg);
        continue;
      }
      const place = `${leg.from ?? ""} ${leg.to ?? ""}`;
      if (nonAirPlace.test(place)) {
        removed += 1;
        continue;
      }
      // "FLIGHT · Ankunft am Flughafen EZE → City" is ground transfer, not a flight leg.
      if (groundAirportTransfer.test(place) && !/\b(rückflug|return flight|povratni|abflug nach|flight to)\b/i.test(place)) {
        next.push({ ...leg, type: "taxi" });
        removed += 1; // count as sanitized
        continue;
      }
      if (
        leg.from &&
        leg.to &&
        leg.from.trim().toLowerCase() === leg.to.trim().toLowerCase() &&
        leg.estimatedPrice === 0
      ) {
        removed += 1;
        continue;
      }
      next.push(leg);
    }
    day.transportation = next.length ? next : undefined;
  }
  return removed;
}

/** Keep at most one international return-flight row on the last calendar day. */
export function dedupeLastDayReturnFlights(plan: AiTripPlan): number {
  const days = plan.days ?? [];
  if (days.length < 1) return 0;
  const last = days[days.length - 1]!;
  if (!last.activities) return 0;
  const isReturnFlight = (a: Activity): boolean =>
    /internationaler\s*(rück)?flug|international\s*(return\s*)?flight|mednarodni\s*(povratni\s*)?let|volo\s*(di\s*ritorno|internazionale)|vuelo\s*(de\s*regreso|internacional)|vol\s*(retour|international)|rückflug|flight home|povratek\s*domov/i.test(
      a.name ?? "",
    );

  const slots: Slot[] = ["evening", "afternoon", "morning"];
  let keepSlot: Slot | null = null;
  let keepIdx = -1;
  for (const slot of slots) {
    const list = last.activities[slot] ?? [];
    const idx = list.findIndex(isReturnFlight);
    if (idx >= 0) {
      keepSlot = slot;
      keepIdx = idx;
      break;
    }
  }
  if (!keepSlot) return 0;

  let removed = 0;
  for (const slot of SLOTS) {
    const list = last.activities[slot] ?? [];
    last.activities[slot] = list.filter((a, i) => {
      if (!isReturnFlight(a)) return true;
      if (slot === keepSlot && i === keepIdx) return true;
      removed += 1;
      return false;
    });
  }
  return removed;
}

/**
 * Keep at most one evening meal per day.
 * Prefer a named venue over generic “Lokalna večerja” / “Sproščena večerja…”.
 */
export function dedupeSameDayMeals(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    if (!day.activities?.evening?.length) continue;
    const evening = day.activities.evening;
    const mealIdx: number[] = [];
    evening.forEach((a, i) => {
      if (isEveningMeal(a)) mealIdx.push(i);
    });
    if (mealIdx.length <= 1) continue;

    const score = (a: Activity): number => {
      const n = a.name ?? "";
      if (/^lokalna večerja|^local dinner|^cena locale|^dîner local|^lokales abendessen/i.test(n)) {
        return 0;
      }
      if (/sproščena večerja|relaxed dinner|after returning|po vrnitvi/i.test(n)) return 1;
      return 3 + Math.min(n.length, 40) / 40;
    };

    let keep = mealIdx[0]!;
    for (const i of mealIdx) {
      if (score(evening[i]!) > score(evening[keep]!)) keep = i;
    }
    day.activities.evening = evening.filter((a, i) => {
      if (!mealIdx.includes(i)) return true;
      if (i === keep) return true;
      removed += 1;
      return false;
    });
  }
  return removed;
}

/** Strip airport-arrival logistics from every day except the real arrival day. */
export function stripPhantomArrivals(plan: AiTripPlan, arrivalDay = 1): number {
  let removed = 0;
  const days = plan.days ?? [];
  const lastDayNum = days.length ? Math.max(...days.map((d) => d.day)) : 0;
  for (const day of days) {
    if (!day.activities) continue;
    if (day.day === arrivalDay) continue;
    // Last calendar day owns departure logistics (check-in / transfer / return flight).
    if (day.day === lastDayNum) continue;
    for (const slot of SLOTS) {
      const list = day.activities[slot] ?? [];
      const next = list.filter((a) => {
        const drop = isAirportArrivalLogistics(a);
        if (drop) removed += 1;
        return !drop;
      });
      day.activities[slot] = next;
    }
  }
  return removed;
}

const POI_TYPE_FLUFF_RE =
  /\b(vecerni|dopoldanski|popoldanski|tempelj|temple|shrine|svetisce|jingu|market|trznica|trznice|park|vrt|garden|muzej|museum|gozd|gaj|bambusov|okrozju|okrozje|cetrt|raziskovanje|odkrivanje|sprehod|obisk|ogled|potepanje|paviljon|zlati|tradicionaln\w*|lokaln\w*|sprostitev|sproscanje|relax\w*|beach|playa|plaza|rusevin\w*|ruins?)\b/g;

function poiDedupeKey(name: string): string {
  return sameDayActivityCoreKey(name)
    .replace(POI_TYPE_FLUFF_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function poiKeyTokens(key: string): string[] {
  return key.split(/\s+/).filter((t) => t.length >= 4);
}

function poiCommonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

function poiTokensAlign(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  // Inflected same word: kajakiranje / kajakom, mangroves / mangrovah.
  return poiCommonPrefixLen(a, b) >= 5;
}

function poiKeysMatch(a: string, b: string, cityKey: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const numbered = (k: string) => {
    const m = k.match(/\b([a-z]{4,})\s*(\d{1,4})\b/);
    return m ? `${m[1]}${m[2]}` : "";
  };
  const na = numbered(a);
  const nb = numbered(b);
  if (na && na === nb) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.includes(" ") && shorter.length >= 8 && longer.includes(shorter)) {
    return true;
  }
  const cityTok = new Set(poiKeyTokens(cityKey));
  const shared: string[] = [];
  for (const x of poiKeyTokens(a)) {
    for (const y of poiKeyTokens(b)) {
      if (!poiTokensAlign(x, y)) continue;
      if (cityTok.has(x) || cityTok.has(y)) continue;
      shared.push(x.length >= y.length ? x : y);
    }
  }
  const distinctive = [...new Set(shared)];
  if (!(distinctive.some((t) => t.length >= 5) || distinctive.length >= 2)) {
    return false;
  }
  const inShare = (t: string) => distinctive.some((s) => poiTokensAlign(t, s));
  const extraA = poiKeyTokens(a).filter(
    (t) => t.length >= 6 && !cityTok.has(t) && !inShare(t),
  );
  const extraB = poiKeyTokens(b).filter(
    (t) => t.length >= 6 && !cityTok.has(t) && !inShare(t),
  );
  if (extraA.length > 0 && extraB.length > 0) return false;
  return true;
}

function isNonPoiActivity(a: Activity): boolean {
  if (a.transportType === "flight" || a.type === "TRANSPORT" || a.type === "STAY") {
    return true;
  }
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  return /check-?in|check-?out|prevoz na letališč|prevoz do hotela|airport transfer|mednarodni\s*(povratni\s*)?let|international\s*(return\s*)?flight|shinkansen|potovanje (s |z )|vožnja s hitrim vlakom/i.test(
    t,
  );
}

/**
 * Same POI must not repeat later in the trip. Keep the first visit; drop the repeat.
 * If that would empty the day, keep the activity. Never invent a replacement sight.
 */
export function dropDuplicatePoisAcrossPlan(plan: AiTripPlan): number {
  const seen: string[] = [];
  let removed = 0;
  const days = plan.days ?? [];
  for (const day of days) {
    if (!day.activities) continue;
    const cityKey = poiDedupeKey(day.city ?? day.focusName ?? "");
    for (let si = 0; si < SLOTS.length; si++) {
      const slot = SLOTS[si]!;
      const list = day.activities[slot] ?? [];
      const next: Activity[] = [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i]!;
        if (isNonPoiActivity(a)) {
          next.push(a);
          continue;
        }
        const key = poiDedupeKey(a.name ?? "");
        if (!key || key.length < 4) {
          next.push(a);
          continue;
        }
        const dup = seen.some((prev) => poiKeysMatch(prev, key, cityKey));
        if (dup) {
          let left = next.length + (list.length - i - 1);
          for (let sj = si + 1; sj < SLOTS.length; sj++) {
            left += day.activities?.[SLOTS[sj]!]?.length ?? 0;
          }
          if (left > 0) {
            removed += 1;
            continue;
          }
          next.push(a);
          continue;
        }
        seen.push(key);
        next.push(a);
      }
      day.activities[slot] = next;
    }
  }
  return removed;
}

/** "Sprostitev na Playa" with no real place name — Gemini stub, not a sight. */
function isGenericSightStub(a: Activity): boolean {
  if (isNonPoiActivity(a)) return false;
  const name = (a.name ?? "").trim();
  if (!name) return true;
  const key = poiDedupeKey(name);
  if (key.length >= 5) return false;
  return /sprostitev|relax|playa|beach|plaž|ruševin|ruins/i.test(name);
}

export function dropGenericSightStubs(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      const list = day.activities[slot] ?? [];
      const next = list.filter((a) => {
        if (!isGenericSightStub(a)) return true;
        removed += 1;
        return false;
      });
      day.activities[slot] = next;
    }
  }
  return removed;
}

/** "Po ogledu ruševin se sprostite…" when the ruins were already a day — keep the new place. */
function stripRevisitLeadIn(text: string): string {
  const next = text
    .replace(
      /^(Po ogledu ruševin|Po obisku ruševin|After (?:exploring|visiting) the ruins|Nach (?:dem )?Besuch der Ruinen)\s*,?\s*/i,
      "",
    )
    .trim();
  if (!next || next === text) return text;
  const normalized = next.replace(/^(se)\s+/i, "");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function stripRevisitLeadIns(plan: AiTripPlan): number {
  let fixed = 0;
  for (const day of plan.days ?? []) {
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      for (const a of day.activities[slot] ?? []) {
        if (!a.description) continue;
        const next = stripRevisitLeadIn(a.description);
        if (next !== a.description) {
          a.description = next;
          fixed += 1;
        }
      }
    }
  }
  return fixed;
}

/**
 * If two consecutive days share ~the same activity set, replace the later day
 * with a thin local day (stops Casco Viejo copy-paste clones).
 */
export function dedupeNearIdenticalConsecutiveDays(
  plan: AiTripPlan,
  opts?: { language?: string; threshold?: number },
): number {
  const lang = opts?.language ?? plan.contentLanguage ?? "sl";
  const threshold = opts?.threshold ?? 0.82;
  let fixed = 0;
  const days = plan.days ?? [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const cur = days[i]!;
    if (prev.inFlightDay || cur.inFlightDay) continue;
    const fpPrev = activityFingerprint(prev);
    const fpCur = activityFingerprint(cur);
    if (!fpPrev || !fpCur) continue;
    const identical = fpPrev === fpCur;
    const sim = jaccard(dayNameTokens(prev), dayNameTokens(cur));
    if (!identical && sim < threshold) continue;
    // Need at least 2 named activities to treat as a real clone (not two empty days).
    if (dayNameTokens(cur).length < 2 && !identical) continue;
    days[i] = thinLocalDay(cur, lang);
    fixed += 1;
  }
  return fixed;
}

function parseHhMmToMinutes(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Earliest departure / flight clock on a day (boarding-pass or activity fields). */
function earliestDepartureMinutes(day: DayPlan): number | null {
  let best: number | null = null;
  const consider = (t?: string | null) => {
    const m = parseHhMmToMinutes(t);
    if (m == null) return;
    if (best == null || m < best) best = m;
  };
  for (const slot of SLOTS) {
    for (const a of day.activities?.[slot] ?? []) {
      const blob = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
      if (
        /odlet|odhod|departure|return flight|mednarodni|international|flight home|prevoz na letališč|airport transfer/i.test(
          blob,
        )
      ) {
        consider(a.arrivalTime);
        consider(a.departureTime);
      }
    }
  }
  return best;
}

function parseApproxHoursFromTips(tips: string): number | null {
  const m =
    /(?:approx\.?|approximately|približno|circa|etwa|about|~)\s*(\d+(?:[.,]\d+)?)\s*(?:h\b|ur[ae]?|hours?|stunden?)/i.exec(
      tips,
    ) || /\b(\d+(?:[.,]\d+)?)\s*(?:hours?|ur[ae]?|stunden?)\b/i.exec(tips);
  if (!m) return null;
  const n = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 48 ? n : null;
}

function parseDurationToHours(duration: string): number | null {
  const s = duration.trim().toLowerCase();
  const hm = /^(\d+)\s*h(?:\s*(\d+)\s*m(?:in)?)?$/.exec(s);
  if (hm) return Number(hm[1]) + (hm[2] ? Number(hm[2]) / 60 : 0);
  const hOnly = /^(\d+(?:[.,]\d+)?)\s*h$/.exec(s);
  if (hOnly) return Number(String(hOnly[1]).replace(",", "."));
  const minOnly = /^(\d+)\s*m(?:in)?$/.exec(s);
  if (minOnly) return Number(minOnly[1]) / 60;
  return null;
}

function formatHoursDuration(hours: number): string {
  const whole = Math.floor(hours);
  const mins = Math.round((hours - whole) * 60);
  if (mins <= 0) return `${whole}h`;
  if (whole <= 0) return `${mins}min`;
  return `${whole}h ${mins}min`;
}

function isAirportOrCheckout(a: Activity): boolean {
  return /check-?out|check-?in|letališč|airport|odhod iz hotela/i.test(
    `${a.name ?? ""} ${a.description ?? ""}`,
  );
}

function isDestinationStayFiller(a: Activity): boolean {
  if (isMoveActivity(a) || isAirportOrCheckout(a)) return false;
  return /zajtrk|breakfast|frühstück|siesta|beach bar|počasen zajtrk/i.test(
    `${a.name ?? ""} ${a.description ?? ""}`,
  );
}

/** Flight / ferry / train — not a local Grab or hotel-to-temple van. */
function isCityChangeTravel(a: Activity): boolean {
  const t = `${a.name ?? ""} ${a.description ?? ""}`;
  if (a.transportType === "flight") return true;
  if (
    (a.type === "TRANSPORT" || isMoveActivity(a)) &&
    /\b(let|flight|trajekt|ferry|speedboat|vlak|train|shinkansen)\b/i.test(t)
  ) {
    return true;
  }
  return (a.type === "TRANSPORT" || Boolean(a.transportType)) && /→|->/.test(t);
}

/**
 * Breakfast / beach program in the destination city before the inbound flight/van
 * has happened (Ao Nang breakfast + afternoon CNX→KBV, Lipe breakfast + morning boat).
 */
export function stripPrematureDestinationProgram(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    if (!day.activities) continue;
    const morning = day.activities.morning ?? [];
    const afternoon = day.activities.afternoon ?? [];
    const morningMove = morning.some((a) => isMoveActivity(a));
    const morningCityChange = morning.some((a) => isCityChangeTravel(a));
    const afternoonInbound = afternoon.some((a) => isCityChangeTravel(a));
    if (!morningMove && !afternoonInbound) continue;

    if (morningCityChange || afternoonInbound) {
      const kept = morning.filter((a) => isMoveActivity(a) || isAirportOrCheckout(a));
      if (kept.length !== morning.length) {
        removed += morning.length - kept.length;
        day.activities.morning = kept;
      }
      continue;
    }
    const kept = morning.filter((a) => !isDestinationStayFiller(a));
    if (kept.length !== morning.length) {
      removed += morning.length - kept.length;
      day.activities.morning = kept;
    }
  }
  return removed;
}

/**
 * Last night is already at the ticket hub — island golf-cart / ferry-to-airport
 * tips left on the departure day are leftovers from the previous stay.
 */

function stripStaleIslandTipsOnHubDeparture(plan: AiTripPlan): number {
  const days = plan.days ?? [];
  if (days.length < 1) return 0;
  const last = days[days.length - 1]!;
  const tips = last.transportationTips?.trim() ?? "";
  if (!tips) return 0;
  const city = last.city || last.focusName || "";
  if (isSmallIsland(city)) return 0;
  const leftover =
    /golf vozič|peščene ulice|avtomobili niso dovoljeni|collectivo|chiquil/i.test(tips) ||
    (/trajekt|ferry/i.test(tips) && /letališč|airport/i.test(tips) && /otok|island/i.test(tips));
  if (!leftover) return 0;
  last.transportationTips = "";
  return 1;
}

/**
 * Drop "first metro/RER at 04:50" advice when the flight is early morning —
 * public transit first trains are almost never safe for a 06:00 international departure.
 */
export function scrubUnsafeEarlyAirportTips(plan: AiTripPlan): number {
  let fixed = 0;
  for (const day of plan.days ?? []) {
    const tips = day.transportationTips?.trim();
    if (!tips) continue;
    const departMin = earliestDepartureMinutes(day);
    const earlyByClock = departMin != null && departMin < 8 * 60;
    const earlyByCopy =
      /early\s+(morning\s+)?flight|zgodnj[iae]\s+(jutranj[iae]\s+)?let|frühen?\s+(morgen)?flug|vol\s+(très\s+)?tôt|vuelo\s+temprano/i.test(
        tips,
      ) ||
      /0?[4-6]:\d{2}/.test(tips);
    if (!earlyByClock && !earlyByCopy) continue;

    const next = tips
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        const s = sentence.toLowerCase();
        const mentionsFirstTransit =
          /\b(rer|metro|métro|underground|u-bahn|s-bahn|train|vlak|zug|tren)\b/i.test(s) &&
          /starts?\s+running|začne\s+voziti|erste[rn]?\s+|first\s+|od\s+okoli|around\s+0?[4-5]|ab\s+0?[4-5]|vers\s+0?[4-5]/i.test(
            s,
          );
        const lateForFlight =
          /0?[4-5][:.][0-5]\d/.test(s) &&
          /\b(rer|metro|métro|train|vlak|check-?in|align)/i.test(s);
        const altPublic =
          /alternativ|or\s+take|lahko\s+tudi|če\s+ostajaš|if\s+staying|ensure\s+it\s+aligns/i.test(
            s,
          ) && /\b(rer|metro|métro|train|vlak|underground)\b/i.test(s);
        return !(mentionsFirstTransit || lateForFlight || altPublic);
      })
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;])/g, "$1")
      .trim();

    if (next && next !== tips) {
      day.transportationTips = next;
      fixed += 1;
    } else if (!next && tips) {
      // Fall back to a safe taxi-only tip when we stripped everything.
      const slo = !(plan.contentLanguage && !plan.contentLanguage.startsWith("sl"));
      day.transportationTips = slo
        ? "Za zgodnji jutranji let vnaprej rezerviraj taxi ali Uber/Bolt zvečer prej. Na mednarodni let pridi ~3 ure pred odhodom."
        : "For an early morning flight, pre-book a taxi or Uber/Bolt the night before. Arrive ~3 hours before an international departure.";
      fixed += 1;
    }
  }
  return fixed;
}

/**
 * When transport tips say "~2 hours" but the banner duration says "1h", prefer the tip
 * (LLM often understates the card while writing a correct prose note).
 */
export function alignTransportationDurationWithTips(plan: AiTripPlan): number {
  let fixed = 0;
  for (const day of plan.days ?? []) {
    const tips = day.transportationTips ?? "";
    const tipHours = parseApproxHoursFromTips(tips);
    if (tipHours == null) continue;
    for (const leg of day.transportation ?? []) {
      if (!leg.duration?.trim()) continue;
      const legHours = parseDurationToHours(leg.duration);
      if (legHours == null) continue;
      if (tipHours >= legHours + 0.5) {
        leg.duration = formatHoursDuration(tipHours);
        fixed += 1;
      }
    }
  }
  return fixed;
}

/** Move Tirana museums off the evening slot (they close ~18:00). */
export function relocateClosedEveningSights(plan: AiTripPlan): number {
  let n = 0;
  for (const day of plan.days ?? []) {
    const city = `${day.city ?? ""} ${day.focusName ?? ""}`;
    if (!/tirana|tiranë/i.test(city)) continue;
    const evening = day.activities?.evening ?? [];
    if (!evening.length) continue;
    const move = evening.filter((a) =>
      /bunk.?art|narodni muzej|national museum|galerij|gallery|pyramid|piramid|skanderbeg/i.test(
        `${a.name ?? ""} ${a.description ?? ""}`,
      ),
    );
    if (!move.length) continue;
    const keep = evening.filter((a) => !move.includes(a));
    day.activities = day.activities ?? { morning: [], afternoon: [], evening: [] };
    day.activities.evening = keep;
    day.activities.afternoon = [...(day.activities.afternoon ?? []), ...move];
    n += move.length;
  }
  return n;
}

/** Run all structural guards once (catalog finalize + after flight rewrite). */
export function applyItineraryGuards(
  plan: AiTripPlan,
  opts?: { arrivalDay?: number; language?: string },
): {
  placeholders: number;
  genericMeals: number;
  meals: number;
  arrivals: number;
  clones: number;
  truncated: number;
  logisticsCopy: number;
  transportLegs: number;
  returnFlights: number;
  earlyAirport: number;
  durationAlign: number;
  driveTimes: number;
  homeStays: number;
  balkanTips: number;
  overlongDrives: number;
  hitAndRun: number;
  splitDrives: number;
  lastDayHome: number;
  stealNights: number;
  wrongCity: number;
  templateScrub: number;
  duplicatePois: number;
} {
  applyIslandHopLogistics(plan, opts?.language ?? plan.contentLanguage);
  relabelHubDayTripOvernights(plan.days ?? [], opts?.language ?? plan.contentLanguage);
  enrichIslandAirportTransfers(plan, {
    destinationIata: plan.destinationIata,
    language: opts?.language ?? plan.contentLanguage,
  });
  stripPrematureDestinationProgram(plan);
  scrubImpossibleIslandDayTrips(plan, opts?.language ?? plan.contentLanguage);
  scrubBangkokSightsOnIslandTransferDays(plan);
  const placeholders = stripPlaceholderActivities(plan);
  dedupeSameDayActivities(plan);
  const wrongCity = stripWrongCityDayActivities(plan) + stripCrossStayLeaks(plan);
  const templateScrub = scrubForbiddenTemplateCopy(plan);
  const genericMeals = stripGenericMealActivities(plan);
  if (plan.summary && plan.days?.length) {
    plan.summary = alignSummaryTripLength(plan.summary, plan.days.length);
  }
  const meals = dedupeSameDayMeals(plan);
  const arrivals = stripPhantomArrivals(plan, opts?.arrivalDay ?? 1);
  const clones = dedupeNearIdenticalConsecutiveDays(plan, {
    language: opts?.language ?? plan.contentLanguage,
  });
  dropGenericSightStubs(plan);
  const duplicatePois = dropDuplicatePoisAcrossPlan(plan);
  stripRevisitLeadIns(plan);
  const truncated = stripTruncatedCopyFromPlan(plan) + stripUnrenderablePlanCopy(plan);
  stripStaleIslandTipsOnHubDeparture(plan);
  const logisticsCopy = repairIncompleteLogisticsCopy(plan);
  const transportLegs = sanitizeTransportationLegs(plan);
  ensureCityChangeTransfer(plan);
  stripReplayedIntercityHops(plan);
  stripImplausibleLongHaulProgram(plan);
  const returnFlights = dedupeLastDayReturnFlights(plan);
  const earlyAirport = scrubUnsafeEarlyAirportTips(plan);
  const durationAlign = alignTransportationDurationWithTips(plan);
  const driveTimes = repairImplausibleDriveTimes(plan);
  stripDriveStatsOnAirDays(plan);
  const lastDayHome = forceLastRoadDayHome(plan);
  const splitDrives = splitOverlongDriveStages(plan);
  const stealNights = stealNightForHitAndRun(plan);
  stripSightseeingOnBrutalDriveDays(plan);
  const overlongDrives = annotateOverlongDriveStages(plan);
  const hitAndRun = annotateHitAndRunStays(plan);
  relocateClosedEveningSights(plan);
  const homeStays = stripHomeboundPaidStays(plan);
  const balkanTips = annotateBalkanRoadTips(plan);
  return {
    placeholders,
    genericMeals,
    meals,
    arrivals,
    clones,
    truncated,
    logisticsCopy,
    transportLegs,
    returnFlights,
    earlyAirport,
    durationAlign,
    driveTimes,
    homeStays,
    balkanTips,
    overlongDrives,
    hitAndRun,
    splitDrives,
    lastDayHome,
    stealNights,
    wrongCity,
    templateScrub,
    duplicatePois,
  };
}
