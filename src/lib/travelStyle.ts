/** Full-plan searcher: how many overnight bases the trip should use. */

export const TRAVEL_STYLES = ["resort", "explore", "roadtrip"] as const;

export type TravelStyle = (typeof TRAVEL_STYLES)[number];

export const DEFAULT_TRAVEL_STYLE: TravelStyle = "resort";

export function isTravelStyle(value: unknown): value is TravelStyle {
  return value === "resort" || value === "explore" || value === "roadtrip";
}

export function normalizeTravelStyle(value: unknown): TravelStyle {
  if (isTravelStyle(value)) return value;
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return DEFAULT_TRAVEL_STYLE;
  if (/road\s*trip|roadtrip|aktivn|več postank|vec postank|more stops/.test(raw)) {
    return "roadtrip";
  }
  if (/razisk|explor|1–2|1-2/.test(raw)) return "explore";
  if (/resort|mir\b|1 baza|one base|no move|brez selit/.test(raw)) return "resort";
  return DEFAULT_TRAVEL_STYLE;
}

/** Resort / 1-base stays do not ask Intensive / Relaxed / Calm. */
export function skipsPaceQuestion(style: TravelStyle): boolean {
  return style === "resort";
}
