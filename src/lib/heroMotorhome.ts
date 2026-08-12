import type { AiPlannerContext, AiPlannerSubmit } from "@/components/AiPlannerPreview";
import type { HeroChatCollected } from "@/lib/heroChatFlow";
import {
  heroChatToPlannerPayload,
  resolveDestinationIata,
  resolveOriginIata,
} from "@/lib/heroChatPlanner";
import { sanitizeGroundDestinationPlace } from "@/lib/groundTransport";
import {
  formatPlannerInterests,
  parsePlannerInterestKeys,
} from "@/lib/plannerInterests";

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
  const interestKeys = parsePlannerInterestKeys(collected.priorities ?? []);
  const interestLabels = interestKeys.length
    ? formatPlannerInterests(interestKeys, language)
    : "";

  const priorityLine =
    interestLabels &&
    (lang === "sl"
      ? `Prioritete: ${interestLabels}. Teži k obali/gore/naravi/jezerom — izogibaj se gostim mestnim jedrom (avtodom ni za centre).`
      : lang === "de"
        ? `Prioritäten: ${interestLabels}. Gewichte Küste/Berge/Natur/Seen — meide dichte Stadtzentren (Wohnmobil ungeeignet).`
        : lang === "fr"
          ? `Priorités: ${interestLabels}. Favoriser côte/montagnes/nature/lacs — éviter les centres-villes denses (camping-car inadapté).`
          : lang === "it"
            ? `Priorità: ${interestLabels}. Privilegia costa/montagne/natura/laghi — evita i centri cittadini densi (camper inadatto).`
            : lang === "es"
              ? `Prioridades: ${interestLabels}. Prioriza costa/montañas/naturaleza/lagos — evita centros urbanos densos (autocaravana no apta).`
              : `Priorities: ${interestLabels}. Favour coast/mountains/nature/lakes — avoid dense city centres (motorhome-unfriendly).`);

  const mustVisit = collected.locationWishes?.trim();
  const mustVisitLine = mustVisit
    ? lang === "sl"
      ? `Mesta / znamenitosti / želje (vključi v pot, kjer smiselno; lahko dopolni z novimi predlogi): ${mustVisit}.`
      : lang === "de"
        ? `Orte / Sehenswürdigkeiten / Wünsche (wo sinnvoll einplanen; gerne mit neuen Vorschlägen ergänzen): ${mustVisit}.`
        : lang === "fr"
          ? `Lieux / sites / souhaits (intégrer sur l'itinéraire si pertinent ; compléter avec de nouvelles idées): ${mustVisit}.`
          : lang === "it"
            ? `Luoghi / attrazioni / desideri (includili nel percorso dove ha senso; integra con nuove proposte): ${mustVisit}.`
            : lang === "es"
              ? `Lugares / atracciones / deseos (inclúyelos en la ruta donde tenga sentido; completa con nuevas ideas): ${mustVisit}.`
              : `Places / sights / wishes (include on the route where sensible; feel free to add new suggestions too): ${mustVisit}.`
    : "";

  if (lang === "sl") {
    return [
      `Potovanje z AVTODOMOM (motorhome / campervan) — ne z letalom.`,
      `Začetek: ${originPlace}.`,
      `Cilj / smer: ${destinationPlace}.`,
      `Datumi: ${dates}.`,
      pax,
      priorityLine,
      mustVisitLine,
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
      priorityLine,
      mustVisitLine,
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
      priorityLine,
      mustVisitLine,
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
      priorityLine,
      mustVisitLine,
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
      priorityLine,
      mustVisitLine,
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
    priorityLine,
    mustVisitLine,
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
  const destinationPlace = sanitizeGroundDestinationPlace(
    (collected.destination ?? "").trim() || baseCtx.destinationPlace || "Amsterdam",
  );

  const from = resolveOriginIata(originPlace) || baseCtx.from || "";
  const to = resolveDestinationIata(destinationPlace) || baseCtx.to || "";

  const wishes = motorhomeWishes(collected, originPlace, destinationPlace, language, baseCtx);
  const interestKeys = parsePlannerInterestKeys(collected.priorities ?? []);

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
    tags: interestKeys,
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
  const labels = formatPlannerInterests(data.priorities ?? [], "en");
  if (labels) parts.push(`priorities: ${labels}`);
  if (data.locationWishes?.trim()) parts.push(`wishes: ${data.locationWishes.trim()}`);
  return parts.join(", ");
}
