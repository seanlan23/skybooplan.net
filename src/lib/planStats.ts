export function formatPlansGeneratedLabel(
  count: number,
  template: string,
  lang: string,
): string {
  const locale = lang === "sl" ? "sl-SI" : lang === "de" ? "de-DE" : "en-US";
  const n = new Intl.NumberFormat(locale).format(count);
  return template.replace("{n}", n);
}
