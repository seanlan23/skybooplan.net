export type WeatherCaptionTone = "dry" | "wet" | "cold" | "clear" | "cloudy" | "mixed";

const DRY_RE =
  /suho|sušn|susn|dry season|cool\/dry|stagione secca|estación seca|saison sèche|trockenzeit/i;
const WET_SEASON_RE =
  /deževn|rainy season|monsun|monsoon|wet season|saison des pluies|regenseit|obdobje dež/i;
const WET_NOW_RE = /dež|rain|pioggia|lluvia|pluie|regen/i;
const COLD_RE = /sneg|snow|neve|nieve|neige|schnee/i;
const CLEAR_RE = /jasno|clear|sereno|despejado|clair|klar/i;
const CLOUDY_RE = /oblačn|cloud|nuvol|nublad|nuageux|bewölkt/i;

export function weatherCaptionTone(text: string): WeatherCaptionTone {
  const t = text.trim();
  if (!t) return "mixed";
  if (DRY_RE.test(t)) return "dry";
  if (WET_SEASON_RE.test(t) || WET_NOW_RE.test(t)) return "wet";
  if (COLD_RE.test(t)) return "cold";
  if (CLEAR_RE.test(t)) return "clear";
  if (CLOUDY_RE.test(t)) return "cloudy";
  return "mixed";
}

export function weatherCaptionsConflict(a: string, b: string): boolean {
  const left = weatherCaptionTone(a);
  const right = weatherCaptionTone(b);
  return (left === "dry" && right === "wet") || (left === "wet" && right === "dry");
}

/** Drop live “it's raining” when the trip caption is dry season (and vice versa). */
export function displayWeatherLabel(
  live: string | null | undefined,
  seasonHints: string[] | null | undefined,
): string | null {
  const label = live?.trim() || "";
  if (!label) return null;
  const hints = (seasonHints ?? []).map((h) => h.trim()).filter(Boolean);
  if (hints.some((hint) => weatherCaptionsConflict(label, hint))) return null;
  return label;
}
