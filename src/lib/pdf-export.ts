import jsPDF from "jspdf";
import {
  buildGoogleMapsDirectionsUrl,
  isValidNavCoord,
  resolveDayNavOrigin,
} from "@/lib/navigationService";
import {
  alignSummaryTripLength,
  resolvePlanContentLanguage,
  stripPlanTeaser,
} from "@/lib/planTeaser";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { DAY_TITLE_PREFIXES, normalizePlanLangCode } from "@/lib/planLanguages";
import { activityDescriptionBullets } from "@/lib/activityDescription";
import { formatActivityClockLabel, uniquifyDayActivityClocks } from "@/lib/activityTime";
import { slPaxAfterNumber } from "@/lib/slovenePax";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";
import { resyncPlanDayDates } from "@/lib/daySequence";
import { fixMotorhomeCopyErrors, activityHasRenderableBody, isDaypartSlotLabel, isPlaceholderOrTruncatedCopy, sanitizeForLang, stripPlannerMetaCopy } from "@/lib/textSanitize";
import {
  collectOvernightHotelStays,
  collectOvernightHotelStaysFromHints,
  hotelHintsHaveMultipleBases,
  overnightPlacesMatch,
  overnightStayBookingUrl,
  stampOvernightCitiesFromHotels,
  holdCityHeaderUntilTransfer,
  syncDayCityToDaytimeProgram,
  type HotelStayHint,
  type OvernightDay,
} from "@/lib/overnightHotelStays";
import { DESTINATION_BY_IATA, lookupDestination } from "@/lib/destinationCoords";
import { resolveTravelRequirements, type TravelRequirements } from "@/lib/travelRequirements";
import {
  isBaseTransferLeg,
  orientArrivalTransferLeg,
  resolveTransferHub,
  sameTransferBase,
} from "@/lib/baseTransfer";
import { scrubLocalTipsOnPdfDays } from "@/lib/localTipsSanitize";

/**
 * Served from /public/fonts so Nitro/Vercel always can fetch them.
 * (Vite `?url` imports of node_modules TTFs often 404 in production client chunks.)
 */
const FONT_REGULAR_URL = "/fonts/DejaVuSans.ttf";
const FONT_BOLD_URL = "/fonts/DejaVuSans-Bold.ttf";

/** Legacy / loose shape accepted from callers. */
export type PlanItinerary = {
  summary?: string;
  destinationName?: string;
  totalBudgetEur?: number;
  /** On-destination spend (meals, sights, local/domestic transport). */
  planEur?: number;
  /** International ticket party total (outbound+return, all pax). */
  flightEur?: number;
  flightTotalEur?: number;
  days?: Array<Record<string, unknown>>;
  flights?: Array<{ from?: string; to?: string; date?: string; airline?: string; price?: string }>;
  originIata?: string;
  destinationIata?: string;
  returnFromIata?: string;
  returnFlightEu?: { fromAirport?: string; toAirport?: string };
  hotels?: Array<{
    name?: string;
    city?: string;
    area?: string;
    nights?: number;
    price?: string;
    from_date?: string;
    to_date?: string;
    note?: string;
  }>;
  budget?: { total?: string; currency?: string; breakdown?: Record<string, string | number> };
  packing?: string[];
};

export type PlanForPdf = {
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  travel_pace?: string | null;
  wishes?: string | null;
  cover_image_url?: string | null;
  itinerary: PlanItinerary | Record<string, unknown>;
  language?: string | null;
  /** Travelers — total budget is daily × pax; label it so €6k isn't read as solo. */
  pax?: number | null;
  /** Visitor IP ISO2 — insurance home market, never departure airport. */
  ipCountry?: string | null;
};

type PdfActivity = {
  time?: string;
  title: string;
  description?: string;
  bullets?: string[];
  location?: string;
  price?: string;
  /** Google Maps directions when AI provided a concrete place. */
  mapsUrl?: string;
};

type PdfDay = {
  day: number;
  dayEnd?: number;
  date?: string;
  dateEnd?: string;
  title: string;
  city?: string;
  dailyBudgetEur?: number;
  transportTips?: string;
  localTips?: string;
  transportation: Array<{
    type: string;
    from: string;
    to: string;
    duration?: string;
    price?: string;
  }>;
  slots: Array<{ label: string; items: PdfActivity[] }>;
  /** Booking.com affiliate search for the first night in this city. */
  bookingUrl?: string;
};

type NormalizedPdfPlan = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  summary: string;
  insurance?: { title: string; body: string; insurers: string };
  totalBudgetEur?: number;
  planEur?: number;
  flightEur?: number;
  staysApproxEur?: number;
  roadTrip: boolean;
  pax: number;
  days: PdfDay[];
  flights: string[];
  hotels: Array<{ text: string; lead?: string; dates?: string; url?: string }>;
  packing: string[];
  labels: PdfLabels;
  contentLang: string;
  coverImageUrl?: string;
};

type PdfLabels = {
  brand: string;
  overview: string;
  daily: string;
  morning: string;
  afternoon: string;
  evening: string;
  transport: string;
  localTips: string;
  budget: string;
  budgetForPax: (n: number) => string;
  dailyBudget: string;
  dailyBudgetPerPerson: string;
  flights: string;
  stays: string;
  packing: string;
  insurance: string;
  navigate: string;
  pageOf: (page: number, total: number) => string;
  day: (n: number, end?: number) => string;
};

const BRAND = { r: 15, g: 23, b: 42 }; // slate-900 header
const BRAND_MID = { r: 30, g: 58, b: 95 }; // deep sky-navy for cover wash
/** Match Logo.tsx — skybooplan brand blues (no orange). */
const SKY = { r: 14, g: 165, b: 233 }; // #0EA5E9
const SKY_DARK = { r: 2, g: 132, b: 199 }; // #0284C7
const SKY_LIGHT = { r: 125, g: 211, b: 252 }; // #7DD3FC
const AMBER = { r: 245, g: 158, b: 11 }; // amber-500
const AMBER_BG = { r: 255, g: 251, b: 235 }; // amber-50
const AMBER_INK = { r: 120, g: 53, b: 15 }; // amber-900
const INK = { r: 30, g: 41, b: 59 };
const MUTED = { r: 100, g: 116, b: 139 };
const RULE = { r: 226, g: 232, b: 240 };
const BAND = { r: 241, g: 245, b: 249 }; // slate-100 day header
const PILL_BG = { r: 224, g: 242, b: 254 }; // sky-100
const CARD = { r: 248, g: 250, b: 252 }; // slate-50 soft panels
const WHITE = { r: 255, g: 255, b: 255 };
const FONT = "DejaVuSans";
const COVER_H = 268;

/** Paper-plane mark from LogoMark (SVG 48×48 → PDF triangles). */
function drawLogoMark(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
) {
  const s = size / 48;
  const pt = (px: number, py: number): [number, number] => [x + px * s, y + py * s];
  const tri = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
    color: { r: number; g: number; b: number },
  ) => {
    doc.setFillColor(color.r, color.g, color.b);
    doc.triangle(a[0], a[1], b[0], b[1], c[0], c[1], "F");
  };
  // Paths from Logo.tsx viewBox 0 0 48 48
  tri(pt(8, 36), pt(40, 8), pt(40, 24), SKY);
  tri(pt(8, 36), pt(40, 24), pt(22, 36), SKY_LIGHT);
  tri(pt(22, 36), pt(40, 24), pt(40, 38), SKY_DARK);
}

function drawBrandWordmark(
  doc: jsPDF,
  x: number,
  y: number,
  opts: { size?: number; onDark?: boolean; unicode?: boolean } = {},
) {
  const size = opts.size ?? 11;
  const onDark = opts.onDark ?? false;
  const unicode = opts.unicode === true;
  const family = unicode ? FONT : "helvetica";
  const ink = onDark ? { r: 255, g: 255, b: 255 } : INK;
  try {
    doc.setFont(family, "bold");
  } catch {
    doc.setFont("helvetica", "bold");
  }
  doc.setFontSize(size);
  doc.setTextColor(ink.r, ink.g, ink.b);
  doc.text("sky", x, y);
  const skyW = doc.getTextWidth("sky");
  try {
    doc.setFont(family, "normal");
  } catch {
    doc.setFont("helvetica", "normal");
  }
  doc.setTextColor(SKY.r, SKY.g, SKY.b);
  doc.text("boo", x + skyW, y);
  const booW = doc.getTextWidth("boo");
  try {
    doc.setFont(family, "bold");
  } catch {
    doc.setFont("helvetica", "bold");
  }
  doc.setTextColor(ink.r, ink.g, ink.b);
  doc.text("plan", x + skyW + booW, y);
}

const PROMO_RE =
  /\b(eSIM|esim|zavarovan|insurance|popust|discount|ekskluzivn[iae]?|exclusive)\b/i;

/** Drop parking-affiliate / filler tips that pad flight days in the PDF. */
function isPdfClutterActivity(title: string, description?: string): boolean {
  const blob = `${title} ${description ?? ""}`;
  return /parkvia|parkos|myway|compare terminal|driving\?\s*$|off-site parking/i.test(blob);
}

function isPdfLogisticsTitle(title: string): boolean {
  return /^(arrive at .+ airport|at .+ airport|na letališču|prihod na letališče|am flughafen|check-in and security|check-in in varnostni|international flight|mednarodni let|airport arrival|airport check-in)\b/i.test(
    title.trim(),
  );
}

const ORDINAL_DAY_TITLE_RE = new RegExp(
  `^(?:${DAY_TITLE_PREFIXES.join("|")})\\s*\\d+(?:\\s*[–\\-—]\\s*\\d+)?$`,
  "i",
);

/** True when the model title is only "Dan 1" / "Day 2" — the PDF badge already shows the number. */
export function isOrdinalPdfDayTitle(title: string): boolean {
  return ORDINAL_DAY_TITLE_RE.test(title.trim());
}

/** Day-band heading: real `day.title`, else overnight city. Never a leftover "Dan N". */
export function pdfDayHeading(title: string | undefined, city: string | undefined): string {
  const t = (title ?? "").trim();
  if (t && !isOrdinalPdfDayTitle(t)) return t;
  return (city ?? "").trim();
}

function pdfExtractIataToken(label: string): string | null {
  const m = label.toUpperCase().match(/\b([A-Z]{3})\b/);
  return m?.[1] ?? null;
}

function pdfExtractKnownIata(label: string): string | null {
  const code = pdfExtractIataToken(label);
  if (!code) return null;
  return DESTINATION_BY_IATA[code] ? code : null;
}

function iatasFromPdfTitle(title: string): { origin?: string; dest?: string } {
  const m = title.toUpperCase().match(/\b([A-Z]{3})\s*(?:→|->|–|-)\s*([A-Z]{3})\b/);
  return m ? { origin: m[1], dest: m[2] } : {};
}

