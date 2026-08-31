import type { AiTripPlan, ResortStay } from "@/lib/aiPlan.functions";
import { buildBookingSearchUrl, resolveBookingStayDates } from "@/lib/bookingUrl";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { hotelStayDatesFromFlight } from "@/lib/hotelStayDates";
import { lookupDestination } from "@/lib/destinationCoords";
import { hotelSearchQueryAlias } from "@/lib/hotelDestinationPick";
import { resolveDayBudgetCountry } from "@/lib/countryDailyBudget";
import { bookingNfltFor } from "@/lib/hotelAmenities";
import { buildSkyscannerFlightUrl } from "@/lib/makeSearch";
import { hotelStayTotalEur, stayNights } from "@/lib/hotelResults";
import {
  estimateHotelRoomNightlyEur,
  overnightPlaceHint,
  resolveStayNights,
} from "@/lib/overnightEstimate";
import {
  meetsMinGuestScore,
  type PackageMealPlan,
  type ResortHotelOffer,
  type ResortPackageTier,
} from "@/lib/resortHotelPicks";
import { resolveResortDiningModel, type ResortDiningModel } from "@/lib/resortDiningModel";
import { INSPIRATION_CARDS } from "@/lib/tripInspiration";
import { TRAVEL_FACTS } from "@/lib/travelFacts";
import { uniqueHotelImageUrls } from "@/lib/hotelImages";

export type { PackageMealPlan } from "@/lib/resortHotelPicks";
export type PackageTransferKind = "speedboat" | "seaplane" | "van" | "unknown";

export type ResortPackage = {
  id: string;
  title: string;
  destinationLabel: string;
  coverImageUrl?: string;
  /** Hotel photos for the card gallery (1–6). One image = no arrows. */
  images?: string[];
  tier?: ResortPackageTier;
  /** Real guest score only — never invent 8.9-style ratings. */
  guestScore?: number;
  guestScoreLabel?: string;
  originIata?: string;
  destinationIata?: string;
  mealPlan: PackageMealPlan;
  transferKind: PackageTransferKind;
  includesCheckedBag: boolean;
  pricePerPersonEur: number;
  totalEur: number;
  flightEur: number;
  hotelEur: number;
  pax: number;
  nights?: number;
  checkIn?: string;
  checkOut?: string;
  adults: number;
  rooms: number;
  childrenAges?: number[];
  bookingHref?: string;
  flightHref?: string;
};

const GENERIC_RESORT_COVER =
  "https://images.unsplash.com/photo-1573843981267-be996f8bcdf4?auto=format&fit=crop&w=1400&q=80";
const PEXELS_RESORT_COVER =
  "https://images.pexels.com/photos/1287460/pexels-photo-1287460.jpeg?auto=compress&cs=tinysrgb&w=1400";

export const RESORT_COVER_FALLBACKS = [GENERIC_RESORT_COVER, PEXELS_RESORT_COVER] as const;

function isUsableCoverUrl(url: string | undefined): boolean {
  const raw = url?.trim() ?? "";
  if (!raw) return false;
  return raw.startsWith("//") || /^https?:\/\//i.test(raw);
}

export function normalizeCoverUrl(url: string): string {
  const raw = url.trim();
  return raw.startsWith("//") ? `https:${raw}` : raw;
}

/** All-inclusive meals vs room-only — generic, not a named-destination branch. */
const ALL_INCLUSIVE_NIGHTLY_MULT = 1.65;

export function inferPackageMealPlan(
  stay: ResortStay | undefined,
  dining?: ResortDiningModel,
): PackageMealPlan {
  if (dining === "breakfast_first") return "breakfast";
  const blob = [
    stay?.resortGuide?.all_inclusive_etiquette,
    stay?.resortGuide?.relaxing_at_resort,
    stay?.resortGuide?.check_in_out,
  ]
    .filter(Boolean)
    .join(" ");
  if (
    dining !== "breakfast_first" &&
    /\ball[-\s]?inclusive\b|\ballinclusive\b|\bvse\s+vklju[čc]en|\bzapestnic/i.test(blob)
  ) {
    return "all_inclusive";
  }
  return "breakfast";
}

