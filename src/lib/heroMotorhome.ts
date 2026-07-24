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

function motorhomeWishes(
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

  if (lang === "sl") {
    return [
      `Potovanje z AVTODOMOM (motorhome / campervan) — ne z letalom.`,
      `Začetek: ${originPlace}.`,
      `Cilj / smer: ${destinationPlace}.`,
      `Datumi: ${dates}.`,
      pax,
      `Vključi: dnevne etape vožnje, kje parkirati / kje ne sme (mestna središča), predlagane kampe / RV parke z imeni, okvirne cene kampov in goriva, napotke za avtodom. Vsak dan jasno poimenuj kamp za nočitev.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (lang === "de") {
    return [
      `Wohnmobil-Reise (motorhome / campervan) — kein Flug.`,
      `Start: ${originPlace}.`,
      `Ziel / Richtung: ${destinationPlace}.`,
      `Daten: ${dates}.`,
      pax,
      `Enthalten: Tagesetappen, Parkregeln (keine Innenstadt), Campingplätze / RV Parks mit Namen, ungefähre Camping- und Kraftstoffkosten, Wohnmobil-Tipps. Jeden Tag klar den Übernachtungs-Camp nennen.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (lang === "fr") {
    return [
      `Voyage en camping-car (motorhome) — pas d'avion.`,
      `Départ: ${originPlace}.`,
      `Destination: ${destinationPlace}.`,
      `Dates: ${dates}.`,
      pax,
      `Inclure: étapes journalières, où stationner (pas en centre-ville), campings / aires avec noms, coûts estimés camping et carburant, conseils camping-car. Nommer clairement le camping de chaque nuit.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (lang === "it") {
    return [
      `Viaggio in camper (motorhome) — niente aereo.`,
      `Partenza: ${originPlace}.`,
      `Destinazione: ${destinationPlace}.`,
      `Date: ${dates}.`,
      pax,
      `Includere: tappe giornaliere, dove parcheggiare (non in centro), campeggi / sosta con nomi, costi stimati campeggio e carburante, consigli camper. Nomina chiaramente il campeggio di ogni notte.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (lang === "es") {
    return [
      `Viaje en autocaravana (motorhome) — sin avión.`,
      `Salida: ${originPlace}.`,
      `Destino: ${destinationPlace}.`,
      `Fechas: ${dates}.`,
      pax,
      `Incluye: etapas diarias, dónde aparcar (no en el centro), campings / áreas con nombres, costes estimados de camping y combustible, consejos de autocaravana. Nombra claramente el camping de cada noche.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Motorhome / campervan road trip — not by plane.`,
    `Start: ${originPlace}.`,
    `Destination / direction: ${destinationPlace}.`,
    `Dates: ${dates}.`,
    pax,
    `Include: daily driving stages, where to park / where not (city centres), suggested campgrounds / RV parks with names, rough camp + fuel costs, motorhome tips. Clearly name the overnight camp each day.`,
  ]
    .filter(Boolean)
    .join(" ");
}

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

  const wishes = motorhomeWishes(collected, originPlace, destinationPlace, language, baseCtx);

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
  const parts = ["Motorhome"];
  if (data.origin?.trim()) parts.push(`from ${data.origin.trim()}`);
  if (data.destination?.trim()) parts.push(`to ${data.destination.trim()}`);
  if (data.dates?.trim()) parts.push(data.dates.trim());
  if (data.passengers?.trim()) parts.push(data.passengers.trim());
  return parts.join(", ");
}
