import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ensureHotelCheckoutAfterCheckin,
  normalizeHotelSearchDate,
  resolveHotelBookingUrl,
} from "./bookingUrl";
import {
  hotelSearchQueryAlias,
  pickBestBookingDestination,
} from "./hotelDestinationPick";
import { inferHotelAmenities, type HotelAmenities, type HotelKind } from "./hotelAmenities";

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
};

const Input = z.object({
  city: z.string().min(1).max(120),
  checkIn: z.string().min(8).max(20),
  checkOut: z.string().min(8).max(20),
  adults: z.number().int().min(1).max(20).default(2),
  rooms: z.number().int().min(1).max(10).default(1),
  childrenAges: z.array(z.number().int().min(0).max(17)).max(10).default([]),
  currency: z.string().min(3).max(3).default("EUR"),
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
  .handler(async ({ data }): Promise<{ hotels: RealHotel[]; error: string | null }> => {
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

      const searchQuery = hotelSearchQueryAlias(city);
      const destParams = { query: searchQuery };
      console.log("[searchHotels] searchDestination", destParams);
      const dest = await rapid("/searchDestination", destParams);
      const destRows = Array.isArray(dest?.data) ? dest.data : [];
      const best = pickBestBookingDestination(searchQuery, destRows);

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

      console.log("[searchHotels] searchHotels params", params);
      const result = await rapid("/searchHotels", params);
      const rows = extractHotelsRows(result);

      console.log("[searchHotels] searchHotels result", {
        city,
        dest_id: params.dest_id,
        hotelCount: rows.length,
      });

      const aid = process.env.BOOKING_AFFILIATE_ID;
      const linkBase = {
        destination: city,
        checkIn: arrival,
        checkOut: departure,
        adults: data.adults,
        rooms: data.rooms,
        childrenAges: data.childrenAges,
        affiliateId: aid,
      };
      const hotels: RealHotel[] = rows.slice(0, 40).map((h: any) => {
        const prop = h.property ?? {};
        const priceObj = prop.priceBreakdown?.grossPrice ?? {};
        const strike = Number(prop.priceBreakdown?.strikethroughPrice?.value ?? 0);
        const id = String(h.hotel_id ?? prop.id ?? "");
        const price = Math.round(Number(priceObj.value ?? 0));
        const lat = Number(prop.latitude ?? prop.lat);
        const lng = Number(prop.longitude ?? prop.lng);
        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
        const starsRaw = Math.round(
          Number(prop.accuratePropertyClass ?? prop.propertyClass ?? prop.qualityClass ?? 0),
        );

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
        const inferred = inferHotelAmenities({
          name: String(prop.name ?? ""),
          typeName: String(prop.accommodationTypeName ?? prop.propertyType ?? ""),
          typeId: Number(prop.accommodationType ?? prop.accommodationTypeId ?? 0) || undefined,
          label: String(prop.accessibilityLabel ?? ""),
          badges,
        });

        return {
          id: id || String(prop.name ?? "hotel"),
          name: String(prop.name ?? "Hotel"),
          price,
          currency: String(priceObj.currency ?? data.currency),
          rating: Number(prop.reviewScore ?? 0),
          reviews: Number(prop.reviewCount ?? 0),
          image: String(
            (Array.isArray(prop.photoUrls) && prop.photoUrls[0]) ||
              prop.photoMainUrl ||
              "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400",
          ),
          bookingUrl,
          reviewWord: String(prop.reviewScoreWord ?? "").trim() || undefined,
          stars: starsRaw >= 1 && starsRaw <= 5 ? starsRaw : undefined,
          lat: hasCoords ? lat : undefined,
          lng: hasCoords ? lng : undefined,
          neighborhood: String(prop.wishlistName ?? "").trim() || undefined,
          preferred: Boolean(prop.isPreferred || prop.isPreferredPlus),
          originalPrice: strike > price ? Math.round(strike) : undefined,
          kind: inferred.kind,
          amenities: inferred.amenities,
        };
      });

      return { hotels, error: null };
    } catch (e: any) {
      console.error("searchHotels failed:", e?.message);
      return { hotels: [], error: e?.message ?? "Failed to fetch hotels" };
    }
  });