export function inferPackageTransferKind(stay: ResortStay | undefined): PackageTransferKind {
  const blob = [stay?.arrivalProtocol?.transfer_pickup, stay?.departureProtocol?.return_transfer]
    .filter(Boolean)
    .join(" ");
  if (/hidroplan|seaplane|hidravlič/i.test(blob)) return "seaplane";
  if (/gliser|speedboat|speed\s*boat|lancha/i.test(blob)) return "speedboat";
  if (/kombi|van\b|minibus|taxi|transfer/i.test(blob)) return "van";
  return "unknown";
}

export function destinationBadgeLabel(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  return text.split(",")[0]!.trim();
}

function isoDay(raw: string | undefined): string | undefined {
  return raw?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
}

function inspirationCoverFor(...labels: Array<string | undefined>): string | undefined {
  const hay = labels.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return undefined;
  const hit = INSPIRATION_CARDS.find((card) => hay.includes(card.destination.toLowerCase()));
  return hit?.imageUrl;
}

function travelFactCoverFor(...labels: Array<string | undefined>): string | undefined {
  const hay = labels.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return undefined;
  const hit = TRAVEL_FACTS.find(
    (fact) =>
      hay.includes(fact.placeSl.toLowerCase()) || hay.includes(fact.placeEn.toLowerCase()),
  );
  return hit?.imageUrl;
}

function unsplashDestinationCover(label: string): string | undefined {
  const q = label.trim();
  if (!q) return undefined;
  return `https://images.unsplash.com/featured/?${encodeURIComponent(q)},resort,beach&w=1400&q=80`;
}

export function resolvePackageCoverImage(
  plan: AiTripPlan,
  destinationLabel: string,
): string {
  const fromDay = plan.days?.[0]?.imageUrl;
  if (isUsableCoverUrl(fromDay)) return normalizeCoverUrl(fromDay!);
  const fromCatalog =
    inspirationCoverFor(
      plan.destinationPlace,
      plan.destinationName,
      destinationLabel,
      plan.days?.[0]?.city,
    ) ||
    travelFactCoverFor(
      plan.destinationPlace,
      plan.destinationName,
      destinationLabel,
      plan.days?.[0]?.city,
    );
  if (fromCatalog) return fromCatalog;
  return unsplashDestinationCover(destinationLabel || plan.destinationName) || GENERIC_RESORT_COVER;
}

export function resolvePackageCoverWithFallback(
  preferred: string | undefined,
  plan: AiTripPlan,
  destinationLabel: string,
): string {
  if (isUsableCoverUrl(preferred)) return normalizeCoverUrl(preferred!);
  return resolvePackageCoverImage(plan, destinationLabel);
}

export type BuildResortPackageOpts = {
  pax: number;
  flightTotalEur?: number | null;
  /** @deprecated Use flightTotalEur + hotel estimate. Kept so callers can force a total. */
  totalEur?: number;
  /** Home-airport ticket date — Skyscanner / itinerary day 1. */
  departDate?: string;
  /** Inbound takeoff date from the destination. */
  returnDate?: string;
  flights?: TripFlightContext;
  outboundArriveIso?: string;
  inboundDepartIso?: string;
  originIata?: string;
  destinationIata?: string;
  lang?: string;
  /** Duffel / partner checkout when the selected offer has one. */
  flightBookingUrl?: string;
  adults?: number;
  rooms?: number;
  childrenAges?: number[];
};

function bookingAdults(opts: BuildResortPackageOpts): number {
  return Math.max(1, opts.adults ?? opts.pax);
}

function bookingRooms(opts: BuildResortPackageOpts): number {
  if (typeof opts.rooms === "number" && opts.rooms > 0) return Math.min(10, opts.rooms);
  return Math.max(1, Math.min(10, Math.ceil(bookingAdults(opts) / 2)));
}

