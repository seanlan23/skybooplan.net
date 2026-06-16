import type { AiPlannerContext, AiPlannerSubmit } from "@/components/AiPlannerPreview";
import { defaultDateFrom, defaultDateTo } from "@/lib/heroFlightSearch";
import { parseHeroDateRangeStart } from "@/lib/heroDateRange";
import type { HeroChatCollected } from "@/lib/heroChatFlow";
import { normalizeIata, type TripBudgetTier } from "@/lib/geminiPro.shared";

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
  hrvaška: "ZAD",
  hrvatska: "ZAD",
  croatia: "ZAD",
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
  return value.trim().toLowerCase();
}

export function resolveOriginIata(origin: string): string {
  const key = normalizeKey(origin);
  if (ORIGIN_IATA[key]) return ORIGIN_IATA[key]!;
  const iata = normalizeIata(origin);
  if (iata) return iata;
  return "LJU";
}

export function resolveDestinationIata(destination: string): string {
  const key = normalizeKey(destination);
  if (DESTINATION_IATA[key]) return DESTINATION_IATA[key]!;
  const iata = normalizeIata(destination);
  if (iata) return iata;
  return destination.trim().toUpperCase().slice(0, 3);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Parse chat date label (e.g. "Julij 2027" or "16. jun → 23. jun 2026") to YYYY-MM-DD. */
export function parseChatDepartDate(datesLabel: string, language = "sl"): string {
  const trimmed = datesLabel.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const rangeStart = parseHeroDateRangeStart(trimmed, language);
  if (rangeStart) return rangeStart;

  const lower = trimmed.toLowerCase();
  const yearMatch = lower.match(/20\d{2}/);
  const year = yearMatch?.[0] ?? String(new Date().getUTCFullYear());

  for (const [name, monthIndex] of Object.entries(MONTH_INDEX)) {
    if (lower.includes(name)) {
      const month = String(monthIndex + 1).padStart(2, "0");
      return `${year}-${month}-01`;
    }
  }

  return defaultDateFrom();
}

/** Infer trip length in nights from chat chip label. */
export function parseChatNights(nightsLabel: string): number {
  const lower = nightsLabel.toLowerCase();
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

export function parseChatPassengers(passengersLabel: string): {
  adults: number;
  childrenAges: number[];
} {
  const lower = passengersLabel.toLowerCase();
  let adults = 1;
  let children = 0;

  const adultsMatch = lower.match(/(\d+)\s*odras/i) ?? lower.match(/(\d+)\s*adult/i);
  if (adultsMatch) adults = Number.parseInt(adultsMatch[1]!, 10);

  const childMatch = lower.match(/(\d+)\s*(otrok|child)/i);
  if (childMatch) children = Number.parseInt(childMatch[1]!, 10);

  if (!adultsMatch && lower.includes("2 odras")) adults = 2;

  adults = Math.min(9, Math.max(1, adults));
  children = Math.min(8, Math.max(0, children));

  return {
    adults,
    childrenAges: Array.from({ length: children }, () => 8),
  };
}

export function mapChatBudget(budgetLabel: string): TripBudgetTier {
  const lower = budgetLabel.toLowerCase();
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
  language = "sl",
): HeroChatPlannerPayload {
  const departDate = parseChatDepartDate(collected.dates, language);
  const nights = parseChatNights(collected.nights);
  const returnDate = nights > 0 ? addDays(departDate, nights) : defaultDateTo(departDate);
  const { adults, childrenAges } = parseChatPassengers(collected.passengers);
  const originPlace = collected.origin.trim();
  const destinationPlace = collected.destination.trim();

  const ctx: AiPlannerContext & { language?: string; currency?: "EUR" | "USD" } = {
    from: resolveOriginIata(originPlace),
    to: resolveDestinationIata(destinationPlace),
    originPlace,
    destinationPlace,
    departDate,
    returnDate,
    pax: adults + childrenAges.length,
    adults,
    childrenAges,
    language,
    currency: "EUR",
  };

  const form: AiPlannerSubmit = {
    pace: "relaxed",
    wishes: [
      `Destinacija: ${destinationPlace}`,
      `Datumi: ${collected.dates}`,
      collected.nights,
      `Proračun: ${collected.budget} na osebo`,
    ].join(". "),
    tags: [],
    customPrompt: "",
    budget: mapChatBudget(collected.budget),
    wishTags: [],
  };

  return { ctx, form };
}
