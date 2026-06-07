import type { AiTripPlan, DayPlan, GroundJourney, GroundJourneyStop, GroundTransportMode } from "@/lib/aiPlan.functions";

export type { GroundJourney, GroundJourneyStop, GroundTransportMode };

export const GROUND_TRANSPORT_MODES: GroundTransportMode[] = ["car", "motorhome", "train"];

export function groundTransportLabel(mode: GroundTransportMode, slo = true): string {
  if (slo) {
    if (mode === "car") return "Avto";
    if (mode === "motorhome") return "Avtodom";
    return "Vlak";
  }
  if (mode === "car") return "Car";
  if (mode === "motorhome") return "Motorhome";
  return "Train";
}

export function isGroundTransportMode(value: unknown): value is GroundTransportMode {
  return value === "car" || value === "motorhome" || value === "train";
}

export function usesRoadRouting(mode?: GroundTransportMode): boolean {
  return mode === "car" || mode === "motorhome";
}

export function groundTransportPromptBlock(
  mode: GroundTransportMode,
  originPlace: string,
  destinationPlace: string,
): string {
  const origin = originPlace.trim();
  const dest = destinationPlace.trim();
  if (mode === "train") {
    return `
PREVOZ DO DESTINACIJE — VLAK (obvezno):
- Potnik potuje iz "${origin}" do "${dest}" z vlakom (ne z letalom za ta del poti).
- Prvi dni itinerarja morajo vključevati logistiko poti od doma: ključne postaje, prestope, trajanje in oceno cene.
- Označi vsak dan poti z jasnim naslovom (npr. "Pot do Rima — vlak preko Dunaja").
- V transportation[] na dneh poti uporabi type "train" z realnimi imeni postaj/mest.
- Po prihodu na destinacijo nadaljuj z običajnim oglednim programom.`;
  }

  const vehicle = mode === "motorhome" ? "avtodomom" : "avtom";
  return `
PREVOZ DO DESTINACIJE — ${mode === "motorhome" ? "AVTODOM" : "AVTO"} (obvezno):
- Potnik potuje iz "${origin}" do "${dest}" z ${vehicle} (ne z letalom za ta del poti).
- Prvi dni morajo pokrivati celotno pot od doma do destinacije z realističnimi postanki (npr. "Postanek v Milanu", "Nočitev v Münchenu").
- Vsak dan poti: drivingDistanceKm, drivingDurationHours, smiselne postanke ali kratki ogledi ob poti.
- Za avtodom: kampiri/RV parki ob poti, ne hoteli v centru mest.
- Po prihodu na destinacijo nadaljuj z glavnim programom na cilju.`;
}

export function isJourneyDay(day: DayPlan, plan: AiTripPlan): boolean {
  if (day.journeyPhase === "outbound") return true;
  if (!plan.groundTransportMode || !plan.groundJourney) return false;
  const stopDays = new Set(plan.groundJourney.stops.map((s) => s.day).filter(Boolean));
  return stopDays.has(day.day);
}

function collectJourneyStops(plan: AiTripPlan): GroundJourneyStop[] {
  const destCity = (plan.destinationPlace ?? plan.destinationName ?? "").trim().toLowerCase();
  const stops: GroundJourneyStop[] = [];
  let seenDest = false;

  for (const day of plan.days) {
    const city = (day.city ?? day.focusName ?? "").trim();
    if (!city) continue;
    const isDest = destCity && city.toLowerCase().includes(destCity.split(",")[0]!.trim().toLowerCase());
    if (isDest) {
      seenDest = true;
      break;
    }
    if (
      day.journeyPhase === "outbound" ||
      day.category === "transport" ||
      (day.drivingDistanceKm ?? 0) > 80 ||
      /pot do|potovanje|vožnja|vlak|postanek|transfer/i.test(`${day.title} ${day.morning}`)
    ) {
      stops.push({
        name: city,
        note: day.title,
        day: day.day,
      });
    }
  }

  if (!seenDest && plan.days.length > 0) {
    const lastJourney = plan.days.find((d) => d.journeyPhase === "outbound");
    if (lastJourney && !stops.some((s) => s.day === lastJourney.day)) {
      stops.push({
        name: lastJourney.city ?? lastJourney.focusName,
        day: lastJourney.day,
      });
    }
  }

  return stops;
}

export function enrichGroundTransportPlan(
  plan: AiTripPlan,
  opts: {
    mode?: GroundTransportMode;
    originPlace?: string;
    destinationPlace?: string;
  },
): void {
  if (!opts.mode || !opts.originPlace?.trim()) return;

  plan.groundTransportMode = opts.mode;
  plan.originPlace = opts.originPlace.trim();
  plan.destinationPlace = opts.destinationPlace?.trim() || plan.destinationName;

  if (opts.mode === "motorhome") {
    plan.accommodationMode = "motorhome";
  }

  let journeyDayCount = 0;
  const maxJourneyDays = opts.mode === "train" ? 3 : 4;

  for (const day of plan.days) {
    if (journeyDayCount >= maxJourneyDays) break;
    const text = `${day.title} ${day.city} ${day.morning} ${day.afternoon}`.toLowerCase();
    const isTravel =
      (day.drivingDistanceKm ?? 0) > 50 ||
      day.category === "transport" ||
      /pot do|vožnja|vlak|postanek|transfer|journey|travel day/i.test(text);

    if (isTravel || journeyDayCount > 0) {
      day.journeyPhase = "outbound";
      journeyDayCount++;
    }
  }

  if (journeyDayCount === 0 && plan.days[0]) {
    plan.days[0].journeyPhase = "outbound";
  }

  const totalKm = plan.days
    .filter((d) => d.journeyPhase === "outbound")
    .reduce((sum, d) => sum + (d.drivingDistanceKm ?? 0), 0);

  const durationParts = plan.days
    .filter((d) => d.journeyPhase === "outbound")
    .map((d) => d.drivingDurationHours)
    .filter(Boolean);

  plan.groundJourney = {
    mode: opts.mode,
    originLabel: plan.originPlace,
    destinationLabel: plan.destinationPlace ?? plan.destinationName,
    totalDistanceKm: totalKm > 0 ? Math.round(totalKm) : undefined,
    totalDuration: durationParts.length ? durationParts.join(" + ") : undefined,
    stops: collectJourneyStops(plan),
  };
}
