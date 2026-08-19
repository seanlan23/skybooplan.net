import { inferBudgetCountryFromPlace } from "@/lib/countryDailyBudget";
import { targetResidentsForOrigin } from "@/lib/originResidents";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { normalizeIata } from "@/lib/geminiPro.shared";
import { planLangCopy } from "@/lib/planLangCopy";
import {
  balkanRoadPack,
  curatedTravelPackForCountry,
  looksConcreteTravelCopy,
  looksGenericTravelCopy,
} from "@/lib/travelRequirementsFallback";
import {
  buildTravelInsurance,
  type TravelInsuranceInfo,
} from "@/lib/travelInsurance";

export type { TravelInsuranceInfo } from "@/lib/travelInsurance";

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
  /** Curated in code — never from Gemini. */
  insurance?: TravelInsuranceInfo;
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

function isBalkanRoadHint(hint: string): boolean {
  const t = hint.toLowerCase();
  if (/\bbalkan/.test(t)) return true;
  const hits = [
    /croatia|hrvašk|zadar|split|dubrovnik/,
    /bosnia|bosna|mostar|sarajevo/,
    /montenegro|črna\s*gora|crna\s*gora|kotor|budva/,
    /albania|albanij|shkod|tirana|saranda/,
  ].filter((re) => re.test(t)).length;
  return hits >= 2;
}

function destinationCountry(
  destinationIata: string | undefined | null,
  placeHint?: string | null,
): string | null {
  const fromPlace = inferBudgetCountryFromPlace(placeHint ?? "");
  const code = normalizeIata(destinationIata ?? "");
  const fromIata = code ? DESTINATION_BY_IATA[code]?.country ?? null : null;
  // Place/cities beat a leftover hub (FCO → Italy on a Balkan car trip).
  if (fromPlace && fromIata && fromPlace !== fromIata) return fromPlace;
  return fromPlace || fromIata;
}

/** All countries the itinerary actually visits — not only the arrival hub. */
const VISIT_COUNTRY_PATTERNS: [string, RegExp][] = [
  ["TH", /thailand|tajska|bangkok|phuket|krabi|chiang|patong|ao\s*nang|phi\s*phi|\bhkt\b|\bbkk\b/i],
  ["MY", /malaysia|malezij|kuala|lumpur|penang|langkawi|\bkul\b/i],
  ["SG", /singapore|singapur|changi/i],
  ["VN", /vietnam|hanoi|saigon|ho\s*chi|da\s*nang|hoi\s*an/i],
  ["ID", /indonesia|indonezij|\bbali\b|ubud|jakarta/i],
  ["KH", /cambodia|kambodž|siem\s*reap|phnom/i],
  ["JP", /japan|japonsk|tokyo|osaka|kyoto/i],
  ["PH", /philippines|filipin|manila|boracay|el\s*nido|cebu/i],
];

function visitedCountryCodes(
  destinationIata: string | undefined | null,
  placeHint?: string | null,
): string[] {
  const codes: string[] = [];
  const add = (cc: string | null | undefined) => {
    const n = (cc ?? "").trim().toUpperCase();
    if (n && !codes.includes(n)) codes.push(n);
  };
  add(destinationCountry(destinationIata, null));
  const iata = normalizeIata(destinationIata ?? "");
  if (iata) add(DESTINATION_BY_IATA[iata]?.country);
  const hint = placeHint ?? "";
  for (const [cc, re] of VISIT_COUNTRY_PATTERNS) {
    if (re.test(hint)) add(cc);
  }
  return codes;
}

function destVisaLabel(cc: string, lang: LangCode): string {
  const L = lang.toLowerCase().slice(0, 2);
  const names: Record<string, { sl: string; de: string; en: string }> = {
    TH: { sl: "Tajska", de: "Thailand", en: "Thailand" },
    MY: { sl: "Malezija", de: "Malaysia", en: "Malaysia" },
    SG: { sl: "Singapur", de: "Singapur", en: "Singapore" },
    VN: { sl: "Vietnam", de: "Vietnam", en: "Vietnam" },
    ID: { sl: "Indonezija", de: "Indonesien", en: "Indonesia" },
    KH: { sl: "Kambodža", de: "Kambodscha", en: "Cambodia" },
    JP: { sl: "Japonska", de: "Japan", en: "Japan" },
    PH: { sl: "Filipini", de: "Philippinen", en: "the Philippines" },
  };
  const row = names[cc];
  if (!row) return cc;
  if (L === "sl") return row.sl;
  if (L === "de") return row.de;
  return row.en;
}

