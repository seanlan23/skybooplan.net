import jsPDF from "jspdf";
import fontRegularUrl from "dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url";
import fontBoldUrl from "dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url";
import { formatActivityClockLabel } from "@/lib/activityTime";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";
import { fixMotorhomeCopyErrors } from "@/lib/textSanitize";
import type { AiTripPlan } from "@/lib/aiPlan.functions";

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
  location?: string;
  price?: string;
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
const FONT = "DejaVuSans";

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
  opts: { size?: number; onDark?: boolean } = {},
) {
  const size = opts.size ?? 11;
  const onDark = opts.onDark ?? false;
  const ink = onDark ? { r: 255, g: 255, b: 255 } : INK;
  try {
    doc.setFont(FONT, "bold");
  } catch {
    doc.setFont("helvetica", "bold");
  }
  doc.setFontSize(size);
  doc.setTextColor(ink.r, ink.g, ink.b);
  doc.text("sky", x, y);
  const skyW = doc.getTextWidth("sky");
  try {
    doc.setFont(FONT, "normal");
  } catch {
    doc.setFont("helvetica", "normal");
  }
  doc.setTextColor(SKY.r, SKY.g, SKY.b);
  doc.text("boo", x + skyW, y);
  const booW = doc.getTextWidth("boo");
  try {
    doc.setFont(FONT, "bold");
  } catch {
    doc.setFont("helvetica", "bold");
  }
  doc.setTextColor(ink.r, ink.g, ink.b);
  doc.text("plan", x + skyW + booW, y);
}

const PROMO_RE =
  /\b(eSIM|esim|zavarovan|insurance|popust|discount|ekskluzivn[iae]?|exclusive)\b/i;

function labelsFor(lang: PlanForPdf["language"], sampleText: string): PdfLabels {
  const normalized = (lang ?? "").toLowerCase();
  const sl =
    normalized === "sl" ||
    (!normalized &&
      /[čšžćđČŠŽĆĐ]|\b(dan|dopoldan|popoldan|večer|načrt|potovanje)\b/i.test(sampleText));
  if (sl) {
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
      pageOf: (page, total) => `${page} / ${total}`,
      day: (n, end) => (end && end !== n ? `Dan ${n}–${end}` : `Dan ${n}`),
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
    pageOf: (page, total) => `${page} / ${total}`,
    day: (n, end) => (end && end !== n ? `Day ${n}–${end}` : `Day ${n}`),
  };
}