/** Destination arrival → inbound takeoff. Never the home-airport ticket date. */
export function flightStayDatesForBooking(
  opts: Pick<
    BuildResortPackageOpts,
    | "departDate"
    | "returnDate"
    | "flights"
    | "outboundArriveIso"
    | "inboundDepartIso"
  >,
  plan: AiTripPlan,
): { checkIn?: string; checkOut?: string } {
  const stay = hotelStayDatesFromFlight({
    departDate: opts.departDate,
    returnDate: opts.returnDate,
    outboundArriveIso: opts.outboundArriveIso,
    outboundArriveDate: opts.flights?.outboundArriveDate,
    outboundArriveDayOffset: opts.flights?.outboundArriveDayOffset,
    outboundDepart: opts.flights?.outboundDepart,
    outboundArrive: opts.flights?.outboundArrive,
    inboundDepartIso: opts.inboundDepartIso,
    inboundDepartDate: opts.flights?.inboundDepartDate,
  });
  if (stay) return stay;
  const checkIn = isoDay(opts.departDate) || isoDay(plan.days?.[0]?.date);
  const checkOut = isoDay(opts.returnDate);
  return { checkIn, checkOut };
}

export function bookingSearchPlace(
  plan: AiTripPlan,
  extra?: { city?: string; destinationIata?: string },
): string {
  const iata = (extra?.destinationIata || plan.destinationIata || "").toUpperCase();
  const fromIata = iata ? lookupDestination(iata)?.name : undefined;
  const raw =
    extra?.city?.trim() ||
    plan.hotels?.[0]?.city?.trim() ||
    plan.destinationPlace?.trim() ||
    plan.days?.[0]?.city?.trim() ||
    plan.destinationName?.trim() ||
    fromIata ||
    "";
  const badge = destinationBadgeLabel(raw);
  return hotelSearchQueryAlias(badge || raw || fromIata || "") || badge || raw || fromIata || "";
}

export function packageBookingHref(params: {
  destination: string;
  hotelName?: string;
  checkIn?: string;
  checkOut?: string;
  /** Hotel stay from the selected flight (arrival / inbound depart). */
  flightDepartDate?: string;
  flightReturnDate?: string;
  hotelCheckIn?: string;
  hotelCheckOut?: string;
  adults: number;
  rooms: number;
  childrenAges?: number[];
  lang?: string;
  nflt?: string[];
  incomingHref?: string;
}): string | undefined {
  const destination = params.destination.trim() || params.hotelName?.trim() || "";
  const stay = resolveBookingStayDates({
    flightDepartDate: params.hotelCheckIn ?? params.flightDepartDate,
    flightReturnDate: params.hotelCheckOut ?? params.flightReturnDate,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
  });
  if (!destination || !stay) return undefined;
  return buildBookingSearchUrl({
    destination,
    hotelName: params.hotelName?.trim() || undefined,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    adults: Math.max(1, params.adults),
    rooms: Math.max(1, params.rooms),
    childrenAges: params.childrenAges,
    nflt: params.nflt,
    lang: params.lang,
    reviewScore: 80,
  });
}

