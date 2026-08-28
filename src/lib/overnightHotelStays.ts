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
  title?: string;
  inFlightDay?: boolean;
  transportation?: Array<{ type?: string; from?: string; to?: string }>;
  activities?: {
    morning?: Array<{ name?: string; title?: string; type?: string }>;
    afternoon?: Array<{ name?: string; title?: string; type?: string }>;
    evening?: Array<{ name?: string; title?: string; type?: string }>;
  };
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

const MOVEMENT_ACT_RE =
  /let\b|flight|trajekt|ferry|vlak|train|shinkansen|bullet train|tgv|\bice\b|eurostar|thalys|\bave\b|visokohitrostn|železn|rail|speedboat|kombi|\bvan\b|prevoz na letališč|airport transfer|check-?out|odjava|odhod iz hotela/i;

function actLabel(a: { name?: string; title?: string }): string {
  return (a.name || a.title || "").trim();
}

function isMovementActivity(a: { name?: string; title?: string; type?: string }): boolean {
  const t = (a.type ?? "").toUpperCase();
  if (t === "TRANSPORT" || t === "TRAIN" || t === "FLIGHT" || t === "FERRY") return true;
  return MOVEMENT_ACT_RE.test(actLabel(a));
}

function isBareCityTitle(title: string, city: string): boolean {
  const t = title.trim();
  if (!t || !city.trim()) return false;
  return overnightPlacesMatch(t, city) && cityKey(t).length <= cityKey(city).length + 6;
}

function hopOriginCity(
  days: OvernightDay[],
  index: number,
  hop: { from: string; to: string },
): string {
  const prevCity = (days[index - 1]?.city ?? days[index - 1]?.focusName ?? "").trim();
  if (prevCity && overnightPlacesMatch(prevCity, hop.from)) return prevCity;
  return stripHopLabel(hop.from);
}

function stampDayCity(day: OvernightDay, city: string, fromCity?: string): void {
  day.city = city;
  if (day.focusName && (!fromCity || overnightPlacesMatch(day.focusName, fromCity))) {
    day.focusName = city;
  }
  if (typeof day.title === "string" && fromCity && isBareCityTitle(day.title, fromCity)) {
    day.title = city;
  }
}

/** Days after a morning/daytime base-change that Gemini left on the old city. */
function forwardFillNewBase(
  days: OvernightDay[],
  hopIndex: number,
  fromCity: string,
  toCity: string,
): number {
  if (!fromCity || !toCity || overnightPlacesMatch(fromCity, toCity)) return 0;
  let n = 0;
  for (let j = hopIndex + 1; j < days.length; j++) {
    const d = days[j]!;
    const hop = overnightHop(d, days[j + 1]);
    if (hop && overnightPlacesMatch(hop.from, toCity) && !overnightPlacesMatch(hop.to, toCity)) {
      break;
    }
    const labeled = (d.city ?? d.focusName ?? "").trim();
    if (!labeled) continue;
    if (overnightPlacesMatch(labeled, toCity)) continue;
    if (!overnightPlacesMatch(labeled, fromCity)) break;
    stampDayCity(d, toCity, fromCity);
    n += 1;
  }
  return n;
}

function chronoActivities(day: OvernightDay): Array<{ name?: string; title?: string; type?: string }> {
  const acts = day.activities;
  if (!acts) return [];
  return [
    ...(acts.morning ?? []),
    ...(acts.afternoon ?? []),
    ...(acts.evening ?? []),
  ];
}

function baseHops(day: OvernightDay): Array<{ from: string; to: string }> {
  const hops: Array<{ from: string; to: string }> = [];
  for (const leg of day.transportation ?? []) {
    const from = (leg.from ?? "").trim();
    const to = (leg.to ?? "").trim();
    if (from && to && !overnightPlacesMatch(from, to)) hops.push({ from, to });
  }
  return hops;
}

function stripHopLabel(raw: string): string {
  return raw.replace(/\s*\([A-Z]{3}\)\s*$/g, "").trim() || raw.trim();
}

function looksLikeIata(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim());
}

/** Prefer a human place name over a bare IATA code on transportation[].to/from. */
function placeNameForHopEnd(
  raw: string,
  labeled?: string,
  nextCity?: string,
): string {
  const stripped = stripHopLabel(raw);
  if (!looksLikeIata(stripped)) return stripped;
  if (labeled && !looksLikeIata(labeled)) return labeled;
  if (nextCity && !looksLikeIata(nextCity)) return nextCity;
  return stripped;
}

