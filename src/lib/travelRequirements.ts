import { targetResidentsForOrigin } from "@/lib/originResidents";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { normalizeIata } from "@/lib/geminiPro.shared";

export type TravelVisaInfo = {
  /** Display label — "EU" when Schengen/EU rules match, else country names. */
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

/** Countries that share the same Thailand / Schengen-style entry rules for our fallbacks. */
export const EU_SCHENGEN_RESIDENTS = new Set([
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
  "EU",
  "EU / Schengen",
  "Schengen",
]);

function isEuResident(name: string): boolean {
  const trimmed = name.trim();
  if (EU_SCHENGEN_RESIDENTS.has(trimmed)) return true;
  // "Slovenia · Austria" style labels from older plans
  if (trimmed.includes("·")) {
    return trimmed
      .split("·")
      .map((p) => p.trim())
      .every((p) => EU_SCHENGEN_RESIDENTS.has(p));
  }
  return /^eu\b/i.test(trimmed) || /schengen/i.test(trimmed);
}

/** Collapse Slovenia/Austria/… pills into a single "EU" chip. */
export function collapseResidentLabels(residents: string[]): string[] {
  const eu: string[] = [];
  const other: string[] = [];
  for (const r of residents) {
    if (isEuResident(r)) eu.push(r);
    else other.push(r);
  }
  if (eu.length === 0) return [...residents];
  if (other.length === 0) return ["EU"];
  return ["EU", ...other];
}

function euVisaCountryLabel(lang: string): string {
  return lang === "sl" ? "EU / Schengen" : "EU / Schengen";
}

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
    targetResidents: collapseResidentLabels(raw.target_residents),
    visaInfo,
    vaccinations: raw.vaccinations?.trim() ?? "",
    estimatedCosts: raw.estimated_costs?.trim() ?? "",
  };
}

/** Merge visa rows that share identical requirement + howToApply text. */
export function groupVisaInfoEntries(entries: TravelVisaInfo[], lang = "en"): TravelVisaInfo[] {
  if (entries.length === 0) return entries;

  const groups = new Map<
    string,
    { countries: string[]; requirement: string; howToApply: string }
  >();

  for (const entry of entries) {
    const key = `${entry.requirement.trim()}\0${entry.howToApply.trim()}`;
    const hit = groups.get(key);
    const parts = entry.country.includes("·")
      ? entry.country.split("·").map((p) => p.trim())
      : [entry.country.trim()];
    if (hit) {
      hit.countries.push(...parts);
    } else {
      groups.set(key, {
        countries: [...parts],
        requirement: entry.requirement,
        howToApply: entry.howToApply,
      });
    }
  }

  return [...groups.values()].map((g) => {
    const unique = [...new Set(g.countries.filter(Boolean))];
    const allEu = unique.length > 0 && unique.every((c) => isEuResident(c));
    return {
      country: allEu ? euVisaCountryLabel(lang) : unique.join(" · "),
      requirement: g.requirement,
      howToApply: g.howToApply,
    };
  });
}

/** Pre-plan hint: resident countries only (full visa/vaccination data comes from AI plan). */
export function previewTravelRequirements(
  originIata: string | undefined | null,
  destinationIata?: string | undefined | null,
): Pick<TravelRequirements, "targetResidents"> | null {
  void destinationIata;
  const residents = collapseResidentLabels(targetResidentsForOrigin(originIata));
  if (!residents.length) return null;
  return { targetResidents: residents };
}

function destinationCountry(destinationIata: string | undefined | null): string | null {
  const code = normalizeIata(destinationIata ?? "");
  if (!code) return null;
  return DESTINATION_BY_IATA[code]?.country ?? null;
}

function looksSlovenianTravelCopy(text: string): boolean {
  return /\b(državljan|brezvizum|potni list|cepljenje|priporočeno|preveri|imigracij)/i.test(
    text,
  );
}

type LangCode = string;

