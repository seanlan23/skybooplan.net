import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { looksMostlyEnglish } from "@/lib/localizeTravelCopy";
import { isPaceLightDay, isPaceProgramActivity } from "@/lib/paceGuard";
import { normalizePlanLangCode } from "@/lib/planLanguages";

/** Minimum visible title/description length before PDF or a stay-day card. */
export const MIN_SLOT_COPY_CHARS = 10;

export type RouteMatrixBase = {
  city: string;
  startDay: number;
  endDay: number;
  startDate?: string;
  endDate?: string;
  nights: number;
  transferToNext?: string;
};

export type RouteMatrix = {
  bases: RouteMatrixBase[];
};

function cityKey(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

function dayCity(day: DayPlan): string {
  return (day.city || day.focusName || "").trim();
}

function isTransportActivity(a: Activity): boolean {
  if (a.type === "TRANSPORT" || a.transportType) return true;
  const t = `${a.name ?? ""} ${a.description ?? ""}`;
  return /→|->/.test(t) && /\b(let|flight|trajekt|ferry|vlak|train|prevoz|transfer)\b/i.test(t);
}

function hopLabel(day: DayPlan): string | undefined {
  const acts = [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
  const hop = acts.find(isTransportActivity);
  if (!hop) return undefined;
  const blob = `${hop.name ?? ""} ${hop.description ?? ""}`.trim();
  return blob.slice(0, 120) || undefined;
}

/** Consecutive sleep cities + dates + the hop that leaves each base. */
export function extractRouteMatrix(plan: Pick<AiTripPlan, "days">): RouteMatrix {
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  const bases: RouteMatrixBase[] = [];
  for (const d of days) {
    const city = dayCity(d);
    if (!city) continue;
    const last = bases[bases.length - 1];
    if (last && cityKey(last.city) === cityKey(city)) {
      last.endDay = d.day;
      last.endDate = d.date;
      last.nights = last.endDay - last.startDay + 1;
      continue;
    }
    if (last) last.transferToNext = hopLabel(d) ?? last.transferToNext;
    bases.push({
      city,
      startDay: d.day,
      endDay: d.day,
      startDate: d.date,
      endDate: d.date,
      nights: 1,
    });
  }
  return { bases };
}

/** Locked Phase-1 matrix for continuation batches. No destination ifs. */
export function formatLockedRouteMatrix(
  matrix: RouteMatrix,
  slo: boolean,
): string {
  if (!matrix.bases.length) return "";
  const title = slo
    ? "=== ZAKLENJENA MATRIKA BAZ (FAZA 1 — mest in nočitev NE spreminjaj) ==="
    : "=== LOCKED ROUTE MATRIX (PHASE 1 — do not change cities or nights) ===";
  const lines = matrix.bases.map((b) => {
    const dates =
      b.startDate && b.endDate ? ` · ${b.startDate}–${b.endDate}` : "";
    const hop = b.transferToNext
      ? slo
        ? ` · prevoz: ${b.transferToNext}`
        : ` · transfer: ${b.transferToNext}`
      : "";
    return `- ${slo ? "Dan" : "Day"} ${b.startDay}–${b.endDay} · ${b.city}${dates} · ${b.nights}${slo ? " noč" : " night"}${hop}`;
  });
  const rule = slo
    ? "Ogledi so SAMO v območju baze, kjer tisti dan spiš — ne v drugem kraju istega otoka ali države."
    : "Sights belong only to the base you sleep in that day — not another town on the same island or country.";
  return [title, rule, ...lines].join("\n");
}

export function twoStagePromptBlock(opts: {
  phase: 1 | 2;
  slo: boolean;
}): string {
  if (opts.phase === 1) {
    return opts.slo
      ? `=== DVO-STOPENJSKI NAČRT — FAZA 1 (matrika baz) ===
- Najprej zakleni itinerar[]: mesto, dnevi/datumi, nočitve, transfer do naslednje baze.
- Šele nato izpolni days[] za TA razpon. Ne začenjaj z restavracijami, če baze niso zaklenjene.
- Ogledi ∈ baza, kjer spiš. Drug kraj istega otoka/države = napačen dan.`
      : `=== TWO-STAGE PLAN — PHASE 1 (route matrix) ===
- First lock itinerar[]: city, day/dates, nights, transfer to the next base.
- Only then fill days[] for THIS window. Do not start with restaurants if bases are unlocked.
- Sights ∈ the sleep base. Another town on the same island/country = the wrong day.`;
  }
  return opts.slo
    ? `=== DVO-STOPENJSKI NAČRT — FAZA 2 (dnevi v chunkih) ===
- Sledi zaklenjeni matriki. Ne prestavljaj nočitev.
- Poln dan v bazi: vsak timeSlot (dopoldan/popoldan/večer) ima title + description (cel stavek, ≥10 znakov) + estimatedCostEur.
- Transfer/prihod/odhod sme imeti prazen slot.
- Celotno besedilo v jeziku languageCode — brez mešanja angleščine.
- PREPOVEDANO: "..." / "…" / prazni opisi / Morning in … / Visit ….`
    : `=== TWO-STAGE PLAN — PHASE 2 (chunked days) ===
- Follow the locked matrix. Do not move nights.
- A full base day: each timeSlot (morning/afternoon/evening) has title + description (complete sentence, ≥10 chars) + estimatedCostEur.
- Transfer/arrival/departure may leave a slot empty.
- All copy in languageCode — no English mix.
- FORBIDDEN: "..." / "…" / empty descriptions / Morning in … / Visit ….`;
}

export function isRenderableSlotCopy(
  title: string,
  description?: string,
  opts?: { lang?: string; allowEmptyDescription?: boolean },
): boolean {
  const name = title.trim();
  if (name.length < MIN_SLOT_COPY_CHARS) return false;
  if (/…|\.\.\./.test(name)) return false;
  if (
    /^(morning|afternoon|evening|dopoldn[ea]|popoldn[ea])\s+in\s+/i.test(name) ||
    (/^(visit|obišči|obiscite)\s+\w/i.test(name) &&
      (description ?? "").trim().length < 40) ||
    /^(city exploration|snorkeling trip|dan\s+\d+)$/i.test(name)
  ) {
    return false;
  }
  const lang = normalizePlanLangCode(opts?.lang);
  if (lang === "sl" && looksMostlyEnglish(name)) return false;
  const desc = (description ?? "").trim();
  if (!desc) return Boolean(opts?.allowEmptyDescription);
  // Light / transport days: a short real description ("Stojnice.") is enough.
  if (desc.length < MIN_SLOT_COPY_CHARS) return Boolean(opts?.allowEmptyDescription);
  if (/…|\.\.\./.test(desc)) return false;
  return true;
}

function stripDayProse(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (t.length < MIN_SLOT_COPY_CHARS || /…|\.\.\./.test(t)) return "";
  return raw ?? "";
}

/** Drop titles/descriptions that would print as stubs in the PDF. */
export function stripUnrenderablePlanCopy(plan: AiTripPlan): number {
  const lang = plan.contentLanguage;
  let removed = 0;
  const totalDays = plan.days?.length ?? 0;
  for (const day of plan.days ?? []) {
    const light = isPaceLightDay(day, { arrivalDay: 1, totalDays });
    for (const prose of ["morning", "afternoon", "evening", "title"] as const) {
      const next = stripDayProse(day[prose]);
      if (next !== (day[prose] ?? "")) {
        if (prose === "title" && day.city && next === "") {
          day.title = day.city;
        } else {
          day[prose] = next;
        }
        removed += 1;
      }
    }
    if (!day.activities) continue;
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      const list = day.activities[slot] ?? [];
      const next = list.filter((a) => {
        const transport = isTransportActivity(a);
        const ok = isRenderableSlotCopy(a.name ?? "", a.description, {
          lang,
          allowEmptyDescription: transport || light || !isPaceProgramActivity(a),
        });
        if (!ok) removed += 1;
        return ok;
      });
      if (next.length !== list.length) day.activities[slot] = next;
    }
  }
  return removed;
}

/** Stay-day programme that is still a stub after generation. */
export function findIncompleteStaySlots(
  plan: AiTripPlan,
): Array<{ day: number; slot: string; name: string }> {
  const lang = plan.contentLanguage;
  const totalDays = plan.days?.length ?? 0;
  const out: Array<{ day: number; slot: string; name: string }> = [];
  for (const day of plan.days ?? []) {
    if (day.inFlightDay || day.category === "transport") continue;
    if (isPaceLightDay(day, { arrivalDay: 1, totalDays })) continue;
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const a of day.activities?.[slot] ?? []) {
        if (!isPaceProgramActivity(a) || isTransportActivity(a)) continue;
        if (
          !isRenderableSlotCopy(a.name ?? "", a.description, {
            lang,
            allowEmptyDescription: false,
          })
        ) {
          out.push({ day: day.day, slot, name: a.name ?? "" });
        }
      }
    }
  }
  return out;
}
