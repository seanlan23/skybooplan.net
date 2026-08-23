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
import { normalizePlanLangCode } from "@/lib/planLanguages";
import { activityDescriptionBullets } from "@/lib/activityDescription";
import { formatActivityClockLabel } from "@/lib/activityTime";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";
import { resyncPlanDayDates } from "@/lib/daySequence";
import { fixMotorhomeCopyErrors } from "@/lib/textSanitize";
import {
  collectOvernightHotelStays,
  overnightStayBookingUrl,
} from "@/lib/overnightHotelStays";
import { resolveTravelRequirements, type TravelRequirements } from "@/lib/travelRequirements";

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
  days?: Array<Record<string, unknown>>;
  flights?: Array<{ from?: string; to?: string; date?: string; airline?: string; price?: string }>;
  hotels?: Array<{ name?: string; area?: string; nights?: number; price?: string }>;
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
  staysApproxEur?: number;
  roadTrip: boolean;
  pax: number;
  days: PdfDay[];
  flights: string[];
  hotels: Array<{ text: string; url?: string }>;
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
const INK = { r: 30, g: 41, b: 59 };
const MUTED = { r: 100, g: 116, b: 139 };
const RULE = { r: 226, g: 232, b: 240 };
const BAND = { r: 241, g: 245, b: 249 }; // slate-100 day header
const PILL_BG = { r: 224, g: 242, b: 254 }; // sky-100
const CARD = { r: 248, g: 250, b: 252 }; // slate-50 soft panels
const WHITE = { r: 255, g: 255, b: 255 };
const FONT = "DejaVuSans";
const COVER_H = 268;
/** PDF stays scannable — fewer bullets than the live UI. */
const PDF_MAX_BULLETS = 2;

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

