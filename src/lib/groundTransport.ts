import type { AiTripPlan, DayPlan, GroundJourney, GroundJourneyStop, GroundTransportMode } from "@/lib/aiPlan.functions";
import { translate, type Lang } from "@/lib/i18n";

export type { GroundJourney, GroundJourneyStop, GroundTransportMode };

export const GROUND_TRANSPORT_MODES: GroundTransportMode[] = ["car", "motorhome", "train"];

const TRANSPORT_I18N: Record<GroundTransportMode, "transport.car" | "transport.motorhome" | "transport.train"> = {
  car: "transport.car",
  motorhome: "transport.motorhome",
  train: "transport.train",
};

export function groundTransportLabel(mode: GroundTransportMode, lang: Lang = "sl"): string {
  return translate(lang, TRANSPORT_I18N[mode]);
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
  return `ZADNJI DAN — STROGI JSON (LET — aplikacija vstavi logistiko):
- activities[] na zadnjem dnevu: samo lahki ogledi/hrana PRED odhodom (title, description, category, timeSlot, coords). BREZ HH:MM.
- PREPOVEDANO v activities[]: check-out, prevoz na letališče, airport check-in, mednarodni let, category "airport", izmišljene ure.
- Aplikacija sama vstavi check-out → transfer → letališče → mednarodni let iz IZBRANI LET (boarding-pass).
- Ne dodajaj novih mest/oddaljenih regij; noč pred odhodom blizu izhodnega letališča (${airport}).
- trip_metadata.return_flight_eu: samo če so ure v IZBRANI LET — kopiraj jih, ne izmišljuj. Če IZBRANI LET manjka, pusti prazno (aplikacija dopolni).`;
}

export function isJourneyDay(day: DayPlan, plan: AiTripPlan): boolean {
  if (day.journeyPhase === "outbound") return true;
  if (!plan.groundTransportMode || !plan.groundJourney) return false;
  const stopDays = new Set(plan.groundJourney.stops.map((s) => s.day).filter(Boolean));
  return stopDays.has(day.day);
}

const COUNTRY_DEST_RE =
  /^(italy|italija|italia|croatia|hrvaška|hrvatska|spain|španija|france|francija|germany|nemčija|austria|avstrija|slovenia|slovenija|greece|grčija|portugal|netherlands|switzerland|švica)(,|\s|$)/i;

function isCountryOnlyDestination(label: string): boolean {
  const s = label.replace(/\s+/g, " ").trim();
  if (!s) return false;
  const head = s.split(",")[0]!.trim();
  return COUNTRY_DEST_RE.test(head) || COUNTRY_DEST_RE.test(s);
}

/**
 * Unique overnight hubs in day order (collapse Venice×2, Florence×3, …).
 * `day` = first itinerary day in that city — used to fly the map.
 */
export function collectRoadTripHubStops(plan: AiTripPlan): GroundJourneyStop[] {
  const stops: GroundJourneyStop[] = [];
  let lastKey = "";

  for (const day of [...plan.days].sort((a, b) => a.day - b.day)) {
    if (day.inFlightDay) continue;
    const city = (day.city ?? day.focusName ?? "").trim();
    if (!city) continue;
    const key = city.toLowerCase();
    if (key === lastKey) continue;
    lastKey = key;
    stops.push({
      name: city,
      note: day.title,
      day: day.day,
    });
  }

  return stops;
}

function collectJourneyStops(plan: AiTripPlan): GroundJourneyStop[] {
  // Full motorhome / country-level road loops: one chip per city stay, not per day.
  if (
    plan.groundTransportMode === "motorhome" ||
    plan.accommodationMode === "motorhome" ||
    isCountryOnlyDestination(plan.destinationPlace ?? plan.destinationName ?? "")
  ) {
    return collectRoadTripHubStops(plan);
  }

  const destCity = (plan.destinationPlace ?? plan.destinationName ?? "").trim().toLowerCase();
  const stops: GroundJourneyStop[] = [];
  let seenDest = false;

  for (const day of plan.days) {
    const city = (day.city ?? day.focusName ?? "").trim();
    if (!city) continue;
    const destHead = destCity.split(",")[0]!.trim().toLowerCase();
    const isDest = destHead.length >= 3 && city.toLowerCase().includes(destHead);
    if (isDest) {
      seenDest = true;
      break;
    }
    if (
      day.journeyPhase === "outbound" ||
      day.category === "transport" ||
      (day.drivingDistanceKm ?? 0) > 80 ||
      /pot do|potovanje|vlak|postanek|transfer/i.test(`${day.title} ${day.morning}`)
    ) {
      // Skip "vožnja" alone — motorhome day copy matches almost every day.
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

  // Collapse accidental same-city runs (e.g. 2 nights Venice).
  const deduped: GroundJourneyStop[] = [];
  for (const stop of stops) {
    const key = (stop.name ?? "").trim().toLowerCase();
    if (!key) continue;
    if (deduped[deduped.length - 1]?.name.trim().toLowerCase() === key) continue;
    deduped.push(stop);
  }
  return deduped;
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

  const fullRoadLoop = opts.mode === "motorhome";
  const distanceDays = fullRoadLoop
    ? plan.days
    : plan.days.filter((d) => d.journeyPhase === "outbound");

  const totalKm = distanceDays.reduce((sum, d) => sum + (d.drivingDistanceKm ?? 0), 0);

  const durationParts = distanceDays
    .map((d) => d.drivingDurationHours)
    .filter((v): v is string => Boolean(v));

  plan.groundJourney = {
    mode: opts.mode,
    originLabel: plan.originPlace,
    destinationLabel: plan.destinationPlace ?? plan.destinationName,
    totalDistanceKm: totalKm > 0 ? Math.round(totalKm) : undefined,
    // Motorhome: one total figure — avoid "2h + 2h + 0h + …" noise for every leg.
    totalDuration: fullRoadLoop
      ? durationParts.length
        ? `${durationParts.length} etap`
        : undefined
      : durationParts.length
        ? durationParts.join(" + ")
        : undefined,
    stops: collectJourneyStops(plan),
  };
}
