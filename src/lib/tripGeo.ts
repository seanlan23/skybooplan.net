import type { SkeletonHighlight, TripRegion } from "@/lib/aiPlan.functions";
import {
  cleanseRegionHighlights,
  spreadKrabiBoatExcursions,
  splitKrabiHillTempleDays,
} from "@/lib/tripContent";
import { distanceKm } from "@/lib/planValidation";
import { lookupDestination } from "@/lib/destinationCoords";

function normalizeHighlightName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DEDUP_STOP = new Set([
  "park",
  "state",
  "national",
  "beach",
  "hike",
  "trail",
  "tour",
  "visit",
  "the",
  "and",
  "los",
  "angeles",
  "city",
  "center",
  "centre",
  "area",
  "district",
  "neighborhood",
  "viewpoint",
  "view",
  "walk",
  "walking",
  "drive",
  "day",
  "trip",
  "local",
  "lokalno",
  "county",
  "pier",
  "coast",
  "highway",
  "boulevard",
  "blvd",
  "studios",
  "hollywood",
]);

/** Fuzzy key — catches "Griffith Observatory" vs "Griffith Park Observatory". */
export function highlightFuzzyKey(name: string): string {
  const tokens = normalizeHighlightName(name)
    .split(" ")
    .filter((t) => t.length >= 3 && !DEDUP_STOP.has(t));
  return [...new Set(tokens)].sort().join("|");
}

