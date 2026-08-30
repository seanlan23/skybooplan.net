/** Slovenian traveler count after a number (nominative). */
export function slPaxAfterNumber(n: number): string {
  const count = Math.max(1, Math.floor(n));
  if (count === 1) return "1 potnik";
  if (count === 2) return "2 potnika";
  if (count === 3 || count === 4) return `${count} potniki`;
  return `${count} potnikov`;
}

/** Slovenian traveler count after "za" (accusative). */
export function slPaxAfterZa(n: number): string {
  const count = Math.max(1, Math.floor(n));
  if (count === 1) return "1 potnika";
  if (count === 2) return "2 potnika";
  if (count === 3 || count === 4) return `${count} potnike`;
  return `${count} potnikov`;
}

/** UI count + noun: Slovenian dual, otherwise singular/plural labels. */
export function formatPaxUiCount(
  n: number,
  lang: string,
  singular: string,
  plural: string,
): string {
  const count = Math.max(1, Math.floor(n));
  if (lang === "sl" || lang.startsWith("sl")) return slPaxAfterNumber(count);
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Stay-night count for package / header copy. */
export function stayNightsPhrase(n: number, lang: string): string {
  const count = Math.max(1, Math.floor(n));
  if (lang === "sl" || lang.startsWith("sl")) {
    if (count === 1) return "1 nočitev";
    if (count === 2) return "2 nočitvi";
    if (count === 3 || count === 4) return `${count} nočitve`;
    return `${count} nočitev`;
  }
  if (lang === "de" || lang.startsWith("de")) {
    return count === 1 ? "1 Nacht" : `${count} Nächte`;
  }
  return count === 1 ? "1 night" : `${count} nights`;
}

/** Fill `{n}` / `{n} potnikov` with the correct dual/plural. */
export function formatPaxCountPhrase(template: string, n: number): string {
  const t = template.trim();
  if (/\{n\}\s*potnikov/i.test(t)) {
    if (/^za\s/i.test(t)) return t.replace(/\{n\}\s*potnikov/i, slPaxAfterZa(n));
    if (/za\s*\{n\}/i.test(t)) return t.replace(/\{n\}\s*potnikov/i, slPaxAfterZa(n));
    return t.replace(/\{n\}\s*potnikov/i, slPaxAfterNumber(n));
  }
  return t.replace(/\{n\}/g, String(Math.max(1, Math.floor(n))));
}
