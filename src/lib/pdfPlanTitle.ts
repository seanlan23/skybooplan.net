/** Human PDF/header title — places for road trips, IATA OK for flights. */
export function buildPdfPlanTitle(opts: {
  groundTransportMode?: string | null;
  accommodationMode?: string | null;
  originPlace?: string | null;
  destinationPlace?: string | null;
  destinationName?: string | null;
  from?: string | null;
  to?: string | null;
}): string {
  const road =
    opts.groundTransportMode === "motorhome" ||
    opts.groundTransportMode === "car" ||
    opts.accommodationMode === "motorhome";

  const originPlace = (opts.originPlace ?? "").trim();
  const destPlace = (
    opts.destinationPlace ??
    opts.destinationName ??
    ""
  ).trim();

  if (road) {
    if (originPlace && destPlace) return `${originPlace} → ${destPlace}`;
    if (originPlace) return originPlace;
    if (destPlace) return destPlace;
  }

  // Empty IATA ("") must not win over a real place label (car trips used to print "LJU").
  const from = (opts.from?.trim() || originPlace).trim();
  const to = (opts.to?.trim() || destPlace).trim();
  if (from && to) return `${from} → ${to}`;
  return from || to || "Skybooplan";
}
