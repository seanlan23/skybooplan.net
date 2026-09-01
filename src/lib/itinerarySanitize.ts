import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { formatHmClock, parseClockMinutes } from "@/lib/flightScheduling";
import { overnightPlacesMatch } from "@/lib/overnightHotelStays";

/** Place-name particles — allow a 4th word after these (`San Daniele del Friuli`). */
const PLACE_PARTICLE_RE = /^(de|del|della|delle|dei|di|da|do|dos|das|am|im|la|le|el|los|las|van|von|der|den|of|the|and)$/i;

/** Activity/sentence leftover glued onto a city header. */
const CLAUSE_STARTER_RE =
  /^(po|pred|after|before|during|following|ob|pri|med|then|kasneje|zajtrk|breakfast)$/i;

const DEPARTURE_WORD_RE = /^(odhod|departure|abflug|partenza|salida|départ)$/i;

const CITY_CUT_RE = /[\n\r.,;:…]|\.{2,}|\s+[–—-]\s+|[–—]|\(/;

const CLOCK_RE = /\b([01]?\d|2[0-3])[:.][0-5]\d\b/;
const DOMESTIC_FLIGHT_RE = /notranji\s*let|domestic\s*(air|flight)|inlandsflug/i;
const RETURN_FLIGHT_RE =
  /mednarodn\w*.{0,24}\blet|odhod mednarodn|let proti domu|povratni\s*let|international\s*(return\s*)?(flight|flug)|overnight (international )?flight|internationaler\s*(rück|nacht)?flug|volo internazionale|vuelo internacional|vol international|rückflug|flight home|return flight/i;
const FLIGHT_WORD_RE = /\b(let|flight|flug|volo|vuelo|vol)\b/i;

export type ReturnClockSource = {
  returnTime?: string;
  inboundDepart?: string;
};

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clockVariants(raw: string): string[] {
  const min = parseClockMinutes(raw);
  if (min == null) return [raw.trim()];
  const padded = formatHmClock(min);
  const h = Math.floor(min / 60);
  const m = String(min % 60).padStart(2, "0");
  const loose = `${h}:${m}`;
  return [...new Set([padded, loose, raw.trim()].filter(Boolean))];
}

/** Ticket return depart. `returnTime` is accepted as an alias of `inboundDepart`. */
export function resolveReturnDepartClock(
  plan: Pick<AiTripPlan, "flightContext" | "returnFlightEu"> & {
    flights?: { returnTime?: string; inboundDepart?: string } | unknown;
  },
  extra?: ReturnClockSource,
): string | undefined {
  const flights = plan.flightContext as
    | (NonNullable<AiTripPlan["flightContext"]> & { returnTime?: string })
    | undefined;
  const loose =
    plan.flights && typeof plan.flights === "object" && !Array.isArray(plan.flights)
      ? (plan.flights as { returnTime?: string; inboundDepart?: string })
      : undefined;
  const raw =
    extra?.returnTime?.trim() ||
    extra?.inboundDepart?.trim() ||
    flights?.returnTime?.trim() ||
    flights?.inboundDepart?.trim() ||
    loose?.returnTime?.trim() ||
    loose?.inboundDepart?.trim() ||
    plan.returnFlightEu?.departureTime?.trim() ||
    "";
  const min = parseClockMinutes(raw);
  return min == null ? undefined : formatHmClock(min);
}

/**
 * City header only: cut after punctuation / dash / newline, drop glued
 * itinerary clauses, cap at 3 words (4 when the extra word follows a particle).
 */
export function sanitizeDayCity(raw: string | undefined | null): string {
  if (!raw) return "";
  let s = raw.replace(/\u00a0/g, " ").trim();
  if (!s) return "";
  s = (s.split(CITY_CUT_RE)[0] ?? "").trim();
  s = s.replace(/\s+(po|pred|after|before|during|following|ob|pri|med|then|kasneje)\b[\s\S]*$/i, "").trim();
  s = s.replace(/\s+/g, " ");
  if (!s) return "";

  const words = s.split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (CLAUSE_STARTER_RE.test(word) && kept.length >= 2) break;
    if (kept.length >= 3) {
      const prev = kept[kept.length - 1] ?? "";
      if (!PLACE_PARTICLE_RE.test(prev) && !PLACE_PARTICLE_RE.test(word)) break;
      if (kept.length >= 4) break;
    }
    kept.push(word);
  }
  while (kept.length >= 3 && CLAUSE_STARTER_RE.test(kept[kept.length - 1] ?? "")) {
    kept.pop();
  }
  const cleaned = kept.join(" ").trim();
  const lead = cleaned.split(/\s+/)[0] ?? "";
  const second = cleaned.split(/\s+/)[1] ?? "";
  if (/^[A-Z]{3}$/.test(lead) && (!second || DEPARTURE_WORD_RE.test(second))) {
    return "";
  }
  return cleaned;
}

