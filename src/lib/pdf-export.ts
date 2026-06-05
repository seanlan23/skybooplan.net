import jsPDF from "jspdf";

export type PlanItinerary = {
  summary?: string;
  days?: Array<{
    day?: number;
    date?: string;
    title?: string;
    items?: Array<{ time?: string; title?: string; description?: string; location?: string }>;
  }>;
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
  itinerary: PlanItinerary;
};

const BRAND = { r: 234, g: 88, b: 12 }; // orange brand
const INK = { r: 17, g: 24, b: 39 };
const MUTED = { r: 107, g: 114, b: 128 };

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return d; }
}

export async function generatePlanPdf(plan: PlanForPdf) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const heading = (text: string, size = 18) => {
    ensureSpace(size + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.text(text, margin, y);
    y += size + 6;
    doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + 40, y);
    y += 14;
  };

  const para = (text: string, size = 11, color = INK) => {
    if (!text) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(color.r, color.g, color.b);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
  };

  // ===== COVER =====
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, pageW, 220, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("SKYBOOPLAN  ·  Travel Plan", margin, 56);

  doc.setFontSize(30);
  const titleLines = doc.splitTextToSize(plan.title, pageW - margin * 2);
  doc.text(titleLines, margin, 110);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.text(plan.destination, margin, 168);

  doc.setFontSize(11);
  const dates = [fmtDate(plan.start_date), fmtDate(plan.end_date)].filter(Boolean).join("  –  ");
  if (dates) doc.text(dates, margin, 190);

  y = 260;

  if (plan.itinerary.summary) {
    heading("Overview");
    para(plan.itinerary.summary);
    y += 8;
  }

  // ===== DAYS =====
  if (plan.itinerary.days?.length) {
    heading("Daily itinerary");
    for (const d of plan.itinerary.days) {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
      const dayLabel = `Day ${d.day ?? ""}${d.date ? `  ·  ${fmtDate(d.date)}` : ""}${d.title ? `  —  ${d.title}` : ""}`;
      doc.text(dayLabel.trim(), margin, y);
      y += 18;
      for (const it of d.items ?? []) {
        const line = [it.time, it.title].filter(Boolean).join("  ·  ");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(INK.r, INK.g, INK.b);
        ensureSpace(16);
        doc.text(`•  ${line}`, margin + 8, y);
        y += 14;
        if (it.description) para(it.description, 10, MUTED);
        if (it.location) para(`📍 ${it.location}`, 10, MUTED);
      }
      y += 6;
    }
  }

  // ===== FLIGHTS =====
  if (plan.itinerary.flights?.length) {
    heading("Flights");
    for (const f of plan.itinerary.flights) {
      para(`${f.from ?? ""} → ${f.to ?? ""}  ·  ${fmtDate(f.date)}  ·  ${f.airline ?? ""}  ${f.price ? "·  " + f.price : ""}`);
    }
    y += 4;
  }

  // ===== HOTELS =====
  if (plan.itinerary.hotels?.length) {
    heading("Stays");
    for (const h of plan.itinerary.hotels) {
      para(`${h.name ?? ""}${h.area ? "  ·  " + h.area : ""}${h.nights ? "  ·  " + h.nights + " nights" : ""}${h.price ? "  ·  " + h.price : ""}`);
    }
    y += 4;
  }

  // ===== BUDGET =====
  if (plan.itinerary.budget) {
    heading("Budget");
    if (plan.itinerary.budget.total) para(`Total: ${plan.itinerary.budget.total} ${plan.itinerary.budget.currency ?? ""}`);
    for (const [k, v] of Object.entries(plan.itinerary.budget.breakdown ?? {})) {
      para(`• ${k}: ${v}`, 11, MUTED);
    }
  }

  // ===== PACKING =====
  if (plan.itinerary.packing?.length) {
    heading("Packing list");
    for (const p of plan.itinerary.packing) para(`☐  ${p}`);
  }

  // ===== FOOTER on each page =====
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text("Generated by Skybooplan  ·  skybooplan.com", margin, pageH - 24);
    doc.text(`${i} / ${pageCount}`, pageW - margin, pageH - 24, { align: "right" });
  }

  const safe = plan.title.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "_") || "travel_plan";
  doc.save(`${safe}.pdf`);
}
