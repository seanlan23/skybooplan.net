import { isAllowedResortStayProperty, type HotelKind } from "@/lib/hotelAmenities";
import { cleanHotelDisplayName } from "@/lib/hotelDisplayName";
import { uniqueHotelImageUrls } from "@/lib/hotelImages";
import {
  isDownrankedResortLocation,
  isExcludedResortLocation,
  isOverwaterStay,
  matchResortStayMix,
  matchesValueNeedle,
  type ResortStayMixRow,
} from "@/lib/resortStayMix";
import {
  budgetCapMaxPerPerson,
  hotelFitsPackageBudgetCap,
} from "@/lib/tripBudgetCap";

export type PackageMealPlan = "all_inclusive" | "breakfast";

/** Minimal live-hotel fields — do not import the Booking server module here. */
export type ResortHotelPickInput = {
  id: string;
  name: string;
  price: number;
  rating: number;
  image?: string;
  images?: string[];
  bookingUrl?: string;
  reviewWord?: string;
  stars?: number;
  neighborhood?: string;
  kind?: HotelKind;
  typeName?: string;
  typeId?: number;
  lat?: number;
  lng?: number;
  amenities?: { allInclusive?: boolean; breakfast?: boolean; pool?: boolean };
  /** Booking location review (0–10 or 0–100). */
  locationScore?: number;
};

export const RESORT_PACKAGE_TIERS = [
  "value",
  "recommended",
  "all_inclusive",
  "all_inclusive_alt",
  "boutique",
  "premium",
] as const;
export type ResortPackageTier = (typeof RESORT_PACKAGE_TIERS)[number];

export const MIN_RESORT_GUEST_SCORE = 8;
export const MAX_RESORT_PACKAGE_OFFERS = 6;

export type ResortHotelOffer = {
  id: string;
  tier: ResortPackageTier;
  name: string;
  imageUrl?: string;
  images?: string[];
  /** Real Booking review score only. */
  guestScore?: number;
  reviewWord?: string;
  hotelEur: number;
  mealPlan: PackageMealPlan;
  bookingHref?: string;
};

/** Booking may send 8.4 or 84 — always compare on a 0–10 scale. */
export function guestScoreOnTen(rating: number): number {
  if (!Number.isFinite(rating) || rating <= 0) return 0;
  return rating > 10 ? rating / 10 : rating;
}

export function meetsMinGuestScore(rating: number): boolean {
  return guestScoreOnTen(rating) >= MIN_RESORT_GUEST_SCORE;
}

export function mealPlanFromHotel(
  hotel: Pick<ResortHotelPickInput, "name" | "amenities">,
): PackageMealPlan {
  if (hotel.amenities?.allInclusive) return "all_inclusive";
  if (/\ball[-\s]?inclusive\b|\ballinclusive\b|\bvse\s+vklju[čc]en/i.test(hotel.name)) {
    return "all_inclusive";
  }
  return "breakfast";
}

export function isBoutiqueOrBeach(hotel: Pick<ResortHotelPickInput, "name" | "neighborhood">): boolean {
  return /\bboutique\b|\bbeach(front|side)?\b|\bseaside\b|\bwaterfront\b|\bseaview\b|\bplaž|\bplaza\b|\bspiaggia\b|\bplage\b|\bstrand\b|\bobal/i.test(
    [hotel.name, hotel.neighborhood].filter(Boolean).join(" "),
  );
}

export function isLuxuryStay(hotel: Pick<ResortHotelPickInput, "name" | "stars">): boolean {
  if ((hotel.stars ?? 0) >= 5) return true;
  return /\b5\s*[- ]?(star|zvezd|[★☆])\b|\bluxury\b|\bluksuz|\bdeluxe\b/i.test(hotel.name);
}

/** Guest score per euro of stay total — higher is better value. */
export function valueForMoneyScore(
  hotel: Pick<ResortHotelPickInput, "rating" | "price">,
): number {
  const rating = guestScoreOnTen(hotel.rating);
  const price = hotel.price;
  if (!(rating > 0) || !(price > 0)) return 0;
  return rating / price;
}

function byValueForMoney(a: ResortHotelPickInput, b: ResortHotelPickInput): number {
  return valueForMoneyScore(b) - valueForMoneyScore(a) || b.rating - a.rating || a.price - b.price;
}