/** jsPDF custom fonts choke on emoji / some symbols — strip for layout stability. */
export function sanitizePdfText(input: string): string {
  return input
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
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

function activityFromUnknown(raw: unknown): PdfActivity | null {
  if (!raw || typeof raw !== "object") {
    const s = textOf(raw);
    return s ? { title: s } : null;
  }
  const o = raw as Record<string, unknown>;
  const title = textOf(o.name) || textOf(o.title);
  if (!title) return null;
  const time =
    textOf(o.time) ||
    textOf(o.timeSlot) ||
    formatActivityClockLabel({
      name: title,
      description: textOf(o.description) || undefined,
      type: textOf(o.type) || undefined,
      transportType: textOf(o.transportType) || undefined,
      arrivalTime: textOf(o.arrivalTime) || undefined,
      departureTime: textOf(o.departureTime) || undefined,
    }) ||
    undefined;
  const price =
    textOf(o.priceLabel) ||
    textOf(o.price) ||
    (typeof o.estimatedCostEur === "number" ? `€${o.estimatedCostEur}` : undefined);
  const desc = textOf(o.description);
  const location = textOf(o.location) || textOf(o.city);
  return {
    title,
    time: time || undefined,
    description: desc || undefined,
    location: location || undefined,
    price: price || undefined,
  };
}

function slotItems(
  day: Record<string, unknown>,
  key: "morning" | "afternoon" | "evening",
): PdfActivity[] {
  const activities = (day.activities ?? {}) as Record<string, unknown>;
  const fromSlots = Array.isArray(activities[key]) ? (activities[key] as unknown[]) : [];
  const fromItems = fromSlots.map(activityFromUnknown).filter(Boolean) as PdfActivity[];
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

function legacyItems(day: Record<string, unknown>): PdfActivity[] {
  if (!Array.isArray(day.items)) return [];
  return (day.items as unknown[]).map(activityFromUnknown).filter(Boolean) as PdfActivity[];
}

/** Normalize AI / saved plan shapes into a clean PDF model. */
export function normalizePlanForPdf(plan: PlanForPdf): NormalizedPdfPlan {
  const itin = (plan.itinerary ?? {}) as PlanItinerary & Record<string, unknown>;
  const motorhome =
    itin.groundTransportMode === "motorhome" || itin.accommodationMode === "motorhome";
  if (motorhome && Array.isArray(itin.days)) {
    enrichMotorhomePlanTips(itin as unknown as AiTripPlan, plan.language ?? "sl");
  }
  const rawDays = Array.isArray(itin.days) ? itin.days : [];
  const sample = [textOf(itin.summary), ...rawDays.map((d) => textOf(d?.title))].join(" ");
  const labels = labelsFor(plan.language, sample);

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
      { label: labels.morning, items: slotItems(d, "morning") },
      { label: labels.afternoon, items: slotItems(d, "afternoon") },
      { label: labels.evening, items: slotItems(d, "evening") },
    ].filter((s) => s.items.length > 0);

    // Fallback: legacy items[] or island stay blurb
    if (!slots.length) {
      const items = legacyItems(d);
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

  return {
    title: plan.title || destination || "Skybooplan",
    destination,
    startDate: fmtDate(plan.start_date),
    endDate: fmtDate(plan.end_date),
    summary: cleanSummary(textOf(itin.summary)),
    totalBudgetEur,
    pax,
    days,
    flights,
    hotels,
    packing,
    labels,
  };
}

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

async function loadFontBinary(url: string): Promise<string> {
  // Vite serves `?url` imports as absolute paths in Node/Vitest — read from disk.
  if (typeof window === "undefined") {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const cleaned = url.split("?")[0] || url;
    const abs = cleaned.startsWith("/")
      ? cleaned
      : resolve(process.cwd(), cleaned.replace(/^\.\//, ""));
    try {
      return uint8ToBinaryString(new Uint8Array(readFileSync(abs)));
    } catch {
      const fallback = resolve(
        process.cwd(),
        "node_modules/dejavu-fonts-ttf/ttf",
        abs.includes("Bold") ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf",
      );
      return uint8ToBinaryString(new Uint8Array(readFileSync(fallback)));
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load PDF font: ${res.status}`);
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
        loadFontBinary(fontRegularUrl),
        loadFontBinary(fontBoldUrl),
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
    doc.setFont("helvetica", "normal");
    return false;
  }
}

export async function generatePlanPdf(plan: PlanForPdf): Promise<{
  buffer: ArrayBuffer;
  fileName: string;
  doc: jsPDF;
}> {
  const model = normalizePlanForPdf(plan);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const hasUnicodeFont = await ensureFonts(doc);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
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
    const cleaned = sanitizePdfText(value);
    if (!cleaned) return;
    try {
      if (opts?.align) doc.text(cleaned, x, yPos, { align: opts.align });
      else doc.text(cleaned, x, yPos);
    } catch (err) {
      console.warn("PDF text skipped", cleaned.slice(0, 80), err);
    }
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 56) {
      doc.addPage();
      y = margin;
    }
  };

  const rule = () => {
    ensureSpace(12);
    doc.setDrawColor(RULE.r, RULE.g, RULE.b);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
  };

  const heading = (text: string) => {
    ensureSpace(36);
    y += 6;
    setFont("bold", 13, ACCENT);
    safeText(text.toUpperCase(), margin, y);
    y += 8;
    doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + 28, y);
    y += 16;
  };

  const para = (text: string, size = 10, color = INK, indent = 0) => {
    const cleaned = sanitizePdfText(text);
    if (!cleaned) return;
    setFont("normal", size, color);
    const lines = doc.splitTextToSize(cleaned, contentW - indent) as string[];
    for (const line of lines) {
      ensureSpace(size + 5);
      safeText(line, margin + indent, y);
      y += size + 4;
    }
  };

  // ===== COVER =====
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, pageW, 168, "F");
  doc.setFillColor(SKY.r, SKY.g, SKY.b);
  doc.rect(0, 168, pageW, 4, "F");

  const markSize = 22;
  drawLogoMark(doc, margin, 28, markSize);
  drawBrandWordmark(doc, margin + markSize + 8, 44, { size: 14, onDark: true });
  setFont("normal", 9, { r: 186, g: 230, b: 253 });
  doc.setTextColor(186, 230, 253);
  const brandTag = model.labels.brand.includes("Potovalni")
    ? "Potovalni načrt"
    : "Travel plan";
  safeText(brandTag, margin + markSize + 8, 58);

  setFont("bold", 26, { r: 255, g: 255, b: 255 });
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(
    sanitizePdfText(model.title.replace(/\s*→\s*/g, " → ")),
    contentW,
  ) as string[];
  for (let i = 0; i < Math.min(3, titleLines.length); i++) {
    safeText(titleLines[i]!, margin, 96 + i * 28);
  }

  setFont("normal", 12, { r: 255, g: 255, b: 255 });
  doc.setTextColor(226, 232, 240);
  const meta = [model.destination, [model.startDate, model.endDate].filter(Boolean).join("  –  ")]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) safeText(meta, margin, 148);

  y = 200;

  if (model.summary) {
    heading(model.labels.overview);
    para(model.summary, 10.5, MUTED);
    y += 4;
  }

  if (model.totalBudgetEur != null) {
    heading(model.labels.budget);
    para(`€${Math.round(model.totalBudgetEur)}`, 14, INK);
    para(model.labels.budgetForPax(model.pax), 9, MUTED, 4);
    y += 2;
  }

  // ===== DAYS =====
  if (model.days.length) {
    heading(model.labels.daily);

    for (const d of model.days) {
      ensureSpace(56);
      const dateLabel = [fmtDate(d.date), d.dateEnd ? fmtDate(d.dateEnd) : ""]
        .filter(Boolean)
        .join(" – ");
      const head = [
        model.labels.day(d.day, d.dayEnd),
        dateLabel,
        d.city,
      ]
        .filter(Boolean)
        .join("  ·  ");

      setFont("bold", 12, ACCENT);
      safeText(head, margin, y);
      y += 15;

      setFont("bold", 11, INK);
      const titleLinesDay = doc.splitTextToSize(sanitizePdfText(d.title), contentW) as string[];
      for (const line of titleLinesDay) {
        ensureSpace(14);
        safeText(line, margin, y);
        y += 14;
      }
      y += 2;

      for (const leg of d.transportation) {
        const line = [
          leg.type.toUpperCase(),
          leg.from && leg.to ? `${leg.from} → ${leg.to}` : "",
          leg.duration,
          leg.price,
        ]
          .filter(Boolean)
          .join("  ·  ");
        para(`▸ ${line}`, 9.5, MUTED, 4);
      }

      for (const slot of d.slots) {
        ensureSpace(18);
        setFont("bold", 9.5, MUTED);
        safeText(slot.label.toUpperCase(), margin + 4, y);
        y += 13;

        for (const it of slot.items) {
          const lead = [it.time, it.title].filter(Boolean).join("  ·  ");
          setFont("bold", 10, INK);
          const leadLines = doc.splitTextToSize(
            sanitizePdfText(`•  ${lead}`),
            contentW - 8,
          ) as string[];
          for (const line of leadLines) {
            ensureSpace(13);
            safeText(line, margin + 4, y);
            y += 12;
          }
          if (it.price) para(it.price, 9, MUTED, 16);
          if (it.description) para(it.description, 9, MUTED, 16);
          if (it.location) para(it.location, 9, MUTED, 16);
          y += 3;
        }
      }

      if (d.dailyBudgetEur != null) {
        para(
          `${model.labels.dailyBudget}: €${Math.round(d.dailyBudgetEur)} ${model.labels.dailyBudgetPerPerson}`,
          9,
          MUTED,
          4,
        );
      }
      if (d.transportTips) {
        para(`${model.labels.transport}: ${d.transportTips}`, 9, MUTED, 4);
      }

      y += 6;
      rule();
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
    drawLogoMark(doc, margin, pageH - 38, 12);
    drawBrandWordmark(doc, margin + 16, pageH - 24, { size: 8.5, onDark: false });
    setFont("normal", 8.5, MUTED);
    safeText(model.labels.pageOf(i, pageCount), pageW - margin, pageH - 24, {
      align: "right",
    });
  }

  const safe =
    model.title
      .replace(/[^a-z0-9-_ ČŠŽĆĐčšžćđ→]/gi, "")
      .replace(/→/g, "-")
      .trim()
      .replace(/\s+/g, "_") || "travel_plan";

  const buffer = doc.output("arraybuffer");
  if (typeof window !== "undefined") {
    doc.save(`${safe}.pdf`);
  }
  return { buffer, fileName: `${safe}.pdf`, doc };
}
