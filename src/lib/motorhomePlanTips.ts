import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { fixMotorhomeCopyErrors } from "@/lib/textSanitize";

function isFerragostoWindow(isoDate: string | undefined): boolean {
  if (!isoDate) return false;
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Peak Italian mid-August holiday traffic ~ Aug 10–20
  return month === 8 && day >= 10 && day <= 20;
}

function isBusyItalyCampCity(city: string): boolean {
  return /venice|benetk|fusina|mestre|lazise|garda|sirmione|florence|firenze|rome|rim\b|roma/i.test(
    city,
  );
}

function appendTip(existing: string | undefined, tip: string): string {
  const base = (existing ?? "").trim();
  if (!tip) return base;
  if (base.toLowerCase().includes(tip.slice(0, 28).toLowerCase())) return base;
  return base ? `${base} ${tip}` : tip;
}

/** Fix known AI camp/POI slips + Ferragosto / long-leg tips on motorhome plans. */
export function enrichMotorhomePlanTips(plan: AiTripPlan, lang = "sl"): void {
  const slo = lang === "sl" || lang.startsWith("sl");

  for (const day of plan.days) {
    const city = day.city ?? day.focusName ?? "";
    day.title = fixMotorhomeCopyErrors(day.title ?? "", city);
    day.morning = fixMotorhomeCopyErrors(day.morning ?? "", city);
    day.afternoon = fixMotorhomeCopyErrors(day.afternoon ?? "", city);
    day.evening = fixMotorhomeCopyErrors(day.evening ?? "", city);
    if (day.transportationTips) {
      day.transportationTips = fixMotorhomeCopyErrors(day.transportationTips, city);
    }

    if (day.activities) {
      for (const slot of ["morning", "afternoon", "evening"] as const) {
        day.activities[slot] = (day.activities[slot] ?? []).map((a) => ({
          ...a,
          name: fixMotorhomeCopyErrors(a.name, city),
          description: fixMotorhomeCopyErrors(a.description ?? "", city),
        }));
      }
    }

    if (isFerragostoWindow(day.date) && isBusyItalyCampCity(city)) {
      day.transportationTips = appendTip(
        day.transportationTips,
        slo
          ? "Ferragosto (sredi avgusta): kamp obvezno rezerviraj vnaprej — Fusina, Garda in obala so polni."
          : "Ferragosto (mid-August): book the campsite in advance — Venice/Garda/coast camps sell out.",
      );
    }

    const km = day.drivingDistanceKm ?? 0;
    if (km >= 380) {
      day.transportationTips = appendTip(
        day.transportationTips,
        slo
          ? `Dolga etapa (~${Math.round(km)} km): računaj na 4,5–5+ ur in morebitne zastoje (npr. A14/A4).`
          : `Long driving day (~${Math.round(km)} km): allow 4.5–5+ hours plus possible A14/A4 traffic.`,
      );
    }
  }
}