/** Hub IATA for a city/airport label (Vancouver → YVR). First match if a name maps to two hubs. */
export function lookupPdfHubIata(place: string | undefined): string | null {
  const raw = (place ?? "").trim();
  if (!raw) return null;
  const resolved = resolveTransferHub(raw);
  if (resolved && DESTINATION_BY_IATA[resolved]) return resolved;
  const direct = pdfExtractKnownIata(raw);
  if (direct) return direct;
  let found: string | null = null;
  for (const [iata, meta] of Object.entries(DESTINATION_BY_IATA)) {
    if (!overnightPlacesMatch(meta.name, raw)) continue;
    if (found && found !== iata) return found;
    found = iata;
  }
  return found ?? resolved;
}

function pdfSameBase(a: string, b: string): boolean {
  const na = a.trim();
  const nb = b.trim();
  if (!na || !nb) return true;
  if (overnightPlacesMatch(na, nb)) return true;
  const ia = lookupPdfHubIata(na);
  const ib = lookupPdfHubIata(nb);
  if (ia && ib && ia === ib) return true;
  if (ia) {
    const name = lookupDestination(ia)?.name;
    if (name && overnightPlacesMatch(name, nb)) return true;
  }
  if (ib) {
    const name = lookupDestination(ib)?.name;
    if (name && overnightPlacesMatch(name, na)) return true;
  }
  return false;
}

/**
 * Gray PDF transfer banner: only a real hop between two overnight bases
 * (or day-1 / last-day international origin ↔ destination). Not a day trip.
 */
export function isPdfBaseTransferLeg(
  leg: { type?: string; from?: string; to?: string },
  opts?: {
    dayCity?: string;
    prevCity?: string;
    dayNumber?: number;
    originIata?: string;
    destinationIata?: string;
    isLastDay?: boolean;
  },
): boolean {
  return isBaseTransferLeg(leg, opts);
}

type PdfTransferLeg = {
  type: string;
  from: string;
  to: string;
  duration?: string;
  price?: string;
};

function pdfTransferTypeRank(type: string): number {
  const t = type.toLowerCase();
  if (/flight|let/.test(t)) return 5;
  if (/ferry|trajekt|boat|ladja/.test(t)) return 4;
  if (/train|vlak/.test(t)) return 3;
  if (/car|avto/.test(t)) return 2;
  if (/van|kombi/.test(t)) return 1;
  return 0;
}

/** Exact "1h" is the old schema default — not a measured duration. */
function isPlaceholderPdfDuration(raw: string | undefined): boolean {
  if (!raw?.trim()) return true;
  return /^1\s*h(?:r|ours?)?$/i.test(raw.trim());
}

function pickBetterPdfTransfer(a: PdfTransferLeg, b: PdfTransferLeg): PdfTransferLeg {
  const aWeak = isPlaceholderPdfDuration(a.duration);
  const bWeak = isPlaceholderPdfDuration(b.duration);
  if (aWeak !== bWeak) return aWeak ? b : a;
  const aRank = pdfTransferTypeRank(a.type);
  const bRank = pdfTransferTypeRank(b.type);
  if (aRank !== bRank) return aRank >= bRank ? a : b;
  return a;
}

function samePdfTransferHop(a: PdfTransferLeg, b: PdfTransferLeg): boolean {
  return sameTransferBase(a.from, b.from) && sameTransferBase(a.to, b.to);
}

/** At most one gray transfer banner per day; identical hops collapse to the first valid leg. */
export function collapsePdfDayTransfers(legs: PdfTransferLeg[]): PdfTransferLeg[] {
  if (legs.length <= 1) return legs;
  const groups: PdfTransferLeg[][] = [];
  for (const leg of legs) {
    const group = groups.find((row) => samePdfTransferHop(row[0]!, leg));
    if (group) group.push(leg);
    else groups.push([leg]);
  }
  const unique = groups.map((group) => group.reduce(pickBetterPdfTransfer));
  if (unique.length <= 1) return unique;
  return [unique.reduce(pickBetterPdfTransfer)];
}

/** Day-1 international hop must read origin → destination, never the reverse. */
export function orientPdfArrivalFlightLeg(
  leg: { type: string; from: string; to: string; duration?: string; price?: string },
  opts: { dayNumber: number; originIata?: string; destinationIata?: string },
): { type: string; from: string; to: string; duration?: string; price?: string } {
  return orientArrivalTransferLeg(leg, opts);
}

/** Open-jaw return origin: last overnight hub, not the arrival-ticket IATA. */
export function resolvePdfReturnFromIata(input: {
  days?: Array<{
    city?: string;
    title?: string;
    transportation?: Array<{ from?: string; to?: string; type?: string }>;
  }>;
  originIata?: string;
  destinationIata?: string;
  returnFromIata?: string;
  returnFlightFrom?: string;
  originPlace?: string;
}): string | undefined {
  const origin = input.originIata?.trim().toUpperCase();
  const dest = input.destinationIata?.trim().toUpperCase();
  const days = input.days ?? [];

  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]!;
    const city = (d.city ?? "").trim();
    if (!city) continue;
    if (origin && pdfSameBase(city, origin)) continue;
    if (input.originPlace && pdfSameBase(city, input.originPlace)) continue;

    for (const leg of d.transportation ?? []) {
      const fromIata = lookupPdfHubIata(leg.from ?? "");
      const toIata = lookupPdfHubIata(leg.to ?? "");
      if (fromIata && toIata && origin && toIata === origin && fromIata !== origin) {
        return fromIata;
      }
    }

    const fromCity = lookupPdfHubIata(city);
    if (fromCity && fromCity !== origin) return fromCity;
    break;
  }

  const hinted = (input.returnFromIata || input.returnFlightFrom || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(hinted) && DESTINATION_BY_IATA[hinted]) return hinted;
  if (dest && DESTINATION_BY_IATA[dest]) return dest;
  return undefined;
}

function rewritePdfReturnFlightEndpoints(
  from: string,
  to: string,
  exitIata: string | undefined,
  destIata: string | undefined,
  originIata: string | undefined,
): { from: string; to: string } {
  if (!exitIata || !originIata) return { from, to };
  const toCode = lookupPdfHubIata(to);
  const fromCode = lookupPdfHubIata(from);
  if (toCode !== originIata.toUpperCase()) return { from, to };
  const fromIsArrivalHub =
    Boolean(destIata) &&
    (fromCode === destIata!.toUpperCase() || pdfSameBase(from, destIata!));
  if (!fromIsArrivalHub) return { from, to };
  if (fromCode === exitIata) return { from, to };
  return { from: exitIata, to: originIata.toUpperCase() };
}

function roadBudgetCaption(model: NormalizedPdfPlan): string {
  if (model.flightEur && model.flightEur > 0) {
    const n = model.pax;
    const lang = model.contentLang;
    if (lang === "sl") {
      return n <= 1
        ? "Skupaj = destinacija + mednarodne karte (hoteli posebej)"
        : `Skupaj za ${n} oseb = destinacija + mednarodne karte (hoteli posebej)`;
    }
    if (lang === "de") {
      return n <= 1
        ? "Gesamt = vor Ort + internationale Tickets (Hotels extra)"
        : `Gesamt für ${n} Reisende = vor Ort + internationale Tickets (Hotels extra)`;
    }
    return n <= 1
      ? "Total = on destination + international tickets (hotels extra)"
      : `Total for ${n} travelers = on destination + international tickets (hotels extra)`;
  }
  if (!model.roadTrip) return model.labels.budgetForPax(model.pax);
  const n = model.pax;
  const lang = model.contentLang;
  if (lang === "sl") {
    return n <= 1
      ? "Skupaj (hrana, gorivo, cestnine — hoteli posebej)"
      : `Skupaj za ${n} oseb (hrana, gorivo, cestnine — hoteli posebej)`;
  }
  if (lang === "de") {
    return n <= 1
      ? "Gesamt (Essen, Kraftstoff, Maut — Hotels extra)"
      : `Gesamt für ${n} Reisende (Essen, Kraftstoff, Maut — Hotels extra)`;
  }
  return n <= 1
    ? "Total (meals, fuel, tolls — hotels extra)"
    : `Total for ${n} travelers (meals, fuel, tolls — hotels extra)`;
}

export function pdfBudgetBreakdownLines(opts: {
  lang: string;
  pax: number;
  planEur?: number;
  flightEur?: number;
  staysApproxEur?: number;
  roadTrip: boolean;
}): string[] {
  const lang = (opts.lang ?? "en").slice(0, 2);
  const planEur = opts.planEur != null && opts.planEur > 0 ? Math.round(opts.planEur) : 0;
  const flightEur = opts.flightEur != null && opts.flightEur > 0 ? Math.round(opts.flightEur) : 0;
  const stays = opts.staysApproxEur != null && opts.staysApproxEur > 0 ? Math.round(opts.staysApproxEur) : 0;
  const lines: string[] = [];

  if (lang === "sl") {
    if (planEur > 0) {
      lines.push(
        opts.roadTrip
          ? `Na cesti (hrana, gorivo, cestnine): €${planEur}`
          : `Na destinaciji (hrana, vstopnine, lokalni/notranji prevoz): €${planEur}`,
      );
    }
    if (flightEur > 0) {
      lines.push(`Mednarodne letalske karte (tja + nazaj, vsi potniki): €${flightEur}`);
    }
    if (stays > 0) {
      lines.push(`Ni v tem znesku — hoteli/apartmaji (okvirno): €${stays}`);
    }
    return lines;
  }
  if (lang === "de") {
    if (planEur > 0) {
      lines.push(
        opts.roadTrip
          ? `Unterwegs (Essen, Kraftstoff, Maut): €${planEur}`
          : `Vor Ort (Essen, Sehenswürdigkeiten, lokaler/Inlandsverkehr): €${planEur}`,
      );
    }
    if (flightEur > 0) {
      lines.push(`Internationale Flugtickets (Hin- und Rückflug, alle Reisenden): €${flightEur}`);
    }
    if (stays > 0) {
      lines.push(`Nicht in dieser Summe — Hotels/Apartments (ca.): €${stays}`);
    }
    return lines;
  }
  if (planEur > 0) {
    lines.push(
      opts.roadTrip
        ? `On the road (meals, fuel, tolls): €${planEur}`
        : `On destination (meals, sights, local/domestic transport): €${planEur}`,
    );
  }
  if (flightEur > 0) {
    lines.push(`International tickets (outbound + return, all passengers): €${flightEur}`);
  }
  if (stays > 0) {
    lines.push(`Not in this total — hotels/apartments (approx.): €${stays}`);
  }
  return lines;
}

