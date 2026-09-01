/**
 * Activity clock display + normalization.
 * Fields: arrivalTime = window start (or event time); departureTime = window end (or flight arrive).
 */

export type ActivityClockFields = {
  name?: string;
  description?: string;
  type?: string;
  transportType?: string;
  arrivalTime?: string | null;
  departureTime?: string | null;
};

function toMin(t: string): number | null {
  const parsed = parseHmClock(t);
  if (!parsed) return null;
  const [h, min] = parsed.split(":").map(Number);
  return (h ?? 0) * 60 + (min ?? 0);
}

/** First HH:MM in a clock or range ("21:10 – 17:55 (+1)"). */
export function firstClockMinutes(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null;
  const exact = parseHmClock(raw.trim());
  if (exact) return toMin(exact);
  const m = raw.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;
  return toMin(`${m[1]}:${m[2]}`) ?? null;
}

/** Window start for sorting — never the landing/end clock. */
export function activityStartMinutes(
  activity: ActivityClockFields & { time?: string | null },
): number | null {
  return firstClockMinutes(activity.arrivalTime) ?? firstClockMinutes(activity.time);
}

export type DaypartSlot = "morning" | "afternoon" | "evening";

export function daypartFromMinutes(min: number): DaypartSlot {
  if (min >= 17 * 60) return "evening";
  if (min >= 12 * 60) return "afternoon";
  return "morning";
}

const SLOT_FALLBACK_MIN: Record<DaypartSlot, number> = {
  morning: 8 * 60,
  afternoon: 14 * 60,
  evening: 19 * 60,
};

const NEXT_DAY_LANDING_RE =
  /naslednji dan|next day|folgetag|giorno successivo|día siguiente|lendemain/i;

function sortMinutes(
  min: number | null,
  from: DaypartSlot,
  name: string | undefined,
): number {
  if (NEXT_DAY_LANDING_RE.test(name ?? "")) return 24 * 60 + 60;
  return min ?? SLOT_FALLBACK_MIN[from];
}

/**
 * Re-bucket a day's activities by start clock (00:00–23:59).
 * Timed items move to morning / afternoon / evening; untimed keep their slot.
 */
export function sortDayActivitiesByClock<T extends ActivityClockFields & { time?: string | null }>(
  slots: { morning?: T[]; afternoon?: T[]; evening?: T[] },
): { morning: T[]; afternoon: T[]; evening: T[] } {
  type Row = { a: T; i: number; from: DaypartSlot; min: number | null };
  const rows: Row[] = [];
  for (const from of ["morning", "afternoon", "evening"] as const) {
    (slots[from] ?? []).forEach((a, i) => {
      rows.push({ a, i, from, min: activityStartMinutes(a) });
    });
  }
  const order: Record<DaypartSlot, number> = { morning: 0, afternoon: 1, evening: 2 };
  rows.sort((x, y) => {
    const xm = sortMinutes(x.min, x.from, x.a.name);
    const ym = sortMinutes(y.min, y.from, y.a.name);
    if (xm !== ym) return xm - ym;
    if (x.from !== y.from) return order[x.from] - order[y.from];
    return x.i - y.i;
  });
  const out: { morning: T[]; afternoon: T[]; evening: T[] } = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const row of rows) {
    const slot = row.min != null ? daypartFromMinutes(row.min) : row.from;
    out[slot].push(row.a);
  }
  return out;
}

