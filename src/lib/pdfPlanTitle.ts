/** Human PDF/header title — places for motorhome, IATA OK for flights. */
export function buildPdfPlanTitle(opts: {
  groundTransportMode?: string | null;
  accommodationMode?: string | null;
  originPlace?: string | null;
  destinationPlace?: string | null;
  destinationName?: string | null;
  from?: string | null;
  to?: string | null;
}): string {
  const motorhome =
    opts.groundTransportMode === "motorhome" || opts.accommodationMode === "motorhome";

  if (motorhome) {
    const origin = (opts.originPlace ?? "").trim();
    const dest = (opts.destinationPlace ?? opts.destinationName ?? "").trim();
    if (origin && dest) return `${origin} → ${dest}`;
    if (origin) return origin;
    if (dest) return dest;
  }

  const from = (opts.from ?? opts.originPlace ?? "").trim();
  const to = (opts.to ?? opts.destinationPlace ?? opts.destinationName ?? "").trim();
  if (from && to) return `${from} → ${to}`;
  return from || to || "Skybooplan";
}