export function estimatePackageHotelEur(
  plan: AiTripPlan,
  opts: {
    pax: number;
    mealPlan: PackageMealPlan;
    departDate?: string;
    returnDate?: string;
    flights?: TripFlightContext;
    outboundArriveIso?: string;
    inboundDepartIso?: string;
    destinationIata?: string;
  },
): { hotelEur: number; nights: number } {
  const hotel = plan.hotels?.[0];
  const destIata = opts.destinationIata || plan.destinationIata;
  const stay = hotelStayDatesFromFlight({
    departDate: opts.departDate,
    returnDate: opts.returnDate,
    outboundArriveIso: opts.outboundArriveIso,
    outboundArriveDate: opts.flights?.outboundArriveDate,
    outboundArriveDayOffset: opts.flights?.outboundArriveDayOffset,
    outboundDepart: opts.flights?.outboundDepart,
    outboundArrive: opts.flights?.outboundArrive,
    inboundDepartIso: opts.inboundDepartIso,
    inboundDepartDate: opts.flights?.inboundDepartDate,
  });
  const fromDate = stay?.checkIn || opts.departDate || hotel?.from_date || plan.days?.[0]?.date;
  const toDate = stay?.checkOut || opts.returnDate || hotel?.to_date;
  const nights =
    resolveStayNights({
      hotelNights: fromDate && toDate ? undefined : hotel?.nights,
      fromDate,
      toDate,
    }) ?? 0;
  if (nights <= 0) return { hotelEur: 0, nights: 0 };
  const pax = Math.max(1, opts.pax);
  const rooms = Math.max(1, Math.ceil(pax / 2));
  const countryCode = resolveDayBudgetCountry({
    destinationName: plan.destinationName,
    destinationIata: destIata,
    dayCity: hotel?.city || plan.days?.[0]?.city,
  });
  let nightly = estimateHotelRoomNightlyEur(countryCode, {
    place: overnightPlaceHint({
      destinationName: plan.destinationName,
      destinationPlace: plan.destinationPlace,
      destinationIata: destIata,
      dayCities: [hotel?.city, plan.days?.[0]?.city],
    }),
    iata: destIata,
  });
  if (opts.mealPlan === "all_inclusive") {
    nightly = Math.round(nightly * ALL_INCLUSIVE_NIGHTLY_MULT);
  }
  return { hotelEur: Math.round(nightly * rooms * nights), nights };
}

export function buildResortPackageFromPlan(
  plan: AiTripPlan,
  opts: BuildResortPackageOpts,
): ResortPackage {
  const hotel = plan.hotels?.[0];
  const stay = plan.resortStay;
  const city =
    hotel?.city?.trim() ||
    plan.destinationPlace?.trim() ||
    plan.days?.[0]?.city?.trim() ||
    plan.destinationName;
  const title = hotel?.name?.trim() || plan.destinationName || city;
  const destinationLabel = destinationBadgeLabel(
    plan.destinationPlace || plan.destinationName || city,
  );
  const originIata = (opts.originIata || plan.originIata || "").toUpperCase() || undefined;
  const destinationIata =
    (opts.destinationIata || plan.destinationIata || "").toUpperCase() || undefined;
  const { checkIn, checkOut } = flightStayDatesForBooking(opts, plan);
  const dining = resolveResortDiningModel({
    destinationIata: opts.destinationIata || plan.destinationIata,
    destinationName: plan.destinationName,
    destinationPlace: plan.destinationPlace,
  });
  const mealPlan = inferPackageMealPlan(stay, dining);
  const pax = Math.max(1, opts.pax);
  const adults = bookingAdults(opts);
  const rooms = bookingRooms(opts);
  const flightEur = Math.max(0, Math.round(opts.flightTotalEur ?? plan.flightTotalEur ?? 0));
  const { hotelEur, nights } = estimatePackageHotelEur(plan, {
    pax,
    mealPlan,
    departDate: opts.departDate,
    returnDate: opts.returnDate,
    flights: opts.flights,
    outboundArriveIso: opts.outboundArriveIso,
    inboundDepartIso: opts.inboundDepartIso,
    destinationIata,
  });
  const totalEur =
    typeof opts.totalEur === "number" && opts.totalEur > 0
      ? Math.round(opts.totalEur)
      : flightEur + hotelEur;
  const nflt = bookingNfltFor({
    hotel: true,
    resortStay: true,
    stars345: true,
    minReview80: true,
    pool: true,
    allInclusive: mealPlan === "all_inclusive",
    breakfast: mealPlan === "breakfast",
  });
  const place = bookingSearchPlace(plan, { city, destinationIata });
  const hotelName = hotel?.name?.trim() && hotel.name.trim() !== place ? hotel.name.trim() : undefined;
  const bookingHref = packageBookingHref({
    destination: place,
    hotelName,
    checkIn,
    checkOut,
    adults,
    rooms,
    childrenAges: opts.childrenAges,
    lang: opts.lang,
    nflt,
  });
  const partnerFlight = opts.flightBookingUrl?.trim();
  const flightHref =
    partnerFlight ||
    (originIata && destinationIata && checkIn
      ? buildSkyscannerFlightUrl({
          from: originIata,
          to: destinationIata,
          departDate: isoDay(opts.departDate) || checkIn,
          returnDate: isoDay(opts.returnDate) || checkOut,
          adults: pax,
        }) ?? undefined
      : undefined);

  const coverImageUrl = resolvePackageCoverImage(plan, destinationLabel);
  return {
    id: "base",
    title,
    destinationLabel,
    coverImageUrl,
    images: uniqueHotelImageUrls([coverImageUrl]),
    originIata,
    destinationIata,
    mealPlan,
    transferKind: inferPackageTransferKind(stay),
    includesCheckedBag: flightEur > 0 || Boolean(originIata && destinationIata),
    pricePerPersonEur: totalEur > 0 ? Math.round(totalEur / pax) : 0,
    totalEur,
    flightEur,
    hotelEur,
    nights,
    pax,
    checkIn,
    checkOut,
    adults,
    rooms,
    childrenAges: opts.childrenAges,
    bookingHref,
    flightHref,
  };
}

