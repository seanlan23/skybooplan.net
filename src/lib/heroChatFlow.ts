import { localizeOriginLabel } from "@/lib/airportCatalog";

export const HERO_CHAT_TOTAL_STEPS = 5;

export type HeroChatMode = "all" | "flights" | "stays" | "plan" | "motorhome" | "car";

/** Homepage searcher tabs. Flights stay inside the full plan — no standalone flight search. */
export const HERO_SEARCHER_MODES: HeroChatMode[] = ["all", "stays", "car", "motorhome"];

export const HERO_CHAT_MODES: HeroChatMode[] = [
  "stays",
  "car",
  "motorhome",
  "plan",
  "all",
];

export function normalizeHeroSearcherMode(mode: HeroChatMode): HeroChatMode {
  return mode === "flights" ? "all" : mode;
}

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

export type HeroTripType = "return" | "oneway" | "openjaw";

export type HeroChatStep =
  | "destination"
  | "travelMode"
  | "tripType"
  | "returnFrom"
  | "dates"
  | "nights"
  | "origin"
  | "passengers"
  | "travelStyle"
  | "pace"
  | "budget"
  | "wishes"
  | "searching";

export type HeroChatCollected = {
  destination: string;
  dates: string;
  nights: string;
  origin: string;
  passengers: string;
  /** Stays only — Booking room count. */
  rooms?: number;
  /** Full plan: resort | explore | roadtrip */
  travelStyle?: import("@/lib/travelStyle").TravelStyle;
  pace: string;
  budget: string;
  /** Free-text places / preferences in the destination country (optional). */
  locationWishes?: string;
  /** Round-trip / one-way / open-jaw (return from another airport). */
  tripType?: HeroTripType;
  /** Open-jaw: IATA for the return-leg origin (e.g. CEB when destination land was MNL). */
  returnFromIata?: string;
  /** Planner interest keys (e.g. beaches, mountains) — used by motorhome search. */
  priorities?: string[];
  attachment?: import("@/lib/heroChatAttachment").HeroChatAttachmentPayload;
};

export function normalizeHeroTripType(
  value: string | undefined | null,
): HeroTripType {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "oneway" || raw === "one-way" || raw === "one_way") return "oneway";
  if (raw === "openjaw" || raw === "open-jaw" || raw === "open_jaw" || raw === "multicity") {
    return "openjaw";
  }
  return "return";
}

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
  /** One-word feeling — identity, not a packing list. */
  feelKey: string;
};

/** Dream row first, then classic + nearby — same size, order is the hierarchy. */
export const HERO_DESTINATION_CHIPS: HeroDestinationChip[] = [
  {
    id: "thailand",
    destination: "Thailand",
    emoji: "🏝️",
    labelKey: "hero.chip.thailand.label",
    nameKey: "hero.chip.thailand.name",
    feelKey: "hero.chip.thailand.feel",
  },
  {
    id: "bali",
    destination: "Bali",
    emoji: "🌴",
    labelKey: "hero.chip.bali.label",
    nameKey: "hero.chip.bali.name",
    feelKey: "hero.chip.bali.feel",
  },
  {
    id: "dubai",
    destination: "Dubai",
    emoji: "🏙️",
    labelKey: "hero.chip.dubai.label",
    nameKey: "hero.chip.dubai.name",
    feelKey: "hero.chip.dubai.feel",
  },
  {
    id: "paris",
    destination: "Paris (CDG)",
    emoji: "🗼",
    labelKey: "hero.chip.paris.label",
    nameKey: "hero.chip.paris.name",
    feelKey: "hero.chip.paris.feel",
  },
  {
    id: "newyork",
    destination: "New York",
    emoji: "🗽",
    labelKey: "hero.chip.newyork.label",
    nameKey: "hero.chip.newyork.name",
    feelKey: "hero.chip.newyork.feel",
  },
  {
    id: "croatia",
    destination: "Croatia",
    emoji: "🌊",
    labelKey: "hero.chip.croatia.label",
    nameKey: "hero.chip.croatia.name",
    feelKey: "hero.chip.croatia.feel",
  },
];