const POI_COORDS: Record<string, { lat: number; lng: number }> = {
  "griffith|observatory": { lat: 34.1184, lng: -118.3004 },
  "hollywood|sign": { lat: 34.1341, lng: -118.3215 },
  "santa|monica|pier": { lat: 34.0083, lng: -118.4987 },
  "santa|monica|beach": { lat: 34.0095, lng: -118.4968 },
  "universal|studios": { lat: 34.1381, lng: -118.3534 },
  "universal|studios|hollywood": { lat: 34.1381, lng: -118.3534 },
  "getty|center": { lat: 34.078, lng: -118.4741 },
  "lacma": { lat: 34.0638, lng: -118.3589 },
  "el|matador": { lat: 34.0379, lng: -118.8695 },
  "venice|canal": { lat: 33.985, lng: -118.4695 },
  "venice|beach": { lat: 33.985, lng: -118.4725 },
  "griffith|carousel": { lat: 34.1328, lng: -118.2872 },
  "warner|bros": { lat: 34.1487, lng: -118.337 },
  "rodeo|drive": { lat: 34.0674, lng: -118.4003 },
  "downtown|los": { lat: 34.0489, lng: -118.2518 },
  "grand|central|market": { lat: 34.0507, lng: -118.249 },
  "beverly|hills": { lat: 34.0736, lng: -118.4004 },
  "melrose|avenue": { lat: 34.0836, lng: -118.3442 },
  "pasadena|old|town": { lat: 34.1478, lng: -118.1503 },
  "zuma|beach": { lat: 34.022, lng: -118.834 },
  "runyon|canyon": { lat: 34.1104, lng: -118.3484 },
  "farmers|market": { lat: 34.0722, lng: -118.3617 },
  "walt|disney|concert|hall": { lat: 34.0553, lng: -118.2498 },
  // Tanzania safari & Zanzibar
  "ngorongoro|crater": { lat: -3.161, lng: 35.587 },
  "maasai|boma": { lat: -3.35, lng: 36.2 },
  "serengeti": { lat: -2.333, lng: 34.833 },
  "balloon|safari": { lat: -2.4, lng: 34.85 },
  "kendwa": { lat: -5.723, lng: 39.258 },
  "nungwi": { lat: -5.726, lng: 39.298 },
  "stone|town": { lat: -6.163, lng: 39.189 },
  "forodhani": { lat: -6.162, lng: 39.189 },
  "jozani": { lat: -6.273, lng: 39.412 },
  "paje": { lat: -6.265, lng: 39.535 },
  "matemwe": { lat: -5.95, lng: 39.38 },
  "kizimkazi": { lat: -6.433, lng: 39.483 },
  // Canada
  "cn|tower": { lat: 43.6426, lng: -79.3871 },
  "stanley|park": { lat: 49.2947, lng: -123.1384 },
  "granville|island": { lat: 49.2713, lng: -123.134 },
  "queen|elizabeth|park": { lat: 49.2417, lng: -123.1129 },
  "lake|louise": { lat: 51.4254, lng: -116.1773 },
  "banff|upper|hot|springs": { lat: 51.151, lng: -115.561 },
  "sulphur|mountain": { lat: 51.144, lng: -115.574 },
  "hornblower|niagara": { lat: 43.09, lng: -79.075 },
  "journey|behind|falls": { lat: 43.079, lng: -79.078 },
  "niagara|city|cruises": { lat: 43.09, lng: -79.075 },
  "parliament|hill": { lat: 45.424, lng: -75.699 },
  "byward|market": { lat: 45.427, lng: -75.693 },
  "niagara|falls": { lat: 43.096, lng: -79.037 },
  "sunset|crater": { lat: 35.364, lng: -111.501 },
  "cadillac|ranch": { lat: 35.187, lng: -101.987 },
  // Thailand
  "grand|palace": { lat: 13.75, lng: 100.4915 },
  "wat|phra|kaew": { lat: 13.751, lng: 100.4925 },
  "wat|pho": { lat: 13.7465, lng: 100.493 },
  "wat|arun": { lat: 13.7437, lng: 100.4888 },
  "wat|plai|laem": { lat: 9.571, lng: 100.005 },
  "big|buddha": { lat: 9.571, lng: 100.005 },
  "khao|san": { lat: 13.7589, lng: 100.4974 },
  "wat|mahathat": { lat: 14.357, lng: 100.567 },
  "ayutthaya": { lat: 14.353, lng: 100.569 },
  "khao|sok": { lat: 8.915, lng: 98.529 },
  "cheow|lan": { lat: 8.97, lng: 98.82 },
  "ratchaprapha": { lat: 8.97, lng: 98.82 },
  "koh|phangan": { lat: 9.731, lng: 100.013 },
  "haad|rIn": { lat: 9.974, lng: 100.069 },
  "full|moon|party": { lat: 9.974, lng: 100.069 },
  "secret|beach": { lat: 9.775, lng: 99.975 },
  "zen|beach": { lat: 9.762, lng: 99.989 },
  "coral|cove": { lat: 9.512, lng: 100.055 },
  "chaweng": { lat: 9.535, lng: 100.062 },
  "iconsiam|icon|siam": { lat: 13.726, lng: 100.51 },
  "floating|market": { lat: 13.517, lng: 100.143 },
  "chatuchak": { lat: 13.799, lng: 100.553 },
  "yaowarat|chinatown": { lat: 13.741, lng: 100.508 },
  "koh|ma": { lat: 9.998, lng: 99.789 },
  "mae|haad": { lat: 9.998, lng: 99.789 },
  "phaeng|waterfall": { lat: 9.745, lng: 100.015 },
  "seen|beach|club": { lat: 9.558, lng: 100.031 },
  "don|sak|pier|donsak": { lat: 9.318, lng: 99.694 },
  "ton|toey|rafthouse": { lat: 8.97, lng: 98.82 },
};

const TH_ZONE_KEYWORDS: Array<{ test: RegExp; coords: { lat: number; lng: number } }> = [
  { test: /bangkok|khao san|grand palace|wat pho|wat arun|chinatown|yaowarat/i, coords: { lat: 13.756, lng: 100.502 } },
  { test: /ayutthaya|wat mahathat/i, coords: { lat: 14.353, lng: 100.569 } },
  { test: /khao sok|cheow lan|ratchaprapha/i, coords: { lat: 8.97, lng: 98.82 } },
  { test: /koh phangan|ko pha-ngan|haad rin|zen beach|secret beach/i, coords: { lat: 9.731, lng: 100.013 } },
  { test: /koh samui|ko samui|chaweng|coral cove|wat plai laem/i, coords: { lat: 9.512, lng: 100.013 } },
];

