import type { AiPlannerContext, AiPlannerSubmit } from "@/components/AiPlannerPreview";
import { defaultDateFrom, defaultDateTo } from "@/lib/heroFlightSearch";
import { parseHeroDateRange } from "@/lib/heroDateRange";
import {
  localizeDestinationDisplay,
  normalizeHeroTripType,
  type HeroChatCollected,
} from "@/lib/heroChatFlow";
import { localizeOriginLabel } from "@/lib/airportCatalog";
import { translate } from "@/lib/i18n";
import { normalizeIata, type TripBudgetTier } from "@/lib/geminiPro.shared";
import { parseMakeSearchDestination, parseMakeSearchOriginAirports } from "@/lib/makeSearch";

const ORIGIN_IATA: Record<string, string> = {
  ljubljana: "LJU",
  zagreb: "ZAG",
  dunaj: "VIE",
  vienna: "VIE",
  benetke: "VCE",
  venice: "VCE",
};

const DESTINATION_IATA: Record<string, string> = {
  pariz: "CDG",
  paris: "CDG",
  "new york": "JFK",
  newyork: "JFK",
  bali: "DPS",
  hrvaška: "SPU",
  hrvatska: "SPU",
  croatia: "SPU",
  albanija: "TIA",
  albania: "TIA",
  španija: "MAD",
  spanija: "MAD",
  spain: "MAD",
  italija: "FCO",
  italy: "FCO",
  grčija: "ATH",
  grcija: "ATH",
  greece: "ATH",
  japonska: "NRT",
  japan: "NRT",
  tokio: "NRT",
  tokyo: "NRT",
  london: "LHR",
  rim: "FCO",
  rome: "FCO",
  barcelona: "BCN",
  amsterdam: "AMS",
  bangkok: "BKK",
  munich: "MUC",
  münchen: "MUC",
  munchen: "MUC",
};

const MONTH_INDEX: Record<string, number> = {
  januar: 0,
  january: 0,
  februar: 1,
  february: 1,
  marec: 2,
  march: 2,
  april: 3,
  maj: 4,
  may: 4,
  junij: 5,
  june: 5,
  julij: 6,
  july: 6,
  avgust: 7,
  august: 7,
  september: 8,
  oktober: 9,
  october: 9,
  november: 10,
  december: 11,
};

