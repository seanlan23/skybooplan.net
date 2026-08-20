import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  clearActivityStructuredClocks,
  isFlightRangeActivity,
  normalizeActivityClocks,
  stripProseClocksExcept,
} from "@/lib/activityTime";
import {
  arrivalDaySlot,
  arrivalTripDay,
  ARRIVAL_HOTEL_OFFSET_MIN,
  ARRIVAL_TRANSFER_OFFSET_MIN,
  addHmMinutes,
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
  departureLogisticsOffsetsMin,
  originAirportLeadHours,
  type LogisticsActivity,
  type TripFlightContext,
} from "@/lib/flightScheduling";
import { lookupDestination } from "@/lib/destinationCoords";
import { haversineKm } from "@/lib/geoMath";
import {
  dedupePlanDaysByNumber,
  planCalendarDayCount,
} from "@/lib/geminiPlanMap";
import { repairPlanDaySequence, resyncPlanDayDates } from "@/lib/daySequence";
import { scrubImpossibleIslandDayTrips } from "@/lib/islandHopGuard";
import { normalizePlanLangCode } from "@/lib/planLanguages";
import { planLangCopy } from "@/lib/planLangCopy";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { buildReturnFlightSummary } from "@/lib/returnFlightSummary";
import { resolveTripLocale } from "@/lib/tripLocale";
import { applyItineraryGuards } from "@/lib/itineraryGuards";
import { stripArrivalLabelSpam } from "@/lib/textSanitize";

/** Same-day ground/rail return to ticket hub (Lyon→Paris). Never LA→NY “budget transfer”. */
const MAX_SAME_DAY_GROUND_HUB_HOP_KM = 750;
/** Morning international boards leave no time for a 4h Shinkansen + NRT check-in. */
const MAX_MORNING_GROUND_HUB_HOP_KM = 220;
const MORNING_INBOUND_HOUR = 14;

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

/** Morning-only pad — never dump this into arrival evening (NYC 16:40 “kava pred ogledom”). */
export function isMorningOnlyFiller(a: { name?: string; description?: string }): boolean {
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  return /jutranji sprehod|kava pred ogledom|morning walk|morning stroll|coffee before|pred glavnim ogledom dopoldan|orientation before (the )?main morning/i.test(
    t,
  );
}

/** Beach breakfast / siesta / pool — nonsense before the plane has landed. */
function isPreLandingDestinationFiller(a: Activity): boolean {
  const t = `${a.name} ${a.description ?? ""} ${a.type ?? ""}`.toLowerCase();
  if (/letališč|airport|transfer|check-?in|odhod|mednarodn|\blet\b|flight/i.test(t)) {
    return false;
  }
  if (isMorningOnlyFiller(a)) return true;
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

function dayBlob(day: DayPlan): string {
  return [
    day.title,
    day.city,
    day.focusName,
    day.morning,
    day.afternoon,
    day.evening,
    ...flattenDayActivities(day).map((a) => `${a.name} ${a.description ?? ""}`),
  ]
    .filter(Boolean)
    .join(" ");
}

/** True when a prior day already returned to the international hub (e.g. TGV Lyon→Paris). */
function alreadyReturnedToHub(day: DayPlan, hubName: string): boolean {
  if (cityNamesMatch(day.city ?? "", hubName) || cityNamesMatch(day.focusName ?? "", hubName)) {
    return true;
  }
  const blob = dayBlob(day);
  const hub = normalizeCityToken(hubName);
  if (!hub || !normalizeCityToken(blob).includes(hub)) return false;
  return /\b(tgv|train|vlak|rail|ferrovia|zug|high-?speed|intercit[eé]|thalys|ouigo)\b/i.test(
    blob,
  );
}

/**
 * City overnighting before the international departure day.
 * Only the last stay day counts — an early hub visit (Bangkok day 2) must not
 * cancel a later island/city hop back (Krabi → BKK).
 */
function resolveCityBeforeDeparture(
  plan: AiTripPlan,
  totalDays: number,
  hubName: string,
): { stayCity: string; alreadyAtHub: boolean } {
  const prev = [...plan.days]
    .filter((d) => d.day < totalDays)
    .sort((a, b) => b.day - a.day)[0];
  if (!prev) return { stayCity: "", alreadyAtHub: false };

  // Last day already back at hub, or stale city (still "Lyon") but TGV/train to hub in content.
  if (hubName && alreadyReturnedToHub(prev, hubName)) {
    return { stayCity: hubName, alreadyAtHub: true };
  }
  const stayCity = (prev.city || prev.focusName || "").trim();
  return {
    stayCity,
    alreadyAtHub: Boolean(hubName && stayCity && cityNamesMatch(stayCity, hubName)),
  };
}

/** Same-country EU hops (Lyon→Paris) are trains — never invent a domestic flight. */
function preferRailHubHop(fromCity: string, hubName: string, destinationIata?: string): boolean {
  const hub = lookupDestination(destinationIata ?? "");
  const country = hub?.country?.toUpperCase() ?? "";
  if (!country || !["FR", "DE", "IT", "ES", "NL", "BE", "CH", "AT"].includes(country)) {
    return false;
  }
  const blob = `${fromCity} ${hubName}`.toLowerCase();
  // Classic rail corridors / short domestic returns.
  if (country === "FR") return true;
  if (/lyon|paris|marseille|nice|bordeaux|lille|munich|berlin|frankfurt|rome|milan|madrid|barcelona|amsterdam|vienna|zurich/.test(blob)) {
    return true;
  }
  return false;
}

function resolveCityLatLng(city: string): { lat: number; lng: number } | null {
  const label = city.trim();
  if (!label) return null;
  const region = lookupRegionCoords(label);
  if (region) return region;
  // Fall back to known IATA hub cities by name (Bangkok, New York, …).
  const token = normalizeCityToken(label);
  for (const iata of [
    "BKK",
    "HKT",
    "KBV",
    "JFK",
    "LAX",
    "LAS",
    "CDG",
    "MUC",
    "FCO",
    "MXP",
    "YYZ",
    "YVR",
  ]) {
    const hub = lookupDestination(iata);
    if (hub && normalizeCityToken(hub.name) === token) {
      return { lat: hub.lat, lng: hub.lng };
    }
  }
  return null;
}

/** km between stay city and ticket hub, or null if unknown. */
function groundHubHopKm(fromCity: string, hubName: string): number | null {
  const from = resolveCityLatLng(fromCity);
  const to = resolveCityLatLng(hubName);
  if (!from || !to) return null;
  return haversineKm([from.lng, from.lat], [to.lng, to.lat]);
}

function inboundHour(inboundDepart?: string): number | null {
  const m = inboundDepart?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]);
}

