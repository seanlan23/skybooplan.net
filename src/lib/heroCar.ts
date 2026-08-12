import type { AiPlannerContext, AiPlannerSubmit } from "@/components/AiPlannerPreview";
import type { HeroChatCollected } from "@/lib/heroChatFlow";
import {
  heroChatToPlannerPayload,
  resolveDestinationIata,
  resolveOriginIata,
} from "@/lib/heroChatPlanner";
import {
  formatPlannerInterests,
  parsePlannerInterestKeys,
} from "@/lib/plannerInterests";

export type HeroCarPlannerPayload = {
  ctx: AiPlannerContext & { language?: string; currency?: "EUR" | "USD" };
  form: AiPlannerSubmit;
};

function carWishes(
  collected: HeroChatCollected,
  originPlace: string,
  destinationPlace: string,
  language: string,
  baseCtx: AiPlannerContext,
): string {
  const dates =
    collected.dates || `${baseCtx.departDate} – ${baseCtx.returnDate ?? ""}`;
  const pax = collected.passengers?.trim();
  const lang = language.slice(0, 2).toLowerCase();
  const interestKeys = parsePlannerInterestKeys(collected.priorities ?? []);
  const interestLabels = interestKeys.length
    ? formatPlannerInterests(interestKeys, language)
    : "";

  const priorityLine =
    interestLabels &&
    (lang === "sl"
      ? `Prioritete: ${interestLabels}.`
      : lang === "de"
        ? `Prioritäten: ${interestLabels}.`
        : `Priorities: ${interestLabels}.`);

  const mustVisit = collected.locationWishes?.trim();
  const mustVisitLine = mustVisit
    ? lang === "sl"
      ? `Mesta / znamenitosti / želje (vključi v pot, kjer smiselno; lahko dopolni z novimi predlogi): ${mustVisit}.`
      : lang === "de"
        ? `Orte / Sehenswürdigkeiten / Wünsche (wo sinnvoll einplanen; gerne mit neuen Vorschlägen ergänzen): ${mustVisit}.`
        : `Places / sights / wishes (include on the route where sensible; feel free to add new suggestions too): ${mustVisit}.`
    : "";

  if (lang === "sl") {
    return [
      `Potovanje z AVTOM (road trip) — ne z letalom, ne z avtodomom.`,
      `Začetek: ${originPlace}.`,
      `Cilj / smer: ${destinationPlace}.`,
      `Datumi: ${dates}.`,
      pax,
      priorityLine,
      mustVisitLine,
      `Nočitve = hoteli v mestih vsak večer (Booking). PREPOVEDANO: kampi, RV parki, sosta, spanje v avtu.`,
      `Vključi: dnevne etape vožnje, okvirne cene goriva in hotelov, konkretna mesta za nočitev.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (lang === "de") {
    return [
      `Autoreise (Roadtrip) — kein Flug, kein Wohnmobil.`,
      `Start: ${originPlace}.`,
      `Ziel / Richtung: ${destinationPlace}.`,
      `Daten: ${dates}.`,
      pax,
      priorityLine,
      mustVisitLine,
      `Übernachtungen = Hotels in Städten jede Nacht (Booking). VERBOTEN: Camping, RV Parks, Sosta, Schlafen im Auto.`,
      `Enthalten: Tagesetappen, ungefähre Kraftstoff- und Hotelkosten, konkrete Übernachtungsstädte.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Car road trip — not by plane, not by motorhome.`,
    `Start: ${originPlace}.`,
    `Destination / direction: ${destinationPlace}.`,
    `Dates: ${dates}.`,
    pax,
    priorityLine,
    mustVisitLine,
    `Overnights = hotels in cities every night (Booking). FORBIDDEN: camps, RV parks, sosta, sleeping in the car.`,
    `Include: daily driving stages, rough fuel and hotel costs, clear overnight cities.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Map hero Car answers → planner context with car ground trip + hotels. */
export function carPlannerFromCollected(
  collected: HeroChatCollected,
  language = "sl",
): HeroCarPlannerPayload {
  const { ctx: baseCtx, form: baseForm } = heroChatToPlannerPayload(collected, language);

  const originPlace = (collected.origin ?? "").trim() || baseCtx.originPlace || "Vienna";
  const destinationPlace =
    (collected.destination ?? "").trim() || baseCtx.destinationPlace || "Amsterdam";

  const from = resolveOriginIata(originPlace) || baseCtx.from || "";
  const to = resolveDestinationIata(destinationPlace) || baseCtx.to || "";

  const wishes = carWishes(collected, originPlace, destinationPlace, language, baseCtx);
  const interestKeys = parsePlannerInterestKeys(collected.priorities ?? []);

  const ctx: AiPlannerContext & { language?: string; currency?: "EUR" | "USD" } = {
    ...baseCtx,
    from,
    to,
    originPlace,
    destinationPlace,
    groundTransportMode: "car",
    language,
    currency: "EUR",
  };

  const form: AiPlannerSubmit = {
    ...baseForm,
    pace: "relaxed",
    budget: baseForm.budget ?? "standard",
    wishes,
    customPrompt: wishes,
    tags: interestKeys,
    wishTags: baseForm.wishTags ?? [],
  };

  return { ctx, form };
}

export function buildHeroCarSearchQuery(data: HeroChatCollected): string {
  const parts = ["Car road trip"];
  if (data.origin?.trim()) parts.push(`from ${data.origin.trim()}`);
  if (data.destination?.trim()) parts.push(`to ${data.destination.trim()}`);
  if (data.dates?.trim()) parts.push(data.dates.trim());
  if (data.passengers?.trim()) parts.push(data.passengers.trim());
  const labels = formatPlannerInterests(data.priorities ?? [], "en");
  if (labels) parts.push(`priorities: ${labels}`);
  if (data.locationWishes?.trim()) parts.push(`wishes: ${data.locationWishes.trim()}`);
  return parts.join(", ");
}
