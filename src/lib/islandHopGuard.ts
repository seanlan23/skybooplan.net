import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { planLangCopy } from "@/lib/planLangCopy";
import { normalizePlanLangCode } from "@/lib/planLanguages";
import { canonicalStayCity, stayCityMentioned } from "@/lib/userStayPlan";

/**
 * Island pairs that cannot be done as a same-day outing (sea + flights + ferries).
 * Match against activity name/description when the day city is one of the hubs.
 */
const IMPOSSIBLE_SAME_DAY_HOPS: Array<{
  hubs: RegExp;
  remote: RegExp;
  /** Replacement local outing when the remote island is hallucinated. */
  localFallback: {
    sl: string;
    en: string;
    it: string;
    es: string;
    fr: string;
    de: string;
  };
  localDesc: {
    sl: string;
    en: string;
    it: string;
    es: string;
    fr: string;
    de: string;
  };
}> = [
  {
    hubs: /\bboracay\b|\bwhite\s*beach\b|\bcaticlan\b|\bkali(?:bo)?\b/i,
    // Far Cebu-north / Visayas — not a same-day outing from Boracay.
    // Do not list Bohol/El Nido/Coron here: overnight island moves are valid.
    remote: /\bmalapascua\b|\bbantayan\b|\bcamotes\b/i,
    localFallback: {
      sl: "Dan na Boracayu — plaže in otoki v bližini",
      en: "Boracay day — beaches and nearby island hopping",
      it: "Giornata a Boracay — spiagge e isole vicine",
      es: "Día en Boracay — playas e islas cercanas",
      fr: "Journée à Boracay — plages et îles proches",
      de: "Tag auf Boracay — Strände und nahe Inselhopping",
    },
    localDesc: {
      sl: "Malapascua ni dosegljiva za enodnevni izlet z Boracaya. Ostani na White Beach, Puka Beach ali lokalnem island hoppingu (Crocodile / Magic Island).",
      en: "Malapascua is not reachable as a day trip from Boracay. Stay on White Beach, Puka Beach, or a local island hop (Crocodile / Magic Island).",
      it: "Malapascua non è raggiungibile in giornata da Boracay. Resta a White Beach, Puka Beach o un island hopping locale (Crocodile / Magic Island).",
      es: "Malapascua no es alcanzable en un día desde Boracay. Quédate en White Beach, Puka Beach o un island hop local (Crocodile / Magic Island).",
      fr: "Malapascua n'est pas accessible en journée depuis Boracay. Restez à White Beach, Puka Beach ou un island hop local (Crocodile / Magic Island).",
      de: "Malapascua ist kein Tagesausflug von Boracay. Bleib an White Beach, Puka Beach oder lokalem Island-Hopping (Crocodile / Magic Island).",
    },
  },
];

function dayCityBlob(day: DayPlan): string {
  return `${day.city ?? ""} ${day.focusName ?? ""} ${day.title ?? ""}`;
}

function activityBlob(a: Activity): string {
  return `${a.name} ${a.description ?? ""}`;
}

function rewriteImpossibleHop(
  activity: Activity,
  rule: (typeof IMPOSSIBLE_SAME_DAY_HOPS)[number],
  lang: string,
): Activity {
  return {
    ...activity,
    name: planLangCopy(lang, rule.localFallback),
    description: planLangCopy(lang, rule.localDesc),
    type: activity.type || "ACTIVITY",
  };
}

