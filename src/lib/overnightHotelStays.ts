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

type OvernightDay = {
  day?: number;
  date?: string;
  city?: string;
  focusName?: string;
  inFlightDay?: boolean;
};

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
 * Paid hotel nights from consecutive city days.
 * Last calendar day is never a hotel night (sleep at home / fly out).
 */
export function collectOvernightHotelStays(plan: {
  days?: OvernightDay[];
  start_date?: string | null;
  originPlace?: string;
  groundTransportMode?: string;
  accommodationMode?: string;
}): OvernightHotelStay[] {
  if (
    plan.groundTransportMode === "motorhome" ||
    plan.accommodationMode === "motorhome"
  ) {
    return [];
  }

  const rawDays = [...(plan.days ?? [])].sort(
    (a, b) => (a.day ?? 0) - (b.day ?? 0),
  );
  if (!rawDays.length) return [];

  const startDate = plan.start_date ?? undefined;
  const lastDayNum = Math.max(
    ...rawDays.map((d, i) => (typeof d.day === "number" ? d.day : i + 1)),
  );
  const origin = plan.originPlace?.trim() ?? "";

  type Group = { city: string; days: Array<{ day: number; date: string }> };
  const groups: Group[] = [];

  const road =
    plan.groundTransportMode === "car" || plan.groundTransportMode === "train";

  for (let i = 0; i < rawDays.length; i++) {
    const d = rawDays[i]!;
    // Car "Odhod z Dunaja" days are often mis-tagged inFlightDay — still a hotel night.
    if (d.inFlightDay && !road) continue;
    const city = (d.city ?? d.focusName ?? "").trim();
    if (!city) continue;
    const dayNum = typeof d.day === "number" ? d.day : i + 1;
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
  if (!road && input.inFlightDay) return false;
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
