import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { isAiPlaceholderText } from "@/lib/tripContent";
import { sameDayActivityCoreKey } from "@/lib/textSanitize";

type DaySlots = NonNullable<DayPlan["activities"]>;
type Slot = keyof DaySlots;

const SLOTS: Slot[] = ["morning", "afternoon", "evening"];

/** Enricher-pool generics that must never ship in final plans / PDFs. */
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
    /^jutranji ogled\s*\/\s*sprehod$/i.test(name) ||
    /^morning sight or stroll$/i.test(name) ||
    /2[–-]3\s*stavki|what to see|why it matters|practical tip/i.test(blob) ||
    /kaj vidiš.*zakaj je vredno/i.test(blob)
  );
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
  return (
    /prihod na (mednarodno )?letališč|airport arrival|tocumen|\(pty\)|\(jfk\)|\(syd\)|arrival hall|prevzem prtljage|baggage claim/i.test(
      t,
    ) ||
    (/prevoz do (hotela|centra)|transfer to (the )?hotel|check-in,?\s*(osvežitev|refresh)|namestitev po prihodu/i.test(
      t,
    ) &&
      /letališč|airport|taxi|grab|uber|transfer/i.test(t)) ||
    ((a.type === "TRANSPORT" || a.type === "STAY") &&
      /prihod|arrival|check-in|letališč|airport/i.test(t))
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
      ? "Dan je bil podvojen v AI osnutku — zamenjan z lahkotnim lokalnim programom."
      : "Day was duplicated in the AI draft — replaced with a light local schedule.",
    morning: "",
    afternoon: "",
    evening: "",
    mapPins: [],
    transportation: undefined,
    activities: {
      morning: [
        {
          name: slo ? `Jutranji sprehod po ${city}` : `Morning stroll in ${city}`,
          type: "ACTIVITY",
          description: slo
            ? `Lahek sprehod in kava v ${city} — brez dolgih transferjev.`
            : `Easy stroll and coffee in ${city} — no long transfers.`,
          bullets: slo
            ? [`Sprehod po soseski blizu hotela.`, `Kava v lokalni kavarni.`]
            : [`Neighborhood walk near the hotel.`, `Coffee at a local café.`],
        },
      ],
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

/** Drop enricher / prompt placeholder activities from every day. */
export function stripPlaceholderActivities(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
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
  for (const day of plan.days ?? []) {
    if (!day.activities) continue;
    if (day.day === arrivalDay) continue;
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

/** Run all structural guards once (catalog finalize + after flight rewrite). */
export function applyItineraryGuards(
  plan: AiTripPlan,
  opts?: { arrivalDay?: number; language?: string },
): {
  placeholders: number;
  meals: number;
  arrivals: number;
  clones: number;
} {
  const placeholders = stripPlaceholderActivities(plan);
  const meals = dedupeSameDayMeals(plan);
  const arrivals = stripPhantomArrivals(plan, opts?.arrivalDay ?? 1);
  const clones = dedupeNearIdenticalConsecutiveDays(plan, {
    language: opts?.language ?? plan.contentLanguage,
  });
  return { placeholders, meals, arrivals, clones };
}
