import {
  buildBookingSearchUrl,
  toAbsoluteBookingClickHref,
} from "@/lib/bookingUrl";

export type OvernightHotelStay = {
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  firstDay: number;
};

export type OvernightDay = {
  day?: number;
  day_number?: number;
  date?: string;
  city?: string;
  focusName?: string;
  inFlightDay?: boolean;
};

function overnightDayNumber(day: OvernightDay, index: number): number {
  if (typeof day.day === "number" && day.day >= 1) return day.day;
  if (typeof day.day_number === "number" && day.day_number >= 1) return day.day_number;
  return index + 1;
}

function cityKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ");
}

export function overnightPlacesMatch(a: string, b: string): boolean {
  const na = cityKey((a.split(",")[0] ?? a).trim());
  const nb = cityKey((b.split(",")[0] ?? b).trim());
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function isoAddDays(iso: string, days: number): string {
  const stamp = iso.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!stamp) return iso.trim();
  const d = new Date(`${stamp}T12:00:00`);
  if (Number.isNaN(d.getTime())) return stamp;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True only for sleeping on the plane (EU hub day 1), not Manila→El Nido hops. */
function isAirborneOriginNight(
  day: OvernightDay,
  dayNum: number,
  origin: string,
): boolean {
  if (dayNum === 1) return true;
  const city = (day.city ?? day.focusName ?? "").trim();
  return Boolean(origin && city && overnightPlacesMatch(city, origin));
}

function dayDate(day: OvernightDay, startDate: string | undefined, index: number): string {
  const raw = typeof day.date === "string" ? day.date.trim() : "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1]!;
  const start = startDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!start) return "";
  const offset =
    typeof day.day === "number" && day.day >= 1 ? day.day - 1 : index;
  return isoAddDays(start, offset);
}

/**
 * Paid overnight stays from consecutive city days (hotels or camper bases).
 * Last calendar day is never an overnight (sleep at home / fly out).
 */
export function collectOvernightHotelStays(plan: {
  days?: OvernightDay[];
  start_date?: string | null;
  originPlace?: string;
  groundTransportMode?: string;
  accommodationMode?: string;
}): OvernightHotelStay[] {
  const rawDays = [...(plan.days ?? [])].sort(
    (a, b) => overnightDayNumber(a, 0) - overnightDayNumber(b, 0),
  );
  if (!rawDays.length) return [];

  const startDate = plan.start_date ?? undefined;
  const lastDayNum = Math.max(
    ...rawDays.map((d, i) => overnightDayNumber(d, i)),
  );
  const origin = plan.originPlace?.trim() ?? "";

  type Group = { city: string; days: Array<{ day: number; date: string }> };
  const groups: Group[] = [];

  const road =
    plan.groundTransportMode === "car" ||
    plan.groundTransportMode === "train" ||
    plan.groundTransportMode === "motorhome" ||
    plan.accommodationMode === "motorhome";

  for (let i = 0; i < rawDays.length; i++) {
    const d = rawDays[i]!;
    const city = (d.city ?? d.focusName ?? "").trim();
    const dayNum = overnightDayNumber(d, i);
    // Skip only the outbound airborne night (day 1 / origin city). Domestic hops
    // and stale inFlightDay on sightseeing days still need a hotel.
    if (!road && d.inFlightDay && isAirborneOriginNight(d, dayNum, origin)) {
      continue;
    }
    if (!city) continue;
    const date = dayDate(d, startDate, i);
    if (!date) continue;

    const prev = groups[groups.length - 1];
    if (prev && overnightPlacesMatch(prev.city, city)) {
      prev.days.push({ day: dayNum, date });
    } else {
      groups.push({ city, days: [{ day: dayNum, date }] });
    }
  }

  const stays: OvernightHotelStay[] = [];
  for (const g of groups) {
    const includesLast = g.days.some((x) => x.day === lastDayNum);
    let nights = g.days.length;
    if (includesLast) nights -= 1;
    if (nights <= 0) continue;

    const paidDays = g.days.slice(0, nights);
    const checkIn = paidDays[0]!.date;
    const lastNight = paidDays[paidDays.length - 1]!.date;
    const checkOut = isoAddDays(lastNight, 1);
    if (!checkIn || checkOut <= checkIn) continue;

    if (
      origin &&
      overnightPlacesMatch(g.city, origin) &&
      includesLast &&
      paidDays.every((x) => x.day >= lastDayNum - 1)
    ) {
      continue;
    }

    stays.push({
      city: g.city,
      checkIn,
      checkOut,
      nights,
      firstDay: paidDays[0]!.day,
    });
  }

  return stays;
}

export type HotelStayHint = {
  city?: string;
  name?: string;
  nights?: number;
  from_date?: string;
  to_date?: string;
};

function isoDateOf(raw?: string): string {
  return raw?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
}

function overnightCityKeys(days: OvernightDay[]): Set<string> {
  if (!days.length) return new Set();
  const lastDayNum = Math.max(
    ...days.map((d, i) => overnightDayNumber(d, i)),
  );
  const keys = new Set<string>();
  for (let i = 0; i < days.length; i++) {
    const d = days[i]!;
    const dayNum = overnightDayNumber(d, i);
    if (dayNum === lastDayNum) continue;
    if (d.inFlightDay && dayNum === 1) continue;
    const city = (d.city ?? d.focusName ?? "").trim();
    if (city) keys.add(cityKey(city));
  }
  return keys;
}

