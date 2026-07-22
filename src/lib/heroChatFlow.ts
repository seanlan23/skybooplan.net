import { localizeOriginLabel } from "@/lib/airportCatalog";

export const HERO_CHAT_TOTAL_STEPS = 5;

export type HeroChatMode = "all" | "flights" | "stays" | "plan" | "motorhome";

export const HERO_CHAT_MODES: HeroChatMode[] = [
  "flights",
  "stays",
  "motorhome",
  "plan",
  "all",
];

/** Start-city chips for Avtodom guided flow. */
export const HERO_MOTORHOME_START_CHIPS: Array<{
  id: string;
  place: string;
  emoji: string;
  nameKey: string;
}> = [
  { id: "vienna", place: "Vienna", emoji: "🇦🇹", nameKey: "hero.mhStart.vienna" },
  { id: "ljubljana", place: "Ljubljana", emoji: "🇸🇮", nameKey: "hero.mhStart.ljubljana" },
  { id: "munich", place: "Munich", emoji: "🇩🇪", nameKey: "hero.mhStart.munich" },
  { id: "zagreb", place: "Zagreb", emoji: "🇭🇷", nameKey: "hero.mhStart.zagreb" },
  { id: "milan", place: "Milan", emoji: "🇮🇹", nameKey: "hero.mhStart.milan" },
  { id: "budapest", place: "Budapest", emoji: "🇭🇺", nameKey: "hero.mhStart.budapest" },
];

/** End / destination chips for Avtodom. */
export const HERO_MOTORHOME_END_CHIPS: Array<{
  id: string;
  place: string;
  emoji: string;
  nameKey: string;
}> = [
  { id: "amsterdam", place: "Amsterdam", emoji: "🇳🇱", nameKey: "hero.mhEnd.amsterdam" },
  { id: "croatia", place: "Croatia", emoji: "🌊", nameKey: "hero.mhEnd.croatia" },
  { id: "albania", place: "Albania", emoji: "🇦🇱", nameKey: "hero.mhEnd.albania" },
  { id: "italy", place: "Italy", emoji: "🇮🇹", nameKey: "hero.mhEnd.italy" },
  { id: "spain", place: "Spain", emoji: "🇪🇸", nameKey: "hero.mhEnd.spain" },
  { id: "greece", place: "Greece", emoji: "🇬🇷", nameKey: "hero.mhEnd.greece" },
];

export type HeroChatStep =
  | "destination"
  | "dates"
  | "nights"
  | "origin"
  | "passengers"
  | "pace"
  | "budget"
  | "searching";

export type HeroChatCollected = {
  destination: string;
  dates: string;
  nights: string;
  origin: string;
  passengers: string;
  pace: string;
  budget: string;
  attachment?: import("@/lib/heroChatAttachment").HeroChatAttachmentPayload;
};

export type HeroChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  /** Optional inline action — show "pick exact dates" button under this Sky message. */
  offerDatePicker?: boolean;
};

export type HeroDestinationChip = {
  id: string;
  destination: string;
  emoji: string;
  labelKey: string;
  nameKey: string;
};

export const HERO_DESTINATION_CHIPS: HeroDestinationChip[] = [
  {
    id: "thailand",
    destination: "Thailand",
    emoji: "🏝️",
    labelKey: "hero.chip.thailand.label",
    nameKey: "hero.chip.thailand.name",
  },
  {
    id: "paris",
    destination: "Paris",
    emoji: "🗼",
    labelKey: "hero.chip.paris.label",
    nameKey: "hero.chip.paris.name",
  },
  {
    id: "croatia",
    destination: "Croatia",
    emoji: "🌊",
    labelKey: "hero.chip.croatia.label",
    nameKey: "hero.chip.croatia.name",
  },
  {
    id: "bali",
    destination: "Bali",
    emoji: "🌴",
    labelKey: "hero.chip.bali.label",
    nameKey: "hero.chip.bali.name",
  },
  {
    id: "newyork",
    destination: "New York",
    emoji: "🗽",
    labelKey: "hero.chip.newyork.label",
    nameKey: "hero.chip.newyork.name",
  },
  {
    id: "japan",
    destination: "Japan",
    emoji: "🏯",
    labelKey: "hero.chip.japan.label",
    nameKey: "hero.chip.japan.name",
  },
];

/** Full chip label e.g. "🗼 Pariz" — never emoji-only. */
export function resolveDestinationChipLabel(
  chip: HeroDestinationChip,
  translate: (key: string) => string,
): string {
  const label = translate(chip.labelKey);
  if (label && !label.startsWith("hero.chip.")) return label;
  return `${chip.emoji} ${chip.destination}`;
}

/** Split display for chip UI — emoji + localized name always separate. */
export function getDestinationChipDisplay(
  chip: HeroDestinationChip,
  translate: (key: string) => string,
): { emoji: string; name: string; label: string } {
  const translatedName = translate(chip.nameKey);
  const name =
    translatedName && !translatedName.startsWith("hero.chip.")
      ? translatedName
      : chip.destination;
  return { emoji: chip.emoji, name, label: `${chip.emoji} ${name}` };
}

