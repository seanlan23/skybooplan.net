import { targetResidentsForOrigin } from "@/lib/originResidents";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { normalizeIata } from "@/lib/geminiPro.shared";

export type TravelVisaInfo = {
  /** Display label — one country or "Slovenia · Austria · …" when rules match. */
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
  const visaInfo = groupVisaInfoEntries(
    (raw.visa_info ?? []).map((v) => ({
      country: v.country,
      requirement: v.requirement,
      howToApply: v.how_to_apply,
    })),
  );
  return {
    targetResidents: raw.target_residents,
    visaInfo,
    vaccinations: raw.vaccinations?.trim() ?? "",
    estimatedCosts: raw.estimated_costs?.trim() ?? "",
  };
}

/** Merge visa rows that share identical requirement + howToApply text. */
export function groupVisaInfoEntries(entries: TravelVisaInfo[]): TravelVisaInfo[] {
  if (entries.length <= 1) return entries;

  const groups = new Map<
    string,
    { countries: string[]; requirement: string; howToApply: string }
  >();

  for (const entry of entries) {
    const key = `${entry.requirement.trim()}\0${entry.howToApply.trim()}`;
    const hit = groups.get(key);
    if (hit) {
      hit.countries.push(entry.country);
    } else {
      groups.set(key, {
        countries: [entry.country],
        requirement: entry.requirement,
        howToApply: entry.howToApply,
      });
    }
  }

  return [...groups.values()].map((g) => ({
    country: g.countries.join(" · "),
    requirement: g.requirement,
    howToApply: g.howToApply,
  }));
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

function destinationCountry(destinationIata: string | undefined | null): string | null {
  const code = normalizeIata(destinationIata ?? "");
  if (!code) return null;
  return DESTINATION_BY_IATA[code]?.country ?? null;
}

/** Curated visa/health copy when Gemini omits travel_requirements (common on 2.5 Flash). */
export function buildFallbackTravelRequirements(
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
): TravelRequirements | null {
  const targetResidents = targetResidentsForOrigin(originIata);
  if (!targetResidents.length) return null;

  const destCountry = destinationCountry(destinationIata);
  if (destCountry === "TH") {
    const euSchengen = new Set([
      "Slovenia",
      "Austria",
      "Italy",
      "Croatia",
      "Germany",
      "France",
      "Czech Republic",
      "Slovakia",
      "Hungary",
      "Poland",
      "Netherlands",
      "Belgium",
      "Spain",
      "Portugal",
      "Greece",
      "Denmark",
      "Sweden",
      "Finland",
      "Ireland",
      "United Kingdom",
      "Switzerland",
      "Norway",
      "Luxembourg",
      "Romania",
      "Bulgaria",
    ]);

    const euGroup = targetResidents.filter((c) => euSchengen.has(c));
    const otherGroup = targetResidents.filter((c) => !euSchengen.has(c));

    const visaInfo: TravelVisaInfo[] = [];

    if (euGroup.length > 0) {
      visaInfo.push({
        country: euGroup.join(" · "),
        requirement:
          "Državljani EU/Schengen za turistični obisk Tajske ne potrebujejo vize v naprej. Po spremembah od maja 2026 velja 30 dni brezvizumskega bivanja na vstop (začasna shema 60 dni je bila ukinjena). Največ dva brezvizumska vstopa na koledarsko leto. Potni list mora veljati vsaj 6 mesecev ob vstopu. Na meji lahko zahtevajo dokazilo o nastanitvi, povratni let in sredstva za bivanje (okvirno 20 000 THB na osebo ali enakovredno).",
        howToApply:
          "Pred prihodom izpolni brezplačni digitalni obrazec TDAC (Thailand Digital Arrival Card) na uradni strani Thai Immigration. Ob vstopu pokažeš potni list in TDAC. Podaljšanje za dodatnih 30 dni je mogoče pri lokalni imigracijski uradi (približno 1 900 THB) — skupaj največ okoli 60 dni na enem potovanju.",
      });
    }

    for (const country of otherGroup) {
      visaInfo.push({
        country,
        requirement: `Preveri aktualna brezvizumska pravila za potnike s potnim listom ${country} ob vstopu v Tajsko (2026: večina zahodnih držav 30 dni, ne 60). Potni list vsaj 6 mesecev veljaven.`,
        howToApply:
          "Preveri uradne vire Thai MFA ali lokalno veleposlaništvo pred odhodom. TDAC obrazec je obvezen za vse potnike.",
      });
    }

    return {
      targetResidents,
      visaInfo,
      vaccinations:
        "Priporočeno: cepljenje proti hepatitisu A (in B pri daljšem potovanju), posodobljena rutinska cepljenja (MMR, tetanus). Rumena mrličica je obvezna le, če prihajaš iz/endemične države. Antimaliki za Bangkok/Chiang Mai/otoke običajno niso potrebni; za deževno sezono imej repelent in zdravila proti driski.",
      estimatedCosts:
        "Viza za turistični obisk običajno ni potrebna (0 €). Podaljšanje pri imigraciji: približno 1 900 THB (~50 €). Cepljenje proti hepatitisu A: približno 40–80 € na osebo v Sloveniji. TDAC je brezplačen.",
    };
  }

  const destLabel = destinationLabelForRequirements(destinationIata);
  return {
    targetResidents,
    visaInfo: [
      {
        country: targetResidents.join(" · "),
        requirement: `Preveri aktualne vizumske zahteve za potnike s potnimi listi (${targetResidents.join(", ")}) ob vstopu v ${destLabel}. Pravila se pogosto spreminjajo — vedno preveri uradne vire pred odhodom.`,
        howToApply:
          "Slovenija: gov.si (MZV). Avstrija: bmeia.gv.at. Italija: vistoperitalia.it. Hrvaška: mvep.gov.hr. Rezerviraj termin na veleposlaništvu ali uporabi e-vizo, če je na voljo.",
      },
    ],
    vaccinations:
      "Posvetuj se s potovalno medicino 4–6 tednov pred odhodom. Rutinska cepljenja morajo biti posodobljena; dodatna cepljenja so odvisna od regije in načina potovanja.",
    estimatedCosts:
      "Stroški viz in cepljenj so odvisni od destinacije — načrtuj 0–150 € na osebo (e-viza + osnovna cepljenja).",
  };
}

/** AI plan data when present; otherwise curated fallback for the route. */
export function resolveTravelRequirements(
  fromPlan: TravelRequirements | undefined | null,
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
): TravelRequirements | null {
  if (fromPlan?.visaInfo?.length) {
    return {
      targetResidents: fromPlan.targetResidents.length
        ? fromPlan.targetResidents
        : targetResidentsForOrigin(originIata),
      visaInfo: groupVisaInfoEntries(fromPlan.visaInfo),
      vaccinations: fromPlan.vaccinations?.trim() || "",
      estimatedCosts: fromPlan.estimatedCosts?.trim() || "",
    };
  }

  return buildFallbackTravelRequirements(originIata, destinationIata);
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
- visa_info: za države z ENAKIMI pravili EN zapis (country = "Slovenia · Austria · Italy" — ne ponavljaj istega besedila).
  • country — ena ali več držav (enako kot v target_residents, ločeno z " · "),
  • requirement — ali je potrebna viza/eTA/ESTA, cena, veljavnost, ali je vstop brez vizum ob turističnem potovanju,
  • how_to_apply — kje in kako urediti (uradna spletna strana, e-viza, ob pristanku).
- Prilagodi vse za destinacijo ${opts.destinationLabel} (${dest}) in realne pravila za leto 2026.
- TAJSKA 2026: brezvizumski vstop za EU/Schengen je 30 dni (ukinjena začasna shema 60 dni, maj 2026), največ 2 vstopa/leto — NE piši 60 dni.
- vaccinations: priporočena/obvezna cepljenja in zdravstveni nasveti za to destinacijo (Hepatitis A/B, rumena mrličica, antimalariki …).
- estimated_costs: okvirni stroški viz + cepljenj v EUR (npr. "Viza cca. 50 USD, cepljenja 40–80 EUR").
- Ne kopiraj generičnih EU nasvetov — bodi specifičen za vsako državo v visa_info.`;
}
