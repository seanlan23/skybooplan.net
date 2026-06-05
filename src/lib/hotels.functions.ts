import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveHotelBookingUrl } from "./bookingUrl";

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

async function rapid(path: string, params: Record<string, string>) {
  const key = process.env.BOOKING_API_KEY;
  if (!key) throw new Error("BOOKING_API_KEY not configured");
  const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`;
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

export const searchHotels = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{ hotels: RealHotel[]; error: string | null }> => {
    try {
      // Step 1 — resolve destination id
      const dest = await rapid("/searchDestination", { query: data.city });
      const first = Array.isArray(dest?.data) ? dest.data[0] : null;
      if (!first?.dest_id) {
        return { hotels: [], error: "No destination found" };
      }

      // Step 2 — search hotels
      const params: Record<string, string> = {
        dest_id: String(first.dest_id),
        search_type: String(first.search_type || "CITY"),
        arrival_date: data.checkIn,
        departure_date: data.checkOut,
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
      const result = await rapid("/searchHotels", params);
      const rows: any[] = result?.data?.hotels ?? [];

      const aid = process.env.BOOKING_AFFILIATE_ID;
      const linkBase = {
        destination: data.city,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
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
              "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400"
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