const ZANZIBAR_ZONE_KEYWORDS: Array<{ test: RegExp; coords: { lat: number; lng: number } }> = [
  { test: /kendwa|nungwi|north/i, coords: { lat: -5.72, lng: 39.28 } },
  { test: /stone town|forodhani/i, coords: { lat: -6.163, lng: 39.189 } },
  { test: /jozani|paje|east/i, coords: { lat: -6.27, lng: 39.5 } },
  { test: /matemwe|northeast/i, coords: { lat: -5.95, lng: 39.38 } },
  { test: /kizimkazi|south/i, coords: { lat: -6.43, lng: 39.48 } },
];

/** Mainland POIs that must never appear in a Zanzibar region. */
const MAINLAND_NOT_ZANZIBAR = /mikindani|dar es salaam|arusha|serengeti|ngorongoro|kilimanjaro|manyara|tarangire|mwanza/i;

/** US-side Niagara attractions — need border crossing / ESTA, not on Canadian plan. */
const NIAGARA_US_ONLY =
  /maid of the mist|cave of the winds|goat island|american falls|terrapin point|rainbow bridge.*usa/i;

const FULL_DAY_SAFARI = [/ngorongoro/i, /balloon safari/i, /celodnevni safari|full.?day safari/i];

const LA_ZONE_KEYWORDS: Array<{ test: RegExp; coords: { lat: number; lng: number } }> = [
  { test: /santa monica|venice|marina del rey|playa/i, coords: { lat: 34.01, lng: -118.49 } },
  { test: /malibu|matador|zuma|pacific coast/i, coords: { lat: 34.04, lng: -118.75 } },
  { test: /universal|studio city|burbank/i, coords: { lat: 34.138, lng: -118.353 } },
  { test: /griffith|hollywood|runyon|walk of fame/i, coords: { lat: 34.12, lng: -118.3 } },
  { test: /getty|brentwood|beverly|rodeo|west hollywood|melrose/i, coords: { lat: 34.07, lng: -118.4 } },
  { test: /downtown|dtla|grand central|broad|walt disney concert/i, coords: { lat: 34.05, lng: -118.25 } },
  { test: /pasadena|eagle rock/i, coords: { lat: 34.148, lng: -118.15 } },
  { test: /lacma|mid.?wilshire|miracle mile/i, coords: { lat: 34.064, lng: -118.36 } },
];

export function lookupPoiCoords(name: string): { lat: number; lng: number } | null {
  const key = highlightFuzzyKey(name);
  if (POI_COORDS[key]) return POI_COORDS[key]!;
  const tokens = key.split("|");
  for (const [k, coords] of Object.entries(POI_COORDS)) {
    const poiTokens = k.split("|");
    if (tokens.length >= 2 && poiTokens.every((t) => tokens.includes(t))) return coords;
  }
  for (const zone of LA_ZONE_KEYWORDS) {
    if (zone.test.test(name)) return zone.coords;
  }
  for (const zone of ZANZIBAR_ZONE_KEYWORDS) {
    if (zone.test.test(name)) return zone.coords;
  }
  for (const zone of TH_ZONE_KEYWORDS) {
    if (zone.test.test(name)) return zone.coords;
  }
  return null;
}

function isZanzibarRegion(city: string): boolean {
  return /zanzibar|stone town|nungwi|kendwa|paje/i.test(city);
}

function isSafariRegion(city: string): boolean {
  return /serengeti|ngorongoro|arusha|manyara|tarangire|safari/i.test(city);
}

function isNiagaraCanadaRegion(city: string): boolean {
  return /niagara/i.test(city);
}

function isFullDaySafariSight(name: string): boolean {
  return FULL_DAY_SAFARI.some((r) => r.test(name));
}

/** Remove mainland hallucinations from Zanzibar days (e.g. Mikindani). */
export function filterInvalidRegionHighlights(
  region: TripRegion,
  trace?: (msg: string) => void,
): SkeletonHighlight[] {
  return (region.highlights ?? []).filter((h) => {
    if (isZanzibarRegion(region.city) && MAINLAND_NOT_ZANZIBAR.test(h.name)) {
      trace?.(`geo: removed "${h.name}" — not on Zanzibar (mainland POI)`);
      return false;
    }
    if (isNiagaraCanadaRegion(region.city) && NIAGARA_US_ONLY.test(h.name)) {
      trace?.(`geo: removed "${h.name}" — US-side Niagara (border/visa required)`);
      return false;
    }
    return true;
  });
}

