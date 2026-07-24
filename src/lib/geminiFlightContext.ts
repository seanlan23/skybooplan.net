import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  isFlightRangeActivity,
  isPointInTimeActivity,
  normalizeActivityClocks,
} from "@/lib/activityTime";
import {
  arrivalDaySlot,
  arrivalTripDay,
  buildArrivalLogistics,
  buildDepartureLogistics,
  buildFlightSchedulingPayload,
  buildOriginDepartureHint,
  buildOriginDepartureLogistics,
  formatArrivalTimeShort,
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
import {
  dedupePlanDaysByNumber,
  planCalendarDayCount,
} from "@/lib/geminiPlanMap";
import { repairPlanDaySequence } from "@/lib/daySequence";
import { scrubImpossibleIslandDayTrips } from "@/lib/islandHopGuard";
import { planLangCopy } from "@/lib/planLangCopy";
import { buildReturnFlightSummary } from "@/lib/returnFlightSummary";
import { resolveTripLocale } from "@/lib/tripLocale";
import { stripArrivalLabelSpam } from "@/lib/textSanitize";

function logisticsToActivity(a: LogisticsActivity): Activity {
  const isIntlFlight =
    /\b(mednarodni (povratni )?let|international return flight|volo internazionale|internationaler rückflug)\b/i.test(
      a.name,
    );
  return {
    name: a.name,
    type: a.type,
    description: a.description,
    priceLabel: a.priceLabel,
    ...(isIntlFlight ? { transportType: "flight" as const } : {}),
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

function normalizeCityToken(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Loose city match for hub-hop detection (Krabi ≠ Bangkok). */
function cityNamesMatch(a: string, b: string): boolean {
  const left = normalizeCityToken(a);
  const right = normalizeCityToken(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
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

function hmFromMinutes(totalMin: number): string {
  const m = ((Math.round(totalMin) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Departure-day clocks: checkout → transfer → airport (single clocks before depart),
 * then international flight alone may use depart→arrive (overnight +1 OK).
 */
function patchAirportActivityTimes(
  activities: NonNullable<DayPlan["activities"]>,
  depart: string,
  arrive?: string,
): NonNullable<DayPlan["activities"]> {
  const depMin = parseHmSafe(depart);
  const checkoutAt = hmFromMinutes(depMin - 4 * 60);
  const transferAt = hmFromMinutes(depMin - 3.5 * 60);
  const airportAt = hmFromMinutes(depMin - 3 * 60);

  const patch = (list: Activity[] | undefined): Activity[] =>
    (list ?? []).map((a) => {
      const blob = `${a.name} ${a.description ?? ""} ${a.type ?? ""}`.toLowerCase();
      const isIntlFlight =
        (a.transportType === "flight" ||
          isFlightRangeActivity(a) ||
          /\b(mednarodni (povratni )?let|international (return )?flight|volo internazionale|internationaler rückflug|vuelo internacional|vol international)\b/i.test(
            a.name,
          )) &&
        !/transfer|check-?out|check-?in(?!.*flight)|grab|taxi/i.test(a.name);

      let description = a.description;
      if (description && /airport|letališč|odlet|povratek|return|flight|check-?out|prevoz|transfer/i.test(blob)) {
        let clockIdx = 0;
        description = description.replace(/\b\d{1,2}:\d{2}\b/g, (match) => {
          clockIdx += 1;
          if (isIntlFlight) {
            if (clockIdx === 1) return depart;
            if (clockIdx === 2 && arrive) return arrive;
            return match;
          }
          if (clockIdx === 1) {
            if (/check-?out|odhod iz hotela|hotel check-out|vrnitev avtodoma/i.test(blob)) {
              return checkoutAt;
            }
            if (/prevoz|transfer|flughafentransfer/i.test(blob)) return transferAt;
            return airportAt;
          }
          return match;
        });
        description = stripArrivalLabelSpam(description);
      }

      if (isIntlFlight) {
        return normalizeActivityClocks({
          ...a,
          arrivalTime: depart,
          departureTime: arrive ?? undefined,
          description,
          transportType: a.transportType ?? "flight",
        });
      }

      // Order matters: transfer before generic “airport + security” (transfer tips mention security).
      if (/check-?out|odhod iz hotela|hotel check-out|vrnitev avtodoma/i.test(a.name)) {
        return normalizeActivityClocks({
          ...a,
          arrivalTime: checkoutAt,
          departureTime: undefined,
          description,
        });
      }

      if (/prevoz na letališč|airport transfer|flughafentransfer|transfer in aeroporto|traslado al aeropuerto|transfert aéroport/i.test(a.name)) {
        return normalizeActivityClocks({
          ...a,
          arrivalTime: transferAt,
          departureTime: undefined,
          description,
        });
      }

      // Airport gate / check-in — single clock before departure (never overnight +1).
      if (
        /prihod na letališče|airport arrival|airport check-in|check-in e (controlli|sicurezza)|ankunft am flughafen|check-in in aeroporto|check-in en el aeropuerto|enregistrement à l'aéroport/i.test(
          a.name,
        ) ||
        (/check-?in|security|varnostni|controlli/i.test(a.name) &&
          /letališč|airport|flughafen|aeroporto|aéroport/i.test(a.name))
      ) {
        return normalizeActivityClocks({
          ...a,
          arrivalTime: airportAt,
          departureTime: undefined,
          description,
        });
      }

      if (!/airport|letališč|odlet|povratek|return|flight home|mednarodn|check-?out|prevoz|transfer/i.test(blob)) {
        return normalizeActivityClocks(a);
      }

      // Fallback logistics: single pre-depart clock — never copy overnight arrive onto checkout.
      return normalizeActivityClocks({
        ...a,
        arrivalTime: airportAt,
        departureTime: undefined,
        description,
      });
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
  const arriveLabel = formatArrivalTimeShort(flights, slo);
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
      ? `- Prihod na ${dest}: ${arriveLabel}. Dolgo “(+N dan od odhoda…)” napiši NAJVEČ enkrat v day title — ne v vsaki aktivnosti.`
      : `- Arrive ${dest}: ${arriveLabel}. Put the long “(+N day from departure…)” note at most once in the day title — not on every activity.`,
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
    slo
      ? `- URE: na dan 1 je prihod na odhodno letališče = odhod − buffer (ne ura pristanka). Na zadnjem dnevu: check-out < transfer < letališče < let; samo mednarodni let sme imeti okno čez noč (npr. 18:10–06:00 +1).`
      : `- CLOCKS: day-1 origin airport arrive = depart − buffer (never destination land time). Last day: checkout < transfer < airport < flight; only the international flight may show an overnight window (e.g. 18:10–06:00 +1).`,
    slo
      ? `- GEO: nikoli enodnevni izlet med nedosežnimi PH otoki (npr. Boracay ↔ Malapascua). Ostani na lokalnih plažah/otokih tega dne.`
      : `- GEO: never schedule same-day hops between non-adjacent PH islands (e.g. Boracay ↔ Malapascua). Keep local beaches/islands for that day.`,
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
      // Never rewrite origin-airport departure logistics (same-day arrival day 1).
      if (
        /odhod:\s|domačega letališča|home airport|parkvia|parkos|m\+r\b|p\+r\b/i.test(blob) ||
        (/check-in in varnostni pregled|security screening/i.test(a.name) &&
          !/prihod na letališč|airport arrival|pristane|lands?\b/i.test(blob))
      ) {
        return normalizeActivityClocks(a);
      }
      const isAirport =
        /letališč|airport|prihod|pristane|landing|transfer|check-?in|hotel|prtljag/i.test(blob);
      if (!isAirport) return normalizeActivityClocks(a);
      let description = a.description;
      if (description) {
        // Rewrite first landing clock only — do not blanket-replace every "ob HH:MM".
        let replaced = false;
        description = description.replace(/\b\d{1,2}:\d{2}\b/g, (match) => {
          if (!replaced) {
            replaced = true;
            return land;
          }
          return match;
        });
        description = stripArrivalLabelSpam(description);
      }

      // Landing / check-in: single land clock. Transfer may keep a short forward window.
      if (isPointInTimeActivity(a) || /prihod na letališč|airport arrival|check-?in/i.test(a.name)) {
        return normalizeActivityClocks({
          ...a,
          arrivalTime: land,
          departureTime: undefined,
          description,
        });
      }

      const end = a.departureTime?.trim();
      const endMin = end ? (() => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(end);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      })() : null;
      const landMin = (() => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(land);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      })();
      const keepEnd =
        end &&
        endMin != null &&
        landMin != null &&
        endMin > landMin &&
        endMin - landMin <= 180;

      return normalizeActivityClocks({
        ...a,
        arrivalTime: land,
        departureTime: keepEnd ? end : undefined,
        description,
      });
    });

  return {
    morning: patchList(activities.morning),
    afternoon: patchList(activities.afternoon),
    evening: patchList(activities.evening),
  };
}

function normalizeDayActivityClocks(day: DayPlan): void {
  if (!day.activities) return;
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    const list = day.activities[slot];
    if (!list) continue;
    day.activities[slot] = list.map((a) => {
      const next = normalizeActivityClocks({ ...a });
      if (next.description) next.description = stripArrivalLabelSpam(next.description);
      return next;
    });
  }
}

function patchArrivalDayTitle(
  title: string | undefined,
  flights: TripFlightContext,
  langCode: string,
): string {
  const t = title?.trim() ?? "";
  const land = flights.outboundArrive;
  if (!t) {
    return planLangCopy(langCode, {
      sl: `Prihod (${land}) in namestitev`,
      en: `Arrival (${land}) and check-in`,
      de: `Ankunft (${land}) und Check-in`,
      it: `Arrivo (${land}) e check-in`,
      es: `Llegada (${land}) y check-in`,
      fr: `Arrivée (${land}) et check-in`,
    });
  }
  // Drop misleading “sproščanje na Patong Beach” style titles that ignore landing time.
  if (/patong|plaž|beach|sprošč/i.test(t) && parseHmSafe(land) >= 17 * 60) {
    return planLangCopy(langCode, {
      sl: `Prihod ob ${land} in namestitev`,
      en: `Arrival at ${land} and check-in`,
      de: `Ankunft um ${land} und Check-in`,
      it: `Arrivo alle ${land} e check-in`,
      es: `Llegada a las ${land} y check-in`,
      fr: `Arrivée à ${land} et check-in`,
    });
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
  const lang = opts?.language ?? "sl";
  plan.days = dedupePlanDaysByNumber(plan.days);
  repairPlanDaySequence(plan, { language: lang });
  const totalDays = planCalendarDayCount(plan.days);
  if (!totalDays) return;

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
      const arriveShort = formatArrivalTimeShort(flights, lang);
      const flightAct: Activity = {
        name: planLangCopy(lang, {
          sl: "Mednarodni let",
          en: "International flight",
          de: "Internationaler Flug",
          es: "Vuelo internacional",
          fr: "Vol international",
          it: "Volo internazionale",
        }),
        type: "TRANSPORT",
        transportType: "flight",
        description: planLangCopy(lang, {
          sl: `Še v letu proti destinaciji — dan ${day.day} od ${totalDays}. Po pristanku (dan ${arrivalDay}, ${arriveShort}) sledi check-in.`,
          en: `Still en route — day ${day.day} of ${totalDays}. Landing day ${arrivalDay} at ${arriveShort}; then check-in.`,
          de: `Noch im Flug — Tag ${day.day} von ${totalDays}. Landung an Tag ${arrivalDay} um ${arriveShort}; danach Check-in.`,
          it: `Ancora in volo — giorno ${day.day} di ${totalDays}. Atterraggio il giorno ${arrivalDay} alle ${arriveShort}; poi check-in.`,
          es: `Aún en vuelo — día ${day.day} de ${totalDays}. Aterrizaje el día ${arrivalDay} a las ${arriveShort}; luego check-in.`,
          fr: `Toujours en vol — jour ${day.day} sur ${totalDays}. Atterrissage le jour ${arrivalDay} à ${arriveShort}; puis check-in.`,
        }),
        // Window start = depart, end = arrive (formatActivityClockLabel overnight +1).
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
      day.title = planLangCopy(lang, {
        sl: `Odhod${originIata ? ` iz ${originIata}` : ""} / mednarodni let`,
        en: `Departure${originIata ? ` from ${originIata}` : ""} / international flight`,
        de: `Abflug${originIata ? ` von ${originIata}` : ""} / internationaler Flug`,
        es: `Salida${originIata ? ` desde ${originIata}` : ""} / vuelo internacional`,
        fr: `Départ${originIata ? ` de ${originIata}` : ""} / vol international`,
        it: `Partenza${originIata ? ` da ${originIata}` : ""} / volo internazionale`,
      });
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
      day.title = patchArrivalDayTitle(day.title, flights, lang);
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
      const prevDay = [...plan.days]
        .reverse()
        .find((d) => d.day < totalDays && !d.inFlightDay);
      const prevCity = (prevDay?.city || prevDay?.focusName || "").trim();
      // Prefer destination hub over a stale island city (e.g. Krabi on BKK departure day).
      const destHub = plan.destinationIata
        ? lookupDestination(plan.destinationIata)
        : undefined;
      const hubName = destHub?.name?.trim();
      const needsHubHop = Boolean(
        hubName &&
          prevCity &&
          !cityNamesMatch(prevCity, hubName) &&
          !cityNamesMatch(prevCity, plan.destinationName ?? ""),
      );
      if (hubName) {
        day.city = hubName;
        day.focusName = hubName;
        day.title = needsHubHop
          ? planLangCopy(lang, {
              sl: `Prevoz v ${hubName} in mednarodni odhod`,
              en: `Transfer to ${hubName} and international departure`,
              de: `Transfer nach ${hubName} und internationaler Abflug`,
              it: `Transfer a ${hubName} e partenza internazionale`,
              es: `Traslado a ${hubName} y salida internacional`,
              fr: `Transfert vers ${hubName} et départ international`,
            })
          : planLangCopy(lang, {
              sl: `Odhod iz ${hubName} / mednarodni let`,
              en: `Departure from ${hubName} / international flight`,
              de: `Abflug von ${hubName} / internationaler Flug`,
              it: `Partenza da ${hubName} / volo internazionale`,
              es: `Salida desde ${hubName} / vuelo internacional`,
              fr: `Départ de ${hubName} / vol international`,
            });
        if (destHub?.lat != null && destHub?.lng != null) {
          day.lat = destHub.lat;
          day.lng = destHub.lng;
        }
      }
      const logistics = buildDepartureLogistics(day.city || plan.destinationName, flights, locale, {
        accommodationMode: plan.accommodationMode,
      });
      const merged = mergeDepartureDay(day, flights, logistics) ?? {
        morning: [],
        afternoon: [],
        evening: [],
      };
      if (needsHubHop && hubName && prevCity) {
        const hop: Activity = {
          name: planLangCopy(lang, {
            sl: `Notranji prevoz ${prevCity} → ${hubName}`,
            en: `Domestic transfer ${prevCity} → ${hubName}`,
            de: `Inlands-Transfer ${prevCity} → ${hubName}`,
            it: `Transfer interno ${prevCity} → ${hubName}`,
            es: `Traslado doméstico ${prevCity} → ${hubName}`,
            fr: `Transfert intérieur ${prevCity} → ${hubName}`,
          }),
          type: "TRANSPORT",
          description: planLangCopy(lang, {
            sl: `Pred mednarodnim odhodom ob ${flights.inboundDepart} se vrneš v ${hubName} (ne ostani v ${prevCity}). Računaj na notranji let ali dolg transfer — rezerviraj vnaprej.`,
            en: `Before the international departure at ${flights.inboundDepart}, return to ${hubName} (do not stay in ${prevCity}). Budget a domestic flight or long transfer — book ahead.`,
            de: `Vor dem internationalen Abflug um ${flights.inboundDepart} zurück nach ${hubName} (nicht in ${prevCity} bleiben). Plane einen Inlandsflug oder langen Transfer — im Voraus buchen.`,
            it: `Prima della partenza internazionale alle ${flights.inboundDepart} torna a ${hubName} (non restare a ${prevCity}). Previsto un volo interno o un lungo transfer — prenota in anticipo.`,
            es: `Antes de la salida internacional a las ${flights.inboundDepart} vuelve a ${hubName} (no te quedes en ${prevCity}). Cuenta con un vuelo doméstico o un traslado largo — reserva con antelación.`,
            fr: `Avant le départ international à ${flights.inboundDepart}, retournez à ${hubName} (ne restez pas à ${prevCity}). Prévoyez un vol intérieur ou un long transfert — réservez à l'avance.`,
          }),
        };
        merged.morning = [hop, ...(merged.morning ?? [])].slice(0, 4);
      }
      day.activities = patchAirportActivityTimes(
        merged,
        flights.inboundDepart,
        flights.inboundArrive,
      );
    }

    normalizeDayActivityClocks(day);
  }

  scrubImpossibleIslandDayTrips(plan, lang);
}
