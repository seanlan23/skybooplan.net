import type { HeroChatCollected } from "@/lib/heroChatFlow";
import {
  parseChatDateRange,
  parseChatNights,
  parseChatPassengers,
} from "@/lib/heroChatPlanner";
import { ensureHotelCheckoutAfterCheckin } from "@/lib/bookingUrl";
import { hotelSearchQueryForStay } from "@/lib/hotelDestinationPick";
import { mergeStayFilters, parseStayIntent, type StayIntentFilters } from "@/lib/stayIntent";

export type HeroStaySearchParams = {
  city: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
  childrenAges: number[];
  filters?: StayIntentFilters;
};

/** Strip emoji / IATA so Booking searchDestination gets a clean place name. */
export function stayDestinationLabel(destination: string): string {
  return destination
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "")
    .replace(/\([A-Za-z]{3}\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function staySearchFromCollected(
  collected: HeroChatCollected,
  language = "sl",
): HeroStaySearchParams {
  const rawDest = stayDestinationLabel(collected.destination);
  const destIntent = parseStayIntent(rawDest);
  const wishIntent = collected.locationWishes?.trim()
    ? parseStayIntent(collected.locationWishes)
    : null;
  const filters = mergeStayFilters(destIntent.filters, wishIntent?.filters);
  const city =
    destIntent.place ||
    wishIntent?.place ||
    hotelSearchQueryForStay(rawDest) ||
    "";
  const range = parseChatDateRange(collected.dates, language);
  const checkIn = range.departDate;
  const nights = collected.nights?.trim()
    ? parseChatNights(collected.nights)
    : undefined;
  const checkOut =
    range.returnDate ||
    ensureHotelCheckoutAfterCheckin(
      checkIn,
      nights
        ? (() => {
            const d = new Date(`${checkIn}T12:00:00Z`);
            d.setUTCDate(d.getUTCDate() + Math.max(1, nights));
            return d.toISOString().slice(0, 10);
          })()
        : undefined,
    );
  const { adults, childrenAges } = parseChatPassengers(collected.passengers);
  const roomsFromLabel = collected.passengers.match(
    /(\d+)\s*(?:sob[aei]?|rooms?|zimmer|chambres?|habitacion(?:es)?|camer[ae]?)/i,
  );
  const rooms = Math.max(
    1,
    Math.min(
      10,
      collected.rooms ??
        (roomsFromLabel ? Number.parseInt(roomsFromLabel[1]!, 10) : Math.ceil(adults / 2)),
    ),
  );

  return {
    city,
    checkIn,
    checkOut,
    adults,
    rooms,
    childrenAges,
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
  };
}