function findRelocateDay(
  h: SkeletonHighlight,
  region: TripRegion,
  excludeDay: number,
  byDay: Map<number, SkeletonHighlight[]>,
  maxPerDay: number,
): number {
  const pt = effectiveCoords(h);
  let best = excludeDay;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let d = region.startDay; d <= region.endDay; d++) {
    if (d === excludeDay) continue;
    const list = byDay.get(d) ?? [];
    if (list.length >= maxPerDay) continue;
    const target = centroid(list) ?? (pt ?? { lat: region.lat, lng: region.lng });
    const dist = pt ? distanceKm(pt, target) : 0;
    const score = dist + list.length * 4;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best === excludeDay ? Math.min(region.endDay, excludeDay + 1) : best;
}

/** Ngorongoro / balloon = full day — no Maasai boma same morning. */
export function enforceSafariDayRules(
  highlights: SkeletonHighlight[],
  region: TripRegion,
  trace?: (msg: string) => void,
): SkeletonHighlight[] {
  if (!isSafariRegion(region.city)) return highlights;

  const list = [...highlights];
  for (let d = region.startDay; d <= region.endDay; d++) {
    const dayH = list.filter((x) => x.day === d);
    const anchors = dayH.filter((x) => isFullDaySafariSight(x.name));
    if (anchors.length === 0) continue;

    const byDay = new Map<number, SkeletonHighlight[]>();
    for (const x of list) {
      const arr = byDay.get(x.day) ?? [];
      arr.push(x);
      byDay.set(x.day, arr);
    }

    for (const h of dayH) {
      if (anchors.includes(h)) continue;
      const newDay = findRelocateDay(h, region, d, byDay, 3);
      if (newDay !== d) {
        h.day = newDay;
        trace?.(`safari: moved "${h.name}" day ${d} → ${newDay} (${anchors[0]!.name} is full-day)`);
      }
    }
  }
  return list;
}

function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

function nearPoint(
  lat: number,
  lng: number,
  center: { lat: number; lng: number },
  maxKm: number,
): boolean {
  return distanceKm({ lat, lng }, center) <= maxKm;
}

/** Never collapse failed geocodes to region center — kills proximity logic. */
export function resolveHighlightCoords(h: SkeletonHighlight, regionCenter?: { lat: number; lng: number }): SkeletonHighlight {
  const poi = lookupPoiCoords(h.name);
  if (poi) return { ...h, lat: poi.lat, lng: poi.lng };

  if (isValidCoord(h.lat, h.lng)) {
    if (regionCenter && nearPoint(h.lat, h.lng, regionCenter, 3)) {
      const inferred = lookupPoiCoords(h.name);
      if (inferred) return { ...h, ...inferred };
    } else {
      return h;
    }
  }

  return { ...h, lat: 0, lng: 0 };
}

function effectiveCoords(h: SkeletonHighlight): { lat: number; lng: number } | null {
  if (isValidCoord(h.lat, h.lng)) return { lat: h.lat, lng: h.lng };
  const poi = lookupPoiCoords(h.name);
  return poi;
}

function daySpreadKm(highlights: SkeletonHighlight[]): number {
  const pts = highlights.map(effectiveCoords).filter((p): p is { lat: number; lng: number } => !!p);
  if (pts.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      max = Math.max(max, distanceKm(pts[i]!, pts[j]!));
    }
  }
  return max;
}

function centroid(highlights: SkeletonHighlight[]): { lat: number; lng: number } | null {
  const pts = highlights.map(effectiveCoords).filter((p): p is { lat: number; lng: number } => !!p);
  if (!pts.length) return null;
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
  return { lat, lng };
}

function farthestFromCentroid(
  highlights: SkeletonHighlight[],
  center: { lat: number; lng: number },
): SkeletonHighlight | null {
  let worst: SkeletonHighlight | null = null;
  let worstKm = -1;
  for (const h of highlights) {
    const p = effectiveCoords(h);
    if (!p) continue;
    const km = distanceKm(p, center);
    if (km > worstKm) {
      worstKm = km;
      worst = h;
    }
  }
  return worst;
}