function formatClockMin(min: number): string {
  const wrapped = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function stampStartClock<T extends ActivityClockFields & { time?: string | null }>(
  a: T,
  clock: string,
): T {
  if (a.arrivalTime) return { ...a, arrivalTime: clock };
  if (a.time) return { ...a, time: clock };
  return { ...a, arrivalTime: clock };
}

/** Sequential timed activities on one day must not share the same start HH:MM. */
export function uniquifyDayActivityClocks<T extends ActivityClockFields & { time?: string | null }>(
  slots: { morning?: T[]; afternoon?: T[]; evening?: T[] },
): { morning: T[]; afternoon: T[]; evening: T[] } {
  const sorted = sortDayActivitiesByClock(slots);
  const rows: Array<{ a: T; from: DaypartSlot; min: number | null }> = [];
  for (const from of ["morning", "afternoon", "evening"] as const) {
    for (const a of sorted[from]) {
      rows.push({ a, from, min: activityStartMinutes(a) });
    }
  }
  let last: number | null = null;
  const stamped = rows.map((row) => {
    if (row.min == null) return row;
    let min = row.min;
    if (last != null && min <= last) min = Math.min(last + 30, 23 * 60 + 30);
    last = min;
    if (min === row.min) return { ...row, min };
    return { ...row, a: stampStartClock(row.a, formatClockMin(min)), min };
  });
  const out: { morning: T[]; afternoon: T[]; evening: T[] } = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const row of stamped) {
    const slot = row.min != null ? daypartFromMinutes(row.min) : row.from;
    out[slot].push(row.a);
  }
  return out;
}

/** Gemini nested slots use `time: "HH:MM"` — reject day-part labels like "evening". */
export function parseHmClock(raw: string | undefined | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** True for check-in / airport arrival / transfer events — show one clock, never overnight nonsense. */
export function isPointInTimeActivity(activity: ActivityClockFields): boolean {
  const name = (activity.name ?? "").trim();
  const blob = `${name} ${activity.description ?? ""} ${activity.type ?? ""} ${activity.transportType ?? ""}`.toLowerCase();

  // Explicit flight / long-haul legs keep a depart→arrive range.
  if (activity.transportType === "flight") return false;
  if (
    /mednarodni\s*let|international\s*flight|notranji\s*let|domestic\s*flight|flight\s*home|povratek\s*domov|return\s*flight/i.test(
      blob,
    )
  ) {
    return false;
  }
  if (/\b(let|flight)\b/.test(blob) && /(→|->|—|–)/.test(name)) return false;

  if (activity.type === "STAY") return true;
  return /prihod na letališč|prihod v hotel|prihod v kamp|hotel arrival|arrival at camp|airport arrival|check-?in|check-?out|osvežit|odhod iz hotela|hotel check-out|varnostni pregled|security screening|prevzem prtljag|collect luggage|orientacija|arrival hall/i.test(
    blob,
  );
}

/** True when the activity is an intercity flight / overnight air leg. */
export function isFlightRangeActivity(activity: ActivityClockFields): boolean {
  if (activity.transportType === "flight") return true;
  const name = (activity.name ?? "").toLowerCase();
  // Logistics that only mention a flight in the description (transfer tip) are NOT air legs.
  if (
    /transfer|check-?out|check-?in|prevoz na letališč|grab|taxi|shuttle|kombi|van\b/i.test(name) &&
    !/\b(let|flight|volo|vuelo|flug)\b/i.test(name)
  ) {
    return false;
  }
  const blob = `${activity.name ?? ""} ${activity.description ?? ""}`.toLowerCase();
  return /mednarodni\s*(povratni\s*)?let|international\s*(return\s*)?flight|notranji\s*let|domestic\s*flight|flight\s*home|povratek\s*domov|volo internazionale|vuelo internacional|vol international|internationaler\s*(rück)?flug|prihod na letališče in odlet|airport arrival and departure/i.test(
    blob,
  );
}

/** Format start → end for UI + PDF. Overnight (+1) only when both sides exist. */
export function formatActivityClockRange(
  arrivalTime?: string | null,
  departureTime?: string | null,
  opts?: { allowOvernightPlus1?: boolean },
): string | undefined {
  const start = arrivalTime?.trim() || "";
  const end = departureTime?.trim() || "";
  if (!start && !end) return undefined;
  if (start && !end) return start;
  if (!start && end) return end;
  if (start === end) return start;

  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null) return `${start} – ${end}`;

  const allowPlus1 = opts?.allowOvernightPlus1 !== false;
  if (b < a) {
    return allowPlus1 ? `${start} – ${end} (+1)` : start;
  }
  return `${start} – ${end}`;
}