/** Shown when the traveler opens “find any destination”. */
export const HERO_TYPE_SUGGESTIONS: Array<{
  id: string;
  destination: string;
  emoji: string;
  nameKey: string;
}> = [
  { id: "portugal", destination: "Portugal", emoji: "🇵🇹", nameKey: "hero.suggest.portugal" },
  { id: "japan", destination: "Japan", emoji: "🏯", nameKey: "hero.chip.japan.name" },
  { id: "iceland", destination: "Iceland", emoji: "🌋", nameKey: "hero.suggest.iceland" },
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
): { emoji: string; name: string; label: string; feel: string } {
  const translatedName = translate(chip.nameKey);
  const name =
    translatedName && !translatedName.startsWith("hero.chip.")
      ? translatedName
      : chip.destination;
  const translatedFeel = translate(chip.feelKey);
  const feel =
    translatedFeel && !translatedFeel.startsWith("hero.chip.") ? translatedFeel : "";
  return { emoji: chip.emoji, name, label: `${chip.emoji} ${name}`, feel };
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
    .replace(/\s*\([A-Za-z]{3}\)\s*$/u, "")
    .trim()
    .toLowerCase();
  const chip = HERO_DESTINATION_CHIPS.find((c) => {
    const stored = c.destination.replace(/\s*\([A-Za-z]{3}\)\s*$/u, "").trim().toLowerCase();
    return stored === normalized || c.destination.toLowerCase() === trimmed.toLowerCase();
  });
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
    (full, _city: string, rest: string, _iata: string) => {
      const localized = localizeOriginLabel(`${_city}${rest}`, lang);
      return localized || full;
    },
  );

  // Rewrite Slovenian / English query scaffolding when UI language differs.
  if (!lang.startsWith("sl")) {
    const tripTo = translate("query.tripTo").replace("{dest}", "").trim();
    const dates = translate("query.dates").replace("{dates}", "").trim();
    const from = translate("query.from").replace("{origin}", "").trim();
    const pace = translate("query.pace").replace("{pace}", "").trim();
    const budget = translate("query.budget").replace("{budget}", "").trim();
    const perPerson = translate("query.perPerson");
    out = out
      .replace(/\bPotovanje v\b/gi, tripTo || "Trip to")
      .replace(/\bTrip to\b/gi, tripTo || "Trip to")
      .replace(/\btermin\b/gi, dates || "dates")
      .replace(/\bdates\b/gi, dates || "dates")
      .replace(/\biz\b/gi, from || "from")
      .replace(/\bfrom\b/gi, from || "from")
      .replace(/\btempo\b/gi, pace || "pace")
      .replace(/\bpace\b/gi, pace || "pace")
      .replace(/\bproračun\b/gi, budget || "budget")
      .replace(/\bbudget\b/gi, budget || "budget")
      .replace(/\bna osebo\b/gi, perPerson || "per person")
      .replace(/\b\/\s*person\b/gi, perPerson ? `/ ${perPerson}` : "/ person")
      .replace(/\bper person\b/gi, perPerson || "per person")
      .replace(/\bodrasli?\b/gi, lang.startsWith("it") ? "adulti" : lang.startsWith("es") ? "adultos" : lang.startsWith("fr") ? "adultes" : lang.startsWith("de") ? "Erwachsene" : "adults")
      .replace(/\badults?\b/gi, lang.startsWith("it") ? "adulti" : lang.startsWith("es") ? "adultos" : lang.startsWith("fr") ? "adultes" : lang.startsWith("de") ? "Erwachsene" : "adults");
  }

  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function heroChatStepNumber(step: HeroChatStep): number {
  switch (step) {
    case "passengers":
      return 1;
    case "tripType":
    case "returnFrom":
      return 2;
    case "dates":
      return 3;
    case "travelStyle":
    case "pace":
      return 4;
    case "budget":
    case "wishes":
      return 5;
    case "nights":
      return 6;
    case "origin":
      return 6;
    default:
      return 0;
  }
}

type QueryTranslate = (key: string, vars?: Record<string, string>) => string;

function defaultQueryTranslate(key: string, vars?: Record<string, string>): string {
  const templates: Record<string, string> = {
    "query.tripTo": "Trip to {dest}",
    "query.flightsTo": "Flights to {dest}",
    "query.staysIn": "Stays in {dest}",
    "query.dates": "dates {dates}",
    "query.from": "from {origin}",
    "query.pace": "pace {pace}",
    "query.budget": "budget {budget}",
    "query.budgetPerPerson": "budget {budget} per person",
  };
  let out = templates[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(`{${k}}`, v);
    }
  }
  return out;
}

export function buildHeroSearchQuery(
  data: HeroChatCollected,
  translate: QueryTranslate = defaultQueryTranslate,
): string {
  return [
    translate("query.tripTo", { dest: data.destination }),
    data.dates?.trim() ? translate("query.dates", { dates: data.dates.trim() }) : "",
    data.nights,
    data.origin?.trim() ? translate("query.from", { origin: data.origin.trim() }) : "",
    data.passengers,
    formatBudgetForQuery(data.budget, translate),
  ]
    .filter(Boolean)
    .join(", ");
}

function formatBudgetForQuery(budget: string, translate: QueryTranslate = defaultQueryTranslate): string {
  const trimmed = budget?.trim() ?? "";
  if (!trimmed) return "";
  // Chips already include "/ osebo" / "/ person" — don't double-suffix.
  if (/\b(osebo|person|pp|persona|personne|Person)\b/i.test(trimmed) || /\/\s*(osebo|person|persona)/i.test(trimmed)) {
    return translate("query.budget", { budget: trimmed });
  }
  return translate("query.budgetPerPerson", { budget: trimmed });
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
  translate: QueryTranslate = defaultQueryTranslate,
): string {
  const dest = data.destination?.trim();
  const parts: string[] = [];
  if (dest) {
    parts.push(
      mode === "flights"
        ? translate("query.flightsTo", { dest })
        : mode === "stays"
          ? translate("query.staysIn", { dest })
          : translate("query.tripTo", { dest }),
    );
  }
  const tripType = normalizeHeroTripType(data.tripType);
  if (mode !== "stays" && mode !== "motorhome" && mode !== "car") {
    if (tripType === "oneway") {
      parts.push("one-way / enosmerno / solo andata");
    } else if (tripType === "openjaw" && data.returnFromIata?.trim()) {
      parts.push(
        `open-jaw return from ${data.returnFromIata.trim().toUpperCase()} (different airport)`,
      );
    } else {
      parts.push("round-trip / povratno");
    }
  }
  if (data.dates?.trim()) parts.push(translate("query.dates", { dates: data.dates.trim() }));
  if (data.passengers?.trim()) parts.push(data.passengers.trim());
  if (data.nights?.trim()) parts.push(data.nights.trim());
  if (data.origin?.trim()) parts.push(translate("query.from", { origin: data.origin.trim() }));
  if (data.pace?.trim()) parts.push(translate("query.pace", { pace: data.pace.trim() }));
  if (data.budget?.trim()) {
    const budgetPart = formatBudgetForQuery(data.budget, translate);
    if (budgetPart) parts.push(budgetPart);
  }
  if (data.locationWishes?.trim()) {
    parts.push(`Želje / must visit: ${data.locationWishes.trim()}`);
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