function finiteEur(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function resolvePdfTripCosts(itin: PlanItinerary): {
  grandTotalEur?: number;
  planEur?: number;
  flightEur?: number;
} {
  const flightEur = finiteEur(itin.flightEur) ?? finiteEur(itin.flightTotalEur) ?? 0;
  const explicitPlan = finiteEur(itin.planEur);
  const storedTotal = finiteEur(itin.totalBudgetEur);

  if (explicitPlan != null) {
    const grand =
      storedTotal != null && storedTotal >= explicitPlan
        ? storedTotal
        : explicitPlan + flightEur;
    return { grandTotalEur: grand, planEur: explicitPlan, flightEur };
  }
  if (flightEur > 0 && storedTotal != null) {
    return { grandTotalEur: storedTotal + flightEur, planEur: storedTotal, flightEur };
  }
  return { grandTotalEur: storedTotal, planEur: storedTotal, flightEur };
}

function pdfTicketPartyLine(lang: string, pax: number, eur: number): string {
  const n = Math.max(1, pax);
  if (lang === "sl") {
    return `Karte (tja + nazaj, ${slPaxAfterNumber(n)}): €${eur}`;
  }
  if (lang === "de") {
    return n <= 1
      ? `Tickets (Hin- und Rückflug, 1 Reisender): €${eur}`
      : `Tickets (Hin- und Rückflug, ${n} Reisende): €${eur}`;
  }
  return n <= 1
    ? `Tickets (outbound + return, 1 traveler): €${eur}`
    : `Tickets (outbound + return, ${n} travelers): €${eur}`;
}

function nightsPhrase(n: number, lang: string): string {
  if (lang === "sl") return n === 1 ? "1 noč" : `${n} noči`;
  if (lang === "de") return n === 1 ? "1 Nacht" : `${n} Nächte`;
  if (lang === "it") return n === 1 ? "1 notte" : `${n} notti`;
  if (lang === "es") return n === 1 ? "1 noche" : `${n} noches`;
  if (lang === "fr") return n === 1 ? "1 nuit" : `${n} nuits`;
  return n === 1 ? "1 night" : `${n} nights`;
}

function bookHotelsLabel(lang: string): string {
  if (lang === "sl") return "Hoteli na Booking.com";
  if (lang === "de") return "Hotels auf Booking.com";
  if (lang === "it") return "Hotel su Booking.com";
  if (lang === "es") return "Hoteles en Booking.com";
  if (lang === "fr") return "Hôtels sur Booking.com";
  return "Hotels on Booking.com";
}

function roadStaysCaption(model: NormalizedPdfPlan): string {
  const eur = Math.round(model.staysApproxEur ?? 0);
  const lang = model.contentLang;
  if (lang === "sl") return `+ Namestitve (okvirno): €${eur}`;
  if (lang === "de") return `+ Unterkünfte (ca.): €${eur}`;
  return `+ Stays (approx.): €${eur}`;
}

function labelsFor(lang: PlanForPdf["language"], sampleText: string): PdfLabels {
  const normalized = (lang ?? "").toLowerCase().slice(0, 2);
  const sl =
    normalized === "sl" ||
    (!normalized &&
      /[čšžćđČŠŽĆĐ]|\b(dan|dopoldan|popoldan|večer|načrt|potovanje)\b/i.test(sampleText));
  if (sl || normalized === "sl") {
    return {
      brand: "SKYBOOPLAN  ·  Potovalni načrt",
      overview: "Pregled",
      daily: "Dnevni itinerar",
      morning: "Dopoldan",
      afternoon: "Popoldan",
      evening: "Večer",
      transport: "Prevoz",
      localTips: "Nasveti lokalcev & varnost",
      budget: "Proračun",
      budgetForPax: (n) =>
        n <= 1 ? "Skupaj (ocena na destinaciji — hoteli posebej)" : `Skupaj za ${n} oseb (ocena na destinaciji — hoteli posebej)`,
      dailyBudget: "Dnevni proračun",
      dailyBudgetPerPerson: "na osebo",
      flights: "Leti",
      stays: "Namestitve",
      packing: "Seznam za pakiranje",
      insurance: "Turistično zavarovanje",
      navigate: "Navigiraj",
      pageOf: (page, total) => `${page} / ${total}`,
      day: (n, end) => (end && end !== n ? `Dan ${n}–${end}` : `Dan ${n}`),
    };
  }
  if (normalized === "it") {
    return {
      brand: "SKYBOOPLAN  ·  Piano di viaggio",
      overview: "Panoramica",
      daily: "Itinerario giornaliero",
      morning: "Mattina",
      afternoon: "Pomeriggio",
      evening: "Sera",
      transport: "Trasporto",
      localTips: "Consigli locali e sicurezza",
      budget: "Budget",
      budgetForPax: (n) =>
        n <= 1
          ? "Totale (stima a destinazione — hotel extra)"
          : `Totale per ${n} viaggiatori (stima a destinazione — hotel extra)`,
      dailyBudget: "Budget giornaliero",
      dailyBudgetPerPerson: "a persona",
      flights: "Voli",
      stays: "Alloggi",
      packing: "Lista bagaglio",
      insurance: "Assicurazione di viaggio",
      navigate: "Naviga",
      pageOf: (page, total) => `${page} / ${total}`,
      day: (n, end) => (end && end !== n ? `Giorno ${n}–${end}` : `Giorno ${n}`),
    };
  }
  if (normalized === "de") {
    return {
      brand: "SKYBOOPLAN  ·  Reiseplan",
      overview: "Überblick",
      daily: "Tagesplan",
      morning: "Morgen",
      afternoon: "Nachmittag",
      evening: "Abend",
      transport: "Transport",
      localTips: "Lokale Tipps & Sicherheit",
      budget: "Budget",
      budgetForPax: (n) =>
        n <= 1
          ? "Gesamt (Schätzung vor Ort — Hotels extra)"
          : `Gesamt für ${n} Reisende (Schätzung vor Ort — Hotels extra)`,
      dailyBudget: "Tagesbudget",
      dailyBudgetPerPerson: "pro Person",
      flights: "Flüge",
      stays: "Unterkünfte",
      packing: "Packliste",
      insurance: "Reiseversicherung",
      navigate: "Navigieren",
      pageOf: (page, total) => `${page} / ${total}`,
      day: (n, end) => (end && end !== n ? `Tag ${n}–${end}` : `Tag ${n}`),
    };
  }
  if (normalized === "es") {
    return {
      brand: "SKYBOOPLAN  ·  Plan de viaje",
      overview: "Resumen",
      daily: "Itinerario diario",
      morning: "Mañana",
      afternoon: "Tarde",
      evening: "Noche",
      transport: "Transporte",
      localTips: "Consejos locales y seguridad",
      budget: "Presupuesto",
      budgetForPax: (n) =>
        n <= 1
          ? "Total (estimación en destino — hoteles aparte)"
          : `Total para ${n} viajeros (estimación en destino — hoteles aparte)`,
      dailyBudget: "Presupuesto diario",
      dailyBudgetPerPerson: "por persona",
      flights: "Vuelos",
      stays: "Alojamientos",
      packing: "Lista de equipaje",
      insurance: "Seguro de viaje",
      navigate: "Navegar",
      pageOf: (page, total) => `${page} / ${total}`,
      day: (n, end) => (end && end !== n ? `Día ${n}–${end}` : `Día ${n}`),
    };
  }
  if (normalized === "fr") {
    return {
      brand: "SKYBOOPLAN  ·  Plan de voyage",
      overview: "Aperçu",
      daily: "Itinéraire jour par jour",
      morning: "Matin",
      afternoon: "Après-midi",
      evening: "Soir",
      transport: "Transport",
      localTips: "Conseils locaux et sécurité",
      budget: "Budget",
      budgetForPax: (n) =>
        n <= 1
          ? "Total (estimation sur place — hôtels en extra)"
          : `Total pour ${n} voyageurs (estimation sur place — hôtels en extra)`,
      dailyBudget: "Budget journalier",
      dailyBudgetPerPerson: "par personne",
      flights: "Vols",
      stays: "Hébergements",
      packing: "Liste de bagages",
      insurance: "Assurance voyage",
      navigate: "Naviguer",
      pageOf: (page, total) => `${page} / ${total}`,
      day: (n, end) => (end && end !== n ? `Jour ${n}–${end}` : `Jour ${n}`),
    };
  }
  return {
    brand: "SKYBOOPLAN  ·  Travel plan",
    overview: "Overview",
    daily: "Daily itinerary",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    transport: "Transport",
    localTips: "Local tips & safety",
    budget: "Budget",
    budgetForPax: (n) =>
      n <= 1
        ? "Total (on-destination estimate — hotels extra)"
        : `Total for ${n} travelers (on-destination estimate — hotels extra)`,
    dailyBudget: "Daily budget",
    dailyBudgetPerPerson: "per person",
    flights: "Flights",
    stays: "Stays",
    packing: "Packing list",
    insurance: "Travel insurance",
    navigate: "Navigate (Google Maps)",
    pageOf: (page, total) => `${page} / ${total}`,
    day: (n, end) => (end && end !== n ? `Day ${n}–${end}` : `Day ${n}`),
  };
}

/** True when a "time" or title is really a day-part label (already shown as a slot pill). */
export function isPdfDaypartToken(raw: string | undefined): boolean {
  return isDaypartSlotLabel(raw);
}

function localizePdfTimeToken(raw: string | undefined, labels: PdfLabels): string | undefined {
  if (!raw?.trim()) return undefined;
  // Day-part tokens are owned by slot pills — omit from the activity clock column.
  if (isPdfDaypartToken(raw)) return undefined;
  return raw.trim();
}

/** jsPDF custom fonts choke on emoji / some symbols — strip for layout stability. */
export function sanitizePdfText(input: unknown): string {
  if (typeof input !== "string") return "";
  return stripPlannerMetaCopy(
    input
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\u0000/g, "")
      // Collapse spaces/tabs only — keep newlines so bullet lists survive when needed.
      .replace(/[^\S\n]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function wrapByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (maxChars > 0 && next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** jsPDF throws on width <= 0 (long clock labels can eat the title column). */
function wrapPdfLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  const cleaned = text || "";
  if (!cleaned) return [];
  const width = Number.isFinite(maxWidth) && maxWidth > 24 ? maxWidth : 24;
  try {
    const lines: string[] = [];
    for (const para of cleaned.split(/\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        if (para === "") lines.push("");
        continue;
      }
      let cur = "";
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (cur && doc.getTextWidth(next) > width) {
          lines.push(cur);
          cur = w;
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
    }
    return lines.length ? lines : wrapByWords(cleaned, 80);
  } catch {
    return wrapByWords(cleaned, 80);
  }
}

/**
 * jsPDF equivalent of CSS page-break-inside: avoid.
 * Hop to a new page when the block fits there but not here.
 * Blocks taller than a page still start on a fresh page if only a stub remains
 * (prevents empty holes); they may then split.
 */
export function shouldBreakBeforeBlock(opts: {
  y: number;
  needed: number;
  pageBottom: number;
  margin: number;
}): boolean {
  const { y, needed, pageBottom, margin } = opts;
  if (needed <= 0) return false;
  const room = pageBottom - y;
  if (needed <= room) return false;
  if (y <= margin + 1) return false;
  const pageBody = pageBottom - margin;
  if (needed > pageBody) {
    return room < Math.min(120, Math.max(48, needed * 0.22));
  }
  return true;
}

/** City · nights on the left, dates nowrap on the right (.accommodation-row). */
export function accommodationStayParts(opts: {
  city: string;
  nightsLabel: string;
  checkInLabel: string;
  checkOutLabel: string;
}): { text: string; lead: string; dates: string } {
  const dates = [opts.checkInLabel, opts.checkOutLabel].filter(Boolean).join(" → ");
  const lead = [opts.city, opts.nightsLabel].filter(Boolean).join("  ·  ");
  return {
    text: [lead, dates].filter(Boolean).join("  ·  "),
    lead,
    dates: dates.replace(/ /g, "\u00A0"),
  };
}

function dateLocaleForPlanLang(lang: string | undefined): string {
  switch ((lang ?? "en").slice(0, 2).toLowerCase()) {
    case "sl":
      return "sl-SI";
    case "de":
      return "de-DE";
    default:
      return "en-GB";
  }
}

function fmtDate(d: string | null | undefined, lang?: string) {
  if (!d) return "";
  const raw = String(d).trim();
  if (!raw) return "";
  const locale = dateLocaleForPlanLang(lang);
  // Keep ISO YYYY-MM-DD stable (avoid timezone day-shift).
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const dt = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return dt.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  try {
    return new Date(raw).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return raw;
  }
}

function textOf(v: unknown): string {
  if (typeof v === "string") return sanitizePdfText(v);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function cleanSummary(raw: string): string {
  if (!raw) return "";
  const parts = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !PROMO_RE.test(s));
  return (parts.length ? parts : [raw]).join(" ").replace(/\s+/g, " ").trim();
}

function activityFromUnknown(
  raw: unknown,
  labels?: PdfLabels,
  dayOrigin?: ReturnType<typeof resolveDayNavOrigin>,
): PdfActivity | null {
  if (!raw || typeof raw !== "object") {
    const s = textOf(raw);
    if (!s || isPdfDaypartToken(s)) return null;
    return { title: s };
  }
  const o = raw as Record<string, unknown>;
  const title = textOf(o.name) || textOf(o.title);
  if (!title || title.trim().length < 3) return null;
  if (isPdfDaypartToken(title)) return null;
  if (isPlaceholderOrTruncatedCopy(title) || /…|\.\.\./.test(title)) return null;
  // Slot names (Morning/Afternoon/…) are section headers — never show them as clock badges.
  const explicitTime = textOf(o.time);
  const clockFromFields = formatActivityClockLabel({
    name: title,
    description: textOf(o.description) || undefined,
    type: textOf(o.type) || undefined,
    transportType: textOf(o.transportType) || undefined,
    arrivalTime: textOf(o.arrivalTime) || undefined,
    departureTime: textOf(o.departureTime) || undefined,
  });
  const rawTime =
    (explicitTime && !isPdfDaypartToken(explicitTime) ? explicitTime : undefined) ||
    clockFromFields ||
    undefined;
  const time = labels ? localizePdfTimeToken(rawTime, labels) : rawTime;
  const price =
    textOf(o.priceLabel) ||
    textOf(o.price) ||
    (typeof o.estimatedCostEur === "number" && o.estimatedCostEur > 0
      ? `€${o.estimatedCostEur}`
      : undefined);
  const bullets = Array.isArray(o.bullets)
    ? o.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    : undefined;
  const rawDesc = textOf(o.description);
  const desc =
    rawDesc &&
    rawDesc.trim().length >= 10 &&
    !isPdfDaypartToken(rawDesc) &&
    !isPlaceholderOrTruncatedCopy(rawDesc) &&
    !/…|\.\.\./.test(rawDesc)
      ? rawDesc
      : "";
  if (!activityHasRenderableBody({ description: desc, bullets })) return null;
  const location = textOf(o.location) || textOf(o.city);
  const lat = typeof o.lat === "number" ? o.lat : Number(o.lat);
  const lng = typeof o.lng === "number" ? o.lng : Number(o.lng);
  const logisticsOnly =
    /\b(check-in|controlli di sicurezza|security check|immigraz|baggage|bagagli|decollo|take-?off|boarding)\b/i.test(
      `${title} ${desc}`,
    ) &&
    !/\b(hotel|ristorante|restaurant|museo|museum|temple|beach|spiaggia)\b/i.test(
      `${title} ${desc}`,
    );
  const mapsUrl =
    !logisticsOnly && isValidNavCoord(lat, lng)
      ? buildGoogleMapsDirectionsUrl(lat, lng, {
          label: title,
          destinationQuery: title,
          ...dayOrigin,
        })
      : undefined;
  return {
    title,
    time: time || undefined,
    description: desc || undefined,
    bullets: bullets?.length ? bullets.map((b) => sanitizePdfText(b)).filter(Boolean) : undefined,
    location: location || undefined,
    price: price || undefined,
    mapsUrl,
  };
}

function slotItems(
  day: Record<string, unknown>,
  key: "morning" | "afternoon" | "evening",
  labels?: PdfLabels,
): PdfActivity[] {
  const dayOrigin = resolveDayNavOrigin({
    city: textOf(day.city) || undefined,
    focusName: textOf(day.focusName) || undefined,
    lat: typeof day.lat === "number" ? day.lat : Number(day.lat) || undefined,
    lng: typeof day.lng === "number" ? day.lng : Number(day.lng) || undefined,
  });
  const activities = (day.activities ?? {}) as Record<string, unknown>;
  const fromSlots = Array.isArray(activities[key]) ? (activities[key] as unknown[]) : [];
  const fromItems = fromSlots
    .map((a) => activityFromUnknown(a, labels, dayOrigin))
    .filter(Boolean) as PdfActivity[];
  if (fromItems.length) return fromItems;

  // Legacy markdown / string slots
  const blob = textOf(day[key]);
  if (!blob) return [];
  return blob
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length >= 10 && !/…|\.\.\./.test(line) && !isPdfDaypartToken(line))
    .map((title) => ({ title }));
}

function legacyItems(day: Record<string, unknown>, labels?: PdfLabels): PdfActivity[] {
  if (!Array.isArray(day.items)) return [];
  const dayOrigin = resolveDayNavOrigin({
    city: textOf(day.city) || undefined,
    focusName: textOf(day.focusName) || undefined,
    lat: typeof day.lat === "number" ? day.lat : Number(day.lat) || undefined,
    lng: typeof day.lng === "number" ? day.lng : Number(day.lng) || undefined,
  });
  return (day.items as unknown[])
    .map((a) => activityFromUnknown(a, labels, dayOrigin))
    .filter(Boolean) as PdfActivity[];
}

function cloneItineraryForPdf(
  sourceItin: PlanItinerary & Record<string, unknown>,
): PlanItinerary & Record<string, unknown> {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(sourceItin);
    }
  } catch {
    /* Proxies / non-cloneables — fall through to JSON */
  }
  try {
    return JSON.parse(JSON.stringify(sourceItin)) as PlanItinerary & Record<string, unknown>;
  } catch {
    return { ...sourceItin, days: Array.isArray(sourceItin.days) ? [...sourceItin.days] : [] };
  }
}

function scrubPdfItineraryLanguage(
  itin: PlanItinerary & Record<string, unknown>,
  lang: string,
) {
  const scrub = (raw: unknown): string => {
    const t = typeof raw === "string" ? raw : "";
    if (!t) return t;
    return sanitizeForLang(t, lang);
  };
  if (typeof itin.summary === "string") itin.summary = scrub(itin.summary);
  for (const day of (itin.days ?? []) as Array<Record<string, unknown>>) {
    for (const key of [
      "title",
      "morning",
      "afternoon",
      "evening",
      "travelHack",
      "transportationTips",
      "localTips",
      "local_tips",
      "localWarnings",
    ] as const) {
      if (typeof day[key] === "string") day[key] = scrub(day[key]);
    }
    const acts = day.activities as
      | Record<string, Array<Record<string, unknown>> | undefined>
      | undefined;
    if (!acts) continue;
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const a of acts[slot] ?? []) {
        if (typeof a.name === "string") a.name = scrub(a.name);
        if (typeof a.description === "string") a.description = scrub(a.description);
        if (Array.isArray(a.bullets)) {
          a.bullets = a.bullets.map((b) => (typeof b === "string" ? scrub(b) : b));
        }
      }
    }
  }
}