export function dropDuplicatePhiPhiDayTrips(plan: AiTripPlan, language?: string): number {
  const lang = normalizePlanLangCode(language ?? plan.contentLanguage ?? "en");
  const maya = /maya bay|koh phi phi|phi phi otok|phi phi island|phi phi don|phi phi leh/i;
  const krabiBase = /krabi|ao nang|railay/i;
  const replacement = {
    sl: "Hong Island / 4 otoki (ne spet Maya Bay)",
    en: "Hong Island / 4 Islands (not Maya Bay again)",
    de: "Hong Island / 4 Inseln (nicht nochmal Maya Bay)",
    it: "Hong Island / 4 isole (non di nuovo Maya Bay)",
    es: "Hong Island / 4 islas (no Maya Bay otra vez)",
    fr: "Hong Island / 4 îles (pas Maya Bay encore)",
  };
  const replacementDesc = {
    sl: "Maya Bay si že naredil včeraj. Danes Hong Island ali 4 Islands iz Ao Nanga — drugačne lagune, manj gneče. Ne plačuj istega Phi Phi izleta dvakrat.",
    en: "You already did Maya Bay yesterday. Today Hong Island or the 4 Islands from Ao Nang — different lagoons, fewer crowds. Don't pay for the same Phi Phi trip twice.",
    de: "Maya Bay war gestern. Heute Hong Island oder 4 Islands ab Ao Nang — andere Lagunen, weniger Andrang.",
    it: "Maya Bay l'hai già fatta ieri. Oggi Hong Island o 4 Islands da Ao Nang.",
    es: "Maya Bay ya lo hiciste ayer. Hoy Hong Island o 4 Islands desde Ao Nang.",
    fr: "Maya Bay, c'était hier. Aujourd'hui Hong Island ou 4 Islands depuis Ao Nang.",
  };
  let n = 0;
  let sawMaya = false;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  for (const day of days) {
    const city = `${day.city ?? ""} ${day.focusName ?? ""} ${day.title ?? ""}`;
    const blob = `${city} ${JSON.stringify(day.activities ?? {})}`;
    const here = krabiBase.test(city) && maya.test(blob);
    if (here && sawMaya) {
      if (maya.test(day.title ?? "")) {
        day.title = planLangCopy(lang, replacement);
      }
      if (day.activities) {
        for (const slot of ["morning", "afternoon", "evening"] as const) {
          day.activities[slot] = (day.activities[slot] ?? []).map((a) => {
            if (!maya.test(`${a.name} ${a.description ?? ""}`)) return a;
            n += 1;
            return {
              ...a,
              name: planLangCopy(lang, replacement),
              description: planLangCopy(lang, replacementDesc),
              type: a.type || "ACTIVITY",
            };
          });
        }
      }
      continue;
    }
    if (here) sawMaya = true;
  }
  return n;
}

const DAY_TRIP_CUE_RE =
  /day\s*trip|celodnevni izlet|izlet na|izlet z (ladj|gliser|čoln|colnom|speedboat)|speedboat|gliser|excursion|escursione|ausflug|excursi[oó]n|boat tour|island hop|same[- ]day (trip|visit|outing)/i;

function overnightStayCities(plan: AiTripPlan): Map<string, number> {
  const counts = new Map<string, number>();
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  let runCity = "";
  let run = 0;
  const flush = () => {
    if (!runCity || run <= 0) return;
    counts.set(runCity, Math.max(counts.get(runCity) ?? 0, run));
  };
  for (const day of days) {
    if (day.inFlightDay) continue;
    const city = canonicalStayCity(day.city ?? day.focusName ?? "");
    if (!city) continue;
    if (city === runCity) run += 1;
    else {
      flush();
      runCity = city;
      run = 1;
    }
  }
  flush();
  return counts;
}

function isTransferTowardStay(day: DayPlan, next: DayPlan | undefined, stayCity: string): boolean {
  if (next && stayCityMentioned(`${next.city ?? ""} ${next.focusName ?? ""}`, stayCity)) {
    return true;
  }
  for (const leg of day.transportation ?? []) {
    if (stayCityMentioned(`${leg.to ?? ""} ${leg.from ?? ""}`, stayCity) && stayCityMentioned(leg.to ?? "", stayCity)) {
      return true;
    }
  }
  return false;
}

/**
 * No preview day-trip (boat/flight) to a place where the traveler already has
 * a multi-night stay. Transfer days that actually move to that base stay intact.
 */
