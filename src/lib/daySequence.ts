import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

function planCalendarDayCount(days: Array<{ day: number }>): number {
  if (!days.length) return 0;
  return Math.max(...days.map((d) => d.day));
}

function dayActivityScore(day: DayPlan): number {
  const a = day.activities;
  if (!a) return day.mapPins?.length ?? 0;
  return (
    (a.morning?.length ?? 0) +
    (a.afternoon?.length ?? 0) +
    (a.evening?.length ?? 0) +
    (day.mapPins?.length ?? 0)
  );
}

function dedupeDays(days: DayPlan[]): DayPlan[] {
  const byDay = new Map<number, DayPlan>();
  for (const d of days) {
    const prev = byDay.get(d.day);
    if (!prev || dayActivityScore(d) > dayActivityScore(prev)) {
      byDay.set(d.day, d);
    }
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function isoPlusDays(iso: string | undefined, add: number): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

function neighborTemplate(
  days: DayPlan[],
  missingDay: number,
): Pick<DayPlan, "city" | "focusName" | "lat" | "lng" | "date"> {
  const prev = [...days].reverse().find((d) => d.day < missingDay);
  const next = days.find((d) => d.day > missingDay);
  const src = prev ?? next;
  const date =
    isoPlusDays(prev?.date, missingDay - (prev?.day ?? missingDay)) ??
    isoPlusDays(next?.date, missingDay - (next?.day ?? missingDay)) ??
    src?.date;
  return {
    city: src?.city ?? "",
    focusName: src?.focusName ?? src?.city ?? "",
    lat: src?.lat ?? 0,
    lng: src?.lng ?? 0,
    date,
  };
}

function thinPlaceholderDay(
  dayNum: number,
  template: ReturnType<typeof neighborTemplate>,
  lang: string,
  opts?: { motorhome?: boolean },
): DayPlan {
  const slo = !lang || lang.startsWith("sl");
  const city = template.city || template.focusName || (slo ? "destinacija" : "destination");
  const motorhome = opts?.motorhome === true;
  return {
    day: dayNum,
    date: template.date,
    title: slo ? `${city} — prosti / lokalni dan` : `${city} — free / local day`,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: slo
      ? "Vstavljen dan (manjkala številka v AI načrtu) — lahek lokalni program."
      : "Inserted day (AI skipped this number) — keep a light local schedule.",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 60,
    lat: template.lat,
    lng: template.lng,
    focusName: template.focusName || city,
    city,
    category: "activity",
    activities: {
      morning: [],
      afternoon: [
        {
          name: slo ? "Popoldanski lokalni ogled" : "Afternoon local sight",
          type: "SIGHT",
          description: slo
            ? `En konkreten ogled v ${city} (muzej, trg ali park) — ne generičen filler.`
            : `One concrete sight in ${city} (museum, square, or park) — not generic filler.`,
        },
      ],
      evening: [
        motorhome
          ? {
              name: slo ? "Večer pri kampu" : "Evening at camp",
              type: "ACTIVITY",
              description: slo
                ? "Lahek večer pri kampu — sprehod ali kuhanje v avtodomu, brez obvezne restavracije."
                : "Easy evening at camp — stroll or cook in the RV, no restaurant required.",
            }
          : {
              name: slo ? "Lahek večer v mestu" : "Easy evening in town",
              type: "ACTIVITY",
              description: slo
                ? `Sprehod po ${city} in lahka večerja — brez dolgega programa.`
                : `Stroll around ${city} and a light dinner — no heavy schedule.`,
            },
      ],
    },
  };
}

function cloneStayDay(
  src: DayPlan,
  dayNum: number,
  lang: string,
  departDate?: string,
  opts?: { motorhome?: boolean },
): DayPlan {
  // Never structuredClone full activity trees — that produced identical Day 3/4 clones.
  const date =
    isoPlusDays(departDate, dayNum - 1) ??
    isoPlusDays(src.date, dayNum - src.day) ??
    src.date;
  const thin = thinPlaceholderDay(
    dayNum,
    {
      city: src.city,
      focusName: src.focusName,
      lat: src.lat,
      lng: src.lng,
      date,
    },
    lang,
    opts,
  );
  const slo = !lang || lang.startsWith("sl");
  const motorhome = opts?.motorhome === true;
  return {
    ...thin,
    travelHack: slo
      ? motorhome
        ? "Dodan dan na isti bazi (AI je vrnil premalo koledarskih dni) — lahek lokalni program, isti kamp."
        : "Dodan dan v istem mestu (AI je vrnil premalo koledarskih dni) — lahek lokalni program, ista hotelska baza."
      : motorhome
        ? "Extra night at the same base (AI returned too few calendar days) — keep a light local day."
        : "Extra night in the same city (AI returned too few calendar days) — keep a light local day.",
  };
}

/**
 * When Gemini returns e.g. 6 day cards for a 10-day motorhome trip (confusing
 * camps/bases with calendar days), expand by inserting stay nights after
 * existing days, then fill any remaining gaps.
 */
export function expandPlanDaysToExpected(
  plan: AiTripPlan,
  opts: { expectedDays: number; language?: string; departDate?: string },
): { inserted: number[] } {
  plan.days = dedupeDays(plan.days ?? []);
  if (!plan.days.length || opts.expectedDays <= 0) return { inserted: [] };

  const lang = opts.language ?? "sl";
  const expected = opts.expectedDays;
  const inserted: number[] = [];
  const motorhomeOpts = {
    motorhome:
      plan.accommodationMode === "motorhome" ||
      plan.groundTransportMode === "motorhome",
  };

  if (plan.days.length < expected) {
    const need = expected - plan.days.length;
    const slots = plan.days.length;
    const extras = Array.from({ length: slots }, () => 0);
    // Prefer extending earlier/mid stays (typical multi-night camps), not only the last stop.
    for (let i = 0; i < need; i++) {
      extras[i % slots]! += 1;
    }

    const expanded: DayPlan[] = [];
    let dayNum = 1;
    for (let i = 0; i < plan.days.length; i++) {
      const src = plan.days[i]!;
      const date =
        isoPlusDays(opts.departDate, dayNum - 1) ??
        isoPlusDays(src.date, dayNum - src.day) ??
        src.date;
      expanded.push({ ...src, day: dayNum, date });
      dayNum += 1;
      for (let e = 0; e < extras[i]!; e++) {
        expanded.push(cloneStayDay(src, dayNum, lang, opts.departDate, motorhomeOpts));
        inserted.push(dayNum);
        dayNum += 1;
      }
    }
    plan.days = expanded;
  }

  const repaired = repairPlanDaySequence(plan, {
    expectedDays: expected,
    language: lang,
    departDate: opts.departDate,
  });
  trimPlanDaysToExpected(plan, expected);
  return { inserted: [...inserted, ...repaired.inserted] };
}

/** Drop Gemini extras beyond N so Day N stays the departure day. */
export function trimPlanDaysToExpected(
  plan: AiTripPlan,
  expectedDays: number,
): number {
  if (!plan.days?.length || expectedDays <= 0) return 0;
  const before = plan.days.length;
  plan.days = plan.days.filter((d) => d.day <= expectedDays);
  return before - plan.days.length;
}

/**
 * Ensure calendar days 1…expected (or max existing) are present.
 * Inserts thin placeholders for gaps so PDF never jumps Day 4 → Day 6.
 */
export function repairPlanDaySequence(
  plan: AiTripPlan,
  opts?: { expectedDays?: number; language?: string; departDate?: string },
): { inserted: number[] } {
  plan.days = dedupeDays(plan.days ?? []);
  if (!plan.days.length) return { inserted: [] };

  const lang = opts?.language ?? "sl";
  const maxExisting = planCalendarDayCount(plan.days);
  const target = Math.max(maxExisting, opts?.expectedDays ?? 0);
  if (target < 1) return { inserted: [] };

  const byDay = new Map(plan.days.map((d) => [d.day, d]));
  const inserted: number[] = [];
  const motorhomeOpts = {
    motorhome:
      plan.accommodationMode === "motorhome" ||
      plan.groundTransportMode === "motorhome",
  };

  for (let n = 1; n <= target; n++) {
    if (byDay.has(n)) continue;
    // Prefer filling internal gaps; trailing missing days only when expectedDays set.
    if (n > maxExisting && (opts?.expectedDays == null || n > opts.expectedDays)) continue;
    const tmpl = neighborTemplate([...byDay.values()].sort((a, b) => a.day - b.day), n);
    if (opts?.departDate) {
      tmpl.date = isoPlusDays(opts.departDate, n - 1) ?? tmpl.date;
    }
    const placeholder = thinPlaceholderDay(n, tmpl, lang, motorhomeOpts);
    byDay.set(n, placeholder);
    inserted.push(n);
  }

  plan.days = [...byDay.values()].sort((a, b) => a.day - b.day);
  if (opts?.departDate) resyncPlanDayDates(plan, opts.departDate);
  return { inserted };
}

/**
 * Authoritative calendar: day N is always departDate + (N-1).
 * Gemini ISO stamps are ignored once we know the trip start (fixes duplicate 31 Oct / skipped 6 Nov).
 */
export function resyncPlanDayDates(plan: AiTripPlan, departDate?: string): number {
  const base =
    (departDate ?? plan.days?.find((d) => d.day === 1)?.date)?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!base) return 0;
  let n = 0;
  for (const day of plan.days ?? []) {
    if (typeof day.day !== "number" || day.day < 1) continue;
    const next = isoPlusDays(base, day.day - 1);
    if (!next || day.date === next) continue;
    day.date = next;
    n += 1;
  }
  return n;
}

/** True when every integer from 1…max(day) exists (island dayEnd spans still count as their start day). */
export function hasContiguousDayNumbers(days: Array<{ day: number; dayEnd?: number }>): boolean {
  if (!days.length) return false;
  const covered = new Set<number>();
  for (const d of days) {
    const end = d.dayEnd != null && d.dayEnd > d.day ? d.dayEnd : d.day;
    for (let n = d.day; n <= end; n++) covered.add(n);
  }
  const max = Math.max(...covered);
  for (let n = 1; n <= max; n++) {
    if (!covered.has(n)) return false;
  }
  return true;
}