export function isSprawlingMetroRegion(
  region: TripRegion,
  destinationIata: string,
  totalTripDays: number,
): boolean {
  const span = region.endDay - region.startDay + 1;
  if (span < 6) return false;
  const iata = destinationIata.toUpperCase();
  if (iata === "LAX" || iata === "JFK") return true;
  const named = (region.highlights ?? []).map(effectiveCoords).filter(Boolean);
  if (named.length < 4) return span >= 8 && totalTripDays >= 8;
  let maxSpan = 0;
  const pts = (region.highlights ?? []).map(effectiveCoords).filter((p): p is { lat: number; lng: number } => !!p);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      maxSpan = Math.max(maxSpan, distanceKm(pts[i]!, pts[j]!));
    }
  }
  return maxSpan > 45;
}

export function maxIntraDayKm(
  destinationIata: string,
  sprawling: boolean,
  regionCity?: string,
): number {
  const iata = destinationIata.toUpperCase();
  if (iata === "LAX" || iata === "JFK") return 15;
  if (isZanzibarRegion(regionCity ?? "") || iata === "ZNZ") return 10;
  if (isSafariRegion(regionCity ?? "")) return 25;
  return sprawling ? 20 : 12;
}

export type RebalanceOpts = {
  maxIntraDayKm: number;
  maxPerDay: number;
  preserveDays?: number[];
};

/** Each named sight appears once — fuzzy match across the whole region. */
export function dedupeHighlightList(
  highlights: SkeletonHighlight[],
  trace?: (msg: string) => void,
): SkeletonHighlight[] {
  const seen = new Map<string, number>();
  return highlights.filter((h) => {
    const key = highlightFuzzyKey(h.name);
    if (!key || key.length < 3) return true;
    const prev = seen.get(key);
    if (prev !== undefined) {
      trace?.(`dedup: "${h.name}" day ${h.day} skipped (fuzzy match day ${prev})`);
      return false;
    }
    seen.set(key, h.day);
    return true;
  });
}

/**
 * Move outliers so each calendar day clusters nearby POIs (fixes LA zig-zag days).
 */
export function rebalanceRegionHighlightsByProximity(
  region: TripRegion,
  opts: RebalanceOpts,
  trace?: (msg: string) => void,
): TripRegion {
  const regionCenter = isValidCoord(region.lat, region.lng) ? { lat: region.lat, lng: region.lng } : undefined;
  const highlights = (region.highlights ?? []).map((h) => resolveHighlightCoords(h, regionCenter));
  const preserve = new Set(opts.preserveDays ?? []);

  const named = highlights.filter((h) => {
    const n = h.name.trim().toLowerCase();
    return n && n !== region.city.trim().toLowerCase() && !n.includes("raziskovanje");
  });

  const lastMovedFrom = new Map<string, number>();

  for (let pass = 0; pass < 60; pass++) {
    const byDay = new Map<number, SkeletonHighlight[]>();
    for (const h of named) {
      const list = byDay.get(h.day) ?? [];
      list.push(h);
      byDay.set(h.day, list);
    }

    let worstDay = -1;
    let worstSpread = opts.maxIntraDayKm;
    for (const [day, list] of byDay) {
      if (preserve.has(day) && list.length <= 1) continue;
      const spread = daySpreadKm(list);
      if (spread > worstSpread) {
        worstSpread = spread;
        worstDay = day;
      }
    }
    if (worstDay < 0) break;

    const dayList = byDay.get(worstDay)!;
    const center = centroid(dayList);
    if (!center) break;

    const outlier = farthestFromCentroid(dayList, center);
    if (!outlier) break;

    const outlierPt = effectiveCoords(outlier);
    if (!outlierPt) break;

    let bestDay = worstDay;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let d = region.startDay; d <= region.endDay; d++) {
      if (d === worstDay) continue;
      const list = byDay.get(d) ?? [];
      if (list.length >= opts.maxPerDay) continue;
      const target = centroid(list) ?? outlierPt;
      const dist = distanceKm(outlierPt, target);
      const penalty = preserve.has(d) ? 30 : 0;
      const score = dist + penalty + list.length * 3;
      if (score < bestScore) {
        bestScore = score;
        bestDay = d;
      }
    }

    if (bestDay === worstDay) break;

    const moveKey = outlier.name.trim().toLowerCase();
    if (lastMovedFrom.get(moveKey) === bestDay) break;

    lastMovedFrom.set(moveKey, worstDay);
    outlier.day = bestDay;
    trace?.(
      `geo: moved "${outlier.name}" day ${worstDay} → ${bestDay} (spread ${Math.round(worstSpread)}km)`,
    );
  }

  const generic = highlights.filter((h) => !named.includes(h));
  return { ...region, highlights: [...named, ...generic] };
}