function visaTextCoversCountry(text: string, cc: string): boolean {
  if (cc === "MY") return /malaysia|malezij|kuala|mdac/i.test(text);
  if (cc === "TH") return /thailand|tajsk|phuket|bangkok|tdac/i.test(text);
  if (cc === "SG") return /singapore|singapur|sgac/i.test(text);
  if (cc === "VN") return /vietnam|hanoi|saigon/i.test(text);
  if (cc === "ID") return /indonesia|indonezij|\bbali\b/i.test(text);
  if (cc === "JP") return /japan|japonsk|tokyo|k-?eta/i.test(text);
  return new RegExp(`\\b${cc}\\b`, "i").test(text);
}

function packForCountry(
  cc: string,
  lang: LangCode,
): { visaRequirement: string; howToApply: string; vaccinations: string; estimatedCosts: string } | null {
  if (cc === "TH") {
    const th = thailandFallback(lang);
    return {
      visaRequirement: th.visaRequirement,
      howToApply: th.howToApply,
      vaccinations: th.vaccinations,
      estimatedCosts: th.estimatedCosts,
    };
  }
  return curatedTravelPackForCountry(cc, lang);
}

function visaCopyMismatchesDestination(
  sample: string,
  destHint: string,
  destIata?: string | null,
): boolean {
  const mentionsItaly = /\bital(y|ija|ien)\b|\brome\b|\bfco\b/i.test(sample);
  if (!mentionsItaly) return false;
  if (isBalkanRoadHint(destHint)) return true;
  const destCc = destinationCountry(destIata, destHint);
  if (destCc === "IT") return false;
  if (destCc && destCc !== "IT") return true;
  if (destHint.trim() && !/ital|rome|roma|\bfco\b/i.test(destHint)) return true;
  return false;
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
  const code = lang.toLowerCase().slice(0, 2);
  if (code === "sl") {
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

  if (code === "de") {
    return {
      visaRequirement:
        "EU-/Schengen-Bürger brauchen für touristische Aufenthalte in Thailand kein Visum im Voraus. Ab Mai 2026 gilt 30 Tage visumfreier Aufenthalt pro Einreise (die vorübergehende 60-Tage-Regelung wurde beendet). Höchstens zwei visumfreie Einreisen pro Kalenderjahr. Reisepass muss bei Einreise mindestens 6 Monate gültig sein. Grenzbeamte können Nachweis über Unterkunft, Rückflug und finanzielle Mittel verlangen (ca. 20.000 THB pro Person oder Gegenwert).",
      howToApply:
        "Vor der Ankunft die kostenlose TDAC (Thailand Digital Arrival Card) auf der offiziellen Thai-Immigration-Website ausfüllen. Bei Einreise Reisepass und TDAC vorzeigen. Eine Verlängerung um 30 Tage ist bei einer lokalen Einwanderungsbehörde möglich (~1.900 THB) — insgesamt bis ca. 60 Tage auf einer Reise.",
      vaccinations:
        "Empfohlen: Hepatitis A (und B bei längeren Reisen), aktuelle Routineimpfungen (MMR, Tetanus). Gelbfieber nur bei Anreise aus einem Endemiegebiet. Malariaprophylaxe ist für Bangkok/Chiang Mai/Inseln meist nicht nötig; für die Regenzeit Repellent und Mittel gegen Durchfall mitnehmen.",
      estimatedCosts:
        "Touristenvisum meist nicht nötig (0 €). Verlängerung bei Immigration ~1.900 THB (~50 €). Hepatitis-A-Impfung ca. 40–80 € pro Person. TDAC ist kostenlos.",
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

function attachTravelInsurance(
  req: TravelRequirements | null,
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
  lang: LangCode,
  destinationHint?: string | null,
  ipCountry?: string | null,
): TravelRequirements | null {
  if (!req) return null;
  return {
    ...req,
    insurance: buildTravelInsurance({
      originIata,
      destinationIata,
      destinationHint,
      lang,
      ipCountry,
    }),
  };
}

/** Curated visa/health copy when Gemini omits travel_requirements (common on 2.5 Flash). */
export function buildFallbackTravelRequirements(
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
  lang: LangCode = "en",
  destinationHint?: string | null,
  ipCountry?: string | null,
): TravelRequirements | null {
  return attachTravelInsurance(
    buildFallbackTravelRequirementsCore(
      originIata,
      destinationIata,
      lang,
      destinationHint,
    ),
    originIata,
    destinationIata,
    lang,
    destinationHint,
    ipCountry,
  );
}

function buildFallbackTravelRequirementsCore(
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
  lang: LangCode = "en",
  destinationHint?: string | null,
): TravelRequirements | null {
  // Ground trips (motorhome) often lack a hub IATA — assume Central-EU passports.
  let rawResidents = targetResidentsForOrigin(originIata);
  if (!rawResidents.length) {
    rawResidents = ["Slovenia", "Austria", "Italy", "Croatia"];
  }

  const targetResidents = collapseResidentLabels(rawResidents);
  const hint = destinationHint ?? "";
  const destCountry = destinationCountry(destinationIata, hint);
  const destLabel = destinationLabelForRequirements(destinationIata, lang, hint);
  const langCode = lang.toLowerCase().slice(0, 2);
  const visited = visitedCountryCodes(destinationIata, hint);

  if (isBalkanRoadHint(hint)) {
    const curated = balkanRoadPack(lang);
    return {
      targetResidents,
      visaInfo: [
        {
          country: euVisaCountryLabel(lang),
          requirement: curated.visaRequirement,
          howToApply: curated.howToApply,
        },
      ],
      vaccinations: curated.vaccinations,
      estimatedCosts: curated.estimatedCosts,
    };
  }

  if (visited.length > 1) {
    const visaInfo: TravelVisaInfo[] = [];
    const vax: string[] = [];
    const costs: string[] = [];
    for (const cc of visited) {
      const pack = packForCountry(cc, lang);
      if (!pack) continue;
      visaInfo.push({
        country: destVisaLabel(cc, lang),
        requirement: pack.visaRequirement,
        howToApply: pack.howToApply,
      });
      if (pack.vaccinations.trim()) vax.push(pack.vaccinations.trim());
      if (pack.estimatedCosts.trim()) costs.push(pack.estimatedCosts.trim());
    }
    if (visaInfo.length > 1) {
      return {
        targetResidents,
        visaInfo,
        vaccinations: [...new Set(vax)].join(" "),
        estimatedCosts: [...new Set(costs)].join(" "),
      };
    }
  }

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
          langCode === "sl"
            ? `Preveri aktualna brezvizumska pravila za potnike s potnim listom ${country} ob vstopu v Tajsko (2026: večina zahodnih držav 30 dni). Potni list vsaj 6 mesecev veljaven.`
            : langCode === "de"
              ? `Aktuelle visumfreie Regeln für Reisende mit Pass aus ${country} bei Einreise nach Thailand prüfen (2026: die meisten westlichen Pässe 30 Tage). Reisepass mindestens 6 Monate gültig.`
              : `Check current visa-free rules for ${country} passport holders entering Thailand (2026: most Western passports get 30 days). Passport must be valid at least 6 months.`,
        howToApply:
          langCode === "sl"
            ? "Preveri uradne vire Thai MFA ali lokalno veleposlaništvo pred odhodom. TDAC obrazec je obvezen za vse potnike."
            : langCode === "de"
              ? "Vor Abreise offizielle Quellen des thailändischen Außenministeriums oder die lokale Botschaft prüfen. TDAC ist für alle Reisenden Pflicht."
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

  const curated = curatedTravelPackForCountry(destCountry, lang);
  if (curated) {
    return {
      targetResidents,
      visaInfo: [
        {
          country: euVisaCountryLabel(lang),
          requirement: curated.visaRequirement,
          howToApply: curated.howToApply,
        },
      ],
      vaccinations: curated.vaccinations,
      estimatedCosts: curated.estimatedCosts,
    };
  }

  return {
    targetResidents,
    visaInfo: [
      {
        country: targetResidents.join(" · "),
        requirement: planLangCopy(langCode, {
          sl: `Za ${destLabel}: preveri vizumske zahteve za potnike z EU/Schengen potnim listom (brezvizumsko / e-viza / VOA). Potni list naj bo veljaven; pravila preveri na gov.si (MZV) pred odhodom.`,
          en: `For ${destLabel}: confirm visa rules for EU/Schengen passports (visa-free / e-visa / VOA). Keep your passport valid; verify on your foreign ministry site before you go.`,
          de: `Für ${destLabel}: Visabestimmungen für EU-/Schengen-Pässe prüfen (visumfrei / E-Visum / VOA). Reisepass gültig halten; vor Abreise offizielle Quellen checken.`,
          it: `Per ${destLabel}: verifica i requisiti di visto per passaporti UE/Schengen (senza visto / e-visa / VOA). Passaporto valido; controlla fonti ufficiali prima della partenza.`,
          es: `Para ${destLabel}: confirma las reglas de visado para pasaportes UE/Schengen (sin visado / e-visa / VOA). Pasaporte válido; verifica fuentes oficiales antes de viajar.`,
          fr: `Pour ${destLabel} : vérifiez les règles de visa pour passeports UE/Schengen (sans visa / e-visa / VOA). Passeport valide ; sources officielles avant le départ.`,
        }),
        howToApply: planLangCopy(langCode, {
          sl: "Uradni viri: gov.si (MZV) ali veleposlaništvo / e-viza destinacije.",
          en: "Official sources: your foreign ministry or the destination embassy / e-visa portal.",
          de: "Offizielle Quellen: Außenministerium oder Botschaft / E-Visum-Portal des Ziellandes.",
          it: "Fonti ufficiali: ministero degli esteri o ambasciata / portale e-visa della destinazione.",
          es: "Fuentes oficiales: ministerio de exteriores o embajada / portal e-visa del destino.",
          fr: "Sources officielles : ministère des affaires étrangères ou ambassade / portail e-visa.",
        }),
      },
    ],
    vaccinations: planLangCopy(langCode, {
      sl: `Za ${destLabel}: posvetuj se s potovalno medicino 4–6 tednov pred odhodom. Rutinska cepljenja posodobi; dodatna (hepatitis A, tifus …) so odvisna od regije.`,
      en: `For ${destLabel}: see a travel clinic 4–6 weeks before departure. Update routine vaccines; extras (hepatitis A, typhoid…) depend on the region.`,
      de: `Für ${destLabel}: Reiseimpfberatung 4–6 Wochen vor Abreise. Routineimpfungen aktualisieren; Zusatzimpfungen (Hepatitis A, Typhus …) je nach Region.`,
      it: `Per ${destLabel}: consulta la medicina di viaggio 4–6 settimane prima. Aggiorna i vaccini di routine; extra (epatite A, tifo…) dipendono dalla regione.`,
      es: `Para ${destLabel}: consulta medicina del viajero 4–6 semanas antes. Actualiza vacunas de rutina; extras (hepatitis A, tifus…) según la región.`,
      fr: `Pour ${destLabel} : consultez la médecine des voyages 4–6 semaines avant. Mettez à jour les vaccins de routine ; extras (hépatite A, typhoïde…) selon la région.`,
    }),
    estimatedCosts: planLangCopy(langCode, {
      sl: `Za ${destLabel}: načrtuj 0–150 € na osebo za morebitno e-vizo in osnovna cepljenja — točen znesek preveri pred odhodom.`,
      en: `For ${destLabel}: budget about €0–150 per person for a possible e-visa and basic vaccines — confirm the amount before travel.`,
      de: `Für ${destLabel}: plane ca. 0–150 € pro Person für ggf. E-Visum und Basisimpfungen — Betrag vor Abreise prüfen.`,
      it: `Per ${destLabel}: budget circa 0–150 € a persona per eventuale e-visa e vaccini base — conferma prima della partenza.`,
      es: `Para ${destLabel}: presupuesto unos 0–150 € por persona por posible e-visa y vacunas básicas — confirma antes de viajar.`,
      fr: `Pour ${destLabel} : budget environ 0–150 € par personne pour éventuel e-visa et vaccins de base — confirmez avant le départ.`,
    }),
  };
}

/** AI plan data when present; otherwise curated fallback for the route. */
export function resolveTravelRequirements(
  fromPlan: TravelRequirements | undefined | null,
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
  lang: LangCode = "en",
  destinationHint?: string | null,
  ipCountry?: string | null,
): TravelRequirements | null {
  return attachTravelInsurance(
    resolveTravelRequirementsCore(
      fromPlan,
      originIata,
      destinationIata,
      lang,
      destinationHint,
    ),
    originIata,
    destinationIata,
    lang,
    destinationHint,
    ipCountry,
  );
}

function resolveTravelRequirementsCore(
  fromPlan: TravelRequirements | undefined | null,
  originIata: string | undefined | null,
  destinationIata: string | undefined | null,
  lang: LangCode = "en",
  destinationHint?: string | null,
): TravelRequirements | null {
  const fb = buildFallbackTravelRequirementsCore(
    originIata,
    destinationIata,
    lang,
    destinationHint,
  );

  if (fromPlan?.visaInfo?.length) {
    const sample = [
      ...fromPlan.visaInfo.map((v) => v.requirement),
      fromPlan.vaccinations ?? "",
      fromPlan.estimatedCosts ?? "",
    ].join(" ");

    // Wrong country (Italy copy on a Balkan road trip) → curated pack.
    if (fb && visaCopyMismatchesDestination(sample, destinationHint ?? "", destinationIata)) {
      return fb;
    }

    // UI language mismatch → prefer curated.
    if (lang !== "sl" && looksSlovenianTravelCopy(sample) && fb) return fb;

    // Boilerplate / thin AI copy → prefer curated country pack.
    if (
      fb &&
      (looksGenericTravelCopy(sample) || !looksConcreteTravelCopy(sample))
    ) {
      return fb;
    }

    const extraVisa = (fb?.visaInfo ?? []).filter((card) => {
      const blob = `${card.country} ${card.requirement} ${card.howToApply}`;
      return visitedCountryCodes(destinationIata, destinationHint).some(
        (cc) =>
          visaTextCoversCountry(blob, cc) && !visaTextCoversCountry(sample, cc),
      );
    });

    return {
      targetResidents: collapseResidentLabels(
        fromPlan.targetResidents.length
          ? fromPlan.targetResidents
          : targetResidentsForOrigin(originIata).length
            ? targetResidentsForOrigin(originIata)
            : fb?.targetResidents ?? [],
      ),
      visaInfo: groupVisaInfoEntries([...fromPlan.visaInfo, ...extraVisa], lang),
      vaccinations: fromPlan.vaccinations?.trim() || fb?.vaccinations || "",
      estimatedCosts: fromPlan.estimatedCosts?.trim() || fb?.estimatedCosts || "",
    };
  }

  return fb;
}

export function destinationLabelForRequirements(
  destinationIata: string | undefined,
  lang: LangCode = "en",
  destinationHint?: string | null,
): string {
  const hint = (destinationHint ?? "").trim();
  if (isBalkanRoadHint(hint)) {
    return lang === "sl" ? "Balkan" : lang === "de" ? "den Balkan" : "the Balkans";
  }
  const code = normalizeIata(destinationIata ?? "");
  if (!code) {
    if (hint) return hint.slice(0, 80);
    return lang === "sl" ? "destinacija" : "destination";
  }
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
  let residents = targetResidentsForOrigin(opts.originIata);
  if (!residents.length) {
    residents = ["Slovenia", "Austria", "Italy", "Croatia"];
  }

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
  • requirement — concrete rule: visa-free / e-visa / ESTA / ETA / VOA, length of stay, passport validity, approximate fee,
  • how_to_apply — official site / e-visa portal / on arrival steps.
- FORBIDDEN boilerplate: do NOT write only “check official sources”, “rules change often”, or “see a travel clinic 4–6 weeks” without stating the actual rule for this destination first.
- Tailor everything to ${opts.destinationLabel} (${dest}) with real 2025–2026 rules for EU/Schengen passport holders.
- Intra-EU/Schengen (Spain, Italy, France, Croatia, Greece, Netherlands, Germany, Austria…): free movement, ID/passport enough, visa €0, no special vaccines.
- NEVER write visa rules for Italy/Rome/FCO unless the destination is actually Italy.
- Western Balkans road trip (Croatia + Bosnia + Montenegro + Albania, or “Balkan”): Croatia is Schengen; BA/ME/AL visa-free 90 days in 180 for EU; mention car green card / borders. This is NOT an Italy trip.
- THAILAND 2026: visa-free for EU/Schengen is 30 days (temporary 60-day scheme ended May 2026), max 2 entries/year — do NOT write 60 days visa-free.
- If the itinerary visits MORE THAN ONE country (e.g. Thailand + Kuala Lumpur/Malaysia), visa_info MUST have a separate entry for EACH country. Never cover only the arrival hub.
- MALAYSIA 2026: EU/Schengen visa-free typically 90 days; complete free MDAC (Malaysia Digital Arrival Card) on imigresen-online.imi.gov.my within 3 days before arrival.
- vaccinations / estimated_costs: destination-specific and practical (fees in €/USD where known).
- Do NOT write travel insurance, EHIC, or named insurers — the app injects a curated insurance block in code.
- ${langLine}`;
}