/** Normalize AI / saved plan shapes into a clean PDF model. */
export function normalizePlanForPdf(plan: PlanForPdf): NormalizedPdfPlan {
  const sourceItin = (plan.itinerary ?? {}) as PlanItinerary & Record<string, unknown>;
  // Clone so PDF scrubbing never mutates live planner state.
  const itin = cloneItineraryForPdf(sourceItin);
  const motorhome =
    itin.groundTransportMode === "motorhome" || itin.accommodationMode === "motorhome";
  const roadTrip = motorhome || itin.groundTransportMode === "car";
  if (Array.isArray(itin.days)) {
    try {
      if (plan.start_date) {
        resyncPlanDayDates(itin as unknown as AiTripPlan, plan.start_date);
      }
    } catch (err) {
      console.warn("[pdf] date resync skipped", err);
    }
  }
  if (motorhome && Array.isArray(itin.days)) {
    try {
      enrichMotorhomePlanTips(itin as unknown as AiTripPlan, plan.language ?? "sl");
    } catch (err) {
      console.warn("[pdf] motorhome tip enrich skipped", err);
    }
  }
  const rawDays = Array.isArray(itin.days) ? itin.days : [];
  const hotelHints: HotelStayHint[] = Array.isArray(itin.hotels)
    ? (itin.hotels as HotelStayHint[])
    : [];
  stampOvernightCitiesFromHotels(rawDays as OvernightDay[], hotelHints);
  syncDayCityToDaytimeProgram(rawDays as OvernightDay[]);
  holdCityHeaderUntilTransfer(rawDays as OvernightDay[]);
  const sample = [textOf(itin.summary), ...rawDays.map((d) => textOf(d?.title))].join(" ");
  const contentLang = normalizePlanLangCode(
    (itin as { contentLanguage?: string }).contentLanguage ||
      plan.language ||
      resolvePlanContentLanguage({
        summary: textOf(itin.summary),
        contentLanguage: (itin as { contentLanguage?: AiTripPlan["contentLanguage"] }).contentLanguage,
        days: rawDays as AiTripPlan["days"],
      }),
  );
  scrubPdfItineraryLanguage(itin, contentLang);
  const labels = labelsFor(contentLang, sample);

  const days: PdfDay[] = rawDays.map((raw, idx) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const city = textOf(d.city) || textOf(d.focusName) || "";
    const dayNum = typeof d.day === "number" ? d.day : idx + 1;
    const dayEnd = typeof d.dayEnd === "number" ? d.dayEnd : undefined;
    const transportation = Array.isArray(d.transportation)
      ? (d.transportation as Array<Record<string, unknown>>).map((t) => {
          const rawType = textOf(t?.type) || "transport";
          const type = roadTrip && rawType.toLowerCase() === "van" ? "car" : rawType;
          return {
            type,
            from: textOf(t.from),
            to: textOf(t.to),
            duration: (() => {
              const raw = textOf(t.duration);
              if (!raw) return undefined;
              if (/^\d+(\.\d+)?$/.test(raw.trim())) return undefined;
              if (isPlaceholderPdfDuration(raw)) return undefined;
              return raw;
            })(),
            price: (() => {
              if (typeof t.estimatedPrice === "number") {
                if (t.estimatedPrice <= 0) return undefined;
                return `€${t.estimatedPrice}`;
              }
              const labeled = textOf(t.cost) || textOf(t.price);
              if (!labeled || /^€?0$/.test(labeled.trim())) return undefined;
              return labeled;
            })(),
          };
        })
      : [];

    const chrono = uniquifyDayActivityClocks({
      morning: slotItems(d, "morning", labels),
      afternoon: slotItems(d, "afternoon", labels),
      evening: slotItems(d, "evening", labels),
    });
    const slots: PdfDay["slots"] = [
      { label: labels.morning, items: chrono.morning },
      { label: labels.afternoon, items: chrono.afternoon },
      { label: labels.evening, items: chrono.evening },
    ].filter((s) => s.items.length > 0);

    // Fallback: legacy items[] or island stay blurb
    if (!slots.length) {
      const items = legacyItems(d, labels);
      if (items.length) {
        const sorted = uniquifyDayActivityClocks({
          morning: items,
          afternoon: [],
          evening: [],
        });
        slots.push({
          label: labels.daily,
          items: [...sorted.morning, ...sorted.afternoon, ...sorted.evening],
        });
      }
    }
    if (!slots.length) {
      const island = d.islandStay as Record<string, unknown> | undefined;
      const blurb =
        textOf(island?.summary) ||
        textOf(island?.description) ||
        textOf(d.focusName) ||
        textOf(d.city);
      if (blurb) slots.push({ label: labels.daily, items: [{ title: blurb }] });
    }

    const fix = (s: string) => (motorhome ? fixMotorhomeCopyErrors(s, city) : s);
    const fixedSlots = slots.map((slot) => ({
      ...slot,
      items: slot.items.map((it) => ({
        ...it,
        title: fix(it.title),
        description: it.description ? fix(it.description) : it.description,
        bullets: it.bullets?.map((b) => fix(b)),
      })),
    }));

    return {
      day: dayNum,
      dayEnd,
      date: textOf(d.date) || undefined,
      dateEnd: textOf(d.dateEnd) || undefined,
      title: fix(pdfDayHeading(textOf(d.title), city)),
      city: city || undefined,
      dailyBudgetEur:
        typeof d.dailyBudgetEur === "number" &&
        Number.isFinite(d.dailyBudgetEur) &&
        d.dailyBudgetEur > 0
          ? d.dailyBudgetEur
          : undefined,
      transportTips: (() => {
        const tips =
          textOf(d.transportationTips) ||
          textOf((d.transport as { description?: string } | undefined)?.description) ||
          "";
        return tips ? fix(tips) : undefined;
      })(),
      localTips: (() => {
        const tips = textOf(d.localTips) || textOf(d.local_tips) || "";
        return tips ? fix(tips) : undefined;
      })(),
      transportation,
      slots: fixedSlots,
    };
  });
  scrubLocalTipsOnPdfDays(days);

  const titleIatas = iatasFromPdfTitle(plan.title);
  const originIata =
    textOf((itin as { originIata?: string }).originIata) || titleIatas.origin || "";
  const destIata =
    textOf((itin as { destinationIata?: string }).destinationIata) ||
    titleIatas.dest ||
    "";

  for (let i = 0; i < days.length; i++) {
    const d = days[i]!;
    d.transportation = collapsePdfDayTransfers(
      d.transportation
        .map((leg) =>
          orientPdfArrivalFlightLeg(leg, {
            dayNumber: d.day,
            originIata,
            destinationIata: destIata,
          }),
        )
        .filter((leg) =>
          isPdfBaseTransferLeg(leg, {
            dayCity: d.city,
            prevCity: days[i - 1]?.city,
            dayNumber: d.day,
            originIata,
            destinationIata: destIata,
            isLastDay: i === days.length - 1,
          }),
        ),
    );
  }
  const returnFlightFrom = textOf(
    (itin as { returnFlightEu?: { fromAirport?: string } }).returnFlightEu?.fromAirport,
  );
  const exitIata = resolvePdfReturnFromIata({
    days: days.map((d) => ({
      city: d.city,
      title: d.title,
      transportation: d.transportation,
    })),
    originIata,
    destinationIata: destIata,
    returnFromIata: textOf((itin as { returnFromIata?: string }).returnFromIata),
    returnFlightFrom,
    originPlace: textOf((itin as { originPlace?: string }).originPlace),
  });

  const flights = Array.isArray(itin.flights)
    ? itin.flights
        .map((raw) => {
          if (!raw || typeof raw !== "object") return "";
          const f = raw as Record<string, unknown>;
          const rewritten = rewritePdfReturnFlightEndpoints(
            textOf(f.from),
            textOf(f.to),
            exitIata,
            destIata,
            originIata,
          );
          const from = rewritten.from;
          const to = rewritten.to;
          return [
            from && to ? `${from} → ${to}` : "",
            fmtDate(textOf(f.date) || null, contentLang),
            textOf(f.airline),
            textOf(f.price),
          ]
            .filter(Boolean)
            .join("  ·  ");
        })
        .filter(Boolean)
    : [];

  const namedHotels = Array.isArray(itin.hotels)
    ? itin.hotels
        .map((raw) => {
          if (!raw || typeof raw !== "object") return "";
          const h = raw as Record<string, unknown>;
          return [
            textOf(h.name),
            textOf(h.area) || textOf(h.city),
            typeof h.nights === "number" && h.nights > 0 ? `${h.nights} nights` : "",
            textOf(h.price) || textOf(h.note),
          ]
            .filter(Boolean)
            .join("  ·  ");
        })
        .filter(Boolean)
    : [];

  const packing = Array.isArray(itin.packing)
    ? itin.packing.map((p) => textOf(p)).filter(Boolean)
    : [];

  const destination =
    plan.destination ||
    textOf(itin.destinationName) ||
    textOf((itin as { destination?: string }).destination) ||
    "";

  const pax =
    typeof plan.pax === "number" && Number.isFinite(plan.pax) && plan.pax >= 1
      ? Math.round(plan.pax)
      : 1;

  const costs = resolvePdfTripCosts(itin);
  const totalBudgetEur = costs.grandTotalEur;
  const planEur = costs.planEur;
  const flightEur = costs.flightEur;

  if (flightEur && flightEur > 0) {
    const ticketLine = pdfTicketPartyLine(contentLang, pax, flightEur);
    if (!flights.some((f) => f.includes(`€${flightEur}`))) {
      flights.push(ticketLine);
    }
  }

  const originPlace = textOf((itin as { originPlace?: string }).originPlace);
  let stays = collectOvernightHotelStays({
    days: rawDays.map((raw, idx) => {
      const d = (raw ?? {}) as Record<string, unknown>;
      return {
        day: typeof d.day === "number" ? d.day : idx + 1,
        date: textOf(d.date) || undefined,
        city: textOf(d.city) || textOf(d.focusName) || undefined,
        inFlightDay: d.inFlightDay === true,
        transportation: Array.isArray(d.transportation)
          ? (d.transportation as Array<{ type?: string; from?: string; to?: string }>)
          : undefined,
        activities: d.activities as OvernightDay["activities"],
      };
    }),
    start_date: plan.start_date,
    originPlace,
    groundTransportMode: textOf(
      (itin as { groundTransportMode?: string }).groundTransportMode,
    ),
    accommodationMode: textOf(
      (itin as { accommodationMode?: string }).accommodationMode,
    ),
  });
  const stayCities = new Set(stays.map((s) => s.city.trim().toLowerCase()));
  if (
    !motorhome &&
    stayCities.size <= 1 &&
    hotelHintsHaveMultipleBases(hotelHints)
  ) {
    const fromHints = collectOvernightHotelStaysFromHints(hotelHints, plan.start_date);
    if (fromHints.length >= 2) stays = fromHints;
  }

  const stayByFirstDay = new Map(stays.map((s) => [s.firstDay, s]));
  for (const d of days) {
    const stay = stayByFirstDay.get(d.day);
    if (stay && !motorhome) {
      d.bookingUrl = overnightStayBookingUrl(stay, {
        adults: pax,
        lang: contentLang,
      });
    }
  }

  const stayHotels = stays.map((s) => {
    const parts = accommodationStayParts({
      city: s.city,
      nightsLabel: nightsPhrase(s.nights, contentLang),
      checkInLabel: fmtDate(s.checkIn, contentLang),
      checkOutLabel: fmtDate(s.checkOut, contentLang),
    });
    return {
      ...parts,
      url: motorhome
        ? undefined
        : overnightStayBookingUrl(s, { adults: pax, lang: contentLang }),
    };
  });
  const hotels = stayHotels.length
    ? stayHotels
    : motorhome
      ? []
      : namedHotels.map((text) => ({ text }));

  const coverImageUrl =
    typeof plan.cover_image_url === "string" && plan.cover_image_url.trim()
      ? plan.cover_image_url.trim()
      : undefined;

  const staysApproxEur =
    typeof (itin as { staysApproxEur?: number }).staysApproxEur === "number" &&
    Number.isFinite((itin as { staysApproxEur?: number }).staysApproxEur)
      ? (itin as { staysApproxEur: number }).staysApproxEur
      : undefined;

  const travelReq = resolveTravelRequirements(
    (itin as { travelRequirements?: TravelRequirements }).travelRequirements,
    textOf((itin as { originIata?: unknown }).originIata) || undefined,
    textOf((itin as { destinationIata?: unknown }).destinationIata) || undefined,
    contentLang,
    [
      textOf((itin as { destinationPlace?: unknown }).destinationPlace),
      textOf((itin as { destinationName?: unknown }).destinationName),
      destination,
    ]
      .filter(Boolean)
      .join(" "),
    plan.ipCountry,
  );
  const ins = travelReq?.insurance;
  const insurance = ins
    ? {
        title: ins.title,
        body: `${ins.body} ${ins.howTo}`.trim(),
        insurers: ins.insurers.join(" · "),
      }
    : undefined;

  return {
    title: plan.title || destination || "Skybooplan",
    destination,
    startDate: fmtDate(plan.start_date, contentLang),
    endDate: fmtDate(plan.end_date, contentLang),
    summary: alignSummaryTripLength(
      cleanSummary(stripPlanTeaser(textOf(itin.summary), contentLang)),
      days.length,
    ),
    insurance,
    totalBudgetEur,
    planEur,
    flightEur,
    staysApproxEur,
    roadTrip,
    pax,
    days,
    flights,
    hotels,
    packing,
    labels,
    contentLang,
    coverImageUrl,
  };
}

