import { isAllowedResortStayProperty, type HotelKind } from "@/lib/hotelAmenities";
import { cleanHotelDisplayName } from "@/lib/hotelDisplayName";
import { uniqueHotelImageUrls } from "@/lib/hotelImages";
import {
  inValueNightlyBand,
  isExcludedResortLocation,
  isOverwaterStay,
  matchesValueNeedle,
  matchResortStayMix,
  stayNightlyEur,
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
  amenities?: { allInclusive?: boolean; breakfast?: boolean };
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

function usableHotels(
  hotels: ResortHotelPickInput[],
  mix?: ResortStayMixRow | null,
): ResortHotelPickInput[] {
  const seen = new Set<string>();
  const out: ResortHotelPickInput[] = [];
  for (const hotel of hotels) {
    const name = cleanHotelDisplayName(hotel.name);
    const id = hotel.id.trim() || name;
    if (!name || hotel.price <= 0 || seen.has(id)) continue;
    if (!meetsMinGuestScore(hotel.rating)) continue;
    if (!isAllowedResortStayProperty(hotel)) continue;
    if (mix && isExcludedResortLocation(hotel, mix)) continue;
    seen.add(id);
    out.push({ ...hotel, id, name, rating: guestScoreOnTen(hotel.rating) });
  }
  return out.sort((a, b) => a.price - b.price || b.rating - a.rating);
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
        },
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

function takeFirst(
  candidates: ResortHotelPickInput[],
  used: Set<string>,
): ResortHotelPickInput | undefined {
  const hit = candidates.find((hotel) => !used.has(hotel.id));
  if (hit) used.add(hit.id);
  return hit;
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

function isThreeOrFourStar(hotel: ResortHotelPickInput): boolean {
  const stars = hotel.stars ?? 0;
  return stars === 3 || stars === 4;
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
  return hotels
    .filter((hotel) =>
      hotelFitsPackageBudgetCap({
        hotelStayEur: hotel.price,
        flightPartyEur,
        guests,
        capMaxPerPerson,
      }),
    )
    .sort((a, b) => a.price - b.price || b.rating - a.rating);
}

function valueCandidateScore(
  hotel: ResortHotelPickInput,
  mix: ResortStayMixRow,
  nights: number,
): number {
  const nightly = stayNightlyEur(hotel.price, nights);
  const mid = (mix.valueNightlyEur.min + mix.valueNightlyEur.max) / 2;
  let score = hotel.rating * 2;
  if ((hotel.stars ?? 0) === 4) score += 28;
  else if ((hotel.stars ?? 0) === 3) score += 6;
  else if ((hotel.stars ?? 0) >= 5) score -= 18;
  if (inValueNightlyBand(hotel.price, nights, mix)) score += 45;
  else score -= Math.min(40, Math.abs(nightly - mid) / 8);
  if (matchesValueNeedle(hotel, mix)) score += 22;
  if (mix.skipForValue.test(hotel.name)) score -= 80;
  score -= nightly * 0.015;
  return score;
}

function pickBalancedStayMix(
  usable: ResortHotelPickInput[],
  mix: ResortStayMixRow,
  nights: number,
  preferAi: boolean,
  budgetCapped: boolean,
): ResortHotelOffer[] {
  const used = new Set<string>();
  const unused = () => usable.filter((hotel) => !used.has(hotel.id));
  const take = (
    candidates: ResortHotelPickInput[],
    count: number,
    tierFor: (index: number) => ResortPackageTier,
  ): ResortHotelOffer[] => {
    const out: ResortHotelOffer[] = [];
    for (const hotel of candidates) {
      if (out.length >= count) break;
      if (used.has(hotel.id)) continue;
      used.add(hotel.id);
      out.push(offerFromHotel(hotel, tierFor(out.length)));
    }
    return out;
  };

  const fourStar = unused().filter(isThreeOrFourStar);
  const valuePool = fourStar
    .filter((hotel) => !mix.skipForValue.test(hotel.name))
    .filter((hotel) => !preferAi || mealPlanFromHotel(hotel) !== "all_inclusive")
    .sort((a, b) =>
      budgetCapped
        ? a.price - b.price || b.rating - a.rating
        : valueCandidateScore(b, mix, nights) - valueCandidateScore(a, mix, nights),
    );
  const valueExpanded =
    valuePool.length >= mix.valueSlots
      ? valuePool
      : unused()
          .filter((hotel) => !mix.skipForValue.test(hotel.name) && (hotel.stars ?? 0) <= 4)
          .filter((hotel) => !preferAi || mealPlanFromHotel(hotel) !== "all_inclusive")
          .sort((a, b) =>
            budgetCapped
              ? a.price - b.price || b.rating - a.rating
              : valueCandidateScore(b, mix, nights) - valueCandidateScore(a, mix, nights),
          );
  const valueSource =
    valueExpanded.length > 0
      ? valueExpanded
      : unused()
          .filter((hotel) => !mix.skipForValue.test(hotel.name))
          .filter((hotel) => !preferAi || mealPlanFromHotel(hotel) !== "all_inclusive")
          .sort((a, b) => a.price - b.price || b.rating - a.rating);
  const valueOffers = take(valueSource, mix.valueSlots, (i) => (i === 0 ? "value" : "recommended"));

  const aiOffers = preferAi
    ? take(
        unused()
          .filter((hotel) => mealPlanFromHotel(hotel) === "all_inclusive")
          .sort((a, b) => a.price - b.price || b.rating - a.rating),
        mix.allInclusiveSlots,
        (i) => (i === 0 ? "all_inclusive" : "all_inclusive_alt"),
      )
    : [];

  const premiumOffers = take(
    unused()
      .filter((hotel) => isOverwaterStay(hotel, mix) || (hotel.stars ?? 0) >= 5)
      .sort((a, b) => {
        const ao = isOverwaterStay(a, mix) ? 1 : 0;
        const bo = isOverwaterStay(b, mix) ? 1 : 0;
        if (ao !== bo) return bo - ao;
        return b.rating - a.rating || b.price - a.price;
      }),
    mix.premiumSlots,
    () => "premium",
  );

  const offers = [...valueOffers, ...aiOffers, ...premiumOffers];
  for (const hotel of unused()) {
    if (offers.length >= MAX_RESORT_PACKAGE_OFFERS) break;
    const needsAi =
      preferAi && offers.filter((o) => o.mealPlan === "all_inclusive").length < mix.allInclusiveSlots;
    const valueLike = offers.filter((o) => o.tier === "value" || o.tier === "recommended").length;
    const tier: ResortPackageTier =
      needsAi && mealPlanFromHotel(hotel) === "all_inclusive"
        ? offers.some((o) => o.tier === "all_inclusive")
          ? "all_inclusive_alt"
          : "all_inclusive"
        : (hotel.stars ?? 0) >= 5 || isOverwaterStay(hotel, mix)
          ? "premium"
          : valueLike < mix.valueSlots
            ? offers.some((o) => o.tier === "value")
              ? "recommended"
              : "value"
            : "boutique";
    offers.push(offerFromHotel(hotel, tier));
    used.add(hotel.id);
  }
  return offers.slice(0, MAX_RESORT_PACKAGE_OFFERS);
}

/**
 * Up to 6 distinct live Booking hotels for the same flight.
 * Drops scores below 8.0 / missing scores. Never invents names or ratings.
 */
export function pickResortHotels(
  hotels: ResortHotelPickInput[],
  opts?: PickResortHotelsOpts,
): ResortHotelOffer[] {
  const mix = matchResortStayMix({
    countryCode: opts?.countryCode,
    destIata: opts?.destIata,
  });
  const usable = hotelsWithinBudgetCap(usableHotels(hotels, mix), opts);
  if (usable.length === 0) return [];

  const preferAi = opts?.preferAllInclusiveSlots !== false;
  const nights = Math.max(1, Math.round(opts?.nights ?? 1));
  const budgetCapped = budgetCapMaxPerPerson({
    maxPerPerson: opts?.budgetMaxPerPerson ?? null,
  }) != null;
  if (mix) return pickBalancedStayMix(usable, mix, nights, preferAi, budgetCapped);

  const used = new Set<string>();
  const unused = () => usable.filter((hotel) => !used.has(hotel.id));

  const allInclusive = preferAi
    ? usable.filter((hotel) => mealPlanFromHotel(hotel) === "all_inclusive")
    : [];
  const aiCheap = [...allInclusive].sort((a, b) => a.price - b.price || b.rating - a.rating)[0];
  const aiBest = [...allInclusive]
    .filter((hotel) => hotel.id !== aiCheap?.id)
    .sort((a, b) => b.rating - a.rating || a.price - b.price)[0];
  if (aiCheap) used.add(aiCheap.id);
  if (aiBest) used.add(aiBest.id);

  const value = takeFirst(
    [...unused()].sort((a, b) => a.price - b.price || b.rating - a.rating),
    used,
  );
  const recommended = takeFirst(
    [...unused()].sort((a, b) => b.rating - a.rating || a.price - b.price),
    used,
  );
  const boutique = takeFirst(
    unused()
      .filter(isBoutiqueOrBeach)
      .sort((a, b) => b.rating - a.rating || a.price - b.price),
    used,
  );
  const luxuryPremium = takeFirst(
    unused()
      .filter(isLuxuryStay)
      .sort((a, b) => b.price - a.price || b.rating - a.rating),
    used,
  );
  const premium =
    luxuryPremium ??
    (budgetCapped
      ? undefined
      : takeFirst([...unused()].sort((a, b) => b.price - a.price || b.rating - a.rating), used));

  const slots: Array<{ hotel?: ResortHotelPickInput; tier: ResortPackageTier }> = [
    { hotel: value, tier: "value" },
    { hotel: recommended, tier: "recommended" },
    { hotel: aiCheap, tier: "all_inclusive" },
    { hotel: aiBest, tier: "all_inclusive_alt" },
    { hotel: boutique, tier: "boutique" },
    { hotel: premium, tier: "premium" },
  ];

  const offers = slots
    .filter((slot): slot is { hotel: ResortHotelPickInput; tier: ResortPackageTier } => Boolean(slot.hotel))
    .map((slot) => offerFromHotel(slot.hotel, slot.tier));

  for (const hotel of unused()) {
    if (offers.length >= MAX_RESORT_PACKAGE_OFFERS) break;
    const needsAi =
      preferAi && offers.filter((o) => o.mealPlan === "all_inclusive").length < 2;
    const tier: ResortPackageTier =
      needsAi && mealPlanFromHotel(hotel) === "all_inclusive"
        ? offers.some((o) => o.tier === "all_inclusive")
          ? "all_inclusive_alt"
          : "all_inclusive"
        : isBoutiqueOrBeach(hotel)
          ? "boutique"
          : isLuxuryStay(hotel)
            ? "premium"
            : "value";
    offers.push(offerFromHotel(hotel, tier));
    used.add(hotel.id);
  }

  return offers.slice(0, MAX_RESORT_PACKAGE_OFFERS);
}