/** Resolve coords, dedupe, rebalance — sync pipeline for preview cards. */
export function prepareRegionHighlights(
  region: TripRegion,
  destinationIata: string,
  totalTripDays: number,
  trace?: (msg: string) => void,
  departDate?: string,
): TripRegion {
  const center = isValidCoord(region.lat, region.lng) ? { lat: region.lat, lng: region.lng } : undefined;
  const country = lookupDestination(destinationIata)?.country;
  let highlights = filterInvalidRegionHighlights(region, trace);
  highlights = cleanseRegionHighlights(
    { ...region, highlights },
    { departDate, country },
    trace,
  );
  highlights = highlights.map((h) => resolveHighlightCoords(h, center));
  highlights = dedupeHighlightList(highlights, trace);
  highlights = enforceSafariDayRules(highlights, region, trace);
  highlights = splitKrabiHillTempleDays(highlights, region);
  highlights = spreadKrabiBoatExcursions(highlights, region);

  const sprawling = isSprawlingMetroRegion({ ...region, highlights }, destinationIata, totalTripDays);
  const maxKm = maxIntraDayKm(destinationIata, sprawling, region.city);
  const maxPerDay = isZanzibarRegion(region.city) ? 3 : 4;

  return rebalanceRegionHighlightsByProximity(
    { ...region, highlights },
    { maxIntraDayKm: maxKm, maxPerDay, preserveDays: [region.startDay, region.endDay] },
    trace,
  );
}

