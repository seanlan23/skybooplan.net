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

export const MIN_PLANNER_INTERESTS = 3;

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

export function formatPlannerInterests(keys: string[], lang = "sl"): string {
  const slo = lang === "sl" || lang.startsWith("sl");
  const map = slo ? SL_LABELS : EN_LABELS;
  return keys
    .filter((k): k is PlannerInterestKey => k in map)
    .map((k) => map[k])
    .join(", ");
}

export function parsePlannerInterestKeys(keys: string[]): PlannerInterestKey[] {
  return keys.filter((k): k is PlannerInterestKey => k in SL_LABELS);
}

/** Structured payload for AI — keys + human labels + steering hint. */
export function buildPrioritiesPayload(keys: string[], langCode = "sl") {
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