export function sanitizePlanDayCities<T extends {
  days?: Array<{ city?: string; focusName?: string }>;
  hotels?: Array<{ city?: string }>;
}>(plan: T): T {
  const days = [...(plan.days ?? [])].sort((a, b) => {
    const da = typeof (a as { day?: number }).day === "number" ? (a as { day: number }).day : 0;
    const db = typeof (b as { day?: number }).day === "number" ? (b as { day: number }).day : 0;
    return da - db;
  });
  let lastClean = "";
  for (const day of days) {
    const prev = (day.city ?? "").trim();
    if (!prev && !lastClean) continue;
    const next = sanitizeDayCity(prev) || lastClean;
    if (!next) continue;
    lastClean = next;
    if (next === prev) continue;
    if (day.focusName && (day.focusName.trim() === prev || overnightPlacesMatch(day.focusName, prev))) {
      day.focusName = next;
    }
    day.city = next;
  }
  for (const hotel of plan.hotels ?? []) {
    if (!hotel.city) continue;
    const next = sanitizeDayCity(hotel.city);
    if (next) hotel.city = next;
  }
  return plan;
}

function flattenDay(day: DayPlan): Activity[] {
  return [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
}

function resyncDayProse(day: DayPlan): void {
  const join = (list: Activity[]) =>
    list
      .map((a) => (a.description ? `${a.name}: ${a.description}` : a.name))
      .filter(Boolean)
      .join("\n\n");
  if (!day.activities) return;
  day.morning = join(day.activities.morning ?? []);
  day.afternoon = join(day.activities.afternoon ?? []);
  day.evening = join(day.activities.evening ?? []);
}

function looksLikeReturnFlight(a: Activity, originIata?: string): boolean {
  const blob = `${a.name ?? ""} ${a.type ?? ""} ${a.transportType ?? ""} ${a.description ?? ""}`;
  if (DOMESTIC_FLIGHT_RE.test(blob)) return false;
  if (RETURN_FLIGHT_RE.test(blob)) return true;
  if (originIata && FLIGHT_WORD_RE.test(blob) && new RegExp(`\\b${escapeRe(originIata)}\\b`, "i").test(blob)) {
    return true;
  }
  return a.transportType === "flight" && /domov|home|povrat|return|international/i.test(blob);
}

function rewriteKnownClocks(text: string | undefined, from: string[], to: string): string | undefined {
  if (!text) return text;
  let out = text;
  for (const raw of from) {
    for (const variant of clockVariants(raw)) {
      if (!variant || variant === to) continue;
      out = out.replace(new RegExp(`\\b${escapeRe(variant)}\\b`, "g"), to);
    }
  }
  return out;
}

function stampActivityClock(a: Activity, clock: string): void {
  const previous = [a.arrivalTime, a.departureTime].filter((v): v is string => Boolean(v?.trim()));
  a.arrivalTime = clock;
  if (a.departureTime?.trim()) a.departureTime = clock;
  a.name = rewriteKnownClocks(a.name, previous, clock) ?? a.name;
  if (a.description) {
    a.description = rewriteKnownClocks(a.description, previous, clock) ?? a.description;
  }
  if (CLOCK_RE.test(a.name) && !a.name.includes(clock)) {
    a.name = a.name.replace(CLOCK_RE, clock);
  }
}

/**
 * Last calendar day's homebound flight clock = ticket `inboundDepart` / `returnTime`.
 * Does not invent a flight row and does not touch domestic hops.
 */
export function stampLastDayReturnFlightClock(
  plan: Pick<AiTripPlan, "days" | "flightContext" | "returnFlightEu" | "originIata"> & {
    flights?: { returnTime?: string; inboundDepart?: string } | unknown;
  },
  extra?: ReturnClockSource,
): boolean {
  const clock = resolveReturnDepartClock(plan, extra);
  const days = [...(plan.days ?? [])].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  const last = days[days.length - 1];
  if (!clock || !last?.activities) return false;

  const items = flattenDay(last);
  const matches = items.filter((a) => looksLikeReturnFlight(a, plan.originIata));
  const target = matches[matches.length - 1];
  if (!target) return false;

  stampActivityClock(target, clock);
  resyncDayProse(last);
  return true;
}

/** City headers + last-day return clock. Idempotent. */
export function sanitizeItineraryPlan<T extends AiTripPlan>(
  plan: T,
  extra?: ReturnClockSource,
): T {
  sanitizePlanDayCities(plan);
  stampLastDayReturnFlightClock(plan, extra);
  return plan;
}