/** Nearest-neighbor order — morning→afternoon follows a sensible route. */
export function orderHighlightsByProximity(highlights: SkeletonHighlight[]): SkeletonHighlight[] {
  if (highlights.length <= 1) return highlights;

  const withPts = highlights
    .map((h) => ({ h, p: effectiveCoords(h) }))
    .filter((x): x is { h: SkeletonHighlight; p: { lat: number; lng: number } } => !!x.p);
  if (withPts.length < 2) return highlights;

  const remaining = [...withPts];
  const ordered: SkeletonHighlight[] = [];
  let current = remaining.shift()!;
  ordered.push(current.h);

  while (remaining.length) {
    let bestIdx = 0;
    let bestKm = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const km = distanceKm(current.p, remaining[i]!.p);
      if (km < bestKm) {
        bestKm = km;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(current.h);
  }

  const noCoords = highlights.filter((h) => !effectiveCoords(h));
  return [...ordered, ...noCoords];
}

export function buildMetroClusteringPayload(
  destinationIata: string,
  nDays: number,
  langCode: string,
): Record<string, unknown> | undefined {
  const iata = destinationIata.toUpperCase();
  if (nDays < 7) return undefined;

  const slo = langCode === "sl" || langCode.startsWith("sl");

  if (iata === "LAX") {
    return {
      city: "Los Angeles",
      maxKmSameDay: 15,
      rule: slo
        ? "LA je razpotegnjena metropola — v ENEM dnevu NE mešaj Hollywooda/Griffitha s Santa Monico/Malibujem (20–60+ km, 1–3 uri v prometu). Vsak dan ostani v isti coni. Griffith Observatory samo ENKRAT."
        : "LA sprawls — never mix Hollywood/Griffith with Santa Monica/Malibu same day. One zone per day. Griffith Observatory only ONCE.",
      zones: [
        "Hollywood & Griffith Park",
        "Santa Monica & Venice Beach",
        "Downtown & Arts District (DTLA, LACMA)",
        "Universal Studios & Studio City",
        "Malibu & Pacific Coast Highway",
        "Beverly Hills & West Hollywood",
      ],
    };
  }

  if (iata === "JRO") {
    return {
      safariClustering: {
        maxKmSameDay: 25,
        rule: slo
          ? "Ngorongoro krater = CEL DAN (med Arusho in Serengetijem), ne dopoldanski izlet iz središča Serengetija. Maasai boma in Ngorongoro nikoli isti dan. Celodnevni safari ≥200 € na osebo."
          : "Ngorongoro Crater = FULL DAY transit day between Arusha and Serengeti — never a morning hop from central Serengeti.",
      },
      zanzibarNote: slo
        ? "Če načrt vključuje Zanzibar: Mikindani ni na otoku — samo Stone Town, plaže sever/vzhod/jug."
        : "If plan includes Zanzibar: Mikindani is mainland — not a Zanzibar POI.",
    };
  }

  if (iata === "ZNZ") {
    return {
      city: "Zanzibar",
      maxKmSameDay: 10,
      rule: slo
        ? "Zanzibar: ista cona otoka na dan (Nungwi/Kendwa, Stone Town, Paje/Jozani, Kizimkazi). Mikindani je na celini — ne na Zanzibarju!"
        : "Zanzibar: one island zone per day. Mikindani is mainland Tanzania.",
      zones: ["North (Nungwi/Kendwa)", "Stone Town & Forodhani", "East (Paje/Jozani)", "Northeast (Matemwe)", "South (Kizimkazi)"],
    };
  }

  if (iata === "JFK") {
    return {
      city: "New York",
      maxKmSameDay: 8,
      rule: slo
        ? "Manhattan, Brooklyn in Queens načrtuj ločeno — ne združuj Bronx + Coney Island v isti dan brez realnega prevoza."
        : "Cluster by borough — do not zig-zag Bronx and Coney Island same day without a transit block.",
      zones: ["Manhattan Midtown", "Manhattan Downtown", "Brooklyn", "Queens", "Central Park & Upper East Side"],
    };
  }

  if (iata === "BCN" || iata === "MAD" || iata === "AGP") {
    return {
      spainRouting: {
        rule: slo
          ? "Španija: linearno proti JUGU (Andaluzija → Gibraltar). Madrid samo na POVRATNI poti sever — nikoli Madrid na začetku in spet na koncu. Konec v letalskem mestu (Barcelona/Madrid) za odlet."
          : "Spain: southbound to Gibraltar; Madrid only once on the northbound return — never Madrid twice. End at flight hub.",
        gibraltarNote: slo
          ? "Gibraltar: peš ali taxi (ni Graba). Če želiš kanadsko/Azijo — ne, to je EU/UK meja."
          : "Gibraltar: walk or taxi; UK border crossing may require passport check.",
      },
    };
  }

  if (iata === "YYZ" || iata === "YVR" || iata === "YOW" || iata === "YYC") {
    return {
      canadaRouting: {
        rule: slo
          ? "Kanada: Toronto → Niagara (kanadska stran: Hornblower/Journey Behind the Falls, NE Maid of the Mist/Cave of the Winds — to je ZDA) → Ottawa → BANFF (notranji let YOW/YYZ→YYC + vožnja, CEL DAN prevoz) → Vancouver (let ali 10h vožnja, CEL DAN). Nikoli Ottawa popoldne in Banff zjutraj isti dan. Prevoz = Uber/taxi, ne Grab."
          : "Canada: linear east→west; Ottawa→Banff and Banff→Vancouver need FULL travel days (domestic flight). Canadian Niagara only (Hornblower, not Maid of the Mist). No Grab in Canada.",
        travelDaysRequired: ["Ottawa→Banff", "Banff→Vancouver"],
        niagaraCanada: ["Hornblower Niagara City Cruises", "Journey Behind the Falls", "Niagara Parkway"],
        niagaraAvoidUS: ["Maid of the Mist", "Cave of the Winds", "Goat Island"],
      },
    };
  }

  return undefined;
}