/**
 * Display label for an activity.
 * Point-in-time logistics → one HH:MM; flight legs → depart – arrive (+1 if overnight).
 */
export function formatActivityClockLabel(activity: ActivityClockFields): string | undefined {
  const start = activity.arrivalTime?.trim() || "";
  const end = activity.departureTime?.trim() || "";

  if (isPointInTimeActivity(activity)) {
    if (start && end && start !== end) {
      const a = toMin(start);
      const b = toMin(end);
      // Swapped / overnight garbage on check-in → keep the start (event) clock only.
      if (a != null && b != null && b < a) return start;
    }
    return start || end || undefined;
  }

  return formatActivityClockRange(start, end, {
    allowOvernightPlus1: isFlightRangeActivity(activity) || Boolean(start && end),
  });
}

const PROSE_CLOCK_RE = /\b\d{1,2}:\d{2}\b/g;

function normalizeHmToken(hm: string): string {
  const m = hm.match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

/**
 * Remove HH:MM from prose except boarding-pass / logistics clocks we own in code.
 * Used on arrival/departure days so Gemini invented “meet at 09:15” cannot fight the schedule.
 */
export function stripProseClocksExcept(
  text: string | undefined,
  keep: readonly string[],
): string | undefined {
  if (!text) return text;
  const allowed = new Set(
    keep.map(normalizeHmToken).filter((t) => /^\d{2}:\d{2}$/.test(t)),
  );
  const out = text.replace(PROSE_CLOCK_RE, (match) => {
    const norm = normalizeHmToken(match);
    return allowed.has(norm) ? norm : "";
  });
  return out
    .split("\n")
    .map((line) =>
      line
        .replace(/[^\S\n]{2,}/g, " ")
        .replace(/[^\S\n]+([,.!?;:])/g, "$1")
        .replace(/\(\s*\)/g, "")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drop structured clocks — sights on flight days must not keep LLM HH:MM fields. */
export function clearActivityStructuredClocks<T extends ActivityClockFields>(activity: T): T {
  activity.arrivalTime = undefined;
  activity.departureTime = undefined;
  return activity;
}

/**
 * Normalize stored clocks so UI/PDF never show 19:30–18:00 on check-in.
 * Mutates the activity-like object.
 */
export function normalizeActivityClocks<T extends ActivityClockFields>(activity: T): T {
  const start = activity.arrivalTime?.trim() || "";
  const end = activity.departureTime?.trim() || "";

  if (!start && !end) return activity;

  if (isPointInTimeActivity(activity)) {
    let clock = start || end;
    if (start && end && start !== end) {
      const a = toMin(start);
      const b = toMin(end);
      // Prefer earlier wall-clock as event time when range looks inverted.
      if (a != null && b != null && b < a) clock = start;
      else clock = start;
    }
    activity.arrivalTime = clock || undefined;
    activity.departureTime = undefined;
    return activity;
  }

  if (isFlightRangeActivity(activity) && start && end) {
    const a = toMin(start);
    const b = toMin(end);
    // If someone stored arrive→depart, swap when start looks like afternoon land and end like evening depart same-calendar nonsense...
    // Prefer: start should be depart (often later local or previous day). Keep as-is when overnight (b < a).
    if (a != null && b != null && a === b) {
      activity.departureTime = undefined;
    }
    return activity;
  }

  // Generic visit window with inverted clocks → collapse to start.
  if (start && end) {
    const a = toMin(start);
    const b = toMin(end);
    if (a != null && b != null && b < a && !isFlightRangeActivity(activity)) {
      activity.arrivalTime = start;
      activity.departureTime = undefined;
    }
  }
  return activity;
}
