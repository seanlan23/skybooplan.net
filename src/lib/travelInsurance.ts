import { inferBudgetCountryFromPlace } from "@/lib/countryDailyBudget";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { normalizeIata } from "@/lib/geminiPro.shared";
import { planLangCopy } from "@/lib/planLangCopy";

/** EU/EEA/CH + UK (GHIC/EHIC public-care zone — not travel insurance). */
const EHIC_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "NO",
  "IS",
  "LI",
  "CH",
  "GB",
  "UK",
]);

const NON_EHIC_HINT =
  /bosnia|bosna|mostar|sarajevo|montenegro|črna\s*gora|crna\s*gora|kotor|albania|albanij|tirana|serbia|beograd|kosovo|macedonia|skopje|turkey|türkiye|istanbul|thailand|tajsk|bangkok|vietnam|japan|japonsk|india|indija|morocco|maroko|peru|mexico|mehika|usa|united states|canada|australia|egypt|kenya|south africa|philippines|filipin|indonesia|bali|iceland|island/i;

export type TravelInsuranceInfo = {
  /** Product rule: extra travel cover is mandatory on the plan (not always a statute). */
  required: true;
  title: string;
  body: string;
  howTo: string;
  insurers: string[];
};

const INSURERS_BY_HOME: Record<string, string[]> = {
  Slovenia: ["Coris", "Vita", "Triglav"],
  Austria: ["Europäische Reiseversicherung", "Uniqa", "ÖAMTC"],
  Germany: ["ADAC", "HanseMerkur", "ERV", "Allianz"],
  Italy: ["Europ Assistance", "Generali", "Allianz"],
  Croatia: ["Croatia osiguranje", "Wiener", "Allianz"],
  France: ["Allianz", "AXA", "Mondial Assistance"],
  Netherlands: ["ANWB", "Allianz", "Unigarant"],
  Belgium: ["AG Insurance", "Allianz", "DKV"],
  Spain: ["Mapfre", "AXA", "Allianz"],
  Portugal: ["Fidelidade", "Allianz"],
  "Czech Republic": ["Kooperativa", "Allianz", "ERV"],
  Slovakia: ["Union", "Allianz", "Generali"],
  Hungary: ["Allianz", "Generali", "Union"],
  Poland: ["PZU", "Allianz", "ERGO"],
  Greece: ["Ethniki", "Allianz", "Interamerican"],
  Denmark: ["Tryg", "Europeiska", "Allianz"],
  Sweden: ["Europeiska ERV", "If", "Allianz"],
  Finland: ["Pohjola", "If", "Allianz"],
  Ireland: ["Allianz", "AXA", "Aviva"],
  Romania: ["Allianz-Țiriac", "Generali"],
  Bulgaria: ["Allianz", "Generali"],
  Luxembourg: ["Foyer", "Allianz"],
  Switzerland: ["CSS", "Allianz Suisse", "Helsana"],
  Norway: ["Europeiske", "If", "Gjensidige"],
  "United Kingdom": ["Aviva", "AXA", "Staysure"],
  "United States": ["Allianz Travel", "AIG Travel Guard", "World Nomads", "IMG", "Seven Corners"],
  Canada: ["Manulife", "Allianz", "Blue Cross", "TuGo"],
  Australia: ["Cover-More", "Fast Cover", "Allianz", "1Cover"],
  "United Arab Emirates": ["AXA", "Allianz", "Oman Insurance"],
  Türkiye: ["Allianz", "AXA", "Anadolu"],
  India: ["Tata AIG", "ICICI Lombard", "Reliance"],
  Mexico: ["GNP", "AXA", "Allianz"],
  Ukraine: ["ARX", "Allianz", "UNIQA"],
};

const EU_HOMES = new Set([
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
  "Luxembourg",
  "Romania",
  "Bulgaria",
  "Norway",
  "Switzerland",
  "EU",
]);