/**
 * When every overnight is the same gateway city but hotels[] lists real bases,
 * stamp days[].city from those stays (generic — not destination-specific).
 */
export function stampOvernightCitiesFromHotels(
  days: OvernightDay[],
  hotels: HotelStayHint[] | undefined,
): boolean {
  if (!days.length || !hotels?.length) return false;
  const stays = hotels
    .map((h) => ({
      city: (h.city || h.name || "").trim(),
      nights: typeof h.nights === "number" && Number.isFinite(h.nights) ? h.nights : 0,
      from: isoDateOf(h.from_date),
      to: isoDateOf(h.to_date),
    }))
    .filter((s) => s.city);
  const distinctStays = new Set(stays.map((s) => cityKey(s.city)));
  if (distinctStays.size < 2) return false;
  if (overnightCityKeys(days).size > 1) return false;

  const sorted = [...days].sort(
    (a, b) => overnightDayNumber(a, 0) - overnightDayNumber(b, 0),
  );
  const ranged = stays.filter((s) => s.from && s.to && s.to > s.from);
  if (ranged.length >= 2) {
    let n = 0;
    for (const d of sorted) {
      const date = dayDate(d, undefined, 0);
      if (!date) continue;
      const hit = ranged.find((s) => date >= s.from && date < s.to);
      if (!hit) continue;
      d.city = hit.city;
      n += 1;
    }
    return n > 0;
  }

  const withNights = stays.filter((s) => s.nights > 0);
  if (withNights.length < 2) return false;

  const lastDayNum = Math.max(
    ...sorted.map((d, i) => overnightDayNumber(d, i)),
  );
  const slots = sorted.filter((d, i) => {
    const dayNum = overnightDayNumber(d, i);
    if (dayNum === lastDayNum) return false;
    if (d.inFlightDay && dayNum === 1) return false;
    return true;
  });

  let i = 0;
  for (const stay of withNights) {
    for (let n = 0; n < stay.nights && i < slots.length; n += 1, i += 1) {
      slots[i]!.city = stay.city;
    }
  }
  return i > 0;
}

function hintNights(h: HotelStayHint): number {
  if (typeof h.nights === "number" && Number.isFinite(h.nights) && h.nights > 0) {
    return Math.round(h.nights);
  }
  const from = isoDateOf(h.from_date);
  const to = isoDateOf(h.to_date);
  if (!from || !to || to <= from) return 0;
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/** Distinct overnight bases from hotels[] — used when days[].city collapsed to a gateway. */
export function hotelHintsHaveMultipleBases(hotels: HotelStayHint[] | undefined): boolean {
  if (!hotels?.length) return false;
  const keys = new Set(
    hotels
      .map((h) => cityKey((h.city || h.name || "").trim()))
      .filter(Boolean),
  );
  return keys.size >= 2;
}

/**
 * Stay rows from hotels[] when days[].city is a single gateway city.
 * Dates chain from startDate when from_date/to_date are missing.
 */
export function collectOvernightHotelStaysFromHints(
  hotels: HotelStayHint[] | undefined,
  startDate?: string | null,
): OvernightHotelStay[] {
  if (!hotelHintsHaveMultipleBases(hotels)) return [];
  let cursor = startDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
  const stays: OvernightHotelStay[] = [];
  let firstDay = 1;
  for (const h of hotels ?? []) {
    const city = (h.city || h.name || "").trim();
    const nights = hintNights(h);
    if (!city || nights <= 0) continue;
    const checkIn = isoDateOf(h.from_date) || cursor;
    const checkOut = isoDateOf(h.to_date) || (checkIn ? isoAddDays(checkIn, nights) : "");
    if (!checkIn || !checkOut || checkOut <= checkIn) continue;
    stays.push({ city, checkIn, checkOut, nights, firstDay });
    cursor = checkOut;
    firstDay += nights;
  }
  return stays.length >= 2 ? stays : [];
}

/** Whether the day card should mount HotelsSection / Booking.com. */
export function shouldShowDayHotels(input: {
  city?: string;
  isFirstInCity: boolean;
  isHotelRestNight?: boolean;
  accommodationMode?: "hotel" | "motorhome";
  groundTransportMode?: string;
  inFlightDay?: boolean;
  dayNumber: number;
  totalTripDays?: number;
}): boolean {
  const city = input.city?.trim();
  if (!city) return false;
  if (input.accommodationMode === "motorhome") return Boolean(input.isHotelRestNight);
  if (input.totalTripDays != null && input.dayNumber >= input.totalTripDays) return false;
  const road =
    input.groundTransportMode === "car" || input.groundTransportMode === "train";
  // Hide Booking only on the outbound airborne day — not on island hops tagged inFlightDay.
  if (!road && input.inFlightDay && input.dayNumber === 1) return false;
  return input.isFirstInCity;
}

export function overnightStayBookingUrl(
  stay: OvernightHotelStay,
  opts?: { adults?: number; lang?: string },
): string {
  return toAbsoluteBookingClickHref(
    buildBookingSearchUrl({
      destination: stay.city,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      adults: Math.max(1, opts?.adults ?? 2),
      rooms: 1,
      lang: opts?.lang,
    }),
  );
}
