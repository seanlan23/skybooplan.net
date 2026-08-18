function slPlansPhrase(count: number, n: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs === 1 || (last === 1 && abs > 20)) return `${n} načrt ustvarjen`;
  if (abs === 2 || (last === 2 && abs > 20)) return `${n} načrta ustvarjena`;
  if ((abs === 3 || abs === 4) || ((last === 3 || last === 4) && abs > 20)) {
    return `${n} načrti ustvarjeni`;
  }
  return `${n} načrtov ustvarjenih`;
}

/** Known completed itineraries — keep the public counter from dropping below this. */
export const KNOWN_PLANS_GENERATED_FLOOR = 204;

export function resolvePublicPlanCount(
  stored: number,
  live = 0,
  floor = KNOWN_PLANS_GENERATED_FLOOR,
): number {
  return Math.max(0, stored, live, floor);
}

export function formatPlansGeneratedLabel(
  count: number,
  template: string,
  lang: string,
): string {
  const locale = lang === "sl" ? "sl-SI" : lang === "de" ? "de-DE" : "en-US";
  const n = new Intl.NumberFormat(locale).format(count);
  if (lang === "sl") return slPlansPhrase(count, n);
  if (lang === "en" || lang === "en-US") {
    return count === 1 ? "1 travel plan generated" : `${n} travel plans generated`;
  }
  if (lang === "de") {
    return count === 1 ? "1 Reiseplan erstellt" : `${n} Reisepläne erstellt`;
  }
  return template.replace("{n}", n);
}
