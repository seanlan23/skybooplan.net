/**
 * IATA → IANA timezone for local flight-time math when providers omit arrival.
 * Covers hubs + common long-haul destinations used by skybooplan.
 */
const AIRPORT_TIME_ZONES: Record<string, string> = {
  // Alps / Central Europe
  LJU: "Europe/Ljubljana",
  ZAG: "Europe/Zagreb",
  VIE: "Europe/Vienna",
  GRZ: "Europe/Vienna",
  INN: "Europe/Vienna",
  BUD: "Europe/Budapest",
  PRG: "Europe/Prague",
  BEG: "Europe/Belgrade",
  SPU: "Europe/Zagreb",
  DBV: "Europe/Zagreb",
  ZAD: "Europe/Zagreb",
  PUY: "Europe/Zagreb",
  // DACH / Italy / CH
  MUC: "Europe/Berlin",
  FRA: "Europe/Berlin",
  BER: "Europe/Berlin",
  DUS: "Europe/Berlin",
  HAM: "Europe/Berlin",
  STR: "Europe/Berlin",
  CGN: "Europe/Berlin",
  ZRH: "Europe/Zurich",
  GVA: "Europe/Zurich",
  BSL: "Europe/Zurich",
  MXP: "Europe/Rome",
  LIN: "Europe/Rome",
  BGY: "Europe/Rome",
  FCO: "Europe/Rome",
  CIA: "Europe/Rome",
  VCE: "Europe/Rome",
  TRS: "Europe/Rome",
  NAP: "Europe/Rome",
  BLQ: "Europe/Rome",
  PSA: "Europe/Rome",
  // Western / Northern Europe
  CDG: "Europe/Paris",
  ORY: "Europe/Paris",
  LYS: "Europe/Paris",
  NCE: "Europe/Paris",
  MRS: "Europe/Paris",
  AMS: "Europe/Amsterdam",
  BRU: "Europe/Brussels",
  LUX: "Europe/Luxembourg",
  LHR: "Europe/London",
  LGW: "Europe/London",
  STN: "Europe/London",
  LTN: "Europe/London",
  MAN: "Europe/London",
  EDI: "Europe/London",
  DUB: "Europe/Dublin",
  MAD: "Europe/Madrid",
  BCN: "Europe/Madrid",
  PMI: "Europe/Madrid",
  AGP: "Europe/Madrid",
  LIS: "Europe/Lisbon",
  OPO: "Europe/Lisbon",
  ATH: "Europe/Athens",
  SKG: "Europe/Athens",
  IST: "Europe/Istanbul",
  SAW: "Europe/Istanbul",
  CPH: "Europe/Copenhagen",
  ARN: "Europe/Stockholm",
  OSL: "Europe/Oslo",
  HEL: "Europe/Helsinki",
  WAW: "Europe/Warsaw",
  KRK: "Europe/Warsaw",
  OTP: "Europe/Bucharest",
  SOF: "Europe/Sofia",
  // Middle East hubs
  AUH: "Asia/Dubai",
  DXB: "Asia/Dubai",
  DOH: "Asia/Qatar",
  RUH: "Asia/Riyadh",
  JED: "Asia/Riyadh",
  // Thailand / SE Asia
  BKK: "Asia/Bangkok",
  DMK: "Asia/Bangkok",
  HKT: "Asia/Bangkok",
  CNX: "Asia/Bangkok",
  USM: "Asia/Bangkok",
  UTP: "Asia/Bangkok",
  KBV: "Asia/Bangkok",
  HDY: "Asia/Bangkok",
  SIN: "Asia/Singapore",
  KUL: "Asia/Kuala_Lumpur",
  MNL: "Asia/Manila",
  CGK: "Asia/Jakarta",
  DPS: "Asia/Makassar",
  SGN: "Asia/Ho_Chi_Minh",
  HAN: "Asia/Bangkok",
  PNH: "Asia/Bangkok",
  REP: "Asia/Bangkok",
  // East Asia
  HKG: "Asia/Hong_Kong",
  TPE: "Asia/Taipei",
  NRT: "Asia/Tokyo",
  HND: "Asia/Tokyo",
  KIX: "Asia/Tokyo",
  ICN: "Asia/Seoul",
  GMP: "Asia/Seoul",
  PEK: "Asia/Shanghai",
  PKX: "Asia/Shanghai",
  PVG: "Asia/Shanghai",
  CAN: "Asia/Shanghai",
  // South Asia
  DEL: "Asia/Kolkata",
  BOM: "Asia/Kolkata",
  BLR: "Asia/Kolkata",
  MAA: "Asia/Kolkata",
  CMB: "Asia/Colombo",
  // Oceania
  SYD: "Australia/Sydney",
  MEL: "Australia/Melbourne",
  BNE: "Australia/Brisbane",
  PER: "Australia/Perth",
  AKL: "Pacific/Auckland",
  // Africa
  CAI: "Africa/Cairo",
  JNB: "Africa/Johannesburg",
  CPT: "Africa/Johannesburg",
  CMN: "Africa/Casablanca",
  // Americas
  JFK: "America/New_York",
  EWR: "America/New_York",
  LGA: "America/New_York",
  BOS: "America/New_York",
  IAD: "America/New_York",
  ORD: "America/Chicago",
  DFW: "America/Chicago",
  IAH: "America/Chicago",
  ATL: "America/New_York",
  MIA: "America/New_York",
  DEN: "America/Denver",
  LAX: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
  SEA: "America/Los_Angeles",
  LAS: "America/Los_Angeles",
  YYZ: "America/Toronto",
  YVR: "America/Vancouver",
  YUL: "America/Toronto",
  MEX: "America/Mexico_City",
  CUN: "America/Cancun",
  GRU: "America/Sao_Paulo",
  GIG: "America/Sao_Paulo",
  EZE: "America/Argentina/Buenos_Aires",
  SCL: "America/Santiago",
  LIM: "America/Lima",
  BOG: "America/Bogota",
};

