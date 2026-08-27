import type { Activity, DayPlan } from "@/lib/aiPlan.functions";
import {
  isOvernightDeparture,
  lastDayArriveForDisplay,
  type TripFlightContext,
} from "@/lib/flightScheduling";
import { lookupDestination } from "@/lib/destinationCoords";
import { planLangCopy } from "@/lib/planLangCopy";
import { normalizePlanLangCode } from "@/lib/planLanguages";
import { sortDayActivitiesByClock } from "@/lib/activityTime";

const CHECKOUT_RE =
  /check-?out|odjava|odhod iz hotela|hotel check-out|vrnitev avtodoma/i;
const AIRPORT_TRANSFER_RE =
  /prevoz na letališč|airport transfer|flughafentransfer|transfer to (the )?airport|traslado al aeropuerto|transfert a[eé]roport/i;
const AIRPORT_CHECKIN_RE =
  /prihod na letališče in prijava|airport check-in|check-in am flughafen|check-in in aeroporto/i;
const RETURN_FLIGHT_RE =
  /mednarodni\s*(povratni\s*)?let|international\s*(return\s*)?flight|internationaler\s*(rück)?flug|volo internazionale|vuelo internacional|vol international retour/i;
const HOME_LANDING_RE =
  /pristanek (doma|v |na |ob )|pristanek v |landing (at home|in )|ankunft (zu hause|in )|arrivée (à la maison|à )/i;
const EVENING_TRANSFER_RE =
  /prevoz na letališč|airport transfer|check-?out|odjava|prihod na letališče/i;