function overnightHop(day: OvernightDay, next?: OvernightDay): { from: string; to: string } | null {
  const hops = baseHops(day);
  if (!hops.length) return null;
  const nextCity = (next?.city ?? next?.focusName ?? "").trim();
  if (nextCity) {
    const hit = [...hops].reverse().find((h) => overnightPlacesMatch(h.to, nextCity));
    if (hit) return hit;
  }
  return hops[hops.length - 1] ?? null;
}

function daytimeSightsBeforeHop(day: OvernightDay, hop: { from: string; to: string } | null): boolean {
  if (!hop) return false;
  if (MOVEMENT_ACT_RE.test(day.title ?? "")) return false;
  const acts = chronoActivities(day);
  const firstSight = acts.findIndex((a) => actLabel(a) && !isMovementActivity(a));
  if (firstSight < 0) return false;
  const firstMove = acts.findIndex((a) => isMovementActivity(a));
  return firstMove < 0 || firstSight < firstMove;
}

function overnightSleepCity(day: OvernightDay, next?: OvernightDay): string {
  const labeled = (day.city ?? day.focusName ?? "").trim();
  const hop = overnightHop(day, next);
  if (!hop || !daytimeSightsBeforeHop(day, hop)) return labeled;
  const nextCity = (next?.city ?? next?.focusName ?? "").trim();
  if (nextCity && overnightPlacesMatch(nextCity, hop.to)) return nextCity;
  if (labeled && overnightPlacesMatch(labeled, hop.to)) return labeled;
  return stripHopLabel(hop.to);
}

/**
 * On a hop after daytime sightseeing, day.city is the origin (Wat Pho day = Bangkok),
 * not the evening arrival city. Hub-return titles ("Nazaj v Cancún") keep the destination.
 * On a morning/daytime hop INTO a new base, day.city is the destination from that day on
 * (Shinkansen Osaka→Tokyo ⇒ Tokyo, including the following stay days).
 */
export function syncDayCityToDaytimeProgram(days: OvernightDay[]): number {
  let n = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const hop = overnightHop(day, days[i + 1]);
    if (!hop) continue;
    const dest = placeNameForHopEnd(
      hop.to,
      (day.city ?? day.focusName ?? "").trim(),
      (days[i + 1]?.city ?? days[i + 1]?.focusName ?? "").trim(),
    );
    const origin = placeNameForHopEnd(hopOriginCity(days, i, hop), (days[i - 1]?.city ?? "").trim());

    if (daytimeSightsBeforeHop(day, hop)) {
      const sightBlob = chronoActivities(day)
        .filter((a) => actLabel(a) && !isMovementActivity(a))
        .map(actLabel)
        .join(" ");
      const destBlob = `${day.title ?? ""} ${sightBlob}`;
      if (overnightPlacesMatch(destBlob, hop.to) || overnightPlacesMatch(day.title ?? "", hop.to)) {
        continue;
      }
      if (!origin) continue;
      const current = (day.city ?? "").trim();
      if (current && overnightPlacesMatch(current, origin)) continue;
      stampDayCity(day, origin, dest);
      n += 1;
      continue;
    }

    if (!dest) continue;
    const current = (day.city ?? "").trim();
    if (!current || !overnightPlacesMatch(current, dest)) {
      stampDayCity(day, dest, origin);
      n += 1;
    } else if (origin) {
      stampDayCity(day, dest, origin);
    }
    n += forwardFillNewBase(days, i, origin, dest);
  }
  return n;
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
    const sleepCity = overnightSleepCity(d, rawDays[i + 1]) || city;

    const prev = groups[groups.length - 1];
    if (prev && overnightPlacesMatch(prev.city, sleepCity)) {
      prev.days.push({ day: dayNum, date });
    } else {
      groups.push({ city: sleepCity, days: [{ day: dayNum, date }] });
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

/** hotels[] rows from actual sleep nights after day.city sync. */
export function hotelsFromSleepNights(plan: {
  days?: OvernightDay[];
  start_date?: string | null;
  originPlace?: string;
  groundTransportMode?: string;
  accommodationMode?: string;
}): HotelStayHint[] {
  return collectOvernightHotelStays(plan).map((s) => ({
    city: s.city,
    nights: s.nights,
    from_date: s.checkIn,
    to_date: s.checkOut,
  }));
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
