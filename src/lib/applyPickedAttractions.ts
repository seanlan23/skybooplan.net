import type { SkeletonHighlight, TripRegion } from "@/lib/aiPlan.functions";
import {
  catalogAttractionDescription,
  catalogAttractionLabel,
  cityTips,
  estimateCatalogBudget,
  formatDuration,
  formatPriceRange,
  getAttractionById,
} from "@/lib/attractionCatalog";

function cityMatches(regionCity: string, attractionCity: string): boolean {
  return regionCity.toLowerCase().trim() === attractionCity.toLowerCase().trim();
}

function toHighlight(
  id: string,
  day: number,
  langCode: string,
): SkeletonHighlight | null {
  const a = getAttractionById(id);
  if (!a) return null;
  const name = catalogAttractionLabel(a, langCode);
  const desc = catalogAttractionDescription(a, langCode);
  const dur = formatDuration(a.durationMin, langCode);
  return {
    day,
    name,
    description: a.fullDay ? `${desc} (${dur})` : desc,
    visitDuration: dur,
    priceLabel: formatPriceRange(a.priceEurMin, a.priceEurMax, langCode),
    lat: a.lat,
    lng: a.lng,
  };
}

/** Spread user picks across days in each region — max one full-day excursion per day. */
export function distributePicksInRegion(
  region: TripRegion,
  pickIds: string[],
  langCode: string,
): SkeletonHighlight[] {
  const picks = pickIds
    .map((id) => getAttractionById(id))
    .filter((a): a is NonNullable<typeof a> => !!a && cityMatches(region.city, a.city));

  if (!picks.length) return [];

  const days: number[] = [];
  for (let d = region.startDay; d <= region.endDay; d++) days.push(d);
  if (!days.length) return [];

  const fullDay = picks.filter((p) => p.fullDay);
  const regular = picks.filter((p) => !p.fullDay);

  const highlights: SkeletonHighlight[] = [];
  const usedDays = new Set<number>();

  let dayIdx = 0;
  for (const pick of fullDay) {
    while (dayIdx < days.length && usedDays.has(days[dayIdx]!)) dayIdx++;
    if (dayIdx >= days.length) break;
    const day = days[dayIdx]!;
    usedDays.add(day);
    const h = toHighlight(pick.id, day, langCode);
    if (h) highlights.push(h);
    dayIdx++;
  }

  const openDays = days.filter((d) => !usedDays.has(d));
  const scheduleDays = openDays.length ? openDays : days;
  let rot = 0;
  for (const pick of regular) {
    const day = scheduleDays[rot % scheduleDays.length]!;
    const h = toHighlight(pick.id, day, langCode);
    if (h) highlights.push(h);
    rot++;
  }

  return highlights;
}

export function applyCatalogPicksToRegions(
  regions: TripRegion[],
  pickIds: string[],
  langCode: string,
): TripRegion[] {
  return regions.map((region) => {
    const tips = cityTips(region.city, langCode);
    const highlights = distributePicksInRegion(region, pickIds, langCode);
    return {
      ...region,
      highlights,
      localTransportTips: region.localTransportTips?.trim() || tips.local,
      travelTips: region.travelTips?.trim() || tips.travel,
    };
  });
}

export function catalogSkeletonSummary(
  pickIds: string[],
  langCode: string,
  destinationName: string,
): string {
  const slo = langCode === "sl" || langCode.startsWith("sl");
  const n = pickIds.length;
  if (slo) {
    return `Načrt po tvoji izbiri — ${n} ogledov in aktivnosti po ${destinationName}. Prevozi in razporeditev po dnevih sta avtomatska.`;
  }
  return `Your pick-and-plan itinerary — ${n} sights and activities across ${destinationName}. Transport and day scheduling are automatic.`;
}

export function catalogSkeletonBudget(pickIds: string[], pax: number): number {
  const est = estimateCatalogBudget(pickIds, pax);
  return Math.round((est.groupMin + est.groupMax) / 2);
}
