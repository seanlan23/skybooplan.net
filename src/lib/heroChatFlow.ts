export const HERO_CHAT_TOTAL_STEPS = 5;

export type HeroChatMode = "all" | "flights" | "stays" | "plan";

export const HERO_CHAT_MODES: HeroChatMode[] = ["flights", "stays", "plan", "all"];

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
  { id: "paris", destination: "Pariz", emoji: "🗼", labelKey: "hero.chip.paris.label", nameKey: "hero.chip.paris.name" },
  { id: "croatia", destination: "Hrvaška", emoji: "🌊", labelKey: "hero.chip.croatia.label", nameKey: "hero.chip.croatia.name" },
  { id: "bali", destination: "Bali", emoji: "🌴", labelKey: "hero.chip.bali.label", nameKey: "hero.chip.bali.name" },
  { id: "newyork", destination: "New York", emoji: "🗽", labelKey: "hero.chip.newyork.label", nameKey: "hero.chip.newyork.name" },
  { id: "japan", destination: "Japonska", emoji: "🏯", labelKey: "hero.chip.japan.label", nameKey: "hero.chip.japan.name" },
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
    `proračun ${data.budget} na osebo`,
  ].join(", ");
}

export function buildHeroFlightsSearchQuery(data: HeroChatCollected): string {
  return buildHeroMakeSearchQuery(data, "flights");
}

/** Natural-language query for Make.com / hero search from whatever the chat collected. */
export function buildHeroMakeSearchQuery(
  data: HeroChatCollected,
  mode: HeroChatMode = "all",
): string {
  const dest = data.destination?.trim();
  const parts: string[] = [];
  if (dest) {
    parts.push(mode === "flights" ? `Leti v ${dest}` : `Potovanje v ${dest}`);
  }
  if (data.dates?.trim()) parts.push(`termin ${data.dates.trim()}`);
  if (data.passengers?.trim()) parts.push(data.passengers.trim());
  if (data.nights?.trim()) parts.push(data.nights.trim());
  if (data.origin?.trim()) parts.push(`iz ${data.origin.trim()}`);
  if (data.pace?.trim()) parts.push(`tempo ${data.pace.trim()}`);
  if (data.budget?.trim()) parts.push(`proračun ${data.budget.trim()} na osebo`);
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
