import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

/** Places that justify temple/wat dress-code copy. */
const TEMPLE_PLACE_RE =
  /\bwat\b|\btemple\b|templj|svetišč|pagoda|\bshrine\b|grand palace|wat pho|wat arun|meiji jingu|doi suthep|angkor|borobudur/i;

/** Culture-leak sentences that belong on a temple day, not on NYC / European sightseeing. */
const TEMPLE_CULTURE_RE =
  /oblačenj\w*\s+v\s+templj|kodeks oblačenja v (?:svetišč|templj)|v templju pokrij|cover (?:your )?shoulders at (?:the )?temple|temple dress|shoes off at (?:the )?temple|sezuj čevlje.{0,40}templj|bare shoulders.{0,40}(?:temple|wat|templj)|no shorts in (?:the )?temple|templj.{0,24}ramena|tempelj je zaprt|the temple is closed/i;

const GENERIC_FILLER_RE =
  /^(?:bodi previden|uporabi zdravo pamet|be careful|use common sense)[.!]?$/i;

/** Day copy that implies US-style tipping — not the Thai/Japan "no tipping" template. */
const US_TIP_CONTEXT_RE =
  /broadway|harlem|gospel|\bthe met\b|manhattan|new york|\bnyc\b|napitnin\w*.{0,16}1[58]\s*[–-]?\s*20|tip(?:ping)?\s*1[58]/i;
const NO_TIPPING_TEMPLATE_RE =
  /napitnine niso pričakovane|tipping is not (?:expected|customary)|no tipping is (?:expected|customary)/i;

function splitTipUnits(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+|;\s+|•\s+/)
    .map((s) => s.replace(/^[-–—]\s*/, "").trim())
    .filter(Boolean);
}

function joinTipUnits(units: string[]): string {
  return units
    .map((u) => u.replace(/[.!?]+$/, "").trim())
    .filter(Boolean)
    .map((u) => (/[.!?]$/.test(u) ? u : `${u}.`))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tipUnitKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9čšžćđäöüáéíóú\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

export function dayLocalTipsContext(day: {
  city?: string;
  focusName?: string;
  title?: string;
  morning?: string;
  afternoon?: string;
  evening?: string;
  activities?: {
    morning?: Array<{ name?: string; description?: string }>;
    afternoon?: Array<{ name?: string; description?: string }>;
    evening?: Array<{ name?: string; description?: string }>;
  };
}): string {
  const bits: string[] = [
    day.city ?? "",
    day.focusName ?? "",
    day.title ?? "",
    day.morning ?? "",
    day.afternoon ?? "",
    day.evening ?? "",
  ];
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    for (const a of day.activities?.[slot] ?? []) {
      bits.push(a.name ?? "", a.description ?? "");
    }
  }
  return bits.join(" ");
}

/** Drop temple-dress / wat-scam leftovers when the day never visits a temple. */
export function scrubDayLocalTips(tips: string, dayContext: string): string {
  if (!tips.trim()) return "";
  const allowTemple = TEMPLE_PLACE_RE.test(dayContext);
  const usTipContext = US_TIP_CONTEXT_RE.test(dayContext);
  const kept = splitTipUnits(tips).filter((unit) => {
    if (GENERIC_FILLER_RE.test(unit.trim())) return false;
    if (!allowTemple && TEMPLE_CULTURE_RE.test(unit)) return false;
    if (usTipContext && NO_TIPPING_TEMPLATE_RE.test(unit)) return false;
    return true;
  });
  return joinTipUnits(kept);
}

/**
 * Unique 2–3 place-bound tips per day: strip mismatched culture copy and
 * drop sentences already used on an earlier day.
 */
export function scrubLocalTipsOnPlan(plan: AiTripPlan): number {
  let fixed = 0;
  const seen = new Set<string>();
  const seenParagraphs = new Set<string>();
  for (const day of plan.days ?? []) {
    const raw = day.localTips?.trim() ?? "";
    if (!raw) continue;
    const ctx = dayLocalTipsContext(day);
    let next = scrubDayLocalTips(raw, ctx);
    const paraKey = tipUnitKey(next);
    if (paraKey && seenParagraphs.has(paraKey)) {
      next = "";
    } else if (paraKey) {
      seenParagraphs.add(paraKey);
      const units = splitTipUnits(next).filter((unit) => {
        const key = tipUnitKey(unit);
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      next = joinTipUnits(units);
    }
    if (next !== raw) {
      day.localTips = next || undefined;
      fixed += 1;
    }
  }
  return fixed;
}

export function scrubLocalTipsOnPdfDays(
  days: Array<{
    city?: string;
    title?: string;
    localTips?: string;
    slots?: Array<{ items?: Array<{ title?: string; description?: string }> }>;
  }>,
): void {
  const seen = new Set<string>();
  const seenParagraphs = new Set<string>();
  for (const day of days) {
    const raw = day.localTips?.trim() ?? "";
    if (!raw) continue;
    const ctx = [
      day.city ?? "",
      day.title ?? "",
      ...(day.slots ?? []).flatMap((s) =>
        (s.items ?? []).map((it) => `${it.title ?? ""} ${it.description ?? ""}`),
      ),
    ].join(" ");
    let next = scrubDayLocalTips(raw, ctx);
    const paraKey = tipUnitKey(next);
    if (paraKey && seenParagraphs.has(paraKey)) {
      next = "";
    } else if (paraKey) {
      seenParagraphs.add(paraKey);
      const units = splitTipUnits(next).filter((unit) => {
        const key = tipUnitKey(unit);
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      next = joinTipUnits(units);
    }
    day.localTips = next || undefined;
  }
}