/** Checklist / UI label for a stored chip destination (search value stays English). */
export function localizeDestinationDisplay(
  destination: string,
  translate: (key: string) => string,
): string {
  const trimmed = destination.trim();
  if (!trimmed) return trimmed;
  const normalized = trimmed
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, "")
    .trim()
    .toLowerCase();
  const chip = HERO_DESTINATION_CHIPS.find(
    (c) =>
      c.destination.toLowerCase() === normalized ||
      c.destination.toLowerCase() === trimmed.toLowerCase(),
  );
  if (!chip) return trimmed;
  return getDestinationChipDisplay(chip, translate).name;
}

/**
 * Localize destination/origin labels for search query + wishes UI.
 * Stored chip values stay English for IATA matching; display strings follow `lang`.
 */
export function localizeHeroCollectedForUi(
  data: HeroChatCollected,
  lang: string,
  translate: (key: string) => string,
): HeroChatCollected {
  return {
    ...data,
    destination: localizeDestinationDisplay(data.destination, translate),
    origin: localizeOriginLabel(data.origin, lang),
  };
}

/** Rewrite English place names inside a wishes blob for the active UI language. */
export function localizeWishesDisplay(
  wishes: string,
  lang: string,
  translate: (key: string) => string,
): string {
  let out = wishes.trim();
  if (!out) return out;

  for (const chip of HERO_DESTINATION_CHIPS) {
    const localized = localizeDestinationDisplay(chip.destination, translate);
    if (localized === chip.destination) continue;
    out = out.replace(new RegExp(`\\b${escapeRegExp(chip.destination)}\\b`, "gi"), localized);
  }

  out = out.replace(
    /([A-Za-zÀ-žÄÖÜäöüß]+)(\s*\(([A-Z]{3})\))/g,
    (full, _city: string, rest: string, iata: string) => {
      const localized = localizeOriginLabel(`${_city}${rest}`, lang);
      return localized || full;
    },
  );

  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function heroChatStepNumber(step: HeroChatStep): number {
  switch (step) {
    case "passengers":
      return 1;
    case "dates":
      return 2;
    case "pace":
      return 3;
    case "budget":
      return 4;
    case "nights":
      return 5;
    case "origin":
      return 5;
    default:
      return 0;
  }
}

export function buildHeroSearchQuery(data: HeroChatCollected): string {
  return [
    `Potovanje v ${data.destination}`,
    `odhod ${data.dates}`,
    data.nights,
    `iz ${data.origin}`,
    data.passengers,
    formatBudgetForQuery(data.budget),
  ].join(", ");
}

function formatBudgetForQuery(budget: string): string {
  const trimmed = budget?.trim() ?? "";
  if (!trimmed) return "";
  // Chips already include "/ osebo" / "/ person" — don't double-suffix.
  if (/\b(osebo|person|pp)\b/i.test(trimmed) || /\/\s*osebo/i.test(trimmed)) {
    return `proračun ${trimmed}`;
  }
  return `proračun ${trimmed} na osebo`;
}

export function buildHeroFlightsSearchQuery(data: HeroChatCollected): string {
  return buildHeroMakeSearchQuery(data, "flights");
}

/** Query label for stays-only hero search (Booking). */
export function buildHeroStaysSearchQuery(data: HeroChatCollected): string {
  const dest = data.destination?.trim();
  const parts: string[] = [];
  if (dest) parts.push(`Nastanitve v ${dest}`);
  if (data.dates?.trim()) parts.push(`termin ${data.dates.trim()}`);
  if (data.passengers?.trim()) parts.push(data.passengers.trim());
  if (data.nights?.trim()) parts.push(data.nights.trim());
  return parts.join(", ");
}

/** Natural-language query for Make.com / hero search from whatever the chat collected. */
export function buildHeroMakeSearchQuery(
  data: HeroChatCollected,
  mode: HeroChatMode = "all",
): string {
  const dest = data.destination?.trim();
  const parts: string[] = [];
  if (dest) {
    parts.push(
      mode === "flights"
        ? `Leti v ${dest}`
        : mode === "stays"
          ? `Nastanitve v ${dest}`
          : `Potovanje v ${dest}`,
    );
  }
  if (data.dates?.trim()) parts.push(`termin ${data.dates.trim()}`);
  if (data.passengers?.trim()) parts.push(data.passengers.trim());
  if (data.nights?.trim()) parts.push(data.nights.trim());
  if (data.origin?.trim()) parts.push(`iz ${data.origin.trim()}`);
  if (data.pace?.trim()) parts.push(`tempo ${data.pace.trim()}`);
  if (data.budget?.trim()) {
    const budgetPart = formatBudgetForQuery(data.budget);
    if (budgetPart) parts.push(budgetPart);
  }
  return parts.join(", ");
}

export function createChatMessage(
  role: "ai" | "user",
  text: string,
  extra?: Pick<HeroChatMessage, "offerDatePicker">,
): HeroChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
    ...extra,
  };
}
