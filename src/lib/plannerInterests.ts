/** Stable keys for planner interest chips — translated in UI, sent to AI as labels. */
export const PLANNER_INTEREST_KEYS = [
  "beaches",
  "fun",
  "sights",
  "hikes",
  "mountains",
  "nature",
  "rivers",
  "food",
  "culture",
  "nightlife",
] as const;

export type PlannerInterestKey = (typeof PLANNER_INTEREST_KEYS)[number];

/**
 * Motorhome-friendly priorities — no dense cities / nightlife (RV parks stay outside cores).
 */
export const MOTORHOME_INTEREST_KEYS = [
  "beaches",
  "mountains",
  "nature",
  "rivers",
  "hikes",
  "food",
  "culture",
] as const satisfies readonly PlannerInterestKey[];

export type MotorhomeInterestKey = (typeof MOTORHOME_INTEREST_KEYS)[number];

export const MIN_PLANNER_INTERESTS = 3;
export const MIN_MOTORHOME_INTERESTS = 1;

const SL_LABELS: Record<PlannerInterestKey, string> = {
  beaches: "sanjske plaže",
  fun: "veliko zabave",
  sights: "znamenitosti",
  hikes: "pohodi",
  mountains: "gore",
  nature: "narava",
  rivers: "reke",
  food: "kulinarika",
  culture: "kultura",
  nightlife: "nočno življenje",
};

const EN_LABELS: Record<PlannerInterestKey, string> = {
  beaches: "dream beaches",
  fun: "lots of fun",
  sights: "landmarks & sights",
  hikes: "hiking",
  mountains: "mountains",
  nature: "nature",
  rivers: "rivers",
  food: "food & dining",
  culture: "culture",
  nightlife: "nightlife",
};

const DE_LABELS: Record<PlannerInterestKey, string> = {
  beaches: "Traumstrände",
  fun: "viel Spaß",
  sights: "Sehenswürdigkeiten",
  hikes: "Wanderungen",
  mountains: "Berge",
  nature: "Natur",
  rivers: "Flüsse",
  food: "Kulinarik",
  culture: "Kultur",
  nightlife: "Nachtleben",
};

const FR_LABELS: Record<PlannerInterestKey, string> = {
  beaches: "plages de rêve",
  fun: "beaucoup de fun",
  sights: "monuments & sites",
  hikes: "randonnées",
  mountains: "montagnes",
  nature: "nature",
  rivers: "rivières",
  food: "gastronomie",
  culture: "culture",
  nightlife: "vie nocturne",
};

const ES_LABELS: Record<PlannerInterestKey, string> = {
  beaches: "playas de ensueño",
  fun: "mucho diversión",
  sights: "lugares de interés",
  hikes: "senderismo",
  mountains: "montañas",
  nature: "naturaleza",
  rivers: "ríos",
  food: "gastronomía",
  culture: "cultura",
  nightlife: "vida nocturna",
};

const IT_LABELS: Record<PlannerInterestKey, string> = {
  beaches: "spiagge da sogno",
  fun: "tanto divertimento",
  sights: "attrazioni",
  hikes: "escursioni",
  mountains: "montagne",
  nature: "natura",
  rivers: "fiumi",
  food: "cucina",
  culture: "cultura",
  nightlife: "vita notturna",
};

function labelsForLang(lang: string): Record<PlannerInterestKey, string> {
  const code = lang.toLowerCase().slice(0, 2);
  if (code === "sl") return SL_LABELS;
  if (code === "de") return DE_LABELS;
  if (code === "fr") return FR_LABELS;
  if (code === "es") return ES_LABELS;
  if (code === "it") return IT_LABELS;
  return EN_LABELS;
}

export function formatPlannerInterests(keys: string[] | null | undefined, lang = "en"): string {
  const map = labelsForLang(lang);
  return (keys ?? [])
    .filter((k): k is PlannerInterestKey => k in map)
    .map((k) => map[k])
    .join(", ");
}

export function parsePlannerInterestKeys(
  keys: string[] | null | undefined,
): PlannerInterestKey[] {
  return (keys ?? []).filter((k): k is PlannerInterestKey => k in EN_LABELS);
}

/** Structured payload for AI — keys + human labels + steering hint. */
export function buildPrioritiesPayload(keys: string[], langCode = "en") {
  const valid = parsePlannerInterestKeys(keys);
  if (!valid.length) return undefined;
  const slo = langCode === "sl" || langCode.startsWith("sl");
  return {
    keys: valid,
    labels: formatPlannerInterests(valid, langCode),
    steer:
      "Weight regions and highlights toward these priorities. At least ~40% of activity days should clearly match a selected priority. beaches→islands/coast; sights→temples/museums/landmarks; nature→parks/jungles/wildlife; food→markets/street food/cooking; culture→temples/museums/local life; nightlife→evening districts/bars; hikes/mountains→trails/viewpoints; rivers→rafting/kayak/cruises; fun→theme parks/adventure/water sports.",
    note: slo
      ? "Uporabnik je izbral te prioritete — jih moraš videti v regijah in highlights."
      : "User selected these priorities — reflect them in regions and highlights.",
  };
}