function mixPreferenceScore(
  hotel: Pick<ResortHotelPickInput, "name" | "neighborhood">,
  mix: ResortStayMixRow | null,
): number {
  if (!mix) return 0;
  let score = 0;
  if (matchesValueNeedle(hotel, mix)) score += 4;
  if (isBoutiqueOrBeach(hotel)) score += 2;
  if (isDownrankedResortLocation(hotel, mix)) score -= 6;
  return score;
}

function byMixThenValue(mix: ResortStayMixRow | null) {
  return (a: ResortHotelPickInput, b: ResortHotelPickInput): number =>
    mixPreferenceScore(b, mix) - mixPreferenceScore(a, mix) || byValueForMoney(a, b);
}

export function hasPoolOrBeach(
  hotel: Pick<ResortHotelPickInput, "name" | "neighborhood" | "amenities">,
): boolean {
  return Boolean(hotel.amenities?.pool) || isBoutiqueOrBeach(hotel);
}

export function locationScoreOnTen(score: number | undefined): number {
  if (!Number.isFinite(score) || !score || score <= 0) return 0;
  return guestScoreOnTen(score);
}

export function isSkybooplanCandidate(hotel: ResortHotelPickInput): boolean {
  return guestScoreOnTen(hotel.rating) >= 8.5 && hasPoolOrBeach(hotel);
}

export function isBoutiqueLocationCandidate(hotel: ResortHotelPickInput): boolean {
  if (locationScoreOnTen(hotel.locationScore) >= 9) return true;
  return guestScoreOnTen(hotel.rating) >= 9 && isBoutiqueOrBeach(hotel);
}

function usableHotels(
  hotels: ResortHotelPickInput[],
  mix?: ResortStayMixRow | null,
  allowUnrated = false,
): ResortHotelPickInput[] {
  const seen = new Set<string>();
  const out: ResortHotelPickInput[] = [];
  const minStars = mix?.minStars ?? 3;
  for (const hotel of hotels) {
    const name = cleanHotelDisplayName(hotel.name);
    const id = hotel.id.trim() || name;
    if (!name || hotel.price <= 0 || seen.has(id)) continue;
    if (!meetsMinGuestScore(hotel.rating)) continue;
    if (!isAllowedResortStayProperty({ ...hotel, minStars, allowUnrated })) continue;
    if (mix && isExcludedResortLocation(hotel, mix)) continue;
    seen.add(id);
    const loc = locationScoreOnTen(hotel.locationScore);
    out.push({
      ...hotel,
      id,
      name,
      rating: guestScoreOnTen(hotel.rating),
      locationScore: loc > 0 ? loc : undefined,
    });
  }
  return out.sort(byMixThenValue(mix ?? null));
}

export function mergeResortHotelPools(
  ...lists: ResortHotelPickInput[][]
): ResortHotelPickInput[] {
  const byId = new Map<string, ResortHotelPickInput>();
  for (const list of lists) {
    for (const hotel of list) {
      const id = hotel.id.trim() || hotel.name.trim();
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, { ...hotel, id });
        continue;
      }
      byId.set(id, {
        ...prev,
        ...hotel,
        id,
        rating: Math.max(prev.rating, hotel.rating),
        stars: Math.max(prev.stars ?? 0, hotel.stars ?? 0) || prev.stars || hotel.stars,
        kind: hotel.kind ?? prev.kind,
        typeName: hotel.typeName || prev.typeName,
        typeId: hotel.typeId ?? prev.typeId,
        images: uniqueHotelImageUrls([...(prev.images ?? []), ...(hotel.images ?? []), prev.image, hotel.image]),
        amenities: {
          ...prev.amenities,
          ...hotel.amenities,
          allInclusive: Boolean(prev.amenities?.allInclusive || hotel.amenities?.allInclusive),
          breakfast: Boolean(prev.amenities?.breakfast || hotel.amenities?.breakfast),
          pool: Boolean(prev.amenities?.pool || hotel.amenities?.pool),
        },
        locationScore: Math.max(prev.locationScore ?? 0, hotel.locationScore ?? 0) || prev.locationScore || hotel.locationScore,
      });
    }
  }
  return [...byId.values()];
}

