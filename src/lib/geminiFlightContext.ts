import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  arrivalDaySlot,
  arrivalTripDay,
  buildArrivalLogistics,
  buildDepartureLogistics,
  buildFlightSchedulingPayload,
  buildOriginDepartureHint,
  buildOriginDepartureLogistics,
  formatArrivalTime,
  isAfternoonDeparture,
  isEarlyDeparture,
  isInFlightTripDay,
  isLateNightDeparture,
  isOvernightDeparture,
  isRedEyeArrival,
  isTightDeparture,
  isEveningDeparture,
  type LogisticsActivity,
  type TripFlightContext,
} from "@/lib/flightScheduling";
import { lookupDestination } from "@/lib/destinationCoords";
import { buildReturnFlightSummary } from "@/lib/returnFlightSummary";
import { resolveTripLocale } from "@/lib/tripLocale";

function logisticsToActivity(a: LogisticsActivity): Activity {
  return {
    name: a.name,
    type: a.type,
    description: a.description,
    priceLabel: a.priceLabel,
    ...(a.arrivalTime ? { arrivalTime: a.arrivalTime } : {}),
    ...(a.departureTime ? { departureTime: a.departureTime } : {}),
  };
}

function isHeavyArrivalSight(a: Activity): boolean {
  const t = `${a.name} ${a.description ?? ""}`.toLowerCase();
  return /museum|muzej|palace|citadel|trdnjava|temple|tempelj|war |znamenit|full-day|celodnev/i.test(
    t,
  );
}

/** Beach breakfast / siesta / pool — nonsense before the plane has landed. */
function isPreLandingDestinationFiller(a: Activity): boolean {
  const t = `${a.name} ${a.description ?? ""} ${a.type ?? ""}`.toLowerCase();
  if (/letališč|airport|transfer|check-?in|odhod|mednarodn|\blet\b|flight/i.test(t)) {
    return false;
  }
  return /zajtrk|breakfast|siesta|tropska\s*pavza|bazen|\bpool\b|beach\s*caf|promenad|plaž|senčnik|brunch/i.test(
    t,
  );
}

function flattenDayActivities(day: DayPlan): Activity[] {
  const a = day.activities;
  if (!a) return [];
  return [...(a.morning ?? []), ...(a.afternoon ?? []), ...(a.evening ?? [])];
}

function mergeArrivalDay(
  day: DayPlan,
  flights: TripFlightContext,
  logistics: LogisticsActivity[],
): DayPlan["activities"] {
  const logisticsActs = logistics.map(logisticsToActivity);
  const sights = flattenDayActivities(day).filter(
    (a) => !isHeavyArrivalSight(a) && !isPreLandingDestinationFiller(a),
  );
  const slot = arrivalDaySlot(flights);

  if (isRedEyeArrival(flights)) {
    return {
      morning: logisticsActs.slice(0, 2),
      afternoon: logisticsActs.slice(2),
      evening: [],
    };
  }
  if (slot === "evening") {
    // Land ~18:00+ — no morning/afternoon at destination (no breakfast, no “tropical break”).
    return { morning: [], afternoon: [], evening: logisticsActs };
  }
  if (slot === "afternoon") {
    return {
      morning: [],
      afternoon: logisticsActs,
      evening: sights.slice(0, 1),
    };
  }
  return {
    morning: logisticsActs,
    afternoon: sights.slice(0, 2),
    evening: sights.slice(2, 3),
  };
}

function mergeDepartureDay(
  day: DayPlan,
  flights: TripFlightContext,
  logistics: LogisticsActivity[],
): DayPlan["activities"] {
  const logisticsActs = logistics.map(logisticsToActivity);
  if (isTightDeparture(flights) || isEarlyDeparture(flights) || isAfternoonDeparture(flights)) {
    return { morning: logisticsActs, afternoon: [], evening: [] };
  }
  const sights = flattenDayActivities(day).filter(
    (a) => !/airport|letališč|odlet|odhod|povratek|flight home|return flight/i.test(
      `${a.name} ${a.description ?? ""}`,
    ),
  );
  if (isLateNightDeparture(flights)) {
    return {
      morning: sights.slice(0, 2),
      afternoon: sights.slice(2, 4),
      evening: logisticsActs,
    };
  }
  if (isEveningDeparture(flights)) {
    return {
      morning: sights.slice(0, 1),
      afternoon: logisticsActs,
      evening: [],
    };
  }
  return {
    morning: sights.slice(0, 1),
    afternoon: logisticsActs,
    evening: [],
  };
}

