import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { planLangCopy } from "@/lib/planLangCopy";
import { normalizePlanLangCode } from "@/lib/planLanguages";

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
}
