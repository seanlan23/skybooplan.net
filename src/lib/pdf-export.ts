import jsPDF from "jspdf";
import {
  buildGoogleMapsDirectionsUrl,
  isValidNavCoord,
  resolveDayNavOrigin,
} from "@/lib/navigationService";
import { resolvePlanContentLanguage, stripPlanTeaser } from "@/lib/planTeaser";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { normalizePlanLangCode } from "@/lib/planLanguages";
import { activityDescriptionBullets } from "@/lib/activityDescription";
import { formatActivityClockLabel } from "@/lib/activityTime";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";
import { fixMotorhomeCopyErrors } from "@/lib/textSanitize";

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
};

type NormalizedPdfPlan = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  summary: string;
  totalBudgetEur?: number;
  pax: number;
  days: PdfDay[];
  flights: string[];
  hotels: string[];
  packing: string[];
  labels: PdfLabels;
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
  navigate: string;
  pageOf: (page: number, total: number) => string;
  day: (n: number, end?: number) => string;
};

const BRAND = { r: 15, g: 23, b: 42 }; // slate-900 header
/** Match Logo.tsx — skybooplan brand blues (no orange). */
const SKY = { r: 14, g: 165, b: 233 }; // #0EA5E9
const SKY_DARK = { r: 2, g: 132, b: 199 }; // #0284C7
const SKY_LIGHT = { r: 125, g: 211, b: 252 }; // #7DD3FC
const ACCENT = SKY;
const INK = { r: 30, g: 41, b: 59 };
const MUTED = { r: 100, g: 116, b: 139 };
const RULE = { r: 226, g: 232, b: 240 };
const BAND = { r: 241, g: 245, b: 249 }; // slate-100 day header
const PILL_BG = { r: 224, g: 242, b: 254 }; // sky-100
const CARD = { r: 248, g: 250, b: 252 }; // slate-50 soft panels
const WHITE = { r: 255, g: 255, b: 255 };
const FONT = "DejaVuSans";
const COVER_H = 220;

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
export function sanitizePdfText(input: string): string {
  return input
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\u0000/g, "")
    // Collapse spaces/tabs only — keep newlines so bullet lists survive when needed.
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  const raw = String(d).trim();
  if (!raw) return "";
  // Keep ISO YYYY-MM-DD stable (avoid timezone day-shift).
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const dt = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return dt.toLocaleDateString("sl-SI", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  try {
    return new Date(raw).toLocaleDateString("sl-SI", {
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
  if (!title) return null;
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
  const desc = textOf(o.description);
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
    .filter(Boolean)
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

/** Normalize AI / saved plan shapes into a clean PDF model. */
export function normalizePlanForPdf(plan: PlanForPdf): NormalizedPdfPlan {
  const itin = (plan.itinerary ?? {}) as PlanItinerary & Record<string, unknown>;
  const motorhome =
    itin.groundTransportMode === "motorhome" || itin.accommodationMode === "motorhome";
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
      ? (d.transportation as Array<Record<string, unknown>>).map((t) => ({
          type: textOf(t.type) || "transport",
          from: textOf(t.from),
          to: textOf(t.to),
          duration: textOf(t.duration) || undefined,
          price:
            typeof t.estimatedPrice === "number"
              ? `€${t.estimatedPrice}`
              : textOf(t.cost) || textOf(t.price) || undefined,
        }))
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
    ? itin.flights.map((f) =>
        [f.from && f.to ? `${f.from} → ${f.to}` : "", fmtDate(f.date), f.airline, f.price]
          .filter(Boolean)
          .join("  ·  "),
      )
    : [];

  const hotels = Array.isArray(itin.hotels)
    ? itin.hotels.map((h) =>
        [
          h.name,
          h.area,
          h.nights ? `${h.nights} nights` : "",
          h.price,
        ]
          .filter(Boolean)
          .join("  ·  "),
      )
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

  const coverImageUrl =
    typeof plan.cover_image_url === "string" && plan.cover_image_url.trim()
      ? plan.cover_image_url.trim()
      : undefined;

  return {
    title: plan.title || destination || "Skybooplan",
    destination,
    startDate: fmtDate(plan.start_date),
    endDate: fmtDate(plan.end_date),
    summary: cleanSummary(stripPlanTeaser(textOf(itin.summary), contentLang)),
    totalBudgetEur,
    pax,
    days,
    flights,
    hotels,
    packing,
    labels,
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

export async function generatePlanPdf(plan: PlanForPdf): Promise<{
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
    ensureSpace(40);
    y += 8;
    setFont("bold", 11, SKY_DARK);
    safeText(text, margin, y);
    y += 7;
    doc.setDrawColor(SKY.r, SKY.g, SKY.b);
    doc.setLineWidth(2);
    doc.line(margin, y, margin + 36, y);
    y += 14;
  };

  const para = (text: string, size = 10, color = INK, indent = 0) => {
    let cleaned = sanitizePdfText(text);
    if (!cleaned) return;
    if (!hasUnicodeFont) cleaned = asciiFallback(cleaned);
    if (!cleaned) return;
    setFont("normal", size, color);
    const lines = doc.splitTextToSize(cleaned, contentW - indent) as string[];
    for (const line of lines) {
      ensureSpace(size + 5);
      safeText(line, margin + indent, y);
      y += size + 4;
    }
  };

  const softPanel = (height: number) => {
    ensureSpace(height + 8);
    doc.setFillColor(CARD.r, CARD.g, CARD.b);
    doc.roundedRect(margin, y - 4, contentW, height, 6, 6, "F");
  };

  const drawSlotPill = (label: string) => {
    const padX = 10;
    const h = 16;
    const w = measure(label, "bold", 8.5) + padX * 2;
    ensureSpace(h + 10);
    doc.setFillColor(PILL_BG.r, PILL_BG.g, PILL_BG.b);
    doc.roundedRect(margin, y - 11, w, h, 8, 8, "F");
    setFont("bold", 8.5, SKY_DARK);
    safeText(label, margin + padX, y);
    y += 14;
  };

  const drawDayBand = (metaLine: string, title: string) => {
    const titleRaw = sanitizePdfText(title);
    const titleSafe = hasUnicodeFont ? titleRaw : asciiFallback(titleRaw);
    setFont("bold", 12, INK);
    const titleLines = doc.splitTextToSize(titleSafe, contentW - 28) as string[];
    const bandH = 28 + titleLines.length * 14;
    ensureSpace(bandH + 12);
    doc.setFillColor(BAND.r, BAND.g, BAND.b);
    doc.roundedRect(margin, y, contentW, bandH, 7, 7, "F");
    doc.setFillColor(SKY.r, SKY.g, SKY.b);
    doc.rect(margin, y, 4, bandH, "F");
    setFont("bold", 9, SKY_DARK);
    safeText(metaLine, margin + 14, y + 14);
    setFont("bold", 12, INK);
    let ty = y + 30;
    for (const line of titleLines) {
      safeText(line, margin + 14, ty);
      ty += 14;
    }
    y += bandH + 12;
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
      doc.setGState(new GState({ opacity: 0.52 }) as never);
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.rect(0, 0, pageW, COVER_H, "F");
      doc.setGState(new GState({ opacity: 1 }) as never);
    } catch {
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.rect(0, COVER_H - 100, pageW, 100, "F");
    }
  } else {
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(0, 0, pageW, COVER_H, "F");
    doc.setFillColor(SKY_DARK.r, SKY_DARK.g, SKY_DARK.b);
    doc.rect(0, 0, pageW, 5, "F");
    // Quiet brand accent — right edge wash, still readable.
    doc.setFillColor(SKY.r, SKY.g, SKY.b);
    doc.rect(pageW - 8, 0, 8, COVER_H, "F");
  }
  doc.setFillColor(SKY.r, SKY.g, SKY.b);
  doc.rect(0, COVER_H, pageW, 4, "F");

  const markSize = 22;
  drawLogoMark(doc, margin, 28, markSize);
  drawBrandWordmark(doc, margin + markSize + 8, 44, {
    size: 15,
    onDark: true,
    unicode: hasUnicodeFont,
  });
  setFont("normal", 9, { r: 186, g: 230, b: 253 });
  const brandTag = model.labels.brand.includes("Potovalni")
    ? "Potovalni načrt"
    : model.labels.brand.includes("Reiseplan")
      ? "Reiseplan"
      : "Travel plan";
  safeText(brandTag, margin + markSize + 8, 60);

  // Destination is the hero signal; route title is secondary.
  const heroDest = sanitizePdfText(model.destination || model.title);
  const heroSafe = hasUnicodeFont ? heroDest : asciiFallback(heroDest);
  setFont("bold", 28, WHITE);
  const heroLines = doc.splitTextToSize(heroSafe, contentW) as string[];
  let heroY = 108;
  for (let i = 0; i < Math.min(2, heroLines.length); i++) {
    safeText(heroLines[i]!, margin, heroY);
    heroY += 32;
  }

  const routeTitle = sanitizePdfText(model.title.replace(/\s*→\s*/g, " → "));
  if (routeTitle && routeTitle.toLowerCase() !== heroDest.toLowerCase()) {
    setFont("normal", 11, { r: 186, g: 230, b: 253 });
    const routeSafe = hasUnicodeFont ? routeTitle : asciiFallback(routeTitle);
    const routeLines = doc.splitTextToSize(routeSafe, contentW) as string[];
    safeText(routeLines[0]!, margin, heroY);
    heroY += 18;
  }

  setFont("normal", 11, { r: 226, g: 232, b: 240 });
  const meta = [model.startDate, model.endDate].filter(Boolean).join("  –  ");
  if (meta) safeText(meta, margin, Math.min(heroY + 4, COVER_H - 18));

  y = COVER_H + 28;

  if (model.summary) {
    heading(model.labels.overview);
    para(model.summary, 10.5, MUTED);
    y += 6;
  }

  if (model.totalBudgetEur != null) {
    heading(model.labels.budget);
    const budgetH = 44;
    softPanel(budgetH);
    setFont("bold", 18, INK);
    safeText(`€${Math.round(model.totalBudgetEur)}`, margin + 14, y + 18);
    setFont("normal", 9, MUTED);
    safeText(model.labels.budgetForPax(model.pax), margin + 14, y + 34);
    y += budgetH + 10;
  }

  // ===== DAYS =====
  if (model.days.length) {
    heading(model.labels.daily);

    for (const d of model.days) {
      const dateLabel = [fmtDate(d.date), d.dateEnd ? fmtDate(d.dateEnd) : ""]
        .filter(Boolean)
        .join(" – ");
      const metaLine = [
        model.labels.day(d.day, d.dayEnd),
        dateLabel,
        d.city,
      ]
        .filter(Boolean)
        .join("  ·  ");

      drawDayBand(metaLine, d.title);

      for (const leg of d.transportation) {
        const line = [
          leg.type.toUpperCase(),
          leg.from && leg.to ? `${leg.from} → ${leg.to}` : "",
          leg.duration,
          leg.price,
        ]
          .filter(Boolean)
          .join("  ·  ");
        ensureSpace(18);
        doc.setFillColor(PILL_BG.r, PILL_BG.g, PILL_BG.b);
        doc.roundedRect(margin, y - 10, contentW, 18, 5, 5, "F");
        setFont("bold", 9, SKY_DARK);
        safeText(`▸  ${line}`, margin + 10, y + 2);
        y += 22;
      }

      for (const slot of d.slots) {
        drawSlotPill(slot.label);

        for (const it of slot.items) {
          ensureSpace(36);
          const timeLabel = it.time?.trim() || "";
          const timeW = timeLabel ? measure(timeLabel, "bold", 9) : 0;
          const titleMaxW = contentW - (timeW ? timeW + 16 : 0);

          setFont("bold", 10.5, INK);
          const titleRaw = sanitizePdfText(it.title);
          const titleSafe = hasUnicodeFont ? titleRaw : asciiFallback(titleRaw);
          const titleLines = doc.splitTextToSize(titleSafe, titleMaxW) as string[];
          const rowTop = y;
          for (const line of titleLines) {
            ensureSpace(13);
            safeText(line, margin + 2, y);
            y += 12;
          }
          if (timeLabel) {
            setFont("bold", 9, SKY_DARK);
            safeText(timeLabel, pageW - margin, rowTop, { align: "right" });
          }

          if (it.price) {
            setFont("normal", 9, MUTED);
            safeText(it.price, margin + 10, y);
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
              const wrap = doc.splitTextToSize(cleaned, contentW - 16) as string[];
              for (const wline of wrap) {
                ensureSpace(12);
                safeText(wline, margin + 10, y);
                y += 11;
              }
            }
          }
          if (it.location) para(it.location, 8.5, MUTED, 10);
          if (it.mapsUrl) {
            ensureSpace(14);
            setFont("normal", 9, SKY);
            try {
              doc.textWithLink(model.labels.navigate, margin + 10, y, { url: it.mapsUrl });
            } catch {
              safeText(model.labels.navigate, margin + 10, y);
            }
            y += 12;
          }
          y += 8;
        }
      }

      if (d.dailyBudgetEur != null || d.transportTips) {
        ensureSpace(28);
        doc.setDrawColor(RULE.r, RULE.g, RULE.b);
        doc.setLineWidth(0.6);
        doc.line(margin, y, pageW - margin, y);
        y += 12;
      }
      if (d.dailyBudgetEur != null) {
        para(
          `${model.labels.dailyBudget}: €${Math.round(d.dailyBudgetEur)} ${model.labels.dailyBudgetPerPerson}`,
          9,
          MUTED,
          2,
        );
      }
      if (d.transportTips) {
        para(`${model.labels.transport}: ${d.transportTips}`, 9, MUTED, 2);
      }

      y += 14;
    }
  }

  if (model.flights.length) {
    heading(model.labels.flights);
    for (const f of model.flights) para(f, 10, INK);
    y += 4;
  }

  if (model.hotels.length) {
    heading(model.labels.stays);
    for (const h of model.hotels) para(h, 10, INK);
    y += 4;
  }

  if (model.packing.length) {
    heading(model.labels.packing);
    for (const p of model.packing) para(`☐  ${p}`, 10, INK);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(SKY.r, SKY.g, SKY.b);
    doc.setLineWidth(1.2);
    doc.line(margin, pageH - 44, pageW - margin, pageH - 44);
    drawLogoMark(doc, margin, pageH - 34, 11);
    drawBrandWordmark(doc, margin + 15, pageH - 22, {
      size: 8.5,
      onDark: false,
      unicode: hasUnicodeFont,
    });
    setFont("normal", 8.5, MUTED);
    safeText(model.labels.pageOf(i, pageCount), pageW - margin, pageH - 22, {
      align: "right",
    });
  }

  const safe =
    asciiFallback(model.title)
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 80) || "travel_plan";

  const fileName = `${safe}.pdf`;
  const buffer = doc.output("arraybuffer");
  if (typeof window !== "undefined") {
    try {
      doc.save(fileName);
    } catch (saveErr) {
      // Safari / popup blockers — fall back to Blob download.
      console.warn("[pdf] doc.save failed, using blob download", saveErr);
      const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    }
  }
  return { buffer, fileName, doc };
}