function patchAirportActivityTimes(
  activities: NonNullable<DayPlan["activities"]>,
  depart: string,
  arrive?: string,
): NonNullable<DayPlan["activities"]> {
  const patch = (list: Activity[] | undefined): Activity[] =>
    (list ?? []).map((a) => {
      const blob = `${a.name} ${a.description ?? ""} ${a.type ?? ""}`.toLowerCase();
      if (!/airport|letališč|odlet|povratek|return|flight home|mednarodn/i.test(blob)) {
        return a;
      }
      let description = a.description;
      if (description) {
        let clockIdx = 0;
        description = description.replace(/\b\d{1,2}:\d{2}\b/g, (match) => {
          clockIdx += 1;
          if (clockIdx === 1) return depart;
          if (clockIdx === 2 && arrive) return arrive;
          return match;
        });
      }
      return {
        ...a,
        arrivalTime: depart,
        departureTime: arrive ?? a.departureTime,
        description,
      };
    });

  return {
    morning: patch(activities.morning),
    afternoon: patch(activities.afternoon),
    evening: patch(activities.evening),
  };
}

/** Prompt fragment: force Gemini to use selected boarding-pass local times. */
export function flightContextPromptBlock(
  flights: TripFlightContext,
  totalDays: number,
  opts?: { originIata?: string; destinationIata?: string; language?: string },
): string {
  const payload = buildFlightSchedulingPayload(flights, totalDays);
  const scheduling = payload.flightScheduling as Record<string, string>;
  const slo = !(opts?.language && !opts.language.startsWith("sl"));
  const arriveLabel = formatArrivalTime(flights, slo);
  const origin = opts?.originIata?.toUpperCase() ?? "EU";
  const dest = opts?.destinationIata?.toUpperCase() ?? "DEST";

  const lines = [
    "",
    slo
      ? "IZBRANI LET (OBVEZNO — ure z letalske kartice, NE IZMIŠLJUJ drugih ur):"
      : "SELECTED FLIGHT (MANDATORY — use boarding-pass local times, do NOT invent others):",
    slo
      ? `- Odhod z ${origin}: ${flights.outboundDepart} (lokalni čas odhoda).`
      : `- Depart ${origin}: ${flights.outboundDepart} (local departure time).`,
    slo
      ? `- Prihod na ${dest}: ${arriveLabel}.`
      : `- Arrive ${dest}: ${arriveLabel}.`,
  ];

  if (flights.inboundDepart) {
    lines.push(
      slo
        ? `- Povratek: odhod ${flights.inboundDepart} z ${dest}, prihod ${flights.inboundArrive ?? "—"} na ${origin} (lokalni časi).`
        : `- Return: depart ${flights.inboundDepart} from ${dest}, arrive ${flights.inboundArrive ?? "—"} at ${origin} (local times).`,
      slo
        ? `- trip_metadata.return_flight_eu.departure_time = "${flights.inboundDepart}", arrival_time_eu = "${flights.inboundArrive ?? ""}", from_airport = "${dest}", to_airport = "${origin}".`
        : `- Fill trip_metadata.return_flight_eu with departure_time="${flights.inboundDepart}", arrival_time_eu="${flights.inboundArrive ?? ""}".`,
    );
    if (flights.inboundStops != null && flights.inboundStops > 0) {
      lines.push(
        slo
          ? `- Povratek NI direktni: ${flights.inboundStops} postanek(ov)${flights.inboundVia ? ` prek ${flights.inboundVia}` : ""}. V summary PREPOVEDANO napisati "direct"/"direktni".`
          : `- Return is NOT direct: ${flights.inboundStops} stop(s)${flights.inboundVia ? ` via ${flights.inboundVia}` : ""}. Summary must NOT say "direct"/"nonstop".`,
      );
    } else if (flights.inboundStops == null) {
      lines.push(
        slo
          ? `- Če nisi prepričan o postankih, v summary NE trdi "direktni let" (HKT/BKK↔EU skoraj nikoli ni nonstop).`
          : `- If unsure about stops, do NOT claim "direct" in summary (HKT/BKK↔EU is almost never nonstop).`,
      );
    }
  }

  for (const [key, value] of Object.entries(scheduling)) {
    lines.push(`- ${key}: ${value}`);
  }

  lines.push(
    slo
      ? `- PRIORITETA NAD “polnim dnem”: na dan prihoda in odhoda so prazni sloti PRED/ZA letom OBVEZNI. PREPOVEDANO: zajtrk, siesta, plaža, “tropska pavza” ali dopoldanske aktivnosti na destinaciji, preden let pristane.`
      : `- PRIORITY OVER “full day”: empty slots before/after flights on arrival/departure days are REQUIRED. FORBIDDEN: breakfast, siesta, beach, or morning destination activities before the plane lands.`,
  );

  return lines.join("\n");
}

