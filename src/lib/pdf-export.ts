import jsPDF from "jspdf";
import fontRegularUrl from "dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url";
import fontBoldUrl from "dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url";

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
  dailyBudget: string;
  flights: string;
  stays: string;
  packing: string;
  pageOf: (page: number, total: number) => string;
  day: (n: number, end?: number) => string;
};

const BRAND = { r: 15, g: 23, b: 42 }; // slate-900
const ACCENT = { r: 234, g: 88, b: 12 }; // brand orange
const INK = { r: 30, g: 41, b: 59 };
const MUTED = { r: 100, g: 116, b: 139 };
const RULE = { r: 226, g: 232, b: 240 };
const FONT = "DejaVuSans";

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
      dailyBudget: "Dnevni proračun",
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
    dailyBudget: "Daily budget",
    flights: "Flights",
    stays: "Stays",
    packing: "Packing list",
    pageOf: (page, total) => `${page} / ${total}`,
    day: (n, end) => (end && end !== n ? `Day ${n}–${end}` : `Day ${n}`),
  };
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
  if (typeof v === "string") return v.trim();
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
    [textOf(o.departureTime), textOf(o.arrivalTime)].filter(Boolean).join(" – ") ||
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
  const rawDays = Array.isArray(itin.days) ? itin.days : [];
  const sample = [textOf(itin.summary), ...rawDays.map((d) => textOf(d?.title))].join(" ");
  const labels = labelsFor(plan.language, sample);

  const days: PdfDay[] = rawDays.map((raw, idx) => {
    const d = (raw ?? {}) as Record<string, unknown>;
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

    return {
      day: dayNum,
      dayEnd,
      date: textOf(d.date) || undefined,
      dateEnd: textOf(d.dateEnd) || undefined,
      title: textOf(d.title) || labels.day(dayNum, dayEnd),
      city: textOf(d.city) || textOf(d.focusName) || undefined,
      dailyBudgetEur:
        typeof d.dailyBudgetEur === "number" && Number.isFinite(d.dailyBudgetEur)
          ? d.dailyBudgetEur
          : undefined,
      transportTips: textOf(d.transportationTips) || textOf((d.transport as { description?: string } | undefined)?.description) || undefined,
      transportation,
      slots,
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

  return {
    title: plan.title || destination || "Skybooplan",
    destination,
    startDate: fmtDate(plan.start_date),
    endDate: fmtDate(plan.end_date),
    summary: cleanSummary(textOf(itin.summary)),
    totalBudgetEur,
    days,
    flights,
    hotels,
    packing,
    labels,
  };
}

async function loadFontBinary(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load PDF font: ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return binary;
}

let fontCache: { regular: string; bold: string } | null = null;

async function ensureFonts(doc: jsPDF) {
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
}

export async function generatePlanPdf(plan: PlanForPdf) {
  const model = normalizePlanForPdf(plan);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  await ensureFonts(doc);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const setFont = (style: "normal" | "bold", size: number, color = INK) => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(color.r, color.g, color.b);
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
    doc.text(text.toUpperCase(), margin, y);
    y += 8;
    doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + 28, y);
    y += 16;
  };

  const para = (text: string, size = 10, color = INK, indent = 0) => {
    if (!text) return;
    setFont("normal", size, color);
    const lines = doc.splitTextToSize(text, contentW - indent) as string[];
    for (const line of lines) {
      ensureSpace(size + 5);
      doc.text(line, margin + indent, y);
      y += size + 4;
    }
  };

  // ===== COVER =====
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, pageW, 168, "F");
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.rect(0, 168, pageW, 4, "F");

  setFont("bold", 11, { r: 255, g: 255, b: 255 });
  doc.setTextColor(255, 255, 255);
  doc.text(model.labels.brand, margin, 44);

  setFont("bold", 26, { r: 255, g: 255, b: 255 });
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(model.title.replace(/\s*→\s*/g, " → "), contentW) as string[];
  doc.text(titleLines.slice(0, 3), margin, 88);

  setFont("normal", 12, { r: 255, g: 255, b: 255 });
  doc.setTextColor(226, 232, 240);
  const meta = [model.destination, [model.startDate, model.endDate].filter(Boolean).join("  –  ")]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) doc.text(meta, margin, 148);

  y = 200;

  if (model.summary) {
    heading(model.labels.overview);
    para(model.summary, 10.5, MUTED);
    y += 4;
  }

  if (model.totalBudgetEur != null) {
    heading(model.labels.budget);
    para(`€${Math.round(model.totalBudgetEur)}`, 14, INK);
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
      doc.text(head, margin, y);
      y += 15;

      setFont("bold", 11, INK);
      const titleLinesDay = doc.splitTextToSize(d.title, contentW) as string[];
      for (const line of titleLinesDay) {
        ensureSpace(14);
        doc.text(line, margin, y);
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
        doc.text(slot.label.toUpperCase(), margin + 4, y);
        y += 13;

        for (const it of slot.items) {
          const lead = [it.time, it.title].filter(Boolean).join("  ·  ");
          setFont("bold", 10, INK);
          const leadLines = doc.splitTextToSize(`•  ${lead}`, contentW - 8) as string[];
          for (const line of leadLines) {
            ensureSpace(13);
            doc.text(line, margin + 4, y);
            y += 12;
          }
          if (it.price) para(it.price, 9, MUTED, 16);
          if (it.description) para(it.description, 9, MUTED, 16);
          if (it.location) para(it.location, 9, MUTED, 16);
          y += 3;
        }
      }

      if (d.dailyBudgetEur != null) {
        para(`${model.labels.dailyBudget}: €${Math.round(d.dailyBudgetEur)}`, 9, MUTED, 4);
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
    setFont("normal", 8.5, MUTED);
    doc.text("skybooplan.com", margin, pageH - 24);
    doc.text(model.labels.pageOf(i, pageCount), pageW - margin, pageH - 24, { align: "right" });
  }

  const safe =
    model.title
      .replace(/[^a-z0-9-_ ČŠŽĆĐčšžćđ→]/gi, "")
      .replace(/→/g, "-")
      .trim()
      .replace(/\s+/g, "_") || "travel_plan";
  doc.save(`${safe}.pdf`);
}