function maxSameDayGroundHubHopKm(inboundDepart?: string): number {
  const hour = inboundHour(inboundDepart);
  if (hour != null && hour < MORNING_INBOUND_HOUR) return MAX_MORNING_GROUND_HUB_HOP_KM;
  return MAX_SAME_DAY_GROUND_HUB_HOP_KM;
}

/**
 * Same-day return to the international hub is only for short ground/rail hops.
 * Cross-country US (LA→NY) or other teleports must NOT invent a “budget transfer”.
 * Morning boards (e.g. 10:50 NRT) cannot include Hiroshima→Tokyo Shinkansen the same day.
 */
function isFeasibleSameDayGroundHubHop(
  fromCity: string,
  hubName: string,
  destinationIata?: string,
  inboundDepart?: string,
): boolean {
  const maxKm = maxSameDayGroundHubHopKm(inboundDepart);
  const km = groundHubHopKm(fromCity, hubName);
  if (km != null) return km <= maxKm;
  // Unknown coords: allow only classic EU rail corridors, and never before a morning board.
  if (maxKm <= MAX_MORNING_GROUND_HUB_HOP_KM) return false;
  return preferRailHubHop(fromCity, hubName, destinationIata);
}

/**
 * Long same-country returns by air (Vancouver→Toronto before YYZ→EU).
 * Not used for US open-jaw west-coast ends (LA with JFK ticket).
 */
function shouldInjectDomesticAirHubHop(
  fromCity: string,
  hubName: string,
  destinationIata?: string,
  inboundDepart?: string,
): boolean {
  const hub = lookupDestination(destinationIata ?? "");
  const country = hub?.country?.toUpperCase() ?? "";
  // Gateway-return countries (linear coast-to-coast / multi-city). Skip US open-jaw.
  if (!["CA", "TH", "AU", "BR", "IN", "JP", "CN"].includes(country)) return false;
  const maxKm = maxSameDayGroundHubHopKm(inboundDepart);
  const km = groundHubHopKm(fromCity, hubName);
  if (km == null) return true;
  if (km <= maxKm) return false;
  if (km > 5500) return false;
  return true;
}

/** Sights on flight days: no LLM clocks — code owns the schedule. */
function stripSightClocks(a: Activity): Activity {
  const cleared = clearActivityStructuredClocks({ ...a });
  if (cleared.description) {
    cleared.description = stripProseClocksExcept(cleared.description, []) ?? "";
  }
  return cleared;
}

function isGeminiCoveredArrivalLogistics(a: Activity): boolean {
  const name = a.name ?? "";
  const blob = `${name} ${a.description ?? ""}`;
  if (
    /airport|letališč|check-?in|check-?out|transfer|immigraz|baggage|prtljag|mednarodni\s*let|international\s*(return\s*)?flight/i.test(
      blob,
    )
  ) {
    return true;
  }
  return (
    /prevoz do (hotela|kampa|najema)|prihod v hotel|prihod v kamp|hotel arrival|arrival at camp|namestitev okoli/i.test(
      name,
    ) ||
    /rer b do centra|roissybus|airtrain \+|prevoz z letališča do/i.test(blob)
  );
}

/** Keep one land / transfer / hotel block on the arrival day — never copy into every slot. */
function keepFirstArrivalLogistics(
  activities: NonNullable<DayPlan["activities"]>,
): NonNullable<DayPlan["activities"]> {
  const seen = new Set<ArrivalLogisticsKind>();
  const keep = (list: Activity[]): Activity[] =>
    list.filter((a) => {
      const kind = classifyArrivalLogisticsActivity(a);
      if (kind === "other" || kind === "origin") return true;
      if (seen.has(kind)) return false;
      seen.add(kind);
      return true;
    });
  return {
    morning: keep(activities.morning ?? []),
    afternoon: keep(activities.afternoon ?? []),
    evening: keep(activities.evening ?? []),
  };
}