type CoverImage = { dataUrl: string; format: "JPEG" | "PNG" };

/** Convert font bytes → binary string without blowing Safari's apply/spread stack. */
function uint8ToBinaryString(bytes: Uint8Array): string {
  const chunk = 0x2000; // 8KB — safe for Safari argument limits
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    let part = "";
    for (let j = 0; j < slice.length; j++) {
      part += String.fromCharCode(slice[j]!);
    }
    binary += part;
  }
  return binary;
}

/** Best-effort cover photo — never blocks PDF if fetch/CORS fails. */
async function tryLoadCoverImage(url?: string): Promise<CoverImage | null> {
  if (!url || typeof fetch !== "function") return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4_000);
    const res = await fetch(url, { signal: ctrl.signal, mode: "cors" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length < 32 || bytes.length > 4_500_000) return null;
    const isPng =
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!isPng && !isJpg) return null;
    const binary = uint8ToBinaryString(bytes);
    // btoa is browser; Buffer for Node/Vitest.
    const b64 =
      typeof btoa === "function"
        ? btoa(binary)
        : Buffer.from(bytes).toString("base64");
    const mime = isPng ? "image/png" : "image/jpeg";
    return { dataUrl: `data:${mime};base64,${b64}`, format: isPng ? "PNG" : "JPEG" };
  } catch {
    return null;
  }
}

