import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { normalizeIata } from "@/lib/geminiPro.shared";

/** English country names for AI JSON + UI. */
const COUNTRY_ENGLISH: Record<string, string> = {
  AT: "Austria",
  SI: "Slovenia",
  CZ: "Czech Republic",
  SK: "Slovakia",
  DE: "Germany",
  CH: "Switzerland",
  IT: "Italy",
  HR: "Croatia",
  HU: "Hungary",
  PL: "Poland",
  FR: "France",
  BE: "Belgium",
  NL: "Netherlands",
  LU: "Luxembourg",
  GB: "United Kingdom",
  IE: "Ireland",
  ES: "Spain",
  PT: "Portugal",
  GR: "Greece",
  TR: "Türkiye",
  RO: "Romania",
  BG: "Bulgaria",
  RS: "Serbia",
  DK: "Denmark",
  SE: "Sweden",
  NO: "Norway",
  FI: "Finland",
  US: "United States",
  CA: "Canada",
  AU: "Australia",
};

/**
 * Most frequent resident nationalities per departure hub (IATA).
 * Used in AI prompts and pre-plan UI hints.
 */
export const HUB_TARGET_RESIDENTS: Record<string, readonly string[]> = {
  VIE: ["Slovenia", "Austria", "Czech Republic", "Slovakia"],
  LJU: ["Slovenia", "Austria", "Italy", "Croatia"],
  MUC: ["Germany", "Austria", "Switzerland", "Czech Republic"],
  BER: ["Germany", "Poland", "Czech Republic", "Austria"],
  FRA: ["Germany", "France", "Belgium", "Netherlands"],
  CDG: ["France", "Belgium", "Germany", "United Kingdom"],
  PAR: ["France", "Belgium", "Germany", "United Kingdom"],
  AMS: ["Netherlands", "Germany", "Belgium", "United Kingdom"],
  BRU: ["Belgium", "France", "Netherlands", "Germany"],
  ZRH: ["Switzerland", "Germany", "Austria", "France"],
  GVA: ["Switzerland", "France", "Germany", "Italy"],
  PRG: ["Czech Republic", "Slovakia", "Austria", "Germany"],
  BUD: ["Hungary", "Austria", "Slovakia", "Germany"],
  WAW: ["Poland", "Germany", "Czech Republic", "Ukraine"],
  KRK: ["Poland", "Czech Republic", "Slovakia", "Germany"],
  BCN: ["Spain", "France", "United Kingdom", "Germany"],
  MAD: ["Spain", "France", "Portugal", "Germany"],
  FCO: ["Italy", "Germany", "France", "United Kingdom"],
  MXP: ["Italy", "Switzerland", "Germany", "France"],
  LIN: ["Italy", "Switzerland", "Germany", "France"],
  LHR: ["United Kingdom", "Ireland", "France", "Germany"],
  LON: ["United Kingdom", "Ireland", "France", "Germany"],
  DUB: ["Ireland", "United Kingdom", "Germany", "France"],
  CPH: ["Denmark", "Sweden", "Germany", "Norway"],
  ARN: ["Sweden", "Norway", "Denmark", "Finland"],
  HEL: ["Finland", "Sweden", "Estonia", "Germany"],
  IST: ["Türkiye", "Germany", "United Kingdom", "France"],
  DXB: ["United Arab Emirates", "India", "United Kingdom", "Germany"],
  JFK: ["United States", "Canada", "United Kingdom", "Mexico"],
  LAX: ["United States", "Canada", "Mexico", "United Kingdom"],
};

/** Resolve likely resident countries for travellers departing from `originIata`. */
export function targetResidentsForOrigin(originIata: string | undefined | null): string[] {
  const code = normalizeIata(originIata ?? "");
  if (!code) return [];

  const curated = HUB_TARGET_RESIDENTS[code];
  if (curated?.length) return [...curated];

  const hub = DESTINATION_BY_IATA[code];
  if (!hub) return [];

  const home = COUNTRY_ENGLISH[hub.country] ?? hub.name;
  return [home];
}