export function offerFromHotel(
  hotel: ResortHotelPickInput,
  tier: ResortPackageTier,
): ResortHotelOffer {
  const guestScore = guestScoreOnTen(hotel.rating);
  const images = uniqueHotelImageUrls([...(hotel.images ?? []), hotel.image]);
  return {
    id: hotel.id,
    tier,
    name: cleanHotelDisplayName(hotel.name),
    imageUrl: images[0] || hotel.image?.trim() || undefined,
    images: images.length ? images : undefined,
    guestScore: guestScore > 0 ? guestScore : undefined,
    reviewWord: hotel.reviewWord?.trim() || undefined,
    hotelEur: Math.round(hotel.price),
    mealPlan: mealPlanFromHotel(hotel),
    bookingHref: hotel.bookingUrl?.trim() || undefined,
  };
}

export type PickResortHotelsOpts = {
  preferAllInclusiveSlots?: boolean;
  destIata?: string;
  countryCode?: string;
  nights?: number;
  /** Party flight total (same basis as the package card). */
  flightTotalEur?: number;
  guests?: number;
  /** Stated € / person band (cap applies +10% slack). */
  budgetMinPerPerson?: number | null;
  budgetMaxPerPerson?: number | null;
};

function isValueStarBand(hotel: ResortHotelPickInput, minStars: number): boolean {
  const stars = hotel.stars ?? 0;
  return stars >= minStars && stars <= 4;
}

function hotelsWithinBudgetCap(
  hotels: ResortHotelPickInput[],
  opts?: PickResortHotelsOpts,
): ResortHotelPickInput[] {
  const capMaxPerPerson = budgetCapMaxPerPerson({
    maxPerPerson: opts?.budgetMaxPerPerson ?? null,
  });
  if (capMaxPerPerson == null) return hotels;
  const flightPartyEur = opts?.flightTotalEur ?? 0;
  const guests = Math.max(1, Math.round(opts?.guests ?? 2));
  return hotels.filter((hotel) =>
    hotelFitsPackageBudgetCap({
      hotelStayEur: hotel.price,
      flightPartyEur,
      guests,
      capMaxPerPerson,
    }),
  );
}

function takeOffers(
  candidates: ResortHotelPickInput[],
  used: Set<string>,
  count: number,
  tierFor: (index: number) => ResortPackageTier,
): ResortHotelOffer[] {
  const out: ResortHotelOffer[] = [];
  for (const hotel of candidates) {
    if (out.length >= count) break;
    if (used.has(hotel.id)) continue;
    used.add(hotel.id);
    out.push(offerFromHotel(hotel, tierFor(out.length)));
  }
  return out;
}

function skipValueRe(mix: ResortStayMixRow | null): RegExp {
  return mix?.skipForValue ?? /.^/;
}