function mergeArrivalDay(
  day: DayPlan,
  flights: TripFlightContext,
  logistics: LogisticsActivity[],
): DayPlan["activities"] {
  const logisticsActs = logistics.map(logisticsToActivity);
  const sights = flattenDayActivities(day)
    .filter(
      (a) =>
        !isHeavyArrivalSight(a) &&
        !isPreLandingDestinationFiller(a) &&
        !isMorningOnlyFiller(a),
    )
    // Drop Gemini airport/transfer/hotel dupes — code logistics already cover them.
    // Slovenian names are "Prevoz do hotela" / "Prihod v hotel" (no English "transfer").
    .filter((a) => !isGeminiCoveredArrivalLogistics(a))
    .map(stripSightClocks);
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
  const sights = flattenDayActivities(day)
    .filter((a) => {
      const blob = `${a.name} ${a.description ?? ""}`;
      // Drop Gemini logistics leftovers (often one unformatted morning wall of text).
      // Include DE/FR/ES/IT return-flight labels (FRA→EZE: "Internationaler Rückflug" leaked into morning/afternoon).
      if (
        /airport|letališč|flughafen|aeroporto|aéroport|odlet|odhod|abflug|povratek|rückflug|flight home|return flight|check-?out|transfer|flughafentransfer|mednarodni\s*(povratni\s*)?let|international\s*(return\s*)?flight|internationaler\s*(rück)?flug|volo\s*(di\s*ritorno|internazionale)|vuelo\s*(de\s*regreso|internacional)|vol\s*(retour|international)|leave the hotel|bags at reception|head to (the )?airport|zaključi check-out/i.test(
          blob,
        )
      ) {
        return false;
      }
      // Mega narrative dumps belong to the LLM prose era — never keep as a "sight".
      if (blob.length > 420 && /breakfast|zajtrk|hotel|reception|recepcij/i.test(blob)) {
        return false;
      }
      return true;
    })
    .map(stripSightClocks);
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
function normalizeHmToken(hm: string): string {
  const m = hm.match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function patchAirportActivityTimes(
  activities: NonNullable<DayPlan["activities"]>,
  depart: string,
  arrive?: string,
  destIata?: string,
): NonNullable<DayPlan["activities"]> {
  const depMin = parseHmSafe(depart);
  const offsets = departureLogisticsOffsetsMin(destIata);
  const checkoutAt = hmFromMinutes(depMin - offsets.checkoutMin);
  const transferAt = hmFromMinutes(depMin - offsets.transferMin);
  const airportAt = hmFromMinutes(depMin - offsets.airportMin);
  const depNorm = normalizeHmToken(depart);
  const arrNorm = arrive ? normalizeHmToken(arrive) : "";

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
          const norm = normalizeHmToken(match);
          // Boarding-pass times in prose are sacred (leaveHint embeds "flight at 21:50").
          // Never rewrite them to checkout/transfer/airport slot clocks (MUC–JFK bug).
          if (norm && norm === depNorm) return depart;
          if (arrNorm && norm === arrNorm) return arrive!;

          if (isIntlFlight) {
            if (clockIdx === 1) return depart;
            if (clockIdx === 2 && arrive) return arrive;
            return match;
          }
          if (clockIdx === 1) {
            if (/check-?out|odhod iz hotela|hotel check-out|vrnitev avtodoma/i.test(blob)) {
              return checkoutAt;
            }
            if (/prevoz|transfer|flughafentransfer|transfert|traslado/i.test(blob)) {
              return transferAt;
            }
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
  const lang = normalizePlanLangCode(opts?.language);
  const arriveLabel = formatArrivalTimeShort(flights, lang);
  const origin = opts?.originIata?.toUpperCase() ?? "EU";
  const dest = opts?.destinationIata?.toUpperCase() ?? "DEST";
  const via = flights.inboundVia ? ` ${flights.inboundVia}` : "";

  const lines = [
    "",
    planLangCopy(lang, {
      sl: "IZBRANI LET (OBVEZNO — ure z letalske kartice, NE IZMIŠLJUJ drugih ur):",
      en: "SELECTED FLIGHT (MANDATORY — use boarding-pass local times, do NOT invent others):",
      de: "AUSGEWÄHLTER FLUG (PFLICHT — Boarding-Pass-Ortszeiten, KEINE anderen Zeiten erfinden):",
    }),
    planLangCopy(lang, {
      sl: `- Odhod z ${origin}: ${flights.outboundDepart} (lokalni čas odhoda).`,
      en: `- Depart ${origin}: ${flights.outboundDepart} (local departure time).`,
      de: `- Abflug ${origin}: ${flights.outboundDepart} (lokale Abflugzeit).`,
    }),
    planLangCopy(lang, {
      sl: `- Prihod na ${dest}: ${arriveLabel}. Dolgo “(+N dan od odhoda…)” napiši NAJVEČ enkrat v day title — ne v vsaki aktivnosti.`,
      en: `- Arrive ${dest}: ${arriveLabel}. Put the long “(+N day from departure…)” note at most once in the day title — not on every activity.`,
      de: `- Ankunft ${dest}: ${arriveLabel}. Die lange „(+N Tag ab Abflug…)“-Notiz höchstens einmal im Day-Title — nicht bei jeder Aktivität.`,
    }),
  ];

  if (flights.inboundDepart) {
    lines.push(
      planLangCopy(lang, {
        sl: `- Povratek: odhod ${flights.inboundDepart} z ${dest}, prihod ${flights.inboundArrive ?? "—"} na ${origin} (lokalni časi).`,
        en: `- Return: depart ${flights.inboundDepart} from ${dest}, arrive ${flights.inboundArrive ?? "—"} at ${origin} (local times).`,
        de: `- Rückflug: Abflug ${flights.inboundDepart} von ${dest}, Ankunft ${flights.inboundArrive ?? "—"} in ${origin} (Ortszeiten).`,
      }),
      planLangCopy(lang, {
        sl: `- trip_metadata.return_flight_eu.departure_time = "${flights.inboundDepart}", arrival_time_eu = "${flights.inboundArrive ?? ""}", from_airport = "${dest}", to_airport = "${origin}".`,
        en: `- Fill trip_metadata.return_flight_eu with departure_time="${flights.inboundDepart}", arrival_time_eu="${flights.inboundArrive ?? ""}".`,
        de: `- trip_metadata.return_flight_eu mit departure_time="${flights.inboundDepart}", arrival_time_eu="${flights.inboundArrive ?? ""}", from_airport="${dest}", to_airport="${origin}" füllen.`,
      }),
    );
    if (flights.inboundStops != null && flights.inboundStops > 0) {
      lines.push(
        planLangCopy(lang, {
          sl: `- Povratek NI direktni: ${flights.inboundStops} postanek(ov)${flights.inboundVia ? ` prek${via}` : ""}. V summary PREPOVEDANO napisati "direct"/"direktni".`,
          en: `- Return is NOT direct: ${flights.inboundStops} stop(s)${flights.inboundVia ? ` via${via}` : ""}. Summary must NOT say "direct"/"nonstop".`,
          de: `- Rückflug ist NICHT direkt: ${flights.inboundStops} Stopp(s)${flights.inboundVia ? ` über${via}` : ""}. Summary darf NICHT "direct"/"nonstop" sagen.`,
        }),
      );
    } else if (flights.inboundStops == null) {
      lines.push(
        planLangCopy(lang, {
          sl: `- Če nisi prepričan o postankih, v summary NE trdi "direktni let" (HKT/BKK↔EU skoraj nikoli ni nonstop).`,
          en: `- If unsure about stops, do NOT claim "direct" in summary (HKT/BKK↔EU is almost never nonstop).`,
          de: `- Bei unsicheren Stops im Summary NICHT "Direktflug" behaupten (HKT/BKK↔EU fast nie nonstop).`,
        }),
      );
    }
  }

  for (const [key, value] of Object.entries(scheduling)) {
    lines.push(`- ${key}: ${value}`);
  }

  lines.push(
    planLangCopy(lang, {
      sl: `- PRIORITETA NAD “polnim dnem”: na dan prihoda in odhoda so prazni sloti PRED/ZA letom OBVEZNI. PREPOVEDANO: zajtrk, siesta, plaža, “tropska pavza” ali dopoldanske aktivnosti na destinaciji, preden let pristane.`,
      en: `- PRIORITY OVER “full day”: empty slots before/after flights on arrival/departure days are REQUIRED. FORBIDDEN: breakfast, siesta, beach, or morning destination activities before the plane lands.`,
      de: `- PRIORITÄT VOR „vollem Tag“: leere Slots VOR/NACH Flügen an Ankunfts-/Abflugtag sind PFLICHT. VERBOTEN: Frühstück, Siesta, Strand oder Vormittags-Aktivitäten am Ziel vor der Landung.`,
    }),
    planLangCopy(lang, {
      sl: `- URE (LAST KODE): NE izmišljuj HH:MM za check-out/transfer/letališče/mednarodni let — aplikacija jih vstavi. Na dan 1: prihod na odhodno letališče = odhod − buffer. Na zadnjem dnevu: check-out < transfer < letališče < let.`,
      en: `- CLOCKS (CODE-OWNED): do NOT invent HH:MM for checkout/transfer/airport/international flight — the app injects them. Day-1 origin airport = depart − buffer. Last day: checkout < transfer < airport < flight.`,
      de: `- UHRZEITEN (CODE): KEINE HH:MM für Check-out/Transfer/Flughafen/internationalen Flug erfinden — die App setzt sie. Tag 1: Ankunft Abflughafen = Abflug − Puffer. Letzter Tag: Check-out < Transfer < Flughafen < Flug.`,
    }),
    planLangCopy(lang, {
      sl: `- STROGI JSON (dan prihoda + zadnji dan): activities[] samo sightseeing/food/nature (title, bullets ali kratke "- " vrstice, category, timeSlot, coords). IZPUSTI arrivalTime/departureTime. IZPUSTI category airport, check-out, transfer, mednarodni let. PREPOVEDAN en dolg odstavek.`,
      en: `- STRICT JSON (arrival day + last day): activities[] = sightseeing/food/nature only (title, bullets or short "- " lines, category, timeSlot, coords). OMIT arrivalTime/departureTime. OMIT category airport, checkout, transfer, international flight rows. FORBIDDEN: one long unformatted paragraph.`,
      de: `- STRICT JSON (Ankunftstag + letzter Tag): activities[] nur sightseeing/food/nature (title, description, category, timeSlot, coords). arrivalTime/departureTime WEGLASSEN. Keine category airport / Check-out / Transfer / internationaler Flug.`,
    }),
    planLangCopy(lang, {
      sl: `- GEO: nikoli enodnevni izlet med nedosežnimi PH otoki (npr. Boracay ↔ Malapascua). Ostani na lokalnih plažah/otokih tega dne.`,
      en: `- GEO: never schedule same-day hops between non-adjacent PH islands (e.g. Boracay ↔ Malapascua). Keep local beaches/islands for that day.`,
      de: `- GEO: keine Same-Day-Hops zwischen nicht benachbarten PH-Inseln (z. B. Boracay ↔ Malapascua). Bleib bei lokalen Stränden/Inseln des Tages.`,
    }),
  );

  return lines.join("\n");
}

type ArrivalLogisticsKind = "land" | "transfer" | "hotel" | "origin" | "other";

/** Classify destination arrival logistics so clocks stay staggered (land < transfer < hotel). */
function classifyArrivalLogisticsActivity(a: Activity): ArrivalLogisticsKind {
  const name = a.name ?? "";
  const blob = `${name} ${a.description ?? ""} ${a.type ?? ""}`.toLowerCase();

  // Origin-airport departure logistics (same-day arrival day 1) — leave boarding-pass clocks.
  // Origin titles include IATA "(MUC)"; destination is bare "Airport arrival" / "Ankunft am Flughafen".
  if (
    /odhod:\s|departure:\s|abflug:\s|partenza:\s|salida:\s|départ\s*:/i.test(name) ||
    (/\([A-Z]{3}\)/.test(name) &&
      /airport|letališč|flughafen|aeroporto|aéroport/i.test(name)) ||
    /\b(international flight|mednarodni let|internationaler flug)\s*\([A-Z]{3}\)/i.test(name) ||
    /domačega letališča|home airport|parkvia|parkos|m\+r\b|p\+r\b/i.test(blob) ||
    (/check-in (in varnostni|and security)|security screening|sicherheitskontrolle|controlli di sicurezza/i.test(
      name,
    ) &&
      !/\b(pristane|lands?\b|airport arrival)\b/i.test(blob))
  ) {
    return "origin";
  }

  // Destination transfer before generic "check-in" (hotel name also contains check-in).
  if (
    /prevoz do hotela|transfer to hotel|transfer zum hotel|transfer all'hotel|traslado al hotel|transfert à l'hôtel|prevoz do najema|transfer to rv|wohnmobil|camping|campeggio|autocaravana|camping-car/i.test(
      name,
    )
  ) {
    return "transfer";
  }

  if (
    /^(prihod na letališče|airport arrival|ankunft am flughafen|arrivo in aeroporto|llegada al aeropuerto|arrivée à l'aéroport)\b/i.test(
      name,
    )
  ) {
    return "land";
  }

  if (
    a.type === "STAY" ||
    /check-in|osvežit|prihod v hotel|prihod v kamp|hotel arrival|arrival at camp|ankunft im hotel|ankunft auf dem camp|short rest|frisch machen|kurze pause|kratek odmor/i.test(name)
  ) {
    return "hotel";
  }

  if (/transfer|prevoz|traslado|transfert/i.test(name) && /hotel|camp|rv|avtodom|wohnmobil/i.test(blob)) {
    return "transfer";
  }

  if (/letališč|airport|pristan|landing|prtljag|baggage|immigraz/i.test(blob)) {
    return "land";
  }

  return "other";
}

/**
 * Boarding-pass land time wins over Gemini clocks, with fixed stagger:
 * land → transfer (+45m) → hotel check-in (+90m). Never pile all three on wheels-down.
 */
function patchArrivalActivityClockTimes(
  activities: NonNullable<DayPlan["activities"]>,
  flights: TripFlightContext,
): NonNullable<DayPlan["activities"]> {
  const land = flights.outboundArrive;
  const transferAt = addHmMinutes(land, ARRIVAL_TRANSFER_OFFSET_MIN);
  const hotelAt = addHmMinutes(land, ARRIVAL_HOTEL_OFFSET_MIN);

  const clockFor = (kind: ArrivalLogisticsKind): string | null => {
    if (kind === "land") return land;
    if (kind === "transfer") return transferAt;
    if (kind === "hotel") return hotelAt;
    return null;
  };

  const patchList = (list: Activity[] | undefined): Activity[] =>
    (list ?? []).map((a) => {
      const kind = classifyArrivalLogisticsActivity(a);
      if (kind === "origin" || kind === "other") {
        return normalizeActivityClocks(a);
      }
      const clock = clockFor(kind)!;
      let description = a.description;
      if (description) {
        // First HH:MM in prose follows this row's staggered clock (not always land).
        let replaced = false;
        description = description.replace(/\b\d{1,2}:\d{2}\b/g, (match) => {
          if (!replaced) {
            replaced = true;
            return clock;
          }
          return match;
        });
        description = stripArrivalLabelSpam(description);
      }
      return normalizeActivityClocks({
        ...a,
        arrivalTime: clock,
        departureTime: undefined,
        description,
      });
    });

  return {
    morning: patchList(activities.morning),
    afternoon: patchList(activities.afternoon),
    evening: patchList(activities.evening),
  };
}

/** True for code-built logistics rows (boarding-pass clocks allowed in prose). */
function isCodeLogisticsActivity(a: Activity): boolean {
  if (a.transportType === "flight" || isFlightRangeActivity(a)) return true;
  if (a.type === "STAY") return true;
  const name = a.name ?? "";
  return /check-?out|check-?in|prihod v hotel|prihod v kamp|hotel arrival|arrival at camp|ankunft im hotel|ankunft auf dem camp|airport transfer|prevoz na letališč|prevoz do hotela|transfer to hotel|transfer zum hotel|transfer all'hotel|traslado al hotel|transfert à l'hôtel|prevoz do najema|transfer to rv|flughafentransfer|prihod na letališče|arrive at .+ airport|airport arrival|ankunft am flughafen|arrivo in aeroporto|llegada al aeropuerto|arrivée à l'aéroport|international (return )?flight|mednarodni (povratni )?let|odhod:|departure:|abflug:|partenza:|salida:|security|varnostni|hotel check-out|vrnitev avtodoma|train |vlak |domestic (transfer|flight)|notranji (prevoz|let)|transfert|traslado/i.test(
    name,
  );
}

/**
 * Final lock: only logistics keep structured clocks + boarding-pass HH:MM in prose.
 * Gemini sightseeing leftovers lose all HH:MM so they cannot fight the schedule.
 */
/** Walk/museum leftovers must never keep boarding-pass ranges (FRA→EZE: Spaziergang @ 22:30). */
function isSightseeingNotFlight(a: Activity): boolean {
  const name = a.name ?? "";
  if (/\b(flug|flight|let|volo|vuelo|vol|rückflug|abflug)\b/i.test(name)) return false;
  return /spaziergang|stroll|walk|paseo|passeggiata|promenade|museum|friedhof|cemetery|park|plaza|caminito|letzter\s+spaziergang|last\s+(walk|stroll)|zadnji\s+sprehod/i.test(
    name,
  );
}

function lockCodeOwnedFlightDayClocks(
  activities: NonNullable<DayPlan["activities"]>,
  boardingPassTimes: string[],
): NonNullable<DayPlan["activities"]> {
  const board = boardingPassTimes.filter(Boolean);
  const patch = (list: Activity[] | undefined): Activity[] =>
    (list ?? []).map((a) => {
      if (isSightseeingNotFlight(a)) return stripSightClocks(a);
      if (isCodeLogisticsActivity(a)) {
        const keep = [
          ...board,
          a.arrivalTime?.trim() ?? "",
          a.departureTime?.trim() ?? "",
        ].filter(Boolean);
        return normalizeActivityClocks({
          ...a,
          description: stripProseClocksExcept(a.description, keep) ?? a.description,
        });
      }
      return stripSightClocks(a);
    });
  return {
    morning: patch(activities.morning),
    afternoon: patch(activities.afternoon),
    evening: patch(activities.evening),
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

/** Prose that may still carry Gemini-invented international-flight clocks. */
const FLIGHT_CLOCK_PROSE_RE =
  /letališč|airport|flughafen|aeroporto|aéroport|mednarodni(?:\s+povratni)?\s+let|international(?:\s+return)?\s+flight|internationaler\s+(?:rück)?flug|\bpristan|boarding|odlet|rückflug|povratni\s+let|prevoz na letališč/i;

function duffelOwnedClockList(
  flights: TripFlightContext,
  destIata?: string,
): string[] {
  const owned = [
    flights.outboundDepart,
    flights.outboundArrive,
    flights.inboundDepart ?? "",
    flights.inboundArrive ?? "",
    addHmMinutes(flights.outboundArrive, ARRIVAL_TRANSFER_OFFSET_MIN),
    addHmMinutes(flights.outboundArrive, ARRIVAL_HOTEL_OFFSET_MIN),
    addHmMinutes(
      flights.outboundDepart,
      -Math.round(originAirportLeadHours(flights.outboundDepart) * 60),
    ),
  ];
  if (flights.inboundDepart) {
    const off = departureLogisticsOffsetsMin(destIata);
    const depMin = parseHmSafe(flights.inboundDepart);
    owned.push(
      hmFromMinutes(depMin - off.checkoutMin),
      hmFromMinutes(depMin - off.transferMin),
      hmFromMinutes(depMin - off.airportMin),
    );
  }
  return owned.filter(Boolean);
}

function clockIsOwned(hm: string | undefined, owned: string[]): boolean {
  const norm = normalizeHmToken(hm ?? "");
  if (!norm) return false;
  return owned.some((t) => normalizeHmToken(t) === norm);
}

function stripNonDuffelFlightClocks(text: string | undefined, owned: string[]): string | undefined {
  if (!text) return text;
  if (!FLIGHT_CLOCK_PROSE_RE.test(text)) return text;
  return stripProseClocksExcept(text, owned) ?? text;
}

function isDuffelOwnedFlightActivity(a: Activity): boolean {
  if (a.transportType === "flight" || isFlightRangeActivity(a)) return true;
  const name = a.name ?? "";
  return /mednarodni(?:\s+povratni)?\s+let|international(?:\s+return)?\s+flight|internationaler\s+(?:rück)?flug|prihod na letališče|airport arrival|ankunft am flughafen|arrivo in aeroporto|llegada al aeropuerto|arrivée à l'aéroport|prevoz na letališč|na letališču .+\([A-Z]{3}\)|mednarodni let\s*\(/i.test(
    name,
  );
}

/**
 * Duffel boarding-pass times win everywhere Gemini still wrote a flight clock.
 * Does not invent times when this function is not called (no flight context).
 */
function overwriteGeminiFlightClocksWithDuffel(
  plan: AiTripPlan,
  flights: TripFlightContext,
  opts: { arrivalDay: number; totalDays: number; planComplete: boolean },
): void {
  const owned = duffelOwnedClockList(flights, plan.destinationIata);
  plan.summary = stripNonDuffelFlightClocks(plan.summary, owned) ?? plan.summary;

  for (const day of plan.days) {
    const flightCalendarDay =
      isInFlightTripDay(day.day, flights) ||
      day.day === opts.arrivalDay ||
      (opts.planComplete && Boolean(flights.inboundDepart) && day.day === opts.totalDays);
    const stripDayText = (text: string | undefined) =>
      flightCalendarDay
        ? (stripProseClocksExcept(text, owned) ?? text)
        : stripNonDuffelFlightClocks(text, owned);

    day.title = stripDayText(day.title) ?? day.title;
    day.travelHack = stripDayText(day.travelHack);
    day.transportationTips = stripDayText(day.transportationTips);
    day.localWarnings = stripDayText(day.localWarnings);
    day.morning = stripDayText(day.morning) ?? "";
    day.afternoon = stripDayText(day.afternoon) ?? "";
    day.evening = stripDayText(day.evening) ?? "";

    if (!day.activities) continue;
    const patchSlot = (list: Activity[] | undefined): Activity[] =>
      (list ?? []).map((a) => {
        const blob = `${a.name} ${a.description ?? ""}`;
        const flightRow = isDuffelOwnedFlightActivity(a) || FLIGHT_CLOCK_PROSE_RE.test(blob);
        if (!flightRow) return a;
        const description = stripProseClocksExcept(a.description, owned) ?? a.description;
        const next: Activity = { ...a, description };
        if (next.arrivalTime && !clockIsOwned(next.arrivalTime, owned)) {
          delete next.arrivalTime;
        }
        if (next.departureTime && !clockIsOwned(next.departureTime, owned)) {
          delete next.departureTime;
        }
        return normalizeActivityClocks(next);
      });
    day.activities = {
      morning: patchSlot(day.activities.morning),
      afternoon: patchSlot(day.activities.afternoon),
      evening: patchSlot(day.activities.evening),
    };
  }

  const arrival = plan.days.find((d) => d.day === opts.arrivalDay);
  if (arrival?.activities) {
    arrival.activities = lockCodeOwnedFlightDayClocks(
      patchArrivalActivityClockTimes(arrival.activities, flights),
      owned,
    );
    arrival.transportation = undefined;
  }

  if (opts.planComplete && flights.inboundDepart) {
    const last = plan.days.find((d) => d.day === opts.totalDays);
    if (last?.activities) {
      last.activities = lockCodeOwnedFlightDayClocks(
        patchAirportActivityTimes(
          last.activities,
          flights.inboundDepart,
          flights.inboundArrive,
          plan.destinationIata,
        ),
        owned,
      );
      last.transportation = undefined;
    }
  }

  for (const day of plan.days) {
    if (isInFlightTripDay(day.day, flights)) {
      day.transportation = undefined;
    }
  }
}

/**
 * Safety net after Gemini stream/catalog: rewrite day 1 / last day around real flight times.
 */
export function applyFlightContextToGeminiPlan(
  plan: AiTripPlan,
  flights: TripFlightContext,
  opts?: { originIata?: string; language?: string; expectedDays?: number; departDate?: string },
): void {
  // Locked plan language wins over live UI lang (prevents rewriting logistics on lang switch).
  const lang = normalizePlanLangCode(plan.contentLanguage ?? opts?.language ?? "sl");
  plan.contentLanguage = lang;
  plan.days = dedupePlanDaysByNumber(plan.days);
  repairPlanDaySequence(plan, { language: lang, departDate: opts?.departDate });
  resyncPlanDayDates(
    plan,
    opts?.departDate ?? plan.days.find((d) => d.day === 1)?.date,
  );
  const calendarDays = planCalendarDayCount(plan.days);
  if (!calendarDays) return;
  // Stream batches are 6 days. Stamping "international departure" on whatever
  // is last in the partial plan poisons Manila→islands→Manila hops (day 6 / 12).
  const expectedDays =
    opts?.expectedDays && opts.expectedDays > 0 ? opts.expectedDays : calendarDays;
  const totalDays = expectedDays;
  const planComplete = calendarDays >= expectedDays;

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
        morning: [...originActs, flightAct].slice(0, 5),
        afternoon: [],
        evening: [],
      };
      // Clear legacy slot strings — AiPlanDayCard used to fall back to these.
      day.morning = "";
      day.afternoon = "";
      day.evening = "";
      day.mapPins = [];
      day.transportation = undefined;
      day.drivingDurationHours = "0h";
      day.drivingDistanceKm = 0;
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
        // Keep full origin (airport + flight) + destination arrival logistics — never slice off hotel check-in.
        activities = {
          ...activities,
          morning: [...originActs, ...(activities.morning ?? [])].slice(0, 8),
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

      activities = keepFirstArrivalLogistics(activities);

      // Nuke Gemini-invented landing times (e.g. 12:00) — boarding-pass time wins.
      day.activities = lockCodeOwnedFlightDayClocks(
        patchArrivalActivityClockTimes(activities, flights),
        [
          flights.outboundDepart,
          flights.outboundArrive,
          flights.inboundDepart ?? "",
          flights.inboundArrive ?? "",
        ],
      );
      day.title = patchArrivalDayTitle(day.title, flights, lang);
      day.morning = "";
      day.afternoon = "";
      day.evening = "";
      day.mapPins = (day.mapPins ?? []).filter((pin) => {
        const blob = `${pin.name ?? ""} ${pin.description ?? ""}`.toLowerCase();
        return !/zajtrk|breakfast|siesta|tropska|bazen|promenad/i.test(blob);
      });
      day.inFlightDay = false;
      const arrivalDriveH = Number(
        String(day.drivingDurationHours ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0,
      );
      if (arrivalDriveH > 18) {
        day.drivingDurationHours = "0h";
        day.drivingDistanceKm = 0;
      }
      continue;
    }

    if (planComplete && day.day === totalDays && flights.inboundDepart) {
      if (isOvernightDeparture(flights)) {
        day.inFlightDay = true;
        day.category = "transport";
      }
      // Prefer destination hub over a stale island city (e.g. Krabi on BKK departure day).
      const destHub = plan.destinationIata
        ? lookupDestination(plan.destinationIata)
        : undefined;
      const hubName = destHub?.name?.trim() || (plan.destinationName ?? "").trim();
      const { stayCity: prevCity, alreadyAtHub } = hubName
        ? resolveCityBeforeDeparture(plan, totalDays, hubName)
        : { stayCity: "", alreadyAtHub: false };
      const hopWanted = Boolean(
        hubName &&
          prevCity &&
          !alreadyAtHub &&
          !cityNamesMatch(prevCity, hubName) &&
          !cityNamesMatch(prevCity, plan.destinationName ?? ""),
      );
      const needsHubHop =
        hopWanted &&
        isFeasibleSameDayGroundHubHop(
          prevCity,
          hubName,
          plan.destinationIata,
          flights.inboundDepart,
        );
      const needsAirHubHop =
        hopWanted &&
        !needsHubHop &&
        shouldInjectDomesticAirHubHop(
          prevCity,
          hubName,
          plan.destinationIata,
          flights.inboundDepart,
        );
      // Ticket hub may be JFK while the trip ends in LA — depart from last stay city.
      // Canada YVR→YYZ (and similar): fly back to gateway, then international.
      const departCity =
        needsHubHop ||
        needsAirHubHop ||
        alreadyAtHub ||
        !prevCity ||
        cityNamesMatch(prevCity, hubName)
          ? hubName || prevCity
          : prevCity;
      if (departCity) {
        day.city = departCity;
        day.focusName = departCity;
        day.title = needsAirHubHop
          ? planLangCopy(lang, {
              sl: `Notranji let v ${hubName} in mednarodni odhod`,
              en: `Domestic flight to ${hubName} and international departure`,
              de: `Inlandsflug nach ${hubName} und internationaler Abflug`,
              it: `Volo domestico a ${hubName} e partenza internazionale`,
              es: `Vuelo doméstico a ${hubName} y salida internacional`,
              fr: `Vol intérieur vers ${hubName} et départ international`,
            })
          : needsHubHop
            ? planLangCopy(lang, {
                sl: `Prevoz v ${hubName} in mednarodni odhod`,
                en: `Transfer to ${hubName} and international departure`,
                de: `Transfer nach ${hubName} und internationaler Abflug`,
                it: `Transfer a ${hubName} e partenza internazionale`,
                es: `Traslado a ${hubName} y salida internacional`,
                fr: `Transfert vers ${hubName} et départ international`,
              })
            : planLangCopy(lang, {
                sl: `Odhod iz ${departCity} / mednarodni let`,
                en: `Departure from ${departCity} / international flight`,
                de: `Abflug von ${departCity} / internationaler Flug`,
                it: `Partenza da ${departCity} / volo internazionale`,
                es: `Salida desde ${departCity} / vuelo internacional`,
                fr: `Départ de ${departCity} / vol international`,
              });
        const departCoords =
          resolveCityLatLng(departCity) ??
          (cityNamesMatch(departCity, hubName) && destHub?.lat != null && destHub?.lng != null
            ? { lat: destHub.lat, lng: destHub.lng }
            : null);
        if (departCoords) {
          day.lat = departCoords.lat;
          day.lng = departCoords.lng;
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
      // Drop Gemini phantom domestic flights to the hub when traveler is already there
      // (or when a prior day already did the TGV/train return). Keep room for code air hop.
      const stripPhantomHubFlight = (list: Activity[] | undefined): Activity[] =>
        (list ?? []).filter((a) => {
          if (!hubName || !prevCity) return true;
          if (needsAirHubHop) return true;
          if (!(alreadyAtHub || !needsHubHop)) return true;
          const blob = `${a.name} ${a.description ?? ""}`;
          const n = normalizeCityToken(blob);
          const from = normalizeCityToken(prevCity);
          const to = normalizeCityToken(hubName);
          const toHub =
            (from && to && n.includes(from) && n.includes(to)) ||
            cityNamesMatch(hubName, a.name);
          const isAir =
            a.transportType === "flight" ||
            /\b(flight|let|flug|volo|vuelo|vol|prevoz|transfer|notranji)\b/i.test(blob);
          return !(toHub && isAir);
        });
      merged.morning = stripPhantomHubFlight(merged.morning);
      merged.afternoon = stripPhantomHubFlight(merged.afternoon);
      merged.evening = stripPhantomHubFlight(merged.evening);

      // Drop Gemini teleports when neither ground nor domestic-air hop applies (e.g. LA→NY).
      if (hopWanted && !needsHubHop && !needsAirHubHop && hubName && prevCity) {
        const stripTeleport = (list: Activity[] | undefined): Activity[] =>
          (list ?? []).filter((a) => {
            const blob = `${a.name} ${a.description ?? ""}`;
            const n = normalizeCityToken(blob);
            const from = normalizeCityToken(prevCity);
            const to = normalizeCityToken(hubName);
            const mentionsBoth = Boolean(from && to && n.includes(from) && n.includes(to));
            const looksLikeHop =
              /transfer|prevoz|train|vlak|flight|let|drive|ground|domestic/i.test(blob);
            return !(mentionsBoth && looksLikeHop);
          });
        merged.morning = stripTeleport(merged.morning);
        merged.afternoon = stripTeleport(merged.afternoon);
        merged.evening = stripTeleport(merged.evening);
      }

      if (needsAirHubHop && hubName && prevCity) {
        const airHop: Activity = {
          name: planLangCopy(lang, {
            sl: `Notranji let ${prevCity} → ${hubName}`,
            en: `Domestic flight ${prevCity} → ${hubName}`,
            de: `Inlandsflug ${prevCity} → ${hubName}`,
            it: `Volo domestico ${prevCity} → ${hubName}`,
            es: `Vuelo doméstico ${prevCity} → ${hubName}`,
            fr: `Vol intérieur ${prevCity} → ${hubName}`,
          }),
          type: "TRANSPORT",
          transportType: "flight",
          description: planLangCopy(lang, {
            sl: `Zjutraj notranji let ${prevCity} → ${hubName}, nato mednarodni odhod ob ${flights.inboundDepart}. Isti dan z avtom/vlakom ni izvedljiv — rezerviraj povezavo z rezervo za prtljago.`,
            en: `Morning domestic air ${prevCity} → ${hubName}, then international departure at ${flights.inboundDepart}. Same-day ground travel is not feasible — book a connection with bag-buffer time.`,
            de: `Morgens Inlandsflug ${prevCity} → ${hubName}, dann internationaler Abflug um ${flights.inboundDepart}. Am selben Tag per Boden nicht machbar — Verbindung mit Gepäck-Puffer buchen.`,
            it: `Al mattino volo domestico ${prevCity} → ${hubName}, poi partenza internazionale alle ${flights.inboundDepart}. Lo stesso giorno via terra non è fattibile — prenota con margine bagagli.`,
            es: `Por la mañana vuelo doméstico ${prevCity} → ${hubName}, luego salida internacional a las ${flights.inboundDepart}. El mismo día por tierra no es viable — reserva con margen para el equipaje.`,
            fr: `Le matin, vol intérieur ${prevCity} → ${hubName}, puis départ international à ${flights.inboundDepart}. Impossible le même jour par voie terrestre — réservez avec marge bagages.`,
          }),
        };
        merged.morning = [airHop, ...(merged.morning ?? [])].slice(0, 5);
      } else if (needsHubHop && hubName && prevCity) {
        const rail = preferRailHubHop(prevCity, hubName, plan.destinationIata);
        const hop: Activity = {
          name: rail
            ? planLangCopy(lang, {
                sl: `Vlak ${prevCity} → ${hubName}`,
                en: `Train ${prevCity} → ${hubName}`,
                de: `Zug ${prevCity} → ${hubName}`,
                it: `Treno ${prevCity} → ${hubName}`,
                es: `Tren ${prevCity} → ${hubName}`,
                fr: `Train ${prevCity} → ${hubName}`,
              })
            : planLangCopy(lang, {
                sl: `Notranji prevoz ${prevCity} → ${hubName}`,
                en: `Domestic transfer ${prevCity} → ${hubName}`,
                de: `Inlands-Transfer ${prevCity} → ${hubName}`,
                it: `Transfer interno ${prevCity} → ${hubName}`,
                es: `Traslado doméstico ${prevCity} → ${hubName}`,
                fr: `Transfert intérieur ${prevCity} → ${hubName}`,
              }),
          type: "TRANSPORT",
          // Never mark as flight — PDF/UI would show a phantom air leg (Lyon→Paris).
          description: rail
            ? planLangCopy(lang, {
                sl: `Pred mednarodnim odhodom ob ${flights.inboundDepart} se z vlakom (TGV/IC) vrneš v ${hubName}. Ne ostani v ${prevCity} — rezerviraj vlak vnaprej.`,
                en: `Before the international departure at ${flights.inboundDepart}, return to ${hubName} by train (TGV/IC). Do not stay in ${prevCity} — book the train ahead.`,
                de: `Vor dem internationalen Abflug um ${flights.inboundDepart} mit dem Zug (TGV/IC) zurück nach ${hubName}. Nicht in ${prevCity} bleiben — Zug im Voraus buchen.`,
                it: `Prima della partenza internazionale alle ${flights.inboundDepart} torna a ${hubName} in treno (TGV/IC). Non restare a ${prevCity} — prenota il treno.`,
                es: `Antes de la salida internacional a las ${flights.inboundDepart} vuelve a ${hubName} en tren (TGV/IC). No te quedes en ${prevCity} — reserva el tren.`,
                fr: `Avant le départ international à ${flights.inboundDepart}, retournez à ${hubName} en train (TGV/IC). Ne restez pas à ${prevCity} — réservez le train.`,
              })
            : planLangCopy(lang, {
                sl: `Pred mednarodnim odhodom ob ${flights.inboundDepart} se vrneš v ${hubName} (ne ostani v ${prevCity}). Računaj na notranji prevoz — rezerviraj vnaprej.`,
                en: `Before the international departure at ${flights.inboundDepart}, return to ${hubName} (do not stay in ${prevCity}). Budget ground transfer — book ahead.`,
                de: `Vor dem internationalen Abflug um ${flights.inboundDepart} zurück nach ${hubName} (nicht in ${prevCity} bleiben). Plane einen Transfer — im Voraus buchen.`,
                it: `Prima della partenza internazionale alle ${flights.inboundDepart} torna a ${hubName} (non restare a ${prevCity}). Previsto un transfer — prenota in anticipo.`,
                es: `Antes de la salida internacional a las ${flights.inboundDepart} vuelve a ${hubName} (no te quedes en ${prevCity}). Cuenta con un traslado — reserva con antelación.`,
                fr: `Avant le départ international à ${flights.inboundDepart}, retournez à ${hubName} (ne restez pas à ${prevCity}). Prévoyez un transfert — réservez à l'avance.`,
              }),
        };
        merged.morning = [hop, ...(merged.morning ?? [])].slice(0, 4);
      }
      day.activities = lockCodeOwnedFlightDayClocks(
        patchAirportActivityTimes(
          merged,
          flights.inboundDepart,
          flights.inboundArrive,
          plan.destinationIata,
        ),
        [
          flights.outboundDepart,
          flights.outboundArrive,
          flights.inboundDepart,
          flights.inboundArrive ?? "",
        ],
      );
      // Gemini often leaves arrival-direction legs (JFK Airport → New York) on the
      // homebound day — drop them; code logistics already cover hotel → airport.
      day.transportation = undefined;
      day.morning = "";
      day.afternoon = "";
      day.evening = "";
    }

    normalizeDayActivityClocks(day);
  }

  // After flight rewrite: strip phantom Tocumen/airport re-arrivals on non-arrival days.
  applyItineraryGuards(plan, { arrivalDay, language: lang });
  scrubImpossibleIslandDayTrips(plan, lang);
  overwriteGeminiFlightClocksWithDuffel(plan, flights, {
    arrivalDay,
    totalDays,
    planComplete,
  });
}
