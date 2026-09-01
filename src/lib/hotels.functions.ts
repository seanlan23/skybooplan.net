import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ensureHotelCheckoutAfterCheckin,
  normalizeHotelSearchDate,
  resolveHotelBookingUrl,
} from "./bookingUrl";
import { lookupDestination } from "./destinationCoords";
import {
  hotelSearchQueryForStay,
  pickBestBookingDestination,
} from "./hotelDestinationPick";
import {
  bookingCategoriesFilterFor,
  inferHotelAmenities,
  isAllowedResortStayProperty,
  type HotelAmenities,
  type HotelKind,
  type StayFilterFlags,
} from "./hotelAmenities";
import { cleanHotelDisplayName } from "./hotelDisplayName";
import { uniqueHotelImageUrls } from "./hotelImages";
import { matchResortStayMix } from "./resortStayMix";

const RAPID_HOST = "booking-com15.p.rapidapi.com";
const BASE = `https://${RAPID_HOST}/api/v1/hotels`;

export type RealHotel = {
  id: string;
  name: string;
  price: number;
  currency: string;
  rating: number;
  reviews: number;
  image: string;
  /** Up to 6 Booking photo URLs for the package-card gallery. */
  images?: string[];
  bookingUrl: string;
  reviewWord?: string;
  stars?: number;
  lat?: number;
  lng?: number;
  neighborhood?: string;
  preferred?: boolean;
  originalPrice?: number;
  kind?: HotelKind;
  amenities?: HotelAmenities;
  typeName?: string;
  typeId?: number;
  /** Booking location review (0–10 or 0–100). */
  locationScore?: number;
};

const Input = z.object({
  city: z.string().min(1).max(120),
  checkIn: z.string().min(8).max(20),
  checkOut: z.string().min(8).max(20),
  adults: z.number().int().min(1).max(20).default(2),
  rooms: z.number().int().min(1).max(10).default(1),
  childrenAges: z.array(z.number().int().min(0).max(17)).max(10).default([]),
  currency: z.string().min(3).max(3).default("EUR"),
  destIata: z.string().min(3).max(3).optional(),
  /** Party stay-total EUR — RapidAPI `price_min` / `price_max`. */
  priceMin: z.number().positive().max(1_000_000).optional(),
  priceMax: z.number().positive().max(1_000_000).optional(),
  filters: z
    .object({
      hotel: z.boolean().optional(),
      apartment: z.boolean().optional(),
      cabin: z.boolean().optional(),
      nature: z.boolean().optional(),
      jacuzzi: z.boolean().optional(),
      breakfast: z.boolean().optional(),
      allInclusive: z.boolean().optional(),
      balcony: z.boolean().optional(),
      pool: z.boolean().optional(),
      parking: z.boolean().optional(),
      freeCancel: z.boolean().optional(),
      minReview80: z.boolean().optional(),
      stars345: z.boolean().optional(),
      stars45: z.boolean().optional(),
      resortStay: z.boolean().optional(),
    })
    .optional(),
});

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeSearchDates(checkIn: string, checkOut: string) {
  const arrival = normalizeHotelSearchDate(checkIn);
  const departure = ensureHotelCheckoutAfterCheckin(arrival, normalizeHotelSearchDate(checkOut));
  return { arrival, departure };
}

