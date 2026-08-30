import { normalizeTravelStyle, type TravelStyle } from "@/lib/travelStyle";

export type ResortCoastalBase = {
  countryCode: string;
  iata: string;
  hotelQuery: string;
  placeLabel: string;
  countryLabel: string;
  altHubs: string;
};

type CoastalRow = {
  /** Whole query is just the country (after trim / first comma). */
  countryOnly: RegExp;
  /** User already named a specific town / airport — do not remap. */
  specificPlace: RegExp;
  base: ResortCoastalBase;
};

/**
 * Country-only resort query → coastal hub.
 * Data table, not a named-city `if (Cancun)` branch in the UI.
 */
const COASTAL_ROWS: CoastalRow[] = [
  {
    countryOnly: /^(thailand|tajska|na tajskem)$/i,
    specificPlace:
      /\b(phuket|krabi|samui|usm|hkt|kbv|khao\s*lak|chiang|bangkok|bkk|pattaya|hua\s*hin|koh\s*phi|ao\s*nang)\b/i,
    base: {
      countryCode: "TH",
      iata: "HKT",
      hotelQuery: "Phuket",
      placeLabel: "Phuket",
      countryLabel: "Tajska",
      altHubs: "Phuket / Krabi",
    },
  },
  {
    countryOnly: /^(mexico|mehika|méxico|na mehiki)$/i,
    specificPlace:
      /\b(cancun|cancún|tulum|playa\s*del\s*carmen|riviera\s*maya|cun|cdmx|mexico\s*city|ciudad\s*de\s*m[eé]xico|mex)\b/i,
    base: {
      countryCode: "MX",
      iata: "CUN",
      hotelQuery: "Cancún",
      placeLabel: "Cancún / Riviera Maya",
      countryLabel: "Mehika",
      altHubs: "Cancún / Riviera Maya",
    },
  },
  {
    countryOnly: /^(indonesia|indonezija|indoneziji)$/i,
    specificPlace:
      /\b(nusa\s*dua|seminyak|sanur|ubud|canggu|uluwatu|jakarta|cgk|lombok|gili|yogyakarta)\b/i,
    base: {
      countryCode: "ID",
      iata: "DPS",
      hotelQuery: "Nusa Dua",
      placeLabel: "Nusa Dua",
      countryLabel: "Indonezija",
      altHubs: "Nusa Dua / Seminyak / Sanur",
    },
  },
  {
    countryOnly: /^(philippines|filipini|filipine|na filipinih)$/i,
    specificPlace:
      /\b(manila|mnl|cebu|ceb|boracay|mph|el\s*nido|palawan|bohol|siargao)\b/i,
    base: {
      countryCode: "PH",
      iata: "CEB",
      hotelQuery: "Cebu",
      placeLabel: "Cebu",
      countryLabel: "Filipini",
      altHubs: "Cebu / Mactan",
    },
  },
  {
    countryOnly: /^(dominican(?:\s+republic)?|dominikanska(?:\s+republika)?)$/i,
    specificPlace: /\b(punta\s*cana|puj|santo\s*domingo|sdq|bavaro|saona)\b/i,
    base: {
      countryCode: "DO",
      iata: "PUJ",
      hotelQuery: "Punta Cana",
      placeLabel: "Punta Cana",
      countryLabel: "Dominikanska republika",
      altHubs: "Punta Cana",
    },
  },
  {
    countryOnly: /^(egypt|egipt|v egiptu)$/i,
    specificPlace: /\b(cairo|kairo|cai|hurghada|hrg|sharm|ssh|luxor|giza)\b/i,
    base: {
      countryCode: "EG",
      iata: "HRG",
      hotelQuery: "Hurghada",
      placeLabel: "Hurghada",
      countryLabel: "Egipt",
      altHubs: "Hurghada",
    },
  },
  {
    countryOnly: /^(turkey|turčija|turcija|v turčiji)$/i,
    specificPlace: /\b(istanbul|ist|antalya|ayt|bodrum|izmir|cappadocia|kapadok)\b/i,
    base: {
      countryCode: "TR",
      iata: "AYT",
      hotelQuery: "Antalya",
      placeLabel: "Antalya",
      countryLabel: "Turčija",
      altHubs: "Antalya",
    },
  },
];

function countryQueryKey(raw: string): string {
  return raw
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "")
    .replace(/\([A-Za-z]{3}\)/g, "")
    .split(",")[0]!
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveResortCoastalBase(
  destination: string | undefined,
  travelStyle?: string | TravelStyle | null,
): ResortCoastalBase | null {
  if (normalizeTravelStyle(travelStyle) !== "resort") return null;
  const key = countryQueryKey(destination ?? "");
  if (!key) return null;
  const row = COASTAL_ROWS.find((entry) => entry.countryOnly.test(key));
  if (!row) return null;
  if (row.specificPlace.test(key)) return null;
  return row.base;
}

export function coastalBaseForIata(iata: string | undefined): ResortCoastalBase | null {
  const code = (iata ?? "").trim().toUpperCase();
  if (!code) return null;
  return COASTAL_ROWS.find((row) => row.base.iata === code)?.base ?? null;
}

export function resortCoastalPlaceLabel(base: ResortCoastalBase): string {
  return `${base.placeLabel}, ${base.countryLabel}`;
}

export function resortCoastalPromptNote(base: ResortCoastalBase, lang: string): string {
  if (lang === "sl") {
    return `Za sproščen oddih v enem resortu ${prepositionNa(base.countryLabel)} smo kot optimalno obmorsko bazo izbrali ${base.altHubs} z neposredno bližino peščenih plaž in enostavnim transferjem z letališča.`;
  }
  return `For a single-base beach stay in ${base.countryLabel}, the coastal hub is ${base.altHubs} — close to sand beaches and a simple airport transfer. Do not send the guest to the inland capital.`;
}

function prepositionNa(country: string): string {
  if (country === "Tajska" || country === "Mehika") return `na ${country}`;
  if (country === "Filipini") return `na ${country.slice(0, -1)}ih`;
  return `v ${country}`;
}

/** System-prompt block — named places are examples, not code branches. */
export function resortCoastalSystemRules(base: ResortCoastalBase | null): string {
  if (!base) {
    return `=== COASTAL BASE (single_base) ===
Če je uporabnik vpisal samo državo, NE usmerjaj leta in hotela v prestolnico / notranjost. Izberi obmorsko letovišče.
Primeri za razumevanje (NE if-veja): Tajska → Phuket (HKT) / Krabi (KBV) / Koh Samui; Mehika → Cancún (CUN); Indonezija → Bali obala (Nusa Dua, Seminyak, Sanur), ne Jakarta.`;
  }
  return `=== COASTAL BASE (single_base) ===
Uporabnik je vpisal samo državo. Let in resort sta že usmerjena na obmorsko bazo ${base.placeLabel} (${base.iata}), hotels[] city = ${base.hotelQuery} — NE prestolnica.
V overview (in trip_title, če gre) jasno pojasni izbiro, v jeziku uporabnika. Primer SL:
"Za sproščen oddih v enem resortu ${prepositionNa(base.countryLabel)} smo kot optimalno obmorsko bazo izbrali ${base.altHubs} z neposredno bližino peščenih plaž in enostavnim transferjem z letališča."
Ne predlagaj prestolnice kot baze.`;
}