/** Replace invented HH:MM (e.g. 12:00) in arrival activities with real outboundArrive. */
function patchArrivalActivityClockTimes(
  activities: NonNullable<DayPlan["activities"]>,
  flights: TripFlightContext,
): NonNullable<DayPlan["activities"]> {
  const land = flights.outboundArrive;
  const patchList = (list: Activity[] | undefined): Activity[] =>
    (list ?? []).map((a) => {
      const blob = `${a.name} ${a.description ?? ""} ${a.type ?? ""}`.toLowerCase();
      const isAirport =
        /letališč|airport|prihod|pristane|landing|transfer|check-?in|hotel|prtljag/i.test(blob);
      if (!isAirport) return a;
      let description = a.description;
      if (description) {
        // Rewrite "pristane ob 12:00" → real land time (first clock in airport copy).
        let replaced = false;
        description = description.replace(/\b\d{1,2}:\d{2}\b/g, (match) => {
          if (!replaced) {
            replaced = true;
            return land;
          }
          return match;
        });
        description = description.replace(
          /ob\s+\d{1,2}:\d{2}/gi,
          `ob ${land}`,
        );
      }
      return {
        ...a,
        arrivalTime: land,
        departureTime: a.departureTime ?? land,
        description,
      };
    });

  return {
    morning: patchList(activities.morning),
    afternoon: patchList(activities.afternoon),
    evening: patchList(activities.evening),
  };
}

function patchArrivalDayTitle(title: string | undefined, flights: TripFlightContext, slo: boolean): string {
  const t = title?.trim() ?? "";
  const land = flights.outboundArrive;
  if (!t) {
    return slo ? `Prihod (${land}) in namestitev` : `Arrival (${land}) and check-in`;
  }
  // Drop misleading “sproščanje na Patong Beach” style titles that ignore landing time.
  if (/patong|plaž|beach|sprošč/i.test(t) && parseHmSafe(land) >= 17 * 60) {
    return slo
      ? `Prihod ob ${land} in namestitev`
      : `Arrival at ${land} and check-in`;
  }
  return t;
}

