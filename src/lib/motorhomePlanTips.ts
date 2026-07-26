import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { fixMotorhomeCopyErrors, repairTruncatedCopy } from "@/lib/textSanitize";
import { repairTransportLegs } from "@/lib/transportLegRepair";

type DayActivity = {
  name: string;
  type?: string;
  description?: string;
  priceLabel?: string;
};

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

/** Generic lunch/dinner/café fillers — not worth a daily itinerary slot on RV trips. */
export function isMotorhomeMealFiller(a: DayActivity): boolean {
  const type = (a.type ?? "").toUpperCase();
  const name = a.name ?? "";
  const desc = a.description ?? "";
  const blob = `${name} ${desc}`;

  // Distinctive once-in-a-trip food experiences — keep when meal budget allows.
  if (
    /\b(konoba|truffle|tartuf|wine\s*tasting|degustac|olive\s*oil|oljčn|seafood\s+market|ribja\s+tržnica)\b/i.test(
      blob,
    ) &&
    !/lokalna\s+večerja|local\s+dinner|kosilo\s+na\s+poti|pavza\s+v\s+kavarni/i.test(name)
  ) {
    return false;
  }

  if (type === "EAT" || type === "FOOD") return true;

  return /\b(kosilo|večerja|zajtrk|lunch|dinner|breakfast|café|cafe\b|kavarn|pavza v kavarni|local dinner|lokalna večerja|seafood večerja|aperitivo)\b/i.test(
    name,
  );
}

/**
 * Keep at most one food activity every ~3 days (plus rare specials).
 * Drops café/lunch/dinner spam that makes RV plans read like hotel menus.
 */
export function thinMotorhomeMealActivities(plan: AiTripPlan): void {
  let daysSinceKeptMeal = 99;

  for (const day of plan.days) {
    if (!day.activities) {
      daysSinceKeptMeal += 1;
      continue;
    }

    const slots = ["morning", "afternoon", "evening"] as const;
    type SlotAct = DayActivity & { _slot: (typeof slots)[number]; _idx: number };
    const meals: SlotAct[] = [];

    for (const slot of slots) {
      const list = day.activities[slot] ?? [];
      list.forEach((a, idx) => {
        if (isMotorhomeMealFiller(a)) meals.push({ ...a, _slot: slot, _idx: idx });
      });
    }

    if (meals.length === 0) {
      daysSinceKeptMeal += 1;
      continue;
    }

    const canKeep = daysSinceKeptMeal >= 3;
    // Prefer a single evening meal when we keep one; drop the rest.
    const keep =
      canKeep
        ? meals.find((m) => m._slot === "evening") ?? meals[meals.length - 1]!
        : null;

    const dropKeys = new Set(
      meals
        .filter((m) => !keep || m._slot !== keep._slot || m._idx !== keep._idx)
        .map((m) => `${m._slot}:${m._idx}`),
    );

    for (const slot of slots) {
      const list = day.activities[slot] ?? [];
      day.activities[slot] = list.filter((_, idx) => !dropKeys.has(`${slot}:${idx}`));
    }

    // If we dropped a lone evening meal and evening is empty, leave empty —
    // camp rest does not need a fake restaurant card.
    if (keep) {
      daysSinceKeptMeal = 0;
    } else {
      daysSinceKeptMeal += 1;
    }
  }
}

/** Fix known AI camp/POI slips + Ferragosto / long-leg tips on motorhome plans. */
export function enrichMotorhomePlanTips(plan: AiTripPlan, lang = "sl"): void {
  const slo = lang === "sl" || lang.startsWith("sl");
  let previousCity = "";

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
          bullets: a.bullets?.map((b) => repairTruncatedCopy(fixMotorhomeCopyErrors(b, city))),
        }));
      }
    }

    if (day.transportation?.length) {
      day.transportation = repairTransportLegs(day.transportation, {
        dayNumber: day.day,
        city,
        previousCity: previousCity || undefined,
        activities: day.activities,
      });
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
      // Never hardcode a specific corridor (A14/A4) — that parroted across unrelated legs.
      day.transportationTips = appendTip(
        day.transportationTips,
        slo
          ? `Dolga etapa (~${Math.round(km)} km): računaj na 4,5–5+ ur vožnje in morebitne zastoje na avtocestah.`
          : `Long driving day (~${Math.round(km)} km): allow 4.5–5+ hours plus possible motorway traffic.`,
      );
    }

    // Strip leftover corridor spam from earlier tip versions / AI copy.
    if (day.transportationTips) {
      day.transportationTips = day.transportationTips
        .replace(/\s*\(npr\.\s*A14\/A4\)\.?/gi, ".")
        .replace(/\s*plus possible A14\/A4 traffic\.?/gi, ".")
        .replace(/\.\s*\./g, ".")
        .trim();
    }

    if (city) previousCity = city;
  }

  thinMotorhomeMealActivities(plan);
}
