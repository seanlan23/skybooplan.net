import type { AiTripPlan } from "@/lib/aiPlan.functions";

const MAX_MAILTO_BODY = 1600;

export function buildPlanEmail(
  plan: AiTripPlan,
  opts?: { title?: string; language?: string | null },
): { subject: string; body: string } {
  const title = (opts?.title || plan.destinationName || "Skybooplan").trim();
  const lang = (opts?.language || plan.contentLanguage || "en").slice(0, 2).toLowerCase();
  const days = plan.days ?? [];
  const first = days[0]?.date?.slice(0, 10) ?? "";
  const last = (days[days.length - 1]?.dateEnd || days[days.length - 1]?.date || "").slice(0, 10);
  const dates = [first, last].filter(Boolean).join(" – ");
  const subject = dates ? `${title} · ${dates}` : title;

  const header =
    lang === "sl"
      ? `${title}${dates ? ` · ${dates}` : ""}\n${days.length} dni · skybooplan.com\n`
      : lang === "de"
        ? `${title}${dates ? ` · ${dates}` : ""}\n${days.length} Tage · skybooplan.com\n`
        : `${title}${dates ? ` · ${dates}` : ""}\n${days.length} days · skybooplan.com\n`;

  const lines: string[] = [header];
  for (const day of days.slice(0, 16)) {
    const label = lang === "sl" ? "Dan" : lang === "de" ? "Tag" : "Day";
    const city = (day.city || day.focusName || "").trim();
    lines.push(`${label} ${day.day}${city ? ` · ${city}` : ""}`);
    const names = [
      ...(day.activities?.morning ?? []),
      ...(day.activities?.afternoon ?? []),
      ...(day.activities?.evening ?? []),
    ]
      .map((a) => (a.name ?? "").trim())
      .filter(Boolean)
      .slice(0, 4);
    for (const name of names) lines.push(`- ${name}`);
    if (!names.length && day.title) lines.push(`- ${day.title}`);
  }

  const footer =
    lang === "sl"
      ? "\nPDF je v Prenosih — pripeti ga v to sporočilo, če želiš celoten načrt."
      : lang === "de"
        ? "\nDas PDF liegt in den Downloads — hänge es an, wenn du den ganzen Plan willst."
        : "\nThe PDF is in your Downloads — attach it here if you want the full plan.";

  let body = lines.join("\n").trim();
  if (body.length > MAX_MAILTO_BODY) {
    body = `${body.slice(0, MAX_MAILTO_BODY - 20).trim()}\n…`;
  }
  return { subject, body: `${body}\n${footer}` };
}

function mailtoHref(to: string | null | undefined, subject: string, body: string): string {
  const q = new URLSearchParams({ subject, body });
  const addr = (to ?? "").trim();
  return `mailto:${encodeURIComponent(addr)}?${q.toString()}`;
}

export function openPlanMailto(
  to: string | null | undefined,
  subject: string,
  body: string,
): void {
  if (typeof window === "undefined") return;
  window.location.href = mailtoHref(to, subject, body);
}

export async function deliverPlanByEmail(opts: {
  to?: string | null;
  subject: string;
  body: string;
  pdf?: { buffer: ArrayBuffer; fileName: string };
}): Promise<"shared" | "mailto"> {
  const file =
    opts.pdf && typeof File !== "undefined"
      ? new File([opts.pdf.buffer], opts.pdf.fileName, { type: "application/pdf" })
      : null;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (file && nav && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: opts.subject,
        text: opts.body.slice(0, 400),
      });
      return "shared";
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return "shared";
    }
  }
  openPlanMailto(opts.to, opts.subject, opts.body);
  return "mailto";
}
