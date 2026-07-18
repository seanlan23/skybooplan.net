import { extractHeroChatDates, type HeroChatDateParseResult } from "@/lib/heroChatDates";

export type HeroChatPassengersExtract = {
  adults: number;
  children: number;
  label: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function formatPassengersLabel(adults: number, children: number, lang: string): string {
  if (lang === "sl") {
    const adultPart =
      adults === 1 ? "1 odrasel" : adults === 2 ? "2 odrasla" : `${adults} odraslih`;
    if (children <= 0) return adultPart;
    const childPart =
      children === 1 ? "1 otrok" : children === 2 ? "2 otroka" : `${children} otrok`;
    return `${adultPart} + ${childPart}`;
  }
  const adultPart = adults === 1 ? "1 adult" : `${adults} adults`;
  if (children <= 0) return adultPart;
  const childPart = children === 1 ? "1 child" : `${children} children`;
  return `${adultPart} + ${childPart}`;
}

/** Extract passenger counts only when the user explicitly mentioned them. */
export function extractHeroChatPassengers(
  text: string,
  lang = "sl",
): HeroChatPassengersExtract | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  let adults: number | null = null;
  let children = 0;
  let mentioned = false;

  const adultMatch = normalized.match(
    /(\d+)\s*(?:odras(?:el|la|li|lih)?|adults?)/i,
  );
  if (adultMatch) {
    adults = clamp(Number.parseInt(adultMatch[1]!, 10), 1, 9);
    mentioned = true;
  }

  const childMatch = normalized.match(
    /(\d+)\s*(?:otrok|otroka|otroci|otrocih|children|child|kids?|infants?)/i,
  );
  if (childMatch) {
    children = clamp(Number.parseInt(childMatch[1]!, 10), 0, 8);
    mentioned = true;
    if (adults == null) adults = 1;
  }

  // "2+1", "2 + 1"
  const plusMatch = normalized.match(/\b(\d+)\s*\+\s*(\d+)\b/);
  if (plusMatch && !adultMatch) {
    adults = clamp(Number.parseInt(plusMatch[1]!, 10), 1, 9);
    children = clamp(Number.parseInt(plusMatch[2]!, 10), 0, 8);
    mentioned = true;
  }

  if (/\b(?:za\s+dva|couple|pair|2\s*oseb[ie]?)\b/i.test(normalized) && adults == null) {
    adults = 2;
    mentioned = true;
  }

  if (/\b(?:sam|samo\s+jaz|alone|solo|1\s*oseb[ae]?)\b/i.test(normalized) && adults == null) {
    adults = 1;
    mentioned = true;
  }

  if (!mentioned || adults == null) return null;

  return {
    adults,
    children,
    label: formatPassengersLabel(adults, children, lang),
  };
}

export type HeroChatBootstrap = {
  passengers: HeroChatPassengersExtract | null;
  dates: HeroChatDateParseResult;
  /** Enough to run flight search without more questions. */
  canSearchNow: boolean;
  nextStep: "passengers" | "dates" | "search";
};

/** Decide what the wizard still needs after the first free-text message. */
export function resolveHeroChatBootstrap(text: string, lang = "sl"): HeroChatBootstrap {
  const passengers = extractHeroChatPassengers(text, lang);
  const dates = extractHeroChatDates(text, lang);
  const hasDates = Boolean(dates.departDate);

  if (passengers && hasDates) {
    return { passengers, dates, canSearchNow: true, nextStep: "search" };
  }
  if (!passengers) {
    return { passengers, dates, canSearchNow: false, nextStep: "passengers" };
  }
  return { passengers, dates, canSearchNow: false, nextStep: "dates" };
}