export function dropDayTripsToOvernightStays(plan: AiTripPlan, language?: string): number {
  const lang = normalizePlanLangCode(language ?? plan.contentLanguage ?? "en");
  const stays = [...overnightStayCities(plan).entries()].filter(([, n]) => n >= 2);
  if (!stays.length) return 0;
  let n = 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    if (day.inFlightDay || !day.activities) continue;
    const here = `${day.city ?? ""} ${day.focusName ?? ""}`;
    const next = days[i + 1];
    for (const [stayCity] of stays) {
      if (stayCityMentioned(here, stayCity)) continue;
      if (isTransferTowardStay(day, next, stayCity)) continue;
      for (const slot of ["morning", "afternoon", "evening"] as const) {
        const list = day.activities[slot];
        if (!list?.length) continue;
        day.activities[slot] = list.map((a) => {
          const blob = `${a.name} ${a.description ?? ""}`;
          if (!stayCityMentioned(blob, stayCity)) return a;
          const dayTrip =
            DAY_TRIP_CUE_RE.test(blob) ||
            /ladja|čoln|boat|ferry|trajekt|gliser|speedboat|let na |flight to /i.test(blob);
          if (!dayTrip) return a;
          if (a.type === "TRANSPORT" && isTransferTowardStay(day, next, stayCity)) return a;
          n += 1;
          const city = (day.city || day.focusName || "").trim() || stayCity;
          return {
            ...a,
            name: planLangCopy(lang, {
              sl: `Lokalni ogled ${city}`,
              en: `Local sights in ${city}`,
              de: `Lokales Programm in ${city}`,
              it: `Visite locali a ${city}`,
              es: `Visitas locales en ${city}`,
              fr: `Visites locales à ${city}`,
            }),
            description: planLangCopy(lang, {
              sl: `${city}: lokalne znamenitosti, staro mestno jedro in bližnje plaže. Ne enodnevni izlet na ${stayCity} — tam že imaš večdnevno bivanje.`,
              en: `${city}: local sights, old town and nearby beaches. Not a day trip to ${stayCity} — you already stay there overnight.`,
              de: `${city}: lokale Sehenswürdigkeiten, Altstadt und Strände in der Nähe. Kein Tagesausflug nach ${stayCity} — dort übernachtest du bereits mehrere Nächte.`,
              it: `${city}: attrazioni locali, centro storico e spiagge vicine. Non un'escursione di un giorno a ${stayCity} — lì soggiorni già più notti.`,
              es: `${city}: sitios locales, casco antiguo y playas cercanas. No una excursión de un día a ${stayCity} — allí ya te quedas varias noches.`,
              fr: `${city} : visites locales, vieille ville et plages proches. Pas d'excursion d'une journée à ${stayCity} — vous y séjournez déjà plusieurs nuits.`,
            }),
            type: a.type === "TRANSPORT" ? "SIGHT" : a.type || "SIGHT",
          };
        });
      }
    }
  }
  return n;
}

/** Drop / rewrite same-day hops that are geographically impossible. */
export function scrubImpossibleIslandDayTrips(
  plan: AiTripPlan,
  language?: string,
): void {
  const lang = normalizePlanLangCode(language ?? plan.contentLanguage ?? "en");

  for (const day of plan.days) {
    const city = dayCityBlob(day);
    if (!day.activities) continue;

    for (const slot of ["morning", "afternoon", "evening"] as const) {
      const list = day.activities[slot];
      if (!list?.length) continue;
      day.activities[slot] = list.map((act) => {
        const blob = activityBlob(act);
        for (const rule of IMPOSSIBLE_SAME_DAY_HOPS) {
          const hubHit = rule.hubs.test(city) || rule.hubs.test(blob);
          const remoteHit = rule.remote.test(blob);
          if (!hubHit || !remoteHit) continue;
          // Same-day outing framing, or any mention while the day city is the hub
          // (Gemini often omits “day trip” but still schedules Malapascua on a Boracay day).
          const dayTripCue =
            /day\s*trip|same[- ]day|escursione|giornata|ausflug|excursi[oó]n|izlet|un po['’]?\s*distante|fattibile|feasible|reachable/i.test(
              blob,
            );
          if (rule.hubs.test(city) || dayTripCue) {
            return rewriteImpossibleHop(act, rule, lang);
          }
        }
        return act;
      });
    }
  }
  dropDuplicatePhiPhiDayTrips(plan, language);
  dropDayTripsToOvernightStays(plan, language);
}
