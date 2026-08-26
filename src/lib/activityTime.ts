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
