import { targetResidentsForOrigin } from "@/lib/originResidents";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { normalizeIata } from "@/lib/geminiPro.shared";

export type TravelVisaInfo = {
  country: string;
  requirement: string;
  howToApply: string;
};

export type TravelRequirements = {
  targetResidents: string[];
  visaInfo: TravelVisaInfo[];
  vaccinations: string;
  estimatedCosts: string;
};

export type TravelRequirementsJson = {
  target_residents: string[];
  visa_info: Array<{
    country: string;
    requirement: string;
    how_to_apply: string;
  }>;
  vaccinations: string;
  estimated_costs: string;
};

export function mapTravelRequirementsFromJson(
  raw: TravelRequirementsJson | undefined | null,
): TravelRequirements | undefined {
  if (!raw?.target_residents?.length) return undefined;
  return {
    targetResidents: raw.target_residents,
    visaInfo: (raw.visa_info ?? []).map((v) => ({
      country: v.country,
      requirement: v.requirement,
      howToApply: v.how_to_apply,
    })),
    vaccinations: raw.vaccinations?.trim() ?? "",
    estimatedCosts: raw.estimated_costs?.trim() ?? "",
  };
}

/** Pre-plan hint: resident countries only (full visa/vaccination data comes from AI plan). */
export function previewTravelRequirements(
  originIata: string | undefined | null,
  destinationIata?: string | undefined | null,
): Pick<TravelRequirements, "targetResidents"> | null {
  const residents = targetResidentsForOrigin(originIata);
  if (!residents.length) return null;
  return { targetResidents: residents };
}

export function destinationLabelForRequirements(destinationIata: string | undefined): string {
  const code = normalizeIata(destinationIata ?? "");
  if (!code) return "destinacija";
  const meta = DESTINATION_BY_IATA[code];
  if (!meta) return code;
  return `${meta.name} (${code})`;
}

/** Prompt block injected into Gemini trip-plan generation. */
export function travelRequirementsPromptBlock(opts: {
  originIata: string;
  destinationIata: string;
  destinationLabel: string;
}): string {
  const residents = targetResidentsForOrigin(opts.originIata);
  if (!residents.length) return "";

  const dest = destinationLabelForRequirements(opts.destinationIata);
  const residentList = residents.map((c) => `"${c}"`).join(", ");

  return `
PAMETNI POTovalNI POGOJI (travel_requirements — obvezno v JSON):
- Dodaj top-level objekt travel_requirements z natančno to strukturo.
- target_residents: natančno [${residentList}] — države, katerih rezidenti najpogosteje letijo z izhodnega letališča ${opts.originIata}.
- visa_info: za VSAKO državo iz target_residents ločen zapis:
  • country — ime države (enako kot v target_residents),
  • requirement — ali je potrebna viza/eTA/ESTA, cena, veljavnost, ali je vstop brez vizum ob turističnem potovanju,
  • how_to_apply — kje in kako urediti (uradna spletna strana, e-viza, ob pristanku).
- Prilagodi vse za destinacijo ${opts.destinationLabel} (${dest}) in realne pravila za leto 2025/2026.
- vaccinations: priporočena/obvezna cepljenja in zdravstveni nasveti za to destinacijo (Hepatitis A/B, rumena mrličica, antimalariki …).
- estimated_costs: okvirni stroški viz + cepljenj v EUR (npr. "Viza cca. 50 USD, cepljenja 40–80 EUR").
- Ne kopiraj generičnih EU nasvetov — bodi specifičen za vsako državo v visa_info.`;
}