function parseHmSafe(hm: string): number {
  const m = hm.trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Safety net after Gemini stream/catalog: rewrite day 1 / last day around real flight times.
 */
export function applyFlightContextToGeminiPlan(
  plan: AiTripPlan,
  flights: TripFlightContext,
  opts?: { originIata?: string; language?: string },
): void {
  const totalDays = plan.days.length;
  if (!totalDays) return;

  const lang = opts?.language ?? "sl";
  const locale = resolveTripLocale(
    plan.destinationIata ?? "",
    plan.destinationName,
    lang,
  );
  const arrivalDay = arrivalTripDay(flights);
  const originIata = opts?.originIata ?? plan.originIata;

  if (flights.inboundDepart && flights.inboundArrive) {
    const fromAirport = (plan.destinationIata ?? "DEST").toUpperCase();
    const toAirport = (originIata ?? "EU").toUpperCase();
    plan.returnFlightEu = {
      departureTime: flights.inboundDepart,
      arrivalTimeEu: flights.inboundArrive,
      fromAirport,
      toAirport,
      summary: buildReturnFlightSummary({
        fromIata: fromAirport,
        toIata: toAirport,
        language: lang,
        stops: flights.inboundStops,
        via: flights.inboundVia,
        depart: flights.inboundDepart,
        arrive: flights.inboundArrive,
      }),
    };
  }

  for (const day of plan.days) {
    if (isInFlightTripDay(day.day, flights)) {
      day.inFlightDay = true;
      day.category = "transport";
      const flightAct: Activity = {
        name: locale.slo ? "Mednarodni let" : "International flight",
        type: "TRANSPORT",
        description: locale.slo
          ? `Še v letu proti destinaciji — dan ${day.day} od ${totalDays}. Po pristanku (dan ${arrivalDay}, ${formatArrivalTime(flights, locale.slo)}) sledi check-in.`
          : `Still en route — day ${day.day} of ${totalDays}. Landing day ${arrivalDay} at ${formatArrivalTime(flights, false)}; then check-in.`,
        arrivalTime: flights.outboundDepart,
        departureTime: flights.outboundArrive,
      };
      const originActs =
        day.day === 1 && originIata && flights.outboundDepart
          ? buildOriginDepartureLogistics(originIata, flights, lang).map(logisticsToActivity)
          : [];
      if (day.day === 1 && originIata) {
        const hint = buildOriginDepartureHint(originIata, flights, lang);
        if (hint) day.travelHack = hint;
      }
      // Wipe Gemini junk (Phuket breakfast + Munich airport mixed into one day).
      day.activities = {
        morning: [...originActs, flightAct].slice(0, 4),
        afternoon: [],
        evening: [],
      };
      // Clear legacy slot strings — AiPlanDayCard used to fall back to these.
      day.morning = "";
      day.afternoon = "";
      day.evening = "";
      day.mapPins = [];
      day.transportation = undefined;
      day.title = locale.slo
        ? `Odhod${originIata ? ` iz ${originIata}` : ""} / mednarodni let`
        : `Departure${originIata ? ` from ${originIata}` : ""} / international flight`;
      if (originIata) {
        const hub = lookupDestination(originIata);
        if (hub) {
          day.city = hub.name;
          day.focusName = hub.name;
          day.lat = hub.lat;
          day.lng = hub.lng;
        } else {
          day.city = originIata;
          day.focusName = originIata;
        }
      }
      continue;
    }

    if (day.day === arrivalDay) {
      const logistics = buildArrivalLogistics(day.city || plan.destinationName, flights, locale, {
        accommodationMode: plan.accommodationMode,
      });
      let activities = mergeArrivalDay(day, flights, logistics) ?? {
        morning: [],
        afternoon: [],
        evening: [],
      };

      if (day.day === 1 && originIata && flights.outboundDepart) {
        const originActs = buildOriginDepartureLogistics(originIata, flights, lang).map(
          logisticsToActivity,
        );
        activities = {
          ...activities,
          morning: [...originActs, ...(activities.morning ?? [])].slice(0, 5),
        };
        const hint = buildOriginDepartureHint(originIata, flights, lang);
        if (hint && !day.travelHack?.includes(flights.outboundDepart)) {
          day.travelHack = day.travelHack ? `${hint} ${day.travelHack}` : hint;
        }
      }

      // Same-day evening arrival: keep only origin-airport morning logistics, never destination fillers.
      if (arrivalDaySlot(flights) === "evening") {
        activities = {
          morning: (activities.morning ?? []).filter((a) => !isPreLandingDestinationFiller(a)),
          afternoon: [],
          evening: activities.evening ?? [],
        };
      } else if (arrivalDaySlot(flights) === "afternoon") {
        activities = {
          morning: (activities.morning ?? []).filter((a) => !isPreLandingDestinationFiller(a)),
          afternoon: activities.afternoon ?? [],
          evening: (activities.evening ?? []).filter((a) => !isPreLandingDestinationFiller(a)),
        };
      }

      // Nuke Gemini-invented landing times (e.g. 12:00) — boarding-pass time wins.
      day.activities = patchArrivalActivityClockTimes(activities, flights);
      day.title = patchArrivalDayTitle(day.title, flights, locale.slo);
      day.morning = "";
      day.afternoon = "";
      day.evening = "";
      day.mapPins = (day.mapPins ?? []).filter((pin) => {
        const blob = `${pin.name ?? ""} ${pin.description ?? ""}`.toLowerCase();
        return !/zajtrk|breakfast|siesta|tropska|bazen|promenad/i.test(blob);
      });
      day.inFlightDay = false;
      continue;
    }

    if (day.day === totalDays && flights.inboundDepart) {
      if (isOvernightDeparture(flights)) {
        day.inFlightDay = true;
        day.category = "transport";
      }
      const logistics = buildDepartureLogistics(day.city || plan.destinationName, flights, locale, {
        accommodationMode: plan.accommodationMode,
      });
      const merged = mergeDepartureDay(day, flights, logistics) ?? {
        morning: [],
        afternoon: [],
        evening: [],
      };
      day.activities = patchAirportActivityTimes(
        merged,
        flights.inboundDepart,
        flights.inboundArrive,
      );
    }
  }
}
