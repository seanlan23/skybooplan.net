import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ensureHotelCheckoutAfterCheckin,
  normalizeHotelSearchDate,
  resolveHotelBookingUrl,
} from "./bookingUrl";

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

      const destParams = { query: city };
      console.log("[searchHotels] searchDestination", destParams);
      const dest = await rapid("/searchDestination", destParams);
      const destRows = Array.isArray(dest?.data) ? dest.data : [];
      const first = destRows[0] ?? null;

      console.log("[searchHotels] searchDestination result", {
        city,
        matchCount: destRows.length,
        first: first
          ? {
              dest_id: first.dest_id,
              search_type: first.search_type,
              label: first.label ?? first.name,
            }
          : null,
      });

      if (!first?.dest_id) {
        return { hotels: [], error: `No destination found for "${city}"` };
      }

      const params: Record<string, string> = {
        dest_id: String(first.dest_id),
        search_type: String(first.search_type || "city"),
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
      const hotels: RealHotel[] = rows.slice(0, 20).map((h: any) => {
        const prop = h.property ?? {};
        const priceObj = prop.priceBreakdown?.grossPrice ?? {};
        const id = String(h.hotel_id ?? prop.id ?? Math.random());

        const directUrl: string | undefined = prop.url ?? h.url;
        const bookingUrl = resolveHotelBookingUrl(directUrl, {
          ...linkBase,
          hotelName: String(prop.name ?? ""),
        });

        return {
          id,
          name: String(prop.name ?? "Hotel"),
          price: Math.round(Number(priceObj.value ?? 0)),
          currency: String(priceObj.currency ?? data.currency),
          rating: Number(prop.reviewScore ?? 0),
          reviews: Number(prop.reviewCount ?? 0),
          image: String(
            (Array.isArray(prop.photoUrls) && prop.photoUrls[0]) ||
              prop.photoMainUrl ||
              "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400",
          ),
          bookingUrl,
        };
      });

      return { hotels, error: null };
    } catch (e: any) {
      console.error("searchHotels failed:", e?.message);
      return { hotels: [], error: e?.message ?? "Failed to fetch hotels" };
    }
  });
