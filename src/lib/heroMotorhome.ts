import type { AiPlannerContext, AiPlannerSubmit } from "@/components/AiPlannerPreview";
import type { HeroChatCollected } from "@/lib/heroChatFlow";
import {
  heroChatToPlannerPayload,
  resolveDestinationIata,
  resolveOriginIata,
} from "@/lib/heroChatPlanner";

export type HeroMotorhomePlannerPayload = {
  ctx: AiPlannerContext & { language?: string; currency?: "EUR" | "USD" };
  form: AiPlannerSubmit;
};

/** Map hero Avtodom answers → planner context with motorhome ground trip. */
export function motorhomePlannerFromCollected(
  collected: HeroChatCollected,
  language = "sl",
): HeroMotorhomePlannerPayload {
  const { ctx: baseCtx, form: baseForm } = heroChatToPlannerPayload(collected, language);

  const originPlace = (collected.origin ?? "").trim() || baseCtx.originPlace || "Vienna";
  const destinationPlace =
    (collected.destination ?? "").trim() || baseCtx.destinationPlace || "Amsterdam";

  const from = resolveOriginIata(originPlace) || baseCtx.from || "";
  const to = resolveDestinationIata(destinationPlace) || baseCtx.to || "";

  const wishes = [
    `Potovanje z AVTODOMOM (motorhome / campervan) — ne z letalom.`,
    `Začetek: ${originPlace}.`,
    `Cilj / smer: ${destinationPlace}.`,
    `Datumi: ${collected.dates || `${baseCtx.departDate} – ${baseCtx.returnDate ?? ""}`}.`,
    collected.passengers?.trim() || undefined,
    `Vključi: dnevne etape vožnje, kje parkirati / kje ne sme (mestna središča), predlagane kampe / RV parke, okvirne cene kampov in goriva, napotke za avtodom.`,
  ]
    .filter(Boolean)
    .join(" ");

  const ctx: AiPlannerContext & { language?: string; currency?: "EUR" | "USD" } = {
    ...baseCtx,
    from,
    to,
    originPlace,
    destinationPlace,
    groundTransportMode: "motorhome",
    language,
    currency: "EUR",
  };

  const form: AiPlannerSubmit = {
    ...baseForm,
    pace: "relaxed",
    budget: baseForm.budget ?? "standard",
    wishes,
    customPrompt: wishes,
    tags: Array.from(new Set([...(baseForm.tags ?? []), "Najem avtomobila"])),
    wishTags: baseForm.wishTags ?? [],
  };

  return { ctx, form };
}

export function buildHeroMotorhomeSearchQuery(data: HeroChatCollected): string {
  const parts = ["Avtodom"];
  if (data.origin?.trim()) parts.push(`iz ${data.origin.trim()}`);
  if (data.destination?.trim()) parts.push(`proti ${data.destination.trim()}`);
  if (data.dates?.trim()) parts.push(`termin ${data.dates.trim()}`);
  if (data.passengers?.trim()) parts.push(data.passengers.trim());
  return parts.join(", ");
}