function thailandFallback(lang: LangCode): Omit<TravelRequirements, "targetResidents" | "visaInfo"> & {
  visaRequirement: string;
  howToApply: string;
} {
  if (lang === "sl") {
    return {
      visaRequirement:
        "Državljani EU/Schengen za turistični obisk Tajske ne potrebujejo vize vnaprej. Od maja 2026 velja 30 dni brezvizumskega bivanja na vstop (začasna shema 60 dni je bila ukinjena). Največ dva brezvizumska vstopa na koledarsko leto. Potni list mora veljati vsaj 6 mesecev ob vstopu. Na meji lahko zahtevajo dokazilo o nastanitvi, povratni let in sredstva za bivanje (okvirno 20 000 THB na osebo ali enakovredno).",
      howToApply:
        "Pred prihodom izpolni brezplačni digitalni obrazec TDAC (Thailand Digital Arrival Card) na uradni strani Thai Immigration. Ob vstopu pokažeš potni list in TDAC. Podaljšanje za dodatnih 30 dni je mogoče pri lokalni imigracijski uradi (približno 1 900 THB) — skupaj največ okoli 60 dni na enem potovanju.",
      vaccinations:
        "Priporočeno: cepljenje proti hepatitisu A (in B pri daljšem potovanju), posodobljena rutinska cepljenja (MMR, tetanus). Rumena mrličica je obvezna le, če prihajaš iz endemične države. Antimalariki za Bangkok/Chiang Mai/otoke običajno niso potrebni; za deževno sezono imej repelent in zdravila proti driski.",
      estimatedCosts:
        "Viza za turistični obisk običajno ni potrebna (0 €). Podaljšanje pri imigraciji: približno 1 900 THB (~50 €). Cepljenje proti hepatitisu A: približno 40–80 € na osebo. TDAC je brezplačen.",
    };
  }

  return {
    visaRequirement:
      "EU/Schengen citizens do not need a visa in advance for tourism in Thailand. From May 2026, visa-free stays are 30 days per entry (the temporary 60-day scheme was ended). Max two visa-free entries per calendar year. Passport must be valid at least 6 months on arrival. Border officers may ask for proof of accommodation, a return flight, and funds (roughly 20,000 THB per person or equivalent).",
    howToApply:
      "Before arrival, complete the free TDAC (Thailand Digital Arrival Card) on the official Thai Immigration site. Show your passport and TDAC at entry. A 30-day extension is possible at a local immigration office (~1,900 THB) — up to about 60 days total on one trip.",
    vaccinations:
      "Recommended: hepatitis A (and B for longer trips), up-to-date routine vaccines (MMR, tetanus). Yellow fever only if arriving from an endemic country. Malaria prophylaxis is usually unnecessary for Bangkok/Chiang Mai/islands; pack repellent and diarrhoea meds for the rainy season.",
    estimatedCosts:
      "Tourist visa usually not required (€0). Immigration extension ~1,900 THB (~€50). Hepatitis A vaccine roughly €40–80 per person. TDAC is free.",
  };
}

/** Curated visa/health copy when Gemini omits travel_requirements (common on 2.5 Flash). */
export function buildFallbackTravelRequirements(
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
  lang: LangCode = "en",
): TravelRequirements | null {
  const rawResidents = targetResidentsForOrigin(originIata);
  if (!rawResidents.length) return null;

  const targetResidents = collapseResidentLabels(rawResidents);
  const destCountry = destinationCountry(destinationIata);

  if (destCountry === "TH") {
    const euGroup = rawResidents.filter((c) => EU_SCHENGEN_RESIDENTS.has(c));
    const otherGroup = rawResidents.filter((c) => !EU_SCHENGEN_RESIDENTS.has(c));
    const th = thailandFallback(lang);
    const visaInfo: TravelVisaInfo[] = [];

    if (euGroup.length > 0) {
      visaInfo.push({
        country: euVisaCountryLabel(lang),
        requirement: th.visaRequirement,
        howToApply: th.howToApply,
      });
    }

    for (const country of otherGroup) {
      visaInfo.push({
        country,
        requirement:
          lang === "sl"
            ? `Preveri aktualna brezvizumska pravila za potnike s potnim listom ${country} ob vstopu v Tajsko (2026: večina zahodnih držav 30 dni). Potni list vsaj 6 mesecev veljaven.`
            : `Check current visa-free rules for ${country} passport holders entering Thailand (2026: most Western passports get 30 days). Passport must be valid at least 6 months.`,
        howToApply:
          lang === "sl"
            ? "Preveri uradne vire Thai MFA ali lokalno veleposlaništvo pred odhodom. TDAC obrazec je obvezen za vse potnike."
            : "Check Thai MFA or your local embassy before departure. TDAC is required for all travellers.",
      });
    }

    return {
      targetResidents,
      visaInfo,
      vaccinations: th.vaccinations,
      estimatedCosts: th.estimatedCosts,
    };
  }

  const destLabel = destinationLabelForRequirements(destinationIata, lang);
  return {
    targetResidents,
    visaInfo: [
      {
        country: targetResidents.join(" · "),
        requirement:
          lang === "sl"
            ? `Preveri aktualne vizumske zahteve za potnike s potnimi listi (${targetResidents.join(", ")}) ob vstopu v ${destLabel}. Pravila se pogosto spreminjajo — vedno preveri uradne vire pred odhodom.`
            : `Check current visa requirements for travellers with passports from ${targetResidents.join(", ")} entering ${destLabel}. Rules change often — always verify official sources before you go.`,
        howToApply:
          lang === "sl"
            ? "Uradni viri: gov.si (MZV) ali ustrezno veleposlaništvo / e-viza, če je na voljo."
            : "Use your foreign ministry site or the destination embassy / e-visa portal if available.",
      },
    ],
    vaccinations:
      lang === "sl"
        ? "Posvetuj se s potovalno medicino 4–6 tednov pred odhodom. Rutinska cepljenja morajo biti posodobljena; dodatna cepljenja so odvisna od regije in načina potovanja."
        : "See a travel clinic 4–6 weeks before departure. Keep routine vaccines up to date; extras depend on region and how you travel.",
    estimatedCosts:
      lang === "sl"
        ? "Stroški viz in cepljenj so odvisni od destinacije — načrtuj 0–150 € na osebo (e-viza + osnovna cepljenja)."
        : "Visa and vaccine costs vary by destination — budget about €0–150 per person (e-visa + basic vaccines).",
  };
}

