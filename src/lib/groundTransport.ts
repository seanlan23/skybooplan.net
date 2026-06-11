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
- Po prihodu na destinacijo nadaljuj z običajnim oglednim programom.

POVRATEK DOMOV — VLAK (obvezno, zadnji dnevi):
- Potnik se NE vrača z mednarodnega letala! Celotno potovanje je vlak iz "${origin}" do "${dest}" in nazaj.
- Zadnji dan (ali zadnja 1–2 dni) mora biti vožnja/vlak NAZAJ do izhodišča "${origin}".
- Na zadnjem dnevu NE načrtuj mednarodnega leta, odhoda z letališča ali trip_metadata.return_flight_eu.
- transportation[] zadnjega dne: type "train" proti domu.`;
  }

  const vehicle = mode === "motorhome" ? "avtodomom" : "avtom";
  return `
PREVOZ DO DESTINACIJE — ${mode === "motorhome" ? "AVTODOM" : "AVTO"} (obvezno):
- Potnik potuje iz "${origin}" do "${dest}" z ${vehicle} (ne z letalom za ta del poti).
- Prvi dni morajo pokrivati celotno pot od doma do destinacije z realističnimi postanki (npr. "Postanek v Milanu", "Nočitev v Münchenu").
- Vsak dan poti: drivingDistanceKm, drivingDurationHours, smiselne postanke ali kratki ogledi ob poti.
- Za avtodom: kampiri/RV parki ob poti, ne hoteli v centru mest.
- Po prihodu na destinacijo nadaljuj z glavnim programom na cilju.

POVRATEK DOMOV — ${mode === "motorhome" ? "AVTODOM" : "AVTO"} (obvezno, zadnji dnevi):
- Potnik se NE vrača z mednarodnega letala! Celotno potovanje je z ${vehicle} iz "${origin}" do "${dest}" in nazaj.
- Zadnji dan (ali zadnja 1–3 dni, glede na razdaljo) mora biti vožnja NAZAJ do izhodišča "${origin}" z realističnimi postanki, drivingDistanceKm in drivingDurationHours.
- Na zadnjem dnevu NE načrtuj mednarodnega leta, category airport za odlet v EU, prevoza na letališče ali trip_metadata.return_flight_eu.
- transportation[] zadnjega dne: vožnja z avtom/avtodomom proti domu — ne flight.`;
}

/** Last-day return rules — must match groundTransportMode (car ≠ flight home). */
export function lastDayReturnPromptBlock(params: {
  groundTransportMode?: GroundTransportMode;
  originPlace?: string;
  returnFromIata?: string;
  destinationIata?: string;
}): string {
  const origin = params.originPlace?.trim() || "izhodišče potnika";
  const mode = params.groundTransportMode;

  if (mode === "car" || mode === "motorhome") {
    const vehicle = mode === "motorhome" ? "avtodomom" : "avtom";
    return `ZADNJI DAN — POVRATEK DOMOV (obvezno, ${mode === "motorhome" ? "AVTODOM" : "AVTO"}):
- Striktno: potnik potuje z ${vehicle} od "${origin}" — zadnji dan je vožnja NAZAJ na "${origin}", NE mednarodni let z letališča!
- Zadnji dan: check-out, nato vožnja domov z drivingDistanceKm, drivingDurationHours in po potrebi postanki ob cesti.
- Prepovedano na zadnjem dnevu: mednarodni let, aktivnost category airport za odlet v EU, prevoz na letališče za povratek domov.
- trip_metadata.return_flight_eu NE izpolnjuj — potnik se vrne z ${vehicle}.`;
  }

  if (mode === "train") {
    return `ZADNJI DAN — POVRATEK DOMOV (obvezno, VLAK):
- Striktno: potnik se vrača z vlakom na "${origin}" — NE z mednarodnega letala!
- Zadnji dan(i): vlak/postaje proti domu; transportation[] type "train".
- trip_metadata.return_flight_eu NE izpolnjuj.`;
  }

  const airport = params.returnFromIata ?? params.destinationIata ?? "izhodno letališče";
  return `ZADNJI DAN — LOGISTIČNI ZAKLJUČEK (LET):
- Zadnji dan potovanja je IZKLJUČNO za logistiko: check-out, prevoz na izhodno letališče (${airport}), buffer za varnost, morebiten hiter obrok v bližini letališča.
- Na zadnji dan NE dodajaj novih mest, ogledov, atrakcij ali oddaljenih regij — potnik mora priti do letala brez stresa.
- Če je odhod zgodaj zjutraj, zadnji dan naj bo kratek; noč pred odhodom prespi v mestu blizu izhodnega letališča.
- Obvezno: aktivnost category airport z natančno uro mednarodnega odleta in trip_metadata.return_flight_eu (departure_time, arrival_time_eu, from_airport, to_airport, summary).`;
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