export function airportTimeZone(iata: string | undefined | null): string | null {
  const code = (iata ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return AIRPORT_TIME_ZONES[code] ?? null;
}

function parseYmd(raw: string): { y: number; m: number; d: number } | null {
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return {
      y: Number.parseInt(iso[1]!, 10),
      m: Number.parseInt(iso[2]!, 10),
      d: Number.parseInt(iso[3]!, 10),
    };
  }
  return null;
}

function parseHm(raw: string): { h: number; min: number } | null {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number.parseInt(match[1]!, 10);
  const min = Number.parseInt(match[2]!, 10);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

/** Offset (ms) such that `utcMs + offset === wall-clock as if UTC parts`. */
function getTimeZoneOffsetMs(timeZone: string, utcDate: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcDate);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const asUtc = Date.UTC(
    Number.parseInt(map.year!, 10),
    Number.parseInt(map.month!, 10) - 1,
    Number.parseInt(map.day!, 10),
    Number.parseInt(map.hour!, 10),
    Number.parseInt(map.minute!, 10),
    Number.parseInt(map.second ?? "0", 10),
  );
  return asUtc - utcDate.getTime();
}

/** Interpret local wall time in `timeZone` as a UTC instant (DST-aware). */
export function zonedLocalToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(y, m - 1, d, h, min, 0);
  let offset = getTimeZoneOffsetMs(timeZone, new Date(utcGuess));
  let corrected = new Date(utcGuess - offset);
  offset = getTimeZoneOffsetMs(timeZone, corrected);
  corrected = new Date(utcGuess - offset);
  return corrected;
}

function formatInTimeZone(
  date: Date,
  timeZone: string,
): { ymd: string; hm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const ymd = `${map.year}-${map.month}-${map.day}`;
  const hm = `${String(map.hour).padStart(2, "0")}:${String(map.minute).padStart(2, "0")}`;
  return { ymd, hm };
}

function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return 0;
  const ms =
    Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}

/**
 * Local arrival at destination = origin local depart → UTC → +duration → dest local.
 * Falls back to null when IATA timezones or inputs are incomplete.
 */
export function estimateLocalArrival(params: {
  departHm: string;
  /** YYYY-MM-DD or ISO datetime */
  departDate: string;
  durationMinutes: number;
  fromIata: string;
  toIata: string;
}): { time: string; dayOffset: number } | null {
  const fromTz = airportTimeZone(params.fromIata);
  const toTz = airportTimeZone(params.toIata);
  const ymd = parseYmd(params.departDate);
  const hm = parseHm(params.departHm);
  if (!fromTz || !toTz || !ymd || !hm) return null;
  if (!Number.isFinite(params.durationMinutes) || params.durationMinutes <= 0) {
    return null;
  }

  const utcDepart = zonedLocalToUtc(ymd.y, ymd.m, ymd.d, hm.h, hm.min, fromTz);
  const utcArrive = new Date(utcDepart.getTime() + params.durationMinutes * 60_000);
  const local = formatInTimeZone(utcArrive, toTz);
  const departYmd = `${String(ymd.y).padStart(4, "0")}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`;
  return {
    time: local.hm,
    dayOffset: Math.max(0, calendarDaysBetween(departYmd, local.ymd)),
  };
}

function parseIsoLocalParts(
  iso: string,
): { y: number; m: number; d: number; h: number; min: number } | null {
  const match = iso
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2})?)?/);
  if (!match) return null;
  return {
    y: Number.parseInt(match[1]!, 10),
    m: Number.parseInt(match[2]!, 10),
    d: Number.parseInt(match[3]!, 10),
    h: Number.parseInt(match[4] ?? "0", 10),
    min: Number.parseInt(match[5] ?? "0", 10),
  };
}

/** True when ISO already carries Z / ±HH:MM — Date.parse is trustworthy. */
export function isoHasExplicitOffset(iso: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso.trim());
}

/**
 * Elapsed minutes between two *local* airport times (naive ISO without offset).
 * MUC 21:10 → HKT 17:55 next day = ~14h45, not wall-clock 20h45.
 */
export function elapsedMinutesBetweenAirportLocals(
  departIso: string,
  arriveIso: string,
  fromIata: string,
  toIata: string,
): number | null {
  const fromTz = airportTimeZone(fromIata);
  const toTz = airportTimeZone(toIata);
  const dep = parseIsoLocalParts(departIso);
  const arr = parseIsoLocalParts(arriveIso);
  if (!fromTz || !toTz || !dep || !arr) return null;

  const utcDepart = zonedLocalToUtc(dep.y, dep.m, dep.d, dep.h, dep.min, fromTz);
  const utcArrive = zonedLocalToUtc(arr.y, arr.m, arr.d, arr.h, arr.min, toTz);
  const mins = Math.round((utcArrive.getTime() - utcDepart.getTime()) / 60_000);
  return mins > 0 ? mins : null;
}