function documentResortCards(
  usable: ResortHotelPickInput[],
  mix: ResortStayMixRow | null,
  preferAi: boolean,
): ResortHotelOffer[] {
  const used = new Set<string>();
  const unused = () => usable.filter((hotel) => !used.has(hotel.id));
  const minStars = mix?.minStars ?? 3;
  const skipValue = skipValueRe(mix);
  const notReservedAi = (hotel: ResortHotelPickInput) =>
    !preferAi || mealPlanFromHotel(hotel) !== "all_inclusive";

  const rank = byMixThenValue(mix);
  const valuePool = unused()
    .filter((hotel) => isValueStarBand(hotel, minStars))
    .filter((hotel) => !skipValue.test(hotel.name))
    .filter(notReservedAi)
    .sort(rank);
  const valueExpanded =
    valuePool.length > 0
      ? valuePool
      : unused()
          .filter((hotel) => (hotel.stars ?? 0) <= 4 && !skipValue.test(hotel.name))
          .filter(notReservedAi)
          .sort(rank);
  const valueOffers = takeOffers(valueExpanded, used, 1, () => "value");

  const recPool = unused()
    .filter((hotel) => !skipValue.test(hotel.name))
    .filter(notReservedAi)
    .filter(isSkybooplanCandidate)
    .sort(rank);
  const recFallback = unused()
    .filter((hotel) => isValueStarBand(hotel, minStars) && !skipValue.test(hotel.name))
    .filter(notReservedAi)
    .sort(rank);
  const recommendedOffers = takeOffers(
    recPool.length ? recPool : recFallback,
    used,
    1,
    () => "recommended",
  );

  const aiSlots = preferAi ? (mix?.allInclusiveSlots ?? 2) : 0;
  const aiOffers = takeOffers(
    unused()
      .filter((hotel) => mealPlanFromHotel(hotel) === "all_inclusive")
      .sort(rank),
    used,
    aiSlots,
    (i) => (i === 0 ? "all_inclusive" : "all_inclusive_alt"),
  );

  const boutiqueSlots = mix?.boutiqueSlots ?? 1;
  const boutiqueOffers = takeOffers(
    unused()
      .filter(isBoutiqueLocationCandidate)
      .sort(
        (a, b) =>
          locationScoreOnTen(b.locationScore) - locationScoreOnTen(a.locationScore) ||
          mixPreferenceScore(b, mix) - mixPreferenceScore(a, mix) ||
          b.rating - a.rating ||
          byValueForMoney(a, b),
      ),
    used,
    boutiqueSlots,
    () => "boutique",
  );

  const premiumSlots = mix?.premiumSlots ?? 1;
  const premiumOffers = takeOffers(
    unused()
      .filter((hotel) => isLuxuryStay(hotel) || (mix != null && isOverwaterStay(hotel, mix)))
      .sort((a, b) => {
        if (mix) {
          const ao = isOverwaterStay(a, mix) ? 1 : 0;
          const bo = isOverwaterStay(b, mix) ? 1 : 0;
          if (ao !== bo) return bo - ao;
          const pref = mixPreferenceScore(b, mix) - mixPreferenceScore(a, mix);
          if (pref) return pref;
        }
        return b.rating - a.rating || b.price - a.price;
      }),
    used,
    premiumSlots,
    () => "premium",
  );

  const offers = [
    ...valueOffers,
    ...recommendedOffers,
    ...aiOffers,
    ...boutiqueOffers,
    ...premiumOffers,
  ];

  for (const hotel of unused().sort(rank)) {
    if (offers.length >= MAX_RESORT_PACKAGE_OFFERS) break;
    const aiCount = offers.filter((o) => o.mealPlan === "all_inclusive").length;
    const needsAi = preferAi && aiCount < aiSlots;
    const valueLike = offers.filter((o) => o.tier === "value" || o.tier === "recommended").length;
    const boutiqueLike = offers.filter((o) => o.tier === "boutique").length;
    const premiumLike = offers.filter((o) => o.tier === "premium").length;
    const tier: ResortPackageTier =
      needsAi && mealPlanFromHotel(hotel) === "all_inclusive"
        ? offers.some((o) => o.tier === "all_inclusive")
          ? "all_inclusive_alt"
          : "all_inclusive"
        : isLuxuryStay(hotel) || (mix != null && isOverwaterStay(hotel, mix))
          ? premiumLike < premiumSlots
            ? "premium"
            : "boutique"
          : isBoutiqueOrBeach(hotel) && boutiqueLike < boutiqueSlots
            ? "boutique"
            : valueLike < 2
              ? offers.some((o) => o.tier === "value")
                ? "recommended"
                : "value"
              : boutiqueLike < boutiqueSlots
                ? "boutique"
                : "premium";
    offers.push(offerFromHotel(hotel, tier));
    used.add(hotel.id);
  }
  return offers.slice(0, MAX_RESORT_PACKAGE_OFFERS);
}

/**
 * Up to 6 distinct live Booking hotels for the same flight.
 * Hard filters: 8.0+, hotel/resort/boutique/villa, 3★+ (4★+ where the mix table says so).
 * Ranked by value-for-money (guest score / stay total), not cheapest-first.
 */
export function pickResortHotels(
  hotels: ResortHotelPickInput[],
  opts?: PickResortHotelsOpts,
): ResortHotelOffer[] {
  const mix = matchResortStayMix({
    countryCode: opts?.countryCode,
    destIata: opts?.destIata,
  });
  const quality = usableHotels(hotels, mix);
  const capped = hotelsWithinBudgetCap(quality, opts);
  let usable = capped.length >= 4 ? capped : quality;
  if (usable.length < 4) {
    usable = usableHotels(hotels, mix, true);
  }
  if (usable.length === 0) return [];

  const preferAi = opts?.preferAllInclusiveSlots !== false;
  return documentResortCards(usable, mix, preferAi);
}
