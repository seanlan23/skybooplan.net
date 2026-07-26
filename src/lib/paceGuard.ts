import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

/** Local parse — avoid importing motorhomePlanTips (keeps this module leaf-level). */
function parseDrivingDurationHours(raw: string | undefined): number {
  const s = (raw ?? "").trim();
  if (!s) return 0;
  const hm = s.match(/(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d+)\s*m)?/i);
  if (hm) {
    const h = Number(hm[1]!.replace(",", "."));
    const m = hm[2] ? Number(hm[2]) : 0;
    if (Number.isFinite(h)) return h + (Number.isFinite(m) ? m / 60 : 0);
  }
  const asNum = Number(s.replace(",", "."));
  return Number.isFinite(asNum) ? asNum : 0;
}

export type TravelPace = "intensive" | "relaxed" | "calm";

type Slot = "morning" | "afternoon" | "evening";
const SLOTS: Slot[] = ["morning", "afternoon", "evening"];

/** Max sightseeing/program activities per day (meals + transport/stay always kept). */
const PACE_PROGRAM_CAPS: Record<
  TravelPace,
  { fullDay: number; lightDay: number }
> = {
  calm: { fullDay: 2, lightDay: 1 },
  relaxed: { fullDay: 3, lightDay: 1 },
  /** Intensive: no final cut — prompt + enricher already steer density. */
  intensive: { fullDay: Number.POSITIVE_INFINITY, lightDay: Number.POSITIVE_INFINITY },
};

export function normalizeTravelPace(raw: unknown): TravelPace {
  if (raw === "intensive" || raw === "calm" || raw === "relaxed") return raw;
  return "relaxed";
}

function isMealActivity(a: Activity): boolean {
  if (a.type === "EAT" || a.type === "FOOD") return true;
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  return /večerja|dinner|kosilo|lunch|zajtrk|breakfast|cena\b|dîner|abendessen|evening meal/i.test(
    t,
  );
}

/** Transport / stay / airport logistics — never trimmed by pace. */
function isProtectedLogistics(a: Activity): boolean {
  if (a.type === "TRANSPORT" || a.type === "STAY") return true;
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  if (
    /pool|emerald|hot spring|waterfall|slap|beach|plaž|temple|tempelj|museum|muzej/i.test(t)
  ) {
    return false;
  }
  return (
    /prihod na (mednarodno )?letališč|airport arrival|baggage claim|prevzem prtljage|transfer to (the )?hotel|prevoz do (hotela|centra)|check-in,?\s*(osvežitev|refresh)/i.test(
      t,
    ) || /letališč|airport/.test(t) && /transfer|taxi|vlak|train|check-?in/i.test(t)
  );
}

/** Sightseeing / beach / nature / generic activity — subject to pace caps. */
export function isPaceProgramActivity(a: Activity): boolean {
  if (isProtectedLogistics(a)) return false;
  if (isMealActivity(a)) return false;
  return true;
}

function programKeepScore(a: Activity): number {
  const type = (a.type ?? "").toUpperCase();
  const blob = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  let score = 30;
  if (type === "SIGHT") score = 55;
  else if (type === "NATURE" || type === "BEACH") score = 45;
  else if (type === "ACTIVITY") score = 35;
  // Weak rest fillers drop first on calm/relaxed.
  if (
    /pavza v kavarni|café break|siesta|bazen|pool siesta|tropska\s*pavza|ulična hrana \/ nočni trg/i.test(
      blob,
    )
  ) {
    score = 8;
  }
  if ((a.description ?? "").trim().length > 40) score += 4;
  return score;
}

export function isPaceLightDay(
  day: DayPlan,
  opts?: { arrivalDay?: number; totalDays?: number },
): boolean {
  if (day.inFlightDay) return true;
  if (day.category === "transport") return true;
  const arrivalDay = opts?.arrivalDay ?? 1;
  if (day.day === arrivalDay) return true;
  const total = opts?.totalDays ?? 0;
  if (total > 0 && day.day === total) return true;
  if ((day.drivingDistanceKm ?? 0) >= 250) return true;
  if (parseDrivingDurationHours(day.drivingDurationHours) >= 4) return true;

  const acts = SLOTS.flatMap((s) => day.activities?.[s] ?? []);
  // Only airport arrival/departure logistics mark a light day — not every ferry/bus hop.
  if (
    acts.some((a) => {
      const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
      return /prihod na (mednarodno )?letališč|airport arrival|odhod|odlet|departure|check-?out|transfer na .*letališč|mednarodni odhod/i.test(
        t,
      );
    })
  ) {
    return true;
  }
  return false;
}

function maxProgramForDay(pace: TravelPace, light: boolean): number {
  const caps = PACE_PROGRAM_CAPS[pace];
  return light ? caps.lightDay : caps.fullDay;
}

/**
 * Final structural pace trim — runs after enrichers fill slots.
 * Never removes transport/stay/airport logistics or meals; only excess program items.
 * Intensive is a no-op. Returns number of removed activities.
 */
export function enforceTravelPace(
  plan: AiTripPlan,
  opts?: { pace?: TravelPace | string | null; arrivalDay?: number },
): number {
  const raw = opts?.pace ?? plan.travelPace;
  // No explicit pace → leave plan alone (legacy / showcase / flight-only rewrites).
  if (raw == null || raw === "") return 0;
  const pace = normalizeTravelPace(raw);
  if (pace === "intensive") return 0;

  const arrivalDay = opts?.arrivalDay ?? 1;
  const totalDays = plan.days?.length ?? 0;
  let removed = 0;

  for (const day of plan.days ?? []) {
    if (!day.activities) continue;
    const light = isPaceLightDay(day, { arrivalDay, totalDays });
    const maxProgram = maxProgramForDay(pace, light);
    if (!Number.isFinite(maxProgram)) continue;

    type Tagged = { slot: Slot; act: Activity; score: number; order: number };
    const program: Tagged[] = [];
    let order = 0;
    for (const slot of SLOTS) {
      for (const act of day.activities[slot] ?? []) {
        if (isPaceProgramActivity(act)) {
          program.push({
            slot,
            act,
            score: programKeepScore(act),
            order: order++,
          });
        }
      }
    }

    if (program.length <= maxProgram) continue;

    // Keep highest score; on tie keep earlier itinerary order.
    const ranked = [...program].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    });
    const keep = new Set(ranked.slice(0, maxProgram).map((t) => t.order));
    const dropOrders = new Set(program.filter((t) => !keep.has(t.order)).map((t) => t.order));

    let walk = 0;
    for (const slot of SLOTS) {
      const list = day.activities[slot] ?? [];
      const next: Activity[] = [];
      for (const act of list) {
        if (isPaceProgramActivity(act)) {
          const myOrder = walk++;
          if (dropOrders.has(myOrder)) {
            removed += 1;
            continue;
          }
          next.push(act);
        } else {
          next.push(act);
        }
      }
      day.activities[slot] = next;
    }
  }

  return removed;
}