const HOME_BY_IP_ISO: Record<string, string> = {
  SI: "Slovenia",
  AT: "Austria",
  DE: "Germany",
  IT: "Italy",
  HR: "Croatia",
  FR: "France",
  NL: "Netherlands",
  BE: "Belgium",
  ES: "Spain",
  PT: "Portugal",
  CZ: "Czech Republic",
  SK: "Slovakia",
  HU: "Hungary",
  PL: "Poland",
  GR: "Greece",
  DK: "Denmark",
  SE: "Sweden",
  FI: "Finland",
  IE: "Ireland",
  RO: "Romania",
  BG: "Bulgaria",
  LU: "Luxembourg",
  CH: "Switzerland",
  NO: "Norway",
  GB: "United Kingdom",
  UK: "United Kingdom",
  US: "United States",
  CA: "Canada",
  AU: "Australia",
  AE: "United Arab Emirates",
  TR: "Türkiye",
  IN: "India",
  MX: "Mexico",
  UA: "Ukraine",
};

/** Home market for policies = visitor IP country, never departure airport. */
export function homeCountryFromIp(ipCountry?: string | null): string {
  const iso = (ipCountry ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  if (!iso) return "Slovenia";
  return HOME_BY_IP_ISO[iso] ?? "";
}

function insurersForHome(home: string): string[] {
  if (!home) return ["Allianz", "ERV", "Europ Assistance"];
  return INSURERS_BY_HOME[home] ?? ["Allianz", "ERV", "Europ Assistance"];
}

function destCountryCodes(
  destinationIata: string | undefined | null,
  destinationHint?: string | null,
): string[] {
  const codes: string[] = [];
  const add = (cc: string | null | undefined) => {
    const n = (cc ?? "").trim().toUpperCase();
    if (n && !codes.includes(n)) codes.push(n);
  };
  const iata = normalizeIata(destinationIata ?? "");
  if (iata) add(DESTINATION_BY_IATA[iata]?.country);
  add(inferBudgetCountryFromPlace(destinationHint ?? "") ?? null);
  return codes;
}

export function tripLeavesEhicArea(
  destinationIata: string | undefined | null,
  destinationHint?: string | null,
): boolean {
  const hint = destinationHint ?? "";
  const iataCc = DESTINATION_BY_IATA[normalizeIata(destinationIata ?? "")]?.country;
  if (iataCc && !EHIC_COUNTRY_CODES.has(iataCc)) return true;
  const codes = destCountryCodes(destinationIata, hint);
  if (codes.some((cc) => !EHIC_COUNTRY_CODES.has(cc))) return true;
  if (codes.length === 0 && NON_EHIC_HINT.test(hint)) return true;
  return false;
}

function disclaimer(lang: string): string {
  return planLangCopy(lang, {
    sl: "Skybooplan ni zavarovalnica in ne prodaja polic — primerjaj kritje pred nakupom.",
    en: "Skybooplan is not an insurer and does not sell policies — compare cover before you buy.",
    de: "Skybooplan ist kein Versicherer und verkauft keine Policen — Deckung vor dem Kauf vergleichen.",
  });
}

function euBody(lang: string, leavesEhic: boolean): string {
  if (leavesEhic) {
    return planLangCopy(lang, {
      sl: "Dodatno turistično zavarovanje je obvezno. Evropska kartica zdravstvenega zavarovanja (EKZZ) na tej destinaciji ne velja — ne krije zdravljenja v tujini, prevoza v domovino, zasebnih klinik niti odpovedi potovanja. Skleni polico pred odhodom (zdravstveno + 24h asistenca + repatriacija).",
      en: "Extra travel insurance is required. The European Health Insurance Card (EHIC) does not apply at this destination — it does not cover treatment abroad, repatriation, private clinics, or trip cancellation. Buy a policy before you go (medical + 24h assistance + repatriation).",
      de: "Zusätzliche Reiseversicherung ist Pflicht. Die EHIC gilt an diesem Ziel nicht — sie deckt keine Behandlung im Ausland, keine Rückholung, keine Privatkliniken und keine Stornierung. Police vor der Abreise abschließen (medizinisch + 24h-Assistance + Rücktransport).",
    });
  }
  return planLangCopy(lang, {
    sl: "Dodatno turistično zavarovanje je obvezno tudi znotraj EU. EKZZ krije le nujno javno zdravljenje v EU/EGP/Švici — ni turistično zavarovanje: ne krije repatriacije, zasebnih bolnišnic, reševanja v gorah, odpovedi potovanja ali prtljage.",
    en: "Extra travel insurance is required even inside the EU. EHIC only covers necessary public healthcare in the EU/EEA/Switzerland — it is not travel insurance: no repatriation, private hospitals, mountain rescue, cancellation, or luggage.",
    de: "Zusätzliche Reiseversicherung ist auch innerhalb der EU Pflicht. Die EHIC deckt nur notwendige öffentliche Behandlung in der EU/EWR/Schweiz — sie ist keine Reiseversicherung: kein Rücktransport, keine Privatkliniken, keine Bergrettung, keine Stornierung, kein Gepäck.",
  });
}

function ukBody(lang: string, leavesEhic: boolean): string {
  if (leavesEhic) {
    return planLangCopy(lang, {
      sl: "Dodatno turistično zavarovanje je obvezno. Britanska GHIC na tej destinaciji ne velja in tudi v EU ni turistično zavarovanje (ni repatriacije, zasebnih klinik, odpovedi). Skleni polico pred odhodom.",
      en: "Extra travel insurance is required. A UK GHIC does not apply at this destination, and even in the EU it is not travel insurance (no repatriation, private clinics, or cancellation). Buy a policy before you go.",
      de: "Zusätzliche Reiseversicherung ist Pflicht. Die britische GHIC gilt an diesem Ziel nicht und ist auch in der EU keine Reiseversicherung (kein Rücktransport, keine Privatkliniken, kein Storno). Police vor der Abreise abschließen.",
    });
  }
  return planLangCopy(lang, {
    sl: "Dodatno turistično zavarovanje je obvezno. GHIC (UK) krije le nujno javno oskrbo v EU — ni turistično zavarovanje: ne krije repatriacije, zasebnih bolnišnic, reševanja v gorah ali odpovedi potovanja.",
    en: "Extra travel insurance is required. A UK GHIC only covers necessary public care in the EU — it is not travel insurance: no repatriation, private hospitals, mountain rescue, or cancellation.",
    de: "Zusätzliche Reiseversicherung ist Pflicht. Die britische GHIC deckt nur notwendige öffentliche Versorgung in der EU — sie ist keine Reiseversicherung: kein Rücktransport, keine Privatkliniken, keine Bergrettung, kein Storno.",
  });
}

function usBody(lang: string): string {
  return planLangCopy(lang, {
    sl: "Ameriško zdravstveno zavarovanje in Medicare v tujini praviloma ne veljata. Zvezni zakon za prostočasna potovanja police ne zahteva, račun iz tujega UR pa plačaš sam. Skybooplan zato zahteva travel medical zavarovanje z evakuacijo. Državljani ZDA za Schengen ne potrebujejo vize, zato pravilo o €30.000 zavarovanju za schengensko vizo zanje ne velja — zdravstveno kritje v tujini vseeno skleni.",
    en: "US health plans and Medicare generally do not cover care abroad. There is no federal law forcing leisure travelers to buy a policy, but an ER bill overseas is yours. Skybooplan therefore requires travel medical insurance with emergency evacuation. US citizens do not need a Schengen visa, so the €30,000 Schengen-visa insurance rule does not apply — still buy medical cover abroad.",
    de: "US-Krankenversicherungen und Medicare gelten im Ausland in der Regel nicht. Es gibt kein Bundesgesetz, das Privatreisende zur Police zwingt — die Rechnung aus der Notaufnahme zahlst du selbst. Skybooplan verlangt daher eine Auslandskrankenversicherung mit Evakuierung. US-Bürger brauchen kein Schengen-Visum, die 30.000-€-Visumspflicht gilt nicht — medizinische Deckung im Ausland trotzdem abschließen.",
  });
}

function caBody(lang: string): string {
  return planLangCopy(lang, {
    sl: "Pokrajinska zdravstvena zavarovanja (OHIP ipd.) v tujini krijejo malo ali nič. Travel medical zavarovanje z evakuacijo je obvezno pred odhodom.",
    en: "Provincial health plans (OHIP etc.) cover little or nothing abroad. Travel medical insurance with evacuation is required before you go.",
    de: "Provinzielle Krankenversicherungen (OHIP usw.) decken im Ausland wenig oder nichts. Auslandskrankenversicherung mit Evakuierung ist vor der Abreise Pflicht.",
  });
}

function auBody(lang: string): string {
  return planLangCopy(lang, {
    sl: "Reciprocal Healthcare Agreement z nekaterimi državami krije le osnovno javno oskrbo — ni turistično zavarovanje. Travel medical + evakuacija sta obvezna.",
    en: "Reciprocal Healthcare Agreements with some countries cover only basic public care — that is not travel insurance. Travel medical + evacuation are required.",
    de: "Gegenseitige Gesundheitsabkommen mit manchen Ländern decken nur grundlegende öffentliche Versorgung — das ist keine Reiseversicherung. Auslandskrankenversicherung + Evakuierung sind Pflicht.",
  });
}

function chBody(lang: string, leavesEhic: boolean): string {
  const extra = planLangCopy(lang, {
    sl: "Švica ni v EU; kartica zdravstvenega zavarovanja pomaga le v javnem sistemu EU/EGP — dodatna polica je obvezna.",
    en: "Switzerland is not in the EU; the health card only helps in the EU/EEA public system — extra cover is required.",
    de: "Die Schweiz ist nicht in der EU; die Versichertenkarte hilft nur im öffentlichen EU/EWR-System — Zusatzpolice ist Pflicht.",
  });
  return `${euBody(lang, leavesEhic)} ${extra}`;
}

function genericNonEuBody(lang: string): string {
  return planLangCopy(lang, {
    sl: "Domače zdravstveno zavarovanje v tujini pogosto ne velja. Turistično zdravstveno zavarovanje z asistenço in repatriacijo je obvezno pred odhodom.",
    en: "Home health insurance often does not apply abroad. Travel medical insurance with assistance and repatriation is required before you go.",
    de: "Die heimische Krankenversicherung gilt im Ausland oft nicht. Reisekrankenversicherung mit Assistance und Rücktransport ist vor der Abreise Pflicht.",
  });
}

function titleFor(lang: string): string {
  return planLangCopy(lang, {
    sl: "Turistično zavarovanje",
    en: "Travel insurance",
    de: "Reiseversicherung",
  });
}

function howToFor(lang: string, insurers: string[]): string {
  const names = insurers.join(", ");
  return planLangCopy(lang, {
    sl: `Za tvoj odhod priporočamo: ${names}. Preveri kritje (zdravljenje v tujini, 24h asistenca, repatriacija, odpoved). ${disclaimer(lang)}`,
    en: `For your departure we recommend: ${names}. Check cover (treatment abroad, 24h assistance, repatriation, cancellation). ${disclaimer(lang)}`,
    de: `Für deinen Start empfehlen wir: ${names}. Deckung prüfen (Behandlung im Ausland, 24h-Assistance, Rücktransport, Storno). ${disclaimer(lang)}`,
  });
}

function bodyForHome(home: string, lang: string, leavesEhic: boolean): string {
  if (home === "United States") return usBody(lang);
  if (home === "Canada") return caBody(lang);
  if (home === "Australia") return auBody(lang);
  if (home === "United Kingdom") return ukBody(lang, leavesEhic);
  if (home === "Switzerland") return chBody(lang, leavesEhic);
  if (EU_HOMES.has(home)) return euBody(lang, leavesEhic);
  return genericNonEuBody(lang);
}

export function buildTravelInsurance(opts: {
  originIata?: string | null;
  destinationIata?: string | null;
  destinationHint?: string | null;
  lang?: string;
  /** ISO 3166-1 alpha-2 from Vercel/Cloudflare IP geo. */
  ipCountry?: string | null;
}): TravelInsuranceInfo {
  const lang = (opts.lang ?? "en").toLowerCase().slice(0, 2);
  const home = homeCountryFromIp(opts.ipCountry);
  const leavesEhic = tripLeavesEhicArea(opts.destinationIata, opts.destinationHint);
  const insurers = insurersForHome(home);
  return {
    required: true,
    title: titleFor(lang),
    body: bodyForHome(home, lang, leavesEhic),
    howTo: howToFor(lang, insurers),
    insurers,
  };
}