async function rapid(path: string, params: Record<string, string>) {
  const key = process.env.BOOKING_API_KEY;
  if (!key) throw new Error("BOOKING_API_KEY not configured");
  const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`;
  console.log("[searchHotels] RapidAPI GET", { path, params });
  const res = await fetch(url, {
    headers: {
      "x-rapidapi-host": RAPID_HOST,
      "x-rapidapi-key": key,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Booking API ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

function extractHotelsRows(result: unknown): any[] {
  const data = (result as { data?: unknown })?.data;
  if (Array.isArray((data as { hotels?: unknown[] })?.hotels)) {
    return (data as { hotels: unknown[] }).hotels;
  }
  if (Array.isArray(data)) return data;
  return [];
}

export const searchHotels = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{
    hotels: RealHotel[];
    error: string | null;
    dest?: { destId: string; destType: string };
  }> => {
    const city = data.city.trim();
    const { arrival, departure } = normalizeSearchDates(data.checkIn, data.checkOut);

    const requestPayload = {
      city,
      checkIn: arrival,
      checkOut: departure,
      adults: data.adults,
      rooms: data.rooms,
      childrenAges: data.childrenAges,
      currency: data.currency,
    };

    console.log("[searchHotels] request payload", requestPayload);

    if (!isIsoDate(arrival) || !isIsoDate(departure)) {
      const msg = `Invalid hotel dates (expected YYYY-MM-DD): checkIn=${JSON.stringify(data.checkIn)} checkOut=${JSON.stringify(data.checkOut)}`;
      console.warn("[searchHotels]", msg);
      return { hotels: [], error: msg };
    }

    if (departure <= arrival) {
      const msg = `Checkout must be after check-in: ${arrival} → ${departure}`;
      console.warn("[searchHotels]", msg);
      return { hotels: [], error: msg };
    }

    try {
      if (!process.env.BOOKING_API_KEY) {
        return { hotels: [], error: "BOOKING_API_KEY not configured" };
      }

      const searchQuery = hotelSearchQueryForStay(city, data.destIata);
      const destCountry = data.destIata
        ? lookupDestination(data.destIata.toUpperCase())?.country
        : undefined;
      const destParams = { query: searchQuery };
      console.log("[searchHotels] searchDestination", destParams);
      const destLookup = await rapid("/searchDestination", destParams);
      const destRows = Array.isArray(destLookup?.data) ? destLookup.data : [];
      const best = pickBestBookingDestination(searchQuery, destRows, {
        countryCode: destCountry,
        destIata: data.destIata,
      });

      console.log("[searchHotels] searchDestination result", {
        city,
        searchQuery,
        matchCount: destRows.length,
        best: best
          ? {
              dest_id: best.dest_id,
              search_type: best.search_type,
              label: best.label ?? best.name,
            }
          : null,
      });

      if (!best?.dest_id) {
        return { hotels: [], error: `No destination found for "${city}"` };
      }

      const bookingDest = {
        destId: String(best.dest_id),
        destType: String(best.search_type || "city"),
      };

      const params: Record<string, string> = {
        dest_id: String(best.dest_id),
        search_type: String(best.search_type || "city"),
        arrival_date: arrival,
        departure_date: departure,
        adults: String(data.adults),
        room_qty: String(data.rooms),
        page_number: "1",
        units: "metric",
        temperature_unit: "c",
        languagecode: "en-us",
        currency_code: data.currency,
      };
      if (data.childrenAges.length > 0) {
        params.children_age = data.childrenAges.join(",");
      }
      if (typeof data.priceMin === "number") {
        params.price_min = String(Math.round(data.priceMin));
      }
      if (typeof data.priceMax === "number") {
        params.price_max = String(Math.round(data.priceMax));
      }
      const categories = bookingCategoriesFilterFor((data.filters ?? {}) as StayFilterFlags);
      if (categories) {
        params.categories_filter = categories;
      }

      console.log("[searchHotels] searchHotels params", params);
      let result: unknown;
      try {
        result = await rapid("/searchHotels", params);
      } catch (err) {
        const canDrop = Boolean(params.categories_filter || params.price_max || params.price_min);
        if (!canDrop) throw err;
        const { categories_filter: _c, price_max: _max, price_min: _min, ...unfiltered } = params;
        console.warn("[searchHotels] filter params rejected, retrying without categories/price");
        result = await rapid("/searchHotels", unfiltered);
      }
      let rows = extractHotelsRows(result);
      if (rows.length === 0 && (params.price_max || params.price_min)) {
        const { price_max: _max, price_min: _min, ...noPrice } = params;
        console.warn("[searchHotels] empty with price filter, retrying without price_min/max");
        result = await rapid("/searchHotels", noPrice);
        rows = extractHotelsRows(result);
      }

      console.log("[searchHotels] searchHotels result", {
        city,
        dest_id: params.dest_id,
        hotelCount: rows.length,
      });

      const aid = process.env.BOOKING_AFFILIATE_ID;
      const linkBase = {
        destination: searchQuery,
        checkIn: arrival,
        checkOut: departure,
        adults: data.adults,
        rooms: data.rooms,
        childrenAges: data.childrenAges,
        affiliateId: aid,
      };
      const mapRows = (hotelRows: any[]): RealHotel[] =>
        hotelRows.slice(0, 40).map((h: any) => {
        const prop = h.property ?? {};
        const priceObj = prop.priceBreakdown?.grossPrice ?? {};
        const strike = Number(prop.priceBreakdown?.strikethroughPrice?.value ?? 0);
        const id = String(h.hotel_id ?? prop.id ?? "");
        const price = Math.round(Number(priceObj.value ?? 0));
        const lat = Number(prop.latitude ?? prop.lat);
        const lng = Number(prop.longitude ?? prop.lng);
        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
        const typeName = String(prop.accommodationTypeName ?? prop.propertyType ?? "").trim();
        const officialStars = Math.round(Number(prop.accuratePropertyClass ?? prop.propertyClass ?? 0));

        const directUrl: string | undefined = prop.url ?? h.url;
        const bookingUrl = resolveHotelBookingUrl(directUrl, {
          ...linkBase,
          hotelName: String(prop.name ?? ""),
        });
        const badges = Array.isArray(prop.priceBreakdown?.benefitBadges)
          ? prop.priceBreakdown.benefitBadges
              .map((b: { text?: string; identifier?: string }) => `${b.text ?? ""} ${b.identifier ?? ""}`)
              .join(" ")
          : "";
        const typeId = Number(prop.accommodationType ?? prop.accommodationTypeId ?? 0) || undefined;
        const rawName = String(prop.name ?? "");
        const displayName = cleanHotelDisplayName(rawName) || rawName || "Hotel";
        const inferred = inferHotelAmenities({
          name: rawName,
          typeName,
          typeId,
          label: String(prop.accessibilityLabel ?? ""),
          badges,
        });
        const images = uniqueHotelImageUrls([
          ...(Array.isArray(prop.photoUrls) ? prop.photoUrls : []),
          prop.photoMainUrl,
        ]);
        const image =
          images[0] || "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400";
        const locationScoreRaw = Number(
          prop.locationScore ??
            prop.reviewLocationScore ??
            prop.locationReviewScore ??
            prop.reviewScores?.location ??
            0,
        );

        return {
          id: id || displayName,
          name: displayName,
          price,
          currency: String(priceObj.currency ?? data.currency),
          rating: Number(prop.reviewScore ?? 0),
          reviews: Number(prop.reviewCount ?? 0),
          image,
          images: images.length ? images : undefined,
          bookingUrl,
          reviewWord: String(prop.reviewScoreWord ?? "").trim() || undefined,
          stars: officialStars >= 1 && officialStars <= 5 ? officialStars : undefined,
          locationScore: locationScoreRaw > 0 ? locationScoreRaw : undefined,
          lat: hasCoords ? lat : undefined,
          lng: hasCoords ? lng : undefined,
          neighborhood: String(prop.wishlistName ?? "").trim() || undefined,
          preferred: Boolean(prop.isPreferred || prop.isPreferredPlus),
          originalPrice: strike > price ? Math.round(strike) : undefined,
          kind: inferred.kind,
          amenities: inferred.amenities,
          typeName: typeName || undefined,
          typeId,
        };
        });
      let hotels = mapRows(rows);

      const stayFilters = data.filters ?? {};
      const resortQuality = Boolean(stayFilters.stars345 || stayFilters.stars45 || stayFilters.resortStay);
      const minStars = stayFilters.stars45
        ? 4
        : (matchResortStayMix({ destIata: data.destIata })?.minStars ?? 3);
      const qualityFilter = (list: RealHotel[], stars: number, allowUnrated = false) =>
        list.filter((hotel) =>
          isAllowedResortStayProperty({
            name: hotel.name,
            typeName: hotel.typeName,
            typeId: hotel.typeId,
            kind: hotel.kind,
            stars: hotel.stars,
            minStars: stars,
            allowUnrated,
          }),
        );
      let filtered = resortQuality ? qualityFilter(hotels, minStars) : hotels;
      if (
        resortQuality &&
        filtered.length < 4 &&
        (params.categories_filter || params.price_max || params.price_min)
      ) {
        const { categories_filter: _c, price_max: _max, price_min: _min, ...loose } = params;
        console.warn("[searchHotels] fewer than 4 quality stays, retrying without categories/price");
        result = await rapid("/searchHotels", loose);
        hotels = mapRows(extractHotelsRows(result));
        filtered = qualityFilter(hotels, Math.min(3, minStars));
      }
      if (resortQuality && filtered.length < 4) {
        filtered = qualityFilter(hotels, Math.min(3, minStars), true);
      }

      return { hotels: filtered, error: null, dest: bookingDest };
    } catch (e: any) {
      console.error("searchHotels failed:", e?.message);
      return { hotels: [], error: e?.message ?? "Failed to fetch hotels" };
    }
  });