function parseHm(hm: string): number {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isCheckout(a: Activity): boolean {
  return CHECKOUT_RE.test(a.name ?? "");
}
function isAirportTransfer(a: Activity): boolean {
  return AIRPORT_TRANSFER_RE.test(a.name ?? "") && !RETURN_FLIGHT_RE.test(a.name ?? "");
}
function isAirportCheckin(a: Activity): boolean {
  return AIRPORT_CHECKIN_RE.test(a.name ?? "");
}
function isReturnFlight(a: Activity): boolean {
  return RETURN_FLIGHT_RE.test(a.name ?? "");
}
function isHomeLanding(a: Activity): boolean {
  return HOME_LANDING_RE.test(a.name ?? "");
}
function isPreFlightLogistics(a: Activity): boolean {
  return isCheckout(a) || isAirportTransfer(a) || isAirportCheckin(a);
}

function takeSlot(day: DayPlan, slot: "morning" | "afternoon" | "evening"): Activity[] {
  return [...(day.activities?.[slot] ?? [])];
}

function setSlot(day: DayPlan, slot: "morning" | "afternoon" | "evening", items: Activity[]) {
  if (!day.activities) {
    day.activities = { morning: [], afternoon: [], evening: [] };
  }
  day.activities[slot] = items;
}

function clockSlot(hm: string): "morning" | "afternoon" | "evening" {
  const m = parseHm(hm);
  if (m >= 17 * 60) return "evening";
  if (m >= 12 * 60) return "afternoon";
  return "morning";
}

function sameDayHomeLanding(
  inboundArrive: string,
  lang: string,
  originIata?: string,
): Activity {
  const city = originIata
    ? lookupDestination(originIata.toUpperCase())?.name ?? originIata.toUpperCase()
    : "";
  const place = city || originIata?.toUpperCase() || "";
  return {
    name: planLangCopy(lang, {
      sl: place ? `Pristanek v ${place}` : "Pristanek doma",
      en: place ? `Landing in ${place}` : "Landing at home",
      de: place ? `Ankunft in ${place}` : "Ankunft zu Hause",
      it: place ? `Arrivo a ${place}` : "Arrivo a casa",
      es: place ? `Llegada a ${place}` : "Llegada a casa",
      fr: place ? `Arrivée à ${place}` : "Arrivée à la maison",
    }),
    type: "TRANSPORT",
    description: planLangCopy(lang, {
      sl: place
        ? `Pristanek v ${place}${originIata ? ` (${originIata.toUpperCase()})` : ""} ob ${inboundArrive} (lokalni čas).`
        : `Pristanek na domačem letališču ob ${inboundArrive} (lokalni čas).`,
      en: `Land at the home airport at ${inboundArrive} (local time).`,
      de: `Ankunft am Heimatflughafen um ${inboundArrive} (Ortszeit).`,
    }),
    arrivalTime: inboundArrive,
  };
}

/**
 * Daytime return (not a 00:00–05:59 red-eye): checkout + transfer in the morning,
 * international flight in the depart slot, same-day landing in afternoon/evening.
 * Never show a next-morning home landing (06:45) in the same morning as hotel checkout.
 */
export function distributeDaytimeReturnActivities(
  logisticsActs: Activity[],
  flights: TripFlightContext,
  opts?: { language?: string; originIata?: string },
): { morning: Activity[]; afternoon: Activity[]; evening: Activity[] } {
  const morning: Activity[] = [];
  const afternoon: Activity[] = [];
  const evening: Activity[] = [];
  const push = (a: Activity, slot: "morning" | "afternoon" | "evening") => {
    if (slot === "evening") evening.push(a);
    else if (slot === "afternoon") afternoon.push(a);
    else morning.push(a);
  };

  const depart = flights.inboundDepart?.trim() ?? "";
  const arrive = lastDayArriveForDisplay(depart, flights.inboundArrive);
  const lang = normalizePlanLangCode(opts?.language ?? "sl");
  const flightSlot = clockSlot(depart || "09:00");

  for (const a of logisticsActs) {
    if (isHomeLanding(a)) continue;
    if (isReturnFlight(a)) {
      const flight: Activity = { ...a, departureTime: arrive };
      if (!arrive) delete flight.departureTime;
      push(flight, flightSlot);
      continue;
    }
    const t = a.arrivalTime?.trim() || "08:00";
    push(a, parseHm(t) < 5 * 60 ? "morning" : clockSlot(t));
  }

  if (arrive && parseHm(arrive) > parseHm(depart)) {
    const landSlot = clockSlot(arrive);
    if (landSlot !== flightSlot) {
      const already = [...morning, ...afternoon, ...evening].some(isHomeLanding);
      if (!already) push(sameDayHomeLanding(arrive, lang, opts?.originIata), landSlot);
    }
  }

  return sortDayActivitiesByClock({ morning, afternoon, evening });
}

function homeLandingActivity(
  inboundArrive: string | undefined,
  lang: string,
): Activity | null {
  if (!inboundArrive?.trim()) return null;
  const min = parseHm(inboundArrive);
  if (min < 12 * 60) return null;
  return {
    name: planLangCopy(lang, {
      sl: "Popoldanski pristanek doma",
      en: "Afternoon landing at home",
      de: "Nachmittagsankunft zu Hause",
      it: "Arrivo pomeridiano a casa",
      es: "Llegada a casa por la tarde",
      fr: "Arrivée à la maison l'après-midi",
    }),
    type: "TRANSPORT",
    description: planLangCopy(lang, {
      sl: `Pristanek na domačem letališču ob ${inboundArrive} (lokalni čas). Zadnji dan nima večernega transferja na letališče — ta je bil že prejšnji večer.`,
      en: `Land at the home airport at ${inboundArrive} (local time). There is no evening airport transfer on this last day — that happened the evening before.`,
      de: `Ankunft am Heimatflughafen um ${inboundArrive} (Ortszeit). Kein abendlicher Flughafentransfer an diesem letzten Tag — der war am Vorabend.`,
    }),
    arrivalTime: inboundArrive,
  };
}

/**
 * Red-eye return (00:00–05:59): checkout + airport transfer belong on the previous
 * evening (~22:30). Last day is only the night flight + afternoon landing at home.
 */
export function applyRedEyeDepartureChronology(
  days: DayPlan[],
  opts: {
    inboundDepart?: string;
    inboundArrive?: string;
    language?: string;
    skip?: boolean;
  },
): void {
  if (opts.skip) return;
  const depart = opts.inboundDepart?.trim();
  if (!depart || days.length < 2) return;
  const flights = { inboundDepart: depart } as TripFlightContext;
  if (!isOvernightDeparture(flights)) return;

  const last = days[days.length - 1]!;
  const prev = days[days.length - 2]!;
  const lang = normalizePlanLangCode(opts.language ?? "sl");

  const pulled: Activity[] = [];
  const nightFlight: Activity[] = [];
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    const kept: Activity[] = [];
    for (const a of takeSlot(last, slot)) {
      if (isPreFlightLogistics(a)) {
        pulled.push({
          ...a,
          arrivalTime:
            isCheckout(a) ? "22:30" : isAirportTransfer(a) ? "23:00" : "23:15",
        });
        continue;
      }
      if (isReturnFlight(a) && slot === "evening") {
        nightFlight.push({ ...a, arrivalTime: a.arrivalTime || depart });
        continue;
      }
      if (slot === "evening" && EVENING_TRANSFER_RE.test(a.name ?? "") && !isReturnFlight(a)) {
        continue;
      }
      kept.push(a);
    }
    setSlot(last, slot, kept);
  }

  if (pulled.length === 0) {
    pulled.push(
      {
        name: planLangCopy(lang, {
          sl: "Odhod iz hotela (odjava)",
          en: "Hotel check-out",
          de: "Hotel Check-out",
        }),
        type: "STAY",
        description: planLangCopy(lang, {
          sl: `Odjava zvečer pred nočnim letom ob ${depart}. Prtljago vzemi s seboj — na letališče že zvečer, ne zjutraj na dan leta.`,
          en: `Check out in the evening before the overnight flight at ${depart}. Take your bags — go to the airport this evening, not on the morning of departure.`,
          de: `Check-out am Abend vor dem Nachtflug um ${depart}. Gepäck mitnehmen — schon am Abend zum Flughafen, nicht am Morgen des Abflugs.`,
        }),
        arrivalTime: "22:30",
      },
      {
        name: planLangCopy(lang, {
          sl: "Prevoz na letališče",
          en: "Airport transfer",
          de: "Flughafentransfer",
        }),
        type: "TRANSPORT",
        description: planLangCopy(lang, {
          sl: `Kombi/taxi na letališče zvečer pred nočnim letom ob ${depart}. Bodi tam ~3 ure pred odletom.`,
          en: `Van/taxi to the airport in the evening before the overnight flight at ${depart}. Be there ~3h before departure.`,
          de: `Transfer zum Flughafen am Abend vor dem Nachtflug um ${depart}. ~3 Stunden vor Abflug da sein.`,
        }),
        arrivalTime: "23:00",
      },
    );
  }

  const prevEvening = takeSlot(prev, "evening").filter((a) => !isPreFlightLogistics(a));
  const seen = new Set(prevEvening.map((a) => (a.name ?? "").toLowerCase()));
  for (const a of pulled) {
    const key = (a.name ?? "").toLowerCase();
    if (seen.has(key)) continue;
    prevEvening.push(a);
    seen.add(key);
  }
  setSlot(prev, "evening", prevEvening);

  const lastMorning = takeSlot(last, "morning");
  for (const a of nightFlight) {
    if (!lastMorning.some(isReturnFlight)) lastMorning.unshift(a);
  }
  if (!lastMorning.some(isReturnFlight)) {
    lastMorning.unshift({
      name: planLangCopy(lang, {
        sl: "Mednarodni povratni let",
        en: "International return flight",
        de: "Internationaler Rückflug",
      }),
      type: "TRANSPORT",
      transportType: "flight",
      description: planLangCopy(lang, {
        sl: `Nočni let ob ${depart}. Na letališču si že od prejšnjega večera — brez ponovnega transferja zjutraj.`,
        en: `Overnight flight at ${depart}. You are already at the airport from the previous evening — no morning transfer.`,
        de: `Nachtflug um ${depart}. Du bist seit dem Vorabend am Flughafen — kein morgendlicher Transfer.`,
      }),
      arrivalTime: depart,
    });
  }
  setSlot(last, "morning", lastMorning);

  const lastEvening = takeSlot(last, "evening").filter(
    (a) => !EVENING_TRANSFER_RE.test(a.name ?? "") || isReturnFlight(a) || isHomeLanding(a),
  );
  setSlot(last, "evening", lastEvening);

  const lastAfternoon = takeSlot(last, "afternoon");
  if (!lastAfternoon.some(isHomeLanding) && !lastEvening.some(isHomeLanding)) {
    const landing = homeLandingActivity(opts.inboundArrive, lang);
    if (landing) {
      lastAfternoon.push(landing);
      setSlot(last, "afternoon", lastAfternoon);
    }
  }

  if (last.transportation?.length) {
    last.transportation = last.transportation.filter((leg) => {
      const blob = `${leg.from} ${leg.to} ${leg.type}`;
      if (/hotel|check-?out|center|zona/i.test(blob) && (leg.type === "van" || leg.type === "car")) {
        return false;
      }
      return true;
    });
    if (!last.transportation.length) last.transportation = undefined;
  }
}