async function loadFontBinary(url: string): Promise<string> {
  // Node / Vitest — read from public/fonts (or node_modules fallback).
  if (typeof window === "undefined") {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fileName = url.includes("Bold") ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf";
    const candidates = [
      resolve(process.cwd(), "public/fonts", fileName),
      resolve(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf", fileName),
    ];
    for (const abs of candidates) {
      try {
        return uint8ToBinaryString(new Uint8Array(readFileSync(abs)));
      } catch {
        /* try next */
      }
    }
    throw new Error(`PDF font missing on disk: ${fileName}`);
  }

  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load PDF font: ${res.status} ${url}`);
  const buf = await res.arrayBuffer();
  return uint8ToBinaryString(new Uint8Array(buf));
}

let fontCache: { regular: string; bold: string } | null = null;
let fontsUnavailable = false;

async function ensureFonts(doc: jsPDF): Promise<boolean> {
  if (fontsUnavailable) {
    doc.setFont("helvetica", "normal");
    return false;
  }
  try {
    if (!fontCache) {
      const [regular, bold] = await Promise.all([
        loadFontBinary(FONT_REGULAR_URL),
        loadFontBinary(FONT_BOLD_URL),
      ]);
      fontCache = { regular, bold };
    }
    doc.addFileToVFS("DejaVuSans.ttf", fontCache.regular);
    doc.addFileToVFS("DejaVuSans-Bold.ttf", fontCache.bold);
    doc.addFont("DejaVuSans.ttf", FONT, "normal");
    doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
    doc.setFont(FONT, "normal");
    return true;
  } catch (err) {
    console.warn("[pdf] DejaVu fonts unavailable — falling back to Helvetica", err);
    fontsUnavailable = true;
    fontCache = null;
    doc.setFont("helvetica", "normal");
    return false;
  }
}

/** ASCII fallback when Unicode font is missing (Helvetica can't draw čšž). */
function asciiFallback(text: string): string {
  return text
    .replace(/[ČĆ]/g, "C")
    .replace(/[čć]/g, "c")
    .replace(/[Š]/g, "S")
    .replace(/[š]/g, "s")
    .replace(/[Ž]/g, "Z")
    .replace(/[ž]/g, "z")
    .replace(/[Đ]/g, "D")
    .replace(/[đ]/g, "d")
    .replace(/[ÁÀÂÄ]/g, "A")
    .replace(/[áàâä]/g, "a")
    .replace(/[ÉÈÊË]/g, "E")
    .replace(/[éèêë]/g, "e")
    .replace(/[ÍÌÎÏ]/g, "I")
    .replace(/[íìîï]/g, "i")
    .replace(/[ÓÒÔÖ]/g, "O")
    .replace(/[óòôö]/g, "o")
    .replace(/[ÚÙÛÜ]/g, "U")
    .replace(/[úùûü]/g, "u")
    .replace(/→/g, "->")
    .replace(/€/g, "EUR ");
}

/** Filesystem-safe PDF name. Never empty — blob tabs otherwise save as Unknown.pdf. */
export function buildPdfDownloadFileName(
  title?: string | null,
  destination?: string | null,
): string {
  const slug = (raw: string) =>
    asciiFallback(raw)
      .replace(/->/g, "-")
      .replace(/\s*-\s*/g, "-")
      .replace(/[^a-z0-9-_]+/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48);
  const route = slug(title ?? "");
  const dest = slug(destination ?? "");
  const core =
    route && dest && dest.toLowerCase() !== route.toLowerCase()
      ? `${route}_${dest}`
      : route || dest || "travel_plan";
  return `Skybooplan_${core.slice(0, 72)}.pdf`;
}

async function renderPlanPdf(plan: PlanForPdf): Promise<{
  buffer: ArrayBuffer;
  fileName: string;
  doc: jsPDF;
}> {
  const model = normalizePlanForPdf(plan);
  const coverImage = await tryLoadCoverImage(model.coverImageUrl);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const hasUnicodeFont = await ensureFonts(doc);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentW = pageW - margin * 2;
  const footerH = 52;
  let y = margin;

  const setFont = (style: "normal" | "bold", size: number, color = INK) => {
    try {
      if (hasUnicodeFont) doc.setFont(FONT, style);
      else doc.setFont("helvetica", style === "bold" ? "bold" : "normal");
    } catch {
      doc.setFont("helvetica", style === "bold" ? "bold" : "normal");
    }
    doc.setFontSize(size);
    doc.setTextColor(color.r, color.g, color.b);
  };

  const safeText = (value: string, x: number, yPos: number, opts?: { align?: "left" | "right" | "center" }) => {
    let cleaned = sanitizePdfText(value);
    if (!cleaned) return;
    if (!hasUnicodeFont) cleaned = asciiFallback(cleaned);
    if (!cleaned) return;
    try {
      if (opts?.align) doc.text(cleaned, x, yPos, { align: opts.align });
      else doc.text(cleaned, x, yPos);
    } catch (err) {
      console.warn("PDF text skipped", cleaned.slice(0, 80), err);
    }
  };

  const measure = (value: string, style: "normal" | "bold", size: number) => {
    setFont(style, size);
    let cleaned = sanitizePdfText(value);
    if (!hasUnicodeFont) cleaned = asciiFallback(cleaned);
    return cleaned ? doc.getTextWidth(cleaned) : 0;
  };

  const pageBottom = pageH - footerH;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageBottom) {
      doc.addPage();
      y = margin;
    }
  };

  /** page-break-inside: avoid — start a new page when the whole unit still fits there. */
  const breakBefore = (needed: number) => {
    if (shouldBreakBeforeBlock({ y, needed, pageBottom, margin })) {
      doc.addPage();
      y = margin;
    }
  };

  const cleanPdfLine = (value: string): string => {
    let cleaned = sanitizePdfText(value);
    if (!cleaned) return "";
    if (!hasUnicodeFont) cleaned = asciiFallback(cleaned);
    return cleaned;
  };

  const measureParaH = (text: string, size = 10, indent = 0): number => {
    const cleaned = cleanPdfLine(text);
    if (!cleaned) return 0;
    setFont("normal", size);
    return wrapPdfLines(doc, cleaned, contentW - indent).length * (size + 3.5);
  };

  const pdfSlotItems = (slot: PdfDay["slots"][number]) => {
    const items = slot.items.filter((it) => !isPdfClutterActivity(it.title, it.description));
    let logisticsKept = 0;
    return items.filter((it) => {
      if (!isPdfLogisticsTitle(it.title)) return true;
      logisticsKept += 1;
      return logisticsKept <= 2;
    });
  };

  const estimateDayHeight = (d: PdfDay): number => {
    const titleSafe = cleanPdfLine(d.title);
    setFont("bold", 13, INK);
    const titleLines = wrapPdfLines(doc, titleSafe, contentW - 72);
    let h = 36 + titleLines.length * 15 + 14;
    h += collapsePdfDayTransfers(d.transportation).length * 24;
    if (d.bookingUrl) h += 16;
    for (const slot of d.slots) {
      const trimmed = pdfSlotItems(slot);
      if (!trimmed.length) continue;
      h += 12;
      for (const it of trimmed) {
        const timeLabel = it.time?.trim() || "";
        const timeW = timeLabel ? measure(timeLabel, "bold", 9) : 0;
        const titleMaxW = contentW - (timeW ? timeW + 18 : 8);
        setFont("bold", 11, INK);
        h += wrapPdfLines(doc, cleanPdfLine(it.title), titleMaxW).length * 13;
        if (it.price) h += 12;
        for (const line of activityDescriptionBullets(it.description, it.bullets)) {
          const bullet = cleanPdfLine(`–  ${line}`);
          setFont("normal", 9, MUTED);
          h += wrapPdfLines(doc, bullet, contentW - 14).length * 11;
        }
        if (it.mapsUrl && !isPdfLogisticsTitle(it.title)) h += 11;
        h += 10;
      }
    }
    if (
      (typeof d.dailyBudgetEur === "number" && d.dailyBudgetEur > 0) ||
      d.localTips ||
      d.transportTips
    ) {
      h += 11;
    }
    if (d.localTips) {
      const cleaned = cleanPdfLine(`${model.labels.localTips}: ${d.localTips}`);
      if (cleaned) {
        setFont("normal", 8.5, AMBER_INK);
        h += 10 + wrapPdfLines(doc, cleaned, contentW - 18).length * 12 + 8;
      }
    }
    if (d.transportTips) h += measureParaH(`${model.labels.transport}: ${d.transportTips}`, 8.5, 2);
    if (typeof d.dailyBudgetEur === "number" && d.dailyBudgetEur > 0) {
      h += measureParaH(
        `${model.labels.dailyBudget}: €${Math.round(d.dailyBudgetEur)} ${model.labels.dailyBudgetPerPerson}`,
        8.5,
        2,
      );
    }
    return h + 16;
  };

  const heading = (text: string, keepWith = 48) => {
    // page-break-after: avoid — heading stays with the following unit
    breakBefore(28 + keepWith);
    y += 10;
    setFont("bold", 10, SKY_DARK);
    safeText(String(text ?? "").toUpperCase(), margin, y);
    y += 6;
    doc.setDrawColor(SKY.r, SKY.g, SKY.b);
    doc.setLineWidth(2.5);
    doc.line(margin, y, margin + 28, y);
    y += 12;
  };

  const para = (text: string, size = 10, color = INK, indent = 0) => {
    let cleaned = sanitizePdfText(text);
    if (!cleaned) return;
    if (!hasUnicodeFont) cleaned = asciiFallback(cleaned);
    if (!cleaned) return;
    setFont("normal", size, color);
    const lines = wrapPdfLines(doc, cleaned, contentW - indent);
    for (const line of lines) {
      ensureSpace(size + 5);
      safeText(line, margin + indent, y);
      y += size + 3.5;
    }
  };

  const softPanel = (height: number) => {
    ensureSpace(height + 8);
    doc.setFillColor(CARD.r, CARD.g, CARD.b);
    doc.roundedRect(margin, y - 4, contentW, height, 8, 8, "F");
    doc.setFillColor(SKY.r, SKY.g, SKY.b);
    doc.roundedRect(margin, y - 4, 4, height, 2, 2, "F");
  };

  const drawSlotPill = (label: string) => {
    const padX = 9;
    const h = 15;
    const w = measure(label, "bold", 8) + padX * 2;
    ensureSpace(h + 12);
    doc.setFillColor(PILL_BG.r, PILL_BG.g, PILL_BG.b);
    doc.roundedRect(margin, y - 10, w, h, 7, 7, "F");
    setFont("bold", 8, SKY_DARK);
    safeText(String(label ?? "").toUpperCase(), margin + padX, y);
    y += 12;
  };

  const drawDayBand = (dayNum: number, metaLine: string, title: string) => {
    const titleRaw = sanitizePdfText(title);
    const titleSafe = hasUnicodeFont ? titleRaw : asciiFallback(titleRaw);
    setFont("bold", 13, INK);
    const titleLines = wrapPdfLines(doc, titleSafe, contentW - 72);
    const bandH = 36 + titleLines.length * 15;
    // .day-header { page-break-after: avoid } — don't leave the band alone at the footer.
    if (shouldBreakBeforeBlock({ y, needed: bandH + 70, pageBottom, margin })) {
      doc.addPage();
      y = margin;
    }
    ensureSpace(bandH + 14);
    doc.setFillColor(BAND.r, BAND.g, BAND.b);
    doc.roundedRect(margin, y, contentW, bandH, 10, 10, "F");
    // Day number badge
    const badge = 26;
    doc.setFillColor(SKY.r, SKY.g, SKY.b);
    doc.roundedRect(margin + 10, y + (bandH - badge) / 2, badge, badge, 8, 8, "F");
    setFont("bold", 11, WHITE);
    const num = String(dayNum);
    const numW = doc.getTextWidth(num);
    safeText(num, margin + 10 + (badge - numW) / 2, y + bandH / 2 + 4);
    setFont("bold", 8.5, SKY_DARK);
    safeText(metaLine, margin + 48, y + 14);
    setFont("bold", 13, INK);
    let ty = y + 30;
    for (const line of titleLines) {
      safeText(line, margin + 48, ty);
      ty += 15;
    }
    y += bandH + 14;
  };

  // ===== COVER =====
  if (coverImage) {
    try {
      doc.addImage(coverImage.dataUrl, coverImage.format, 0, 0, pageW, COVER_H, undefined, "FAST");
    } catch {
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.rect(0, 0, pageW, COVER_H, "F");
    }
    try {
      const GState = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
      doc.setGState(new GState({ opacity: 0.55 }) as never);
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.rect(0, 0, pageW, COVER_H, "F");
      doc.setGState(new GState({ opacity: 1 }) as never);
    } catch {
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.rect(0, COVER_H - 110, pageW, 110, "F");
    }
  } else {
    // Layered sky wash — brand first, no flat single slab.
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(0, 0, pageW, COVER_H, "F");
    doc.setFillColor(BRAND_MID.r, BRAND_MID.g, BRAND_MID.b);
    doc.rect(0, COVER_H * 0.42, pageW, COVER_H * 0.58, "F");
    doc.setFillColor(SKY_DARK.r, SKY_DARK.g, SKY_DARK.b);
    doc.rect(0, 0, pageW, 6, "F");
    doc.setFillColor(SKY.r, SKY.g, SKY.b);
    doc.rect(0, COVER_H - 10, pageW, 10, "F");
  }
  doc.setFillColor(SKY.r, SKY.g, SKY.b);
  doc.rect(0, COVER_H, pageW, 3, "F");

  const markSize = 24;
  drawLogoMark(doc, margin, 32, markSize);
  drawBrandWordmark(doc, margin + markSize + 10, 50, {
    size: 16,
    onDark: true,
    unicode: hasUnicodeFont,
  });
  setFont("normal", 9, { r: 186, g: 230, b: 253 });
  const brandTag = model.labels.brand.includes("Potovalni")
    ? "Potovalni načrt"
    : model.labels.brand.includes("Reiseplan")
      ? "Reiseplan"
      : "Travel plan";
  safeText(brandTag, margin + markSize + 10, 68);

  const heroDest = sanitizePdfText(model.destination || model.title);
  const heroSafe = hasUnicodeFont ? heroDest : asciiFallback(heroDest);
  setFont("bold", 32, WHITE);
  const heroLines = wrapPdfLines(doc, heroSafe, contentW);
  let heroY = 118;
  for (let i = 0; i < Math.min(2, heroLines.length); i++) {
    safeText(heroLines[i]!, margin, heroY);
    heroY += 36;
  }

  const routeTitle = sanitizePdfText(String(model.title ?? "").replace(/\s*→\s*/g, " → "));
  if (routeTitle && routeTitle.toLowerCase() !== heroDest.toLowerCase()) {
    setFont("normal", 12, { r: 186, g: 230, b: 253 });
    const routeSafe = hasUnicodeFont ? routeTitle : asciiFallback(routeTitle);
    const routeLines = wrapPdfLines(doc, routeSafe, contentW);
    safeText(routeLines[0]!, margin, heroY);
    heroY += 20;
  }

  const meta = [model.startDate, model.endDate].filter(Boolean).join("  –  ");
  const dayCountLabel =
    model.days.length > 0
      ? model.contentLang === "sl"
        ? `${model.days.length} dni`
        : model.contentLang === "de"
          ? `${model.days.length} Tage`
          : `${model.days.length} days`
      : "";
  // Meta chips under hero
  const chips = [meta, dayCountLabel, model.pax > 1 ? `${model.pax}×` : ""]
    .filter(Boolean)
    .join("   ·   ");
  if (chips) {
    setFont("normal", 10, { r: 226, g: 232, b: 240 });
    safeText(chips, margin, Math.min(heroY + 8, COVER_H - 22));
  }

  y = COVER_H + 24;

  if (model.summary) {
    heading(model.labels.overview, measureParaH(model.summary, 10.5) + 8);
    para(model.summary, 10.5, MUTED);
    y += 8;
  }

  if (model.insurance) {
    const insBody =
      measureParaH(`${model.insurance.title} — ${model.insurance.body}`, 10) +
      (model.insurance.insurers ? measureParaH(model.insurance.insurers, 9, 2) : 0) +
      8;
    heading(model.labels.insurance, insBody);
    para(`${model.insurance.title} — ${model.insurance.body}`, 10, MUTED);
    if (model.insurance.insurers) {
      para(model.insurance.insurers, 9, MUTED, 2);
    }
    y += 8;
  }

  if (model.totalBudgetEur != null) {
    const breakdown = pdfBudgetBreakdownLines({
      lang: model.contentLang,
      pax: model.pax,
      planEur: model.planEur,
      flightEur: model.flightEur,
      staysApproxEur: model.staysApproxEur,
      roadTrip: model.roadTrip,
    });
    const caption = roadBudgetCaption(model);
    const extraLines = breakdown.length ? breakdown : [caption];
    if (breakdown.length === 0 && model.roadTrip && model.staysApproxEur && model.staysApproxEur > 0) {
      extraLines.push(roadStaysCaption(model));
    }
    const budgetH = 28 + extraLines.length * 13;
    heading(model.labels.budget, budgetH + 12);
    softPanel(budgetH);
    setFont("bold", 20, INK);
    safeText(`€${Math.round(model.totalBudgetEur)}`, margin + 16, y + 20);
    setFont("normal", 8.5, MUTED);
    let lineY = y + 34;
    for (const line of extraLines) {
      safeText(line, margin + 16, lineY);
      lineY += 13;
    }
    y += budgetH + 12;
  }

  // ===== DAYS =====
  if (model.days.length) {
    heading(model.labels.daily, Math.min(estimateDayHeight(model.days[0]!), 140));

    for (const d of model.days) {
      const dateLabel = [
        fmtDate(d.date, model.contentLang),
        d.dateEnd ? fmtDate(d.dateEnd, model.contentLang) : "",
      ]
        .filter(Boolean)
        .join(" – ");
      const metaLine = [dateLabel, d.city].filter(Boolean).join("  ·  ");

      // .day-card { page-break-inside: avoid }
      breakBefore(estimateDayHeight(d));
      drawDayBand(d.day, metaLine, d.title);

      for (const leg of collapsePdfDayTransfers(d.transportation)) {
        const line = [
          String(leg.type || "transport").toUpperCase(),
          leg.from && leg.to ? `${leg.from} → ${leg.to}` : "",
          leg.duration,
          leg.price,
        ]
          .filter(Boolean)
          .join("  ·  ");
        ensureSpace(20);
        doc.setFillColor(SKY_DARK.r, SKY_DARK.g, SKY_DARK.b);
        doc.roundedRect(margin, y - 10, contentW, 18, 6, 6, "F");
        setFont("bold", 8.5, WHITE);
        safeText(`▸  ${line}`, margin + 10, y + 2);
        y += 24;
      }

      if (d.bookingUrl) {
        ensureSpace(16);
        setFont("normal", 8.5, SKY);
        try {
          doc.textWithLink(bookHotelsLabel(model.contentLang), margin + 8, y, {
            url: d.bookingUrl,
          });
        } catch {
          safeText(bookHotelsLabel(model.contentLang), margin + 8, y);
        }
        y += 16;
      }

      for (const slot of d.slots) {
        const trimmed = pdfSlotItems(slot);
        if (!trimmed.length) continue;

        // Keep slot pill with the first row — don't orphan "POPOLDAN" at a page break.
        if (shouldBreakBeforeBlock({ y, needed: 55, pageBottom, margin })) {
          doc.addPage();
          y = margin;
        }
        drawSlotPill(slot.label);

        for (const it of trimmed) {
          ensureSpace(40);
          const timeLabel = it.time?.trim() || "";
          const timeW = timeLabel ? measure(timeLabel, "bold", 9) : 0;
          const titleMaxW = contentW - (timeW ? timeW + 18 : 8);

          setFont("bold", 11, INK);
          const titleRaw = sanitizePdfText(it.title);
          const titleSafe = hasUnicodeFont ? titleRaw : asciiFallback(titleRaw);
          const titleLines = wrapPdfLines(doc, titleSafe, titleMaxW);
          const rowTop = y;
          for (const line of titleLines) {
            ensureSpace(13);
            safeText(line, margin + 2, y);
            y += 13;
          }
          if (timeLabel) {
            setFont("bold", 9, SKY_DARK);
            safeText(timeLabel, pageW - margin, rowTop, { align: "right" });
          }

          if (it.price) {
            setFont("bold", 9, SKY_DARK);
            safeText(it.price, margin + 2, y);
            y += 12;
          }
          {
            const lines = activityDescriptionBullets(it.description, it.bullets);
            for (const line of lines) {
              setFont("normal", 9, MUTED);
              const bullet = `–  ${line}`;
              const cleaned = hasUnicodeFont
                ? sanitizePdfText(bullet)
                : asciiFallback(sanitizePdfText(bullet));
              const wrap = wrapPdfLines(doc, cleaned, contentW - 14);
              for (const wline of wrap) {
                ensureSpace(11);
                safeText(wline, margin + 8, y);
                y += 11;
              }
            }
          }
          if (it.mapsUrl && !isPdfLogisticsTitle(it.title)) {
            ensureSpace(12);
            setFont("normal", 8.5, SKY);
            try {
              doc.textWithLink(model.labels.navigate, margin + 8, y, { url: it.mapsUrl });
            } catch {
              safeText(model.labels.navigate, margin + 8, y);
            }
            y += 11;
          }
          y += 10;
        }
      }

      if (
        (typeof d.dailyBudgetEur === "number" && d.dailyBudgetEur > 0) ||
        d.localTips ||
        d.transportTips
      ) {
        ensureSpace(26);
        doc.setDrawColor(RULE.r, RULE.g, RULE.b);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageW - margin, y);
        y += 11;
      }
      if (d.localTips) {
        let cleaned = sanitizePdfText(`${model.labels.localTips}: ${d.localTips}`);
        if (cleaned && !hasUnicodeFont) cleaned = asciiFallback(cleaned);
        if (cleaned) {
          setFont("normal", 8.5, AMBER_INK);
          const lines = wrapPdfLines(doc, cleaned, contentW - 18);
          const boxH = 10 + lines.length * 12;
          ensureSpace(boxH + 8);
          doc.setFillColor(AMBER_BG.r, AMBER_BG.g, AMBER_BG.b);
          doc.roundedRect(margin, y - 6, contentW, boxH, 4, 4, "F");
          doc.setFillColor(AMBER.r, AMBER.g, AMBER.b);
          doc.rect(margin, y - 6, 4, boxH, "F");
          for (const line of lines) {
            safeText(line, margin + 12, y + 4);
            y += 12;
          }
          y += 8;
        }
      }
      if (d.transportTips) {
        para(`${model.labels.transport}: ${d.transportTips}`, 8.5, MUTED, 2);
      }
      if (typeof d.dailyBudgetEur === "number" && d.dailyBudgetEur > 0) {
        para(
          `${model.labels.dailyBudget}: €${Math.round(d.dailyBudgetEur)} ${model.labels.dailyBudgetPerPerson}`,
          8.5,
          MUTED,
          2,
        );
      }

      y += 16;
    }
  }

  if (model.flights.length) {
    // .flights-container { page-break-inside: auto } — keep each row together
    heading(model.labels.flights, measureParaH(model.flights[0]!, 10));
    for (const f of model.flights) {
      breakBefore(measureParaH(f, 10));
      para(f, 10, INK);
    }
    y += 4;
  }

  if (model.hotels.length) {
    const firstStay = model.hotels[0]!;
    const firstLead = firstStay.lead || firstStay.text;
    const firstDates = firstStay.dates || "";
    const firstOneLine =
      !firstDates ||
      measure(firstLead, "normal", 10) + 12 + (firstDates ? measure(firstDates, "normal", 10) : 0) <=
        contentW;
    const firstStayH = (firstOneLine ? 16 : 30) + (firstStay.url ? 12 : 0);
    heading(model.labels.stays, firstStayH);
    for (const h of model.hotels) {
      // .accommodation-row { display:flex; justify-content:space-between;
      //   white-space:nowrap; break-inside:avoid }
      const lead = h.lead || h.text;
      const dates = h.dates || "";
      setFont("normal", 10);
      const dateW = dates ? measure(dates, "normal", 10) : 0;
      const leadW = measure(lead, "normal", 10);
      const oneLine = !dates || leadW + 12 + dateW <= contentW;
      const rowH = (oneLine ? 16 : 30) + (h.url ? 12 : 0);
      breakBefore(rowH);
      setFont("normal", 10, INK);
      if (dates && oneLine) {
        safeText(lead, margin, y);
        safeText(dates, pageW - margin, y, { align: "right" });
        y += 16;
      } else if (dates) {
        safeText(lead, margin, y);
        y += 14;
        safeText(dates, pageW - margin, y, { align: "right" });
        y += 16;
      } else {
        para(h.text, 10, INK);
      }
      if (h.url) {
        ensureSpace(12);
        setFont("normal", 8.5, SKY);
        try {
          doc.textWithLink(bookHotelsLabel(model.contentLang), margin, y, { url: h.url });
        } catch {
          safeText(bookHotelsLabel(model.contentLang), margin, y);
        }
        y += 12;
      }
    }
    y += 4;
  }

  if (model.packing.length) {
    heading(model.labels.packing);
    for (const p of model.packing) para(`☐  ${p}`, 10, INK);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(RULE.r, RULE.g, RULE.b);
    doc.setLineWidth(0.8);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
    drawLogoMark(doc, margin, pageH - 30, 10);
    drawBrandWordmark(doc, margin + 14, pageH - 19, {
      size: 8,
      onDark: false,
      unicode: hasUnicodeFont,
    });
    setFont("normal", 8, MUTED);
    safeText(model.labels.pageOf(i, pageCount), pageW - margin, pageH - 19, {
      align: "right",
    });
  }

  const fileName = buildPdfDownloadFileName(model.title, model.destination);
  const buffer = doc.output("arraybuffer");
  return { buffer, fileName, doc };
}

/** Warm DejaVu so the click-to-download stays inside Safari's user-gesture window. */
export async function preloadPdfFonts(): Promise<void> {
  if (fontCache || fontsUnavailable || typeof window === "undefined") return;
  try {
    const [regular, bold] = await Promise.all([
      loadFontBinary(FONT_REGULAR_URL),
      loadFontBinary(FONT_BOLD_URL),
    ]);
    fontCache = { regular, bold };
  } catch (err) {
    console.warn("[pdf] font preload failed — Helvetica fallback", err);
    fontsUnavailable = true;
  }
}

/** Open a tab synchronously in the click handler so Safari/iOS still allow the file. */
export function openPendingPdfWindow(): Window | null {
  if (typeof window === "undefined") return null;
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

/** Put a rendered PDF on disk / in the pending tab. Never throws. */
export function offerPdfDownload(
  buffer: ArrayBuffer,
  fileName: string,
  pendingWindow?: Window | null,
): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const cleaned = fileName.replace(/[/\\?%*:|"<>]/g, "_").trim();
  const named = /\.pdf$/i.test(cleaned)
    ? cleaned
    : `${cleaned || "Skybooplan_travel_plan"}.pdf`;
  const isiOS = /iP(hone|ad|od)/i.test(navigator.userAgent);

  const clickNamed = (doc: Document) => {
    const a = doc.createElement("a");
    a.href = url;
    a.download = named;
    a.rel = "noopener";
    doc.body.appendChild(a);
    a.click();
    a.remove();
  };

  try {
    if (isiOS && pendingWindow && !pendingWindow.closed) {
      try {
        clickNamed(pendingWindow.document);
      } catch {
        pendingWindow.location.href = url;
      }
    } else {
      try {
        pendingWindow?.close();
      } catch {
        /* ignore */
      }
      clickNamed(document);
    }
  } catch (err) {
    console.warn("[pdf] download click failed", err);
    try {
      window.location.href = url;
    } catch {
      pendingWindow?.close();
    }
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 8_000);
}

function renderEmergencyPdf(plan: PlanForPdf): {
  buffer: ArrayBuffer;
  fileName: string;
  doc: jsPDF;
} {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const title = asciiFallback(sanitizePdfText(plan.title || plan.destination) || "Skybooplan");
  const titleLines = doc.splitTextToSize(title, 500) as string[];
  doc.text(titleLines, 44, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const days = Array.isArray((plan.itinerary as { days?: unknown[] } | undefined)?.days)
    ? ((plan.itinerary as { days: Array<Record<string, unknown>> }).days ?? [])
    : [];
  let y = 64 + titleLines.length * 18;
  days.slice(0, 40).forEach((d, i) => {
    const line = asciiFallback(
      sanitizePdfText(d?.title) || sanitizePdfText(d?.city) || `Day ${i + 1}`,
    );
    const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, 500) as string[];
    if (y > 780) {
      doc.addPage();
      y = 64;
    }
    doc.text(wrapped, 44, y);
    y += wrapped.length * 16;
  });
  const fileName = buildPdfDownloadFileName(title, plan.destination);
  return { buffer: doc.output("arraybuffer"), fileName, doc };
}

export async function generatePlanPdf(plan: PlanForPdf): Promise<{
  buffer: ArrayBuffer;
  fileName: string;
  doc: jsPDF;
}> {
  try {
    return await renderPlanPdf(plan);
  } catch (err) {
    // Custom font / VFS quirks — retry once with Helvetica ASCII fallback.
    console.warn("[pdf] export failed, retrying without DejaVu fonts", err);
  }
  fontsUnavailable = true;
  fontCache = null;
  try {
    return await renderPlanPdf(plan);
  } catch (retryErr) {
    console.warn("[pdf] fallback render failed, using emergency PDF", retryErr);
    return renderEmergencyPdf(plan);
  }
}
