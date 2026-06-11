import type { Lang } from "@/lib/i18n";
import { translate } from "@/lib/i18n";

/** Slovenian dual/plural: 1 odrasel, 2 odrasla, 3–4 odrasli, 5+ odraslih */
export function formatAdultsCount(lang: Lang, count: number): string {
  if (count <= 0) return "";
  if (lang === "sl") {
    if (count === 1) return "1 odrasel";
    if (count === 2) return "2 odrasla";
    if (count === 3 || count === 4) return `${count} odrasli`;
    return `${count} odraslih`;
  }
  const word = count === 1 ? translate(lang, "trav.adult") : translate(lang, "trav.adults");
  return `${count} ${word}`;
}

/** Slovenian dual/plural: 1 otrok, 2 otroka, 3–4 otroci, 5+ otrok */
export function formatChildrenCount(lang: Lang, count: number): string {
  if (count <= 0) return "";
  if (lang === "sl") {
    if (count === 1) return "1 otrok";
    if (count === 2) return "2 otroka";
    if (count === 3 || count === 4) return `${count} otroci`;
    return `${count} otrok`;
  }
  const word = count === 1 ? translate(lang, "trav.child") : translate(lang, "trav.children");
  return `${count} ${word}`;
}

export function formatTravellersSummary(lang: Lang, adults: number, children: number): string {
  const parts = [formatAdultsCount(lang, adults)];
  const childPart = formatChildrenCount(lang, children);
  if (childPart) parts.push(childPart);
  return parts.join(", ");
}