export function buildResortPackageFromOffer(
  plan: AiTripPlan,
  offer: ResortHotelOffer,
  opts: BuildResortPackageOpts,
): ResortPackage {
  const base = buildResortPackageFromPlan(plan, opts);
  const nights = Math.max(
    1,
    base.nights ||
      (base.checkIn && base.checkOut ? stayNights(base.checkIn, base.checkOut) : 0) ||
      1,
  );
  const hotelEur = hotelStayTotalEur(offer.hotelEur, nights);
  const flightEur = base.flightEur;
  const totalEur = flightEur + hotelEur;
  const hotelImages = uniqueHotelImageUrls([...(offer.images ?? []), offer.imageUrl]);
  const images = hotelImages.length
    ? hotelImages
    : uniqueHotelImageUrls([base.coverImageUrl]);
  return {
    ...base,
    id: offer.id,
    title: offer.name,
    tier: offer.tier,
    coverImageUrl: resolvePackageCoverWithFallback(
      images[0] || offer.imageUrl,
      plan,
      base.destinationLabel,
    ),
    images,
    guestScore: offer.guestScore,
    guestScoreLabel: offer.reviewWord,
    mealPlan: offer.mealPlan,
    hotelEur,
    nights,
    totalEur,
    pricePerPersonEur: totalEur > 0 ? Math.round(totalEur / base.pax) : 0,
    bookingHref:
      packageBookingHref({
        destination: bookingSearchPlace(plan, {
          city: plan.hotels?.[0]?.city,
          destinationIata: opts.destinationIata || plan.destinationIata,
        }),
        hotelName: offer.name.trim() || undefined,
        checkIn: base.checkIn,
        checkOut: base.checkOut,
        adults: base.adults,
        rooms: base.rooms,
        childrenAges: base.childrenAges,
        lang: opts.lang,
        nflt: bookingNfltFor({
          hotel: true,
          resortStay: true,
          stars345: true,
          minReview80: true,
          pool: true,
          allInclusive: offer.mealPlan === "all_inclusive",
          breakfast: offer.mealPlan === "breakfast",
        }),
        incomingHref: offer.bookingHref,
      }) || base.bookingHref,
  };
}

export function resortPackagesFromPlan(
  plan: AiTripPlan,
  opts: BuildResortPackageOpts,
): ResortPackage[] {
  if (!plan.resortStay && plan.tripStyle !== "single_base") return [];
  const offers = (plan.resortOffers ?? []).filter(
    (offer) => typeof offer.guestScore === "number" && meetsMinGuestScore(offer.guestScore),
  );
  if (offers.length > 0) {
    return offers.map((offer) => buildResortPackageFromOffer(plan, offer, opts));
  }
  return [buildResortPackageFromPlan(plan, opts)];
}