function roadBudgetCaption(model: NormalizedPdfPlan): string {
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
      budget: "Proračun",
      budgetForPax: (n) =>
        n <= 1 ? "Skupaj (ocena na destinaciji, brez mednarodnih letov)" : `Skupaj za ${n} oseb (ocena na destinaciji, brez mednarodnih letov)`,
      dailyBudget: "Dnevni proračun",
      dailyBudgetPerPerson: "na osebo",
      flights: "Leti",
      stays: "Namestitve",
      packing: "Seznam za pakiranje",
      insurance: "Turistično zavarovanje",
      navigate: "Navigiraj (Google Maps)",
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
      budget: "Budget",
      budgetForPax: (n) =>
        n <= 1
          ? "Totale (stima a destinazione, esclusi voli internazionali)"
          : `Totale per ${n} viaggiatori (stima a destinazione, esclusi voli internazionali)`,
      dailyBudget: "Budget giornaliero",
      dailyBudgetPerPerson: "a persona",
      flights: "Voli",
      stays: "Alloggi",
      packing: "Lista bagaglio",
      insurance: "Assicurazione di viaggio",
      navigate: "Naviga (Google Maps)",
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
      budget: "Budget",
      budgetForPax: (n) =>
        n <= 1
          ? "Gesamt (Schätzung vor Ort, ohne internationale Flüge)"
          : `Gesamt für ${n} Reisende (Schätzung vor Ort, ohne internationale Flüge)`,
      dailyBudget: "Tagesbudget",
      dailyBudgetPerPerson: "pro Person",
      flights: "Flüge",
      stays: "Unterkünfte",
      packing: "Packliste",
      insurance: "Reiseversicherung",
      navigate: "Navigieren (Google Maps)",
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
      budget: "Presupuesto",
      budgetForPax: (n) =>
        n <= 1
          ? "Total (estimación en destino, sin vuelos internacionales)"
          : `Total para ${n} viajeros (estimación en destino, sin vuelos internacionales)`,
      dailyBudget: "Presupuesto diario",
      dailyBudgetPerPerson: "por persona",
      flights: "Vuelos",
      stays: "Alojamientos",
      packing: "Lista de equipaje",
      insurance: "Seguro de viaje",
      navigate: "Navegar (Google Maps)",
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
      budget: "Budget",
      budgetForPax: (n) =>
        n <= 1
          ? "Total (estimation sur place, hors vols internationaux)"
          : `Total pour ${n} voyageurs (estimation sur place, hors vols internationaux)`,
      dailyBudget: "Budget journalier",
      dailyBudgetPerPerson: "par personne",
      flights: "Vols",
      stays: "Hébergements",
      packing: "Liste de bagages",
      insurance: "Assurance voyage",
      navigate: "Naviguer (Google Maps)",
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
    budget: "Budget",
    budgetForPax: (n) =>
      n <= 1
        ? "Total (on-destination estimate, excl. international flights)"
        : `Total for ${n} travelers (on-destination estimate, excl. international flights)`,
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

/** Map Gemini/internal slot tokens (often Slovenian) to PDF morning/afternoon/evening labels. */
/** True when a "time" value is really a day-part label (already shown as a slot pill). */
export function isPdfDaypartToken(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  return /^(dopoldan|popoldan|večer|vecer|morning|afternoon|evening|mattina|pomeriggio|sera|morgen|nachmittag|abend|matin|après-midi|apres-midi|soir|mañana|tarde|noche|nuit)$/i.test(
    raw.trim(),
  );
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
  return input
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\u0000/g, "")
    // Collapse spaces/tabs only — keep newlines so bullet lists survive when needed.
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clipAtWordBoundary(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const sp = cut.lastIndexOf(" ");
  return (sp > 16 ? cut.slice(0, sp) : cut).replace(/[.…]+$/u, "").trim();
}

/** jsPDF throws on width <= 0 (long clock labels can eat the title column). */
function wrapPdfLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  const cleaned = text || "";
  if (!cleaned) return [];
  const width = Number.isFinite(maxWidth) && maxWidth > 24 ? maxWidth : 24;
  try {
    return doc.splitTextToSize(cleaned, width) as string[];
  } catch {
    return [clipAtWordBoundary(cleaned, 80)];
  }
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
    return s ? { title: s } : null;
  }
  const o = raw as Record<string, unknown>;
  const title = textOf(o.name) || textOf(o.title);
  if (!title || title.trim().length < 10) return null;
  if (/…|\.\.\./.test(title)) return null;
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
    (typeof o.estimatedCostEur === "number" ? `€${o.estimatedCostEur}` : undefined);
  const bullets = Array.isArray(o.bullets)
    ? o.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    : undefined;
  const rawDesc = textOf(o.description);
  const desc =
    rawDesc && rawDesc.trim().length >= 10 && !/…|\.\.\./.test(rawDesc) ? rawDesc : "";
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
    .filter((line) => line.length >= 10 && !/…|\.\.\./.test(line))
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

    const slots: PdfDay["slots"] = [
      { label: labels.morning, items: slotItems(d, "morning", labels) },
      { label: labels.afternoon, items: slotItems(d, "afternoon", labels) },
      { label: labels.evening, items: slotItems(d, "evening", labels) },
    ].filter((s) => s.items.length > 0);

    // Fallback: legacy items[] or island stay blurb
    if (!slots.length) {
      const items = legacyItems(d, labels);
      if (items.length) slots.push({ label: labels.daily, items });
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
      title: fix(textOf(d.title) || labels.day(dayNum, dayEnd)),
      city: city || undefined,
      dailyBudgetEur:
        typeof d.dailyBudgetEur === "number" && Number.isFinite(d.dailyBudgetEur)
          ? d.dailyBudgetEur
          : undefined,
      transportTips: (() => {
        const tips =
          textOf(d.transportationTips) ||
          textOf((d.transport as { description?: string } | undefined)?.description) ||
          "";
        return tips ? fix(tips) : undefined;
      })(),
      transportation,
      slots: fixedSlots,
    };
  });

  const flights = Array.isArray(itin.flights)
    ? itin.flights
        .map((raw) => {
          if (!raw || typeof raw !== "object") return "";
          const f = raw as Record<string, unknown>;
          const from = textOf(f.from);
          const to = textOf(f.to);
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

  const totalBudgetEur =
    typeof itin.totalBudgetEur === "number" && Number.isFinite(itin.totalBudgetEur)
      ? itin.totalBudgetEur
      : undefined;

  const destination =
    plan.destination ||
    textOf(itin.destinationName) ||
    textOf((itin as { destination?: string }).destination) ||
    "";

  const pax =
    typeof plan.pax === "number" && Number.isFinite(plan.pax) && plan.pax >= 1
      ? Math.round(plan.pax)
      : 1;

  const originPlace = textOf((itin as { originPlace?: string }).originPlace);
  const stays = motorhome
    ? []
    : collectOvernightHotelStays({
        days: rawDays.map((raw, idx) => {
          const d = (raw ?? {}) as Record<string, unknown>;
          return {
            day: typeof d.day === "number" ? d.day : idx + 1,
            date: textOf(d.date) || undefined,
            city: textOf(d.city) || textOf(d.focusName) || undefined,
            inFlightDay: d.inFlightDay === true,
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

  const stayByFirstDay = new Map(stays.map((s) => [s.firstDay, s]));
  for (const d of days) {
    const stay = stayByFirstDay.get(d.day);
    if (stay) {
      d.bookingUrl = overnightStayBookingUrl(stay, {
        adults: pax,
        lang: contentLang,
      });
    }
  }

  const stayHotels = stays.map((s) => ({
    text: [
      s.city,
      nightsPhrase(s.nights, contentLang),
      [fmtDate(s.checkIn, contentLang), fmtDate(s.checkOut, contentLang)]
        .filter(Boolean)
        .join(" → "),
    ]
      .filter(Boolean)
      .join("  ·  "),
    url: overnightStayBookingUrl(s, { adults: pax, lang: contentLang }),
  }));
  const hotels = motorhome
    ? []
    : stayHotels.length
      ? stayHotels
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

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - footerH) {
      doc.addPage();
      y = margin;
    }
  };

  const heading = (text: string) => {
    ensureSpace(36);
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
    // Prefer starting a day on a fresh page when little room remains.
    if (y + bandH + 90 > pageH - footerH && y > margin + 40) {
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
    heading(model.labels.overview);
    para(model.summary, 10.5, MUTED);
    y += 8;
  }

  if (model.insurance) {
    heading(model.labels.insurance);
    para(`${model.insurance.title} — ${model.insurance.body}`, 10, MUTED);
    if (model.insurance.insurers) {
      para(model.insurance.insurers, 9, MUTED, 2);
    }
    y += 8;
  }

  if (model.totalBudgetEur != null) {
    heading(model.labels.budget);
    const budgetH = model.roadTrip && model.staysApproxEur ? 60 : 48;
    softPanel(budgetH);
    setFont("bold", 20, INK);
    safeText(`€${Math.round(model.totalBudgetEur)}`, margin + 16, y + 20);
    setFont("normal", 9, MUTED);
    safeText(roadBudgetCaption(model), margin + 16, y + 36);
    if (model.roadTrip && model.staysApproxEur && model.staysApproxEur > 0) {
      safeText(
        roadStaysCaption(model),
        margin + 16,
        y + 48,
      );
    }
    y += budgetH + 12;
  }

  // ===== DAYS =====
  if (model.days.length) {
    heading(model.labels.daily);

    for (const d of model.days) {
      const dateLabel = [
        fmtDate(d.date, model.contentLang),
        d.dateEnd ? fmtDate(d.dateEnd, model.contentLang) : "",
      ]
        .filter(Boolean)
        .join(" – ");
      const metaLine = [dateLabel, d.city].filter(Boolean).join("  ·  ");

      drawDayBand(d.day, metaLine || model.labels.day(d.day, d.dayEnd), d.title);

      for (const leg of d.transportation) {
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
        const items = slot.items.filter(
          (it) => !isPdfClutterActivity(it.title, it.description),
        );
        // Keep at most 2 pure logistics rows per slot (flight day noise).
        let logisticsKept = 0;
        const trimmed = items.filter((it) => {
          if (!isPdfLogisticsTitle(it.title)) return true;
          logisticsKept += 1;
          return logisticsKept <= 2;
        });
        if (!trimmed.length) continue;

        // Keep slot pill with the first row — don't orphan "POPOLDAN" at a page break.
        if (y + 55 > pageH - footerH && y > margin + 40) {
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
            const lines = activityDescriptionBullets(it.description, it.bullets).slice(
              0,
              PDF_MAX_BULLETS,
            );
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

      if (d.dailyBudgetEur != null || d.transportTips) {
        ensureSpace(26);
        doc.setDrawColor(RULE.r, RULE.g, RULE.b);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageW - margin, y);
        y += 11;
      }
      if (d.dailyBudgetEur != null) {
        para(
          `${model.labels.dailyBudget}: €${Math.round(d.dailyBudgetEur)} ${model.labels.dailyBudgetPerPerson}`,
          8.5,
          MUTED,
          2,
        );
      }
      if (d.transportTips) {
        para(`${model.labels.transport}: ${d.transportTips}`, 8.5, MUTED, 2);
      }

      y += 16;
    }
  }

  if (model.flights.length) {
    heading(model.labels.flights);
    for (const f of model.flights) para(f, 10, INK);
    y += 4;
  }

  if (model.hotels.length) {
    heading(model.labels.stays);
    for (const h of model.hotels) {
      para(h.text, 10, INK);
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
