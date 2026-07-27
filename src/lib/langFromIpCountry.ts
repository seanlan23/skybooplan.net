/** UI langs selectable from IP geo (matches SUPPORTED_LANGS). */
export type IpUiLang = "sl" | "en" | "de";

/**
 * Map coarse IP country (ISO 3166-1 alpha-2) to UI language.
 * SI → sl; DE / AT / CH → de; everything else → en.
 */
export function langFromIpCountry(country: string | null | undefined): IpUiLang {
  const code = (country ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  if (code === "SI") return "sl";
  if (code === "DE" || code === "AT" || code === "CH") return "de";
  return "en";
}