function normalizeKey(value: string): string {
  return value
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function resolveOriginIata(origin: string): string {
  const fromList = parseMakeSearchOriginAirports(origin);
  if (fromList[0]) return fromList[0];
  const key = normalizeKey(origin);
  if (ORIGIN_IATA[key]) return ORIGIN_IATA[key]!;
  const iata = normalizeIata(origin);
  if (iata) return iata;
  return "LJU";
}

export function resolveDestinationIata(destination: string): string {
  const fromMake = parseMakeSearchDestination(destination);
  if (fromMake) return fromMake;
  const key = normalizeKey(destination);
  if (DESTINATION_IATA[key]) return DESTINATION_IATA[key]!;
  const iata = normalizeIata(destination);
  if (iata) return iata;
  return "";
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Parse chat date label (e.g. "Julij 2027" or "16. jun → 23. jun 2026") to YYYY-MM-DD. */
export function parseChatDepartDate(
  datesLabel: string | undefined | null,
  language = "sl",
): string {
  return parseChatDateRange(datesLabel, language).departDate;
}

/** Exact range from chat, or depart + nights fallback. */
export function parseChatDateRange(
  datesLabel: string | undefined | null,
  language = "sl",
): { departDate: string; returnDate?: string } {
  const trimmed = (datesLabel ?? "").trim();
  if (!trimmed) return { departDate: defaultDateFrom() };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { departDate: trimmed };

  // Skyscanner-style browser: "2026-08-01 – 2026-08-12"
  const isoRange = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s*(?:→|->|–|—|-)\s*(\d{4}-\d{2}-\d{2})$/,
  );
  if (isoRange) {
    return { departDate: isoRange[1]!, returnDate: isoRange[2]! };
  }

  const range = parseHeroDateRange(trimmed, language);
  if (range) return range;

  const lower = trimmed.toLowerCase();
  const yearMatch = lower.match(/20\d{2}/);
  const year = yearMatch?.[0] ?? String(new Date().getUTCFullYear());

  for (const [name, monthIndex] of Object.entries(MONTH_INDEX)) {
    if (lower.includes(name)) {
      const month = String(monthIndex + 1).padStart(2, "0");
      return { departDate: `${year}-${month}-01` };
    }
  }

  return { departDate: defaultDateFrom() };
}

/** Infer trip length in nights from chat chip label. */
export function parseChatNights(nightsLabel: string | undefined | null): number {
  const lower = (nightsLabel ?? "").toLowerCase();
  if (lower.includes("2 tedn") || lower.includes("2 week")) return 15;
  const range = lower.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) {
    const a = Number.parseInt(range[1]!, 10);
    const b = Number.parseInt(range[2]!, 10);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
  }
  const single = lower.match(/(\d+)/);
  if (single) {
    const n = Number.parseInt(single[1]!, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 7;
}

export function parseChatPassengers(passengersLabel: string | undefined | null): {
  adults: number;
  childrenAges: number[];
} {
  const lower = (passengersLabel ?? "").toLowerCase();
  let adults = 1;
  let children = 0;

  const adultsMatch =
    lower.match(/(\d+)\s*odras/i) ??
    lower.match(/(\d+)\s*adult/i) ??
    lower.match(/(\d+)\s*erwachs/i) ??
    lower.match(/(\d+)\s*adulte/i) ??
    lower.match(/(\d+)\s*adulto/i);
  if (adultsMatch) adults = Number.parseInt(adultsMatch[1]!, 10);

  const childMatch =
    lower.match(/(\d+)\s*(otrok|child|kind|enfant|niñ|bambin)/i);
  if (childMatch) children = Number.parseInt(childMatch[1]!, 10);

  if (!adultsMatch && lower.includes("2 odras")) adults = 2;

  adults = Math.min(9, Math.max(1, adults));
  children = Math.min(8, Math.max(0, children));

  return {
    adults,
    childrenAges: Array.from({ length: children }, () => 8),
  };
}

export function mapChatBudget(budgetLabel: string | undefined | null): TripBudgetTier {
  const lower = (budgetLabel ?? "").toLowerCase();
  if (lower.includes("2000") && (lower.includes("+") || lower.includes("plus"))) return "premium";
  if (lower.includes("do 500") || lower.includes("up to") || lower.includes("under")) return "budget";
  if (lower.includes("1000-2000") || lower.includes("1000–2000")) return "standard";
  return "standard";
}

export type HeroChatPlannerPayload = {
  ctx: AiPlannerContext & { language?: string; currency?: "EUR" | "USD" };
  form: AiPlannerSubmit;
};

/** Map hero chat answers to AI planner context + submit form. */
export function heroChatToPlannerPayload(
  collected: HeroChatCollected,
  language = "en",
): HeroChatPlannerPayload {
  const parsedDates = parseChatDateRange(collected.dates, language);
  const departDate = parsedDates.departDate;
  const nightsLabel = collected.nights?.trim() || "";
  const budgetLabel = collected.budget?.trim() || "500–1000€";
  const tripType = normalizeHeroTripType(collected.tripType);
  // Exact calendar range wins — do NOT collapse "26. okt → 10. nov" to default 7 nights (Nov 2).
  // One-way: still need a plan end date (nights / default week), but no return flight.
  const returnDate =
    tripType === "oneway"
      ? nightsLabel
        ? addDays(departDate, parseChatNights(nightsLabel))
        : defaultDateTo(departDate)
      : parsedDates.returnDate ||
        (nightsLabel
          ? addDays(departDate, parseChatNights(nightsLabel))
          : defaultDateTo(departDate));
  const { adults, childrenAges } = parseChatPassengers(collected.passengers);
  const originPlace = collected.origin?.trim() || "Ljubljana";
  const destinationPlace = (collected.destination ?? "").trim() || "Thailand";
  const t = (key: string) => translate(language, key as never);
  const destinationLabel = localizeDestinationDisplay(destinationPlace, t);
  const originLabel = localizeOriginLabel(originPlace, language);
  const returnFromIata =
    tripType === "openjaw" && collected.returnFromIata?.trim()
      ? collected.returnFromIata.trim().toUpperCase()
      : undefined;

  const ctx: AiPlannerContext & { language?: string; currency?: "EUR" | "USD" } = {
    from: resolveOriginIata(originPlace),
    to: resolveDestinationIata(destinationPlace),
    originPlace,
    destinationPlace,
    departDate,
    returnDate,
    ...(returnFromIata ? { returnFromIata } : {}),
    pax: adults + childrenAges.length,
    adults,
    childrenAges,
    language,
    currency: "EUR",
  };

  const paceLabel = collected.pace?.toLowerCase() ?? "";
  const pace =
    /intensiv|intensive/.test(paceLabel)
      ? ("intensive" as const)
      : /umir|calm/.test(paceLabel)
        ? ("calm" as const)
        : ("relaxed" as const);

  const form: AiPlannerSubmit = {
    pace,
    wishes: [
      `Destinacija: ${destinationLabel}`,
      `Datumi: ${collected.dates}`,
      nightsLabel || undefined,
      originLabel ? `Odhod: ${originLabel}` : "",
      collected.pace ? `Tempo: ${collected.pace}` : "",
      /\b(osebo|person)\b/i.test(budgetLabel)
        ? `Proračun: ${budgetLabel}`
        : `Proračun: ${budgetLabel} na osebo`,
    ]
      .filter(Boolean)
      .join(". "),
    tags: [],
    customPrompt: "",
    budget: mapChatBudget(budgetLabel),
    wishTags: [],
  };

  return { ctx, form };
}