/** AI plan data when present; otherwise curated fallback for the route. */
export function resolveTravelRequirements(
  fromPlan: TravelRequirements | undefined | null,
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
  lang: LangCode = "en",
): TravelRequirements | null {
  if (fromPlan?.visaInfo?.length) {
    const sample = fromPlan.visaInfo.map((v) => v.requirement).join(" ");
    // UI is English but plan/fallback body arrived in Slovenian → prefer EN curated copy.
    if (lang !== "sl" && looksSlovenianTravelCopy(sample)) {
      const fb = buildFallbackTravelRequirements(originIata, destinationIata, lang);
      if (fb) return fb;
    }

    return {
      targetResidents: collapseResidentLabels(
        fromPlan.targetResidents.length
          ? fromPlan.targetResidents
          : targetResidentsForOrigin(originIata),
      ),
      visaInfo: groupVisaInfoEntries(fromPlan.visaInfo, lang),
      vaccinations: fromPlan.vaccinations?.trim() || "",
      estimatedCosts: fromPlan.estimatedCosts?.trim() || "",
    };
  }

  return buildFallbackTravelRequirements(originIata, destinationIata, lang);
}

export function destinationLabelForRequirements(
  destinationIata: string | undefined,
  lang: LangCode = "en",
): string {
  const code = normalizeIata(destinationIata ?? "");
  if (!code) return lang === "sl" ? "destinacija" : "destination";
  const meta = DESTINATION_BY_IATA[code];
  if (!meta) return code;
  return `${meta.name} (${code})`;
}

/** Prompt block injected into Gemini trip-plan generation. */
export function travelRequirementsPromptBlock(opts: {
  originIata: string;
  destinationIata: string;
  destinationLabel: string;
  language?: string;
}): string {
  const residents = targetResidentsForOrigin(opts.originIata);
  if (!residents.length) return "";

  const lang = opts.language ?? "en";
  const dest = destinationLabelForRequirements(opts.destinationIata, lang);
  const allEu = residents.every((c) => EU_SCHENGEN_RESIDENTS.has(c));
  const residentList = allEu
    ? `"EU"`
    : residents.map((c) => `"${c}"`).join(", ");

  const langLine =
    lang === "sl"
      ? "Vsa besedila v travel_requirements piši v slovenščini."
      : `Write ALL travel_requirements strings in ${lang === "en" ? "English" : lang} (same language as the itinerary).`;

  return `
SMART TRAVEL REQUIREMENTS (travel_requirements — required in JSON):
- Add top-level object travel_requirements with exactly this structure.
- target_residents: exactly [${residentList}] — for EU/Schengen hubs use ["EU"] when rules are identical across member states (do NOT list Slovenia, Austria, Italy, Croatia separately).
- visa_info: one entry when rules match. country must be "EU" or "EU / Schengen" for shared EU rules — never repeat the same paragraph per country.
  • country — "EU" / "EU / Schengen" or a non-EU country name,
  • requirement — visa/eTA/visa-free, price, validity,
  • how_to_apply — official site / e-visa / on arrival.
- Tailor everything to ${opts.destinationLabel} (${dest}) with real 2026 rules.
- THAILAND 2026: visa-free for EU/Schengen is 30 days (temporary 60-day scheme ended May 2026), max 2 entries/year — do NOT write 60 days visa-free.
- vaccinations / estimated_costs: concise, practical.
- ${langLine}`;
}
