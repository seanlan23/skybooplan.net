import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { sortDayActivitiesByClock } from "@/lib/activityTime";
import { isOvernightDeparture, parseClockMinutes, type TripFlightContext } from "@/lib/flightScheduling";
import { collectOvernightHotelStays, overnightPlacesMatch } from "@/lib/overnightHotelStays";
import { planLangCopy } from "@/lib/planLangCopy";
import { normalizePlanLangCode } from "@/lib/planLanguages";

const CHECKOUT_RE =
  /check-?out|odjava|odhod iz hotela|hotel check-out|vrnitev avtodoma/i;
const AIRPORT_TRANSFER_RE =
  /prevoz na letališč|airport transfer|flughafentransfer|transfer to (the )?airport|traslado al aeropuerto|transfert a[eé]roport/i;
const RETURN_FLIGHT_RE =
  /mednarodn\w*.{0,24}\blet|odhod mednarodn|let proti domu|international\s*(return\s*)?(flight|flug)|overnight (international )?flight|internationaler\s*(rück|nacht)?flug|volo internazionale|vuelo internacional|vol international/i;
const HOME_LANDING_RE =
  /pristanek (doma|v |na |ob )|pristanek v |landing (at home|in )|ankunft (zu hause|in )|arrivée (à la maison|à )/i;

function parseHm(hm: string | undefined | null): number | null {
  if (!hm?.trim()) return null;
  return parseClockMinutes(hm);
}

function isCheckout(a: Activity): boolean {
  return CHECKOUT_RE.test(a.name ?? "");
}
function isAirportTransfer(a: Activity): boolean {
  return AIRPORT_TRANSFER_RE.test(a.name ?? "") && !RETURN_FLIGHT_RE.test(a.name ?? "");
}
function isReturnFlight(a: Activity): boolean {
  if (/notranji\s*let|domestic\s*(air|flight)|inlandsflug/i.test(a.name ?? "")) return false;
  return RETURN_FLIGHT_RE.test(a.name ?? "");
}
function isHomeLanding(a: Activity, originIata?: string): boolean {
  if (RETURN_FLIGHT_RE.test(a.name ?? "")) return false;
  if (HOME_LANDING_RE.test(a.name ?? "")) return true;
  if (originIata && new RegExp(`pristanek[^\\n]{0,40}\\b${originIata}\\b`, "i").test(a.name ?? "")) {
    return true;
  }
  return false;
}

function flattenDay(day: DayPlan): Activity[] {
  return [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
}

function resyncProse(day: DayPlan): void {
  const join = (list: Activity[]) =>
    list
      .map((a) => (a.description ? `${a.name}: ${a.description}` : a.name))
      .filter(Boolean)
      .join("\n\n");
  day.morning = join(day.activities?.morning ?? []);
  day.afternoon = join(day.activities?.afternoon ?? []);
  day.evening = join(day.activities?.evening ?? []);
}

function inboundClocks(plan: AiTripPlan, opts?: DepartureDaySortOpts): {
  depart?: string;
  arrive?: string;
} {
  return {
    depart:
      opts?.inboundDepart?.trim() ||
      plan.flightContext?.inboundDepart?.trim() ||
      plan.returnFlightEu?.departureTime?.trim() ||
      undefined,
    arrive:
      opts?.inboundArrive?.trim() ||
      plan.flightContext?.inboundArrive?.trim() ||
      plan.returnFlightEu?.arrivalTimeEu?.trim() ||
      undefined,
  };
}

function isHomeOriginCity(city: string, plan: AiTripPlan): boolean {
  const token = city.trim();
  if (!token) return false;
  if (plan.originPlace && overnightPlacesMatch(token, plan.originPlace)) return true;
  const iata = plan.originIata?.trim();
  return Boolean(iata && token.toUpperCase().includes(iata.toUpperCase()));
}

function rebaseLastDayCity(plan: AiTripPlan, last: DayPlan): void {
  if (plan.groundTransportMode) return;
  if (!isHomeOriginCity(last.city, plan)) return;
  const stays = collectOvernightHotelStays({
    days: plan.days,
    originPlace: plan.originPlace,
    groundTransportMode: plan.groundTransportMode,
    accommodationMode: plan.accommodationMode,
  });
  const lastStay = stays[stays.length - 1];
  if (!lastStay?.city) return;
  if (overnightPlacesMatch(last.city, lastStay.city)) return;
  last.city = lastStay.city;
  last.focusName = lastStay.city;
}

function markNextDayLanding(a: Activity, arrive: string | undefined, lang: string): Activity {
  const next = { ...a };
  delete next.arrivalTime;
  delete next.departureTime;
  const already = /naslednji dan|next day|folgetag|giorno successivo/i.test(next.name ?? "");
  if (!already) {
    next.name = planLangCopy(lang, {
      sl: `Naslednji dan: ${next.name}`,
      en: `Next day: ${next.name}`,
      de: `Folgetag: ${next.name}`,
      it: `Giorno successivo: ${next.name}`,
      es: `Día siguiente: ${next.name}`,
      fr: `Lendemain : ${next.name}`,
    });
  }
  const clock = arrive?.trim();
  next.description = planLangCopy(lang, {
    sl: clock
      ? `Pristanek na domačem letališču ob ${clock} (lokalni čas, naslednji dan).`
      : "Pristanek na domačem letališču naslednji dan (lokalni čas).",
    en: clock
      ? `Land at the home airport at ${clock} (local time, next day).`
      : "Land at the home airport the next day (local time).",
    de: clock
      ? `Ankunft am Heimatflughafen um ${clock} (Ortszeit, Folgetag).`
      : "Ankunft am Heimatflughafen am Folgetag (Ortszeit).",
  });
  return next;
}

export type DepartureDaySortOpts = {
  inboundDepart?: string;
  inboundArrive?: string;
  language?: string;
  originIata?: string;
};

function isHomeboundLogistics(a: Activity): boolean {
  if (isAirportTransfer(a) || isReturnFlight(a)) return true;
  if (/prihod na letališče in prijava|airport check-in/i.test(a.name ?? "")) return true;
  if (isCheckout(a) && /letališč|airport|mednarodn|flight home|povrat/i.test(`${a.name} ${a.description ?? ""}`)) {
    return true;
  }
  if (isCheckout(a) && !/→|->|prevoz v |transfer to |check-?in v /i.test(a.name ?? "")) {
    return true;
  }
  return false;
}

/**
 * Same-day evening/afternoon return (not 00:00–05:59 red-eye): checkout and
 * airport transfer live only on the last calendar day. Strip them from N−1.
 */
export function stripPrematureDepartureLogistics(
  plan: AiTripPlan,
  opts?: DepartureDaySortOpts,
): number {
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  if (days.length < 2) return 0;
  const { depart } = inboundClocks(plan, opts);
  if (depart && isOvernightDeparture({ inboundDepart: depart } as TripFlightContext)) return 0;

  const prev = days[days.length - 2];
  if (!prev?.activities) return 0;
  let removed = 0;
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    const list = prev.activities[slot] ?? [];
    prev.activities[slot] = list.filter((a) => {
      if (!isHomeboundLogistics(a)) return true;
      removed += 1;
      return false;
    });
  }
  prev.evening = (prev.evening ?? "")
    .replace(/[^.!\n]*(odjava iz hotela|hotel check-out|prevoz na letališč)[^.!\n]*[.!]?/gi, "")
    .trim();
  return removed;
}

/**
 * Last calendar day: keep existing logistics clocks, but never show a home
 * landing whose clock is before the international depart (06:00 before 18:45)
 * in the morning. That landing is next-day and is appended after the flight.
 * Does not rewrite a 00:00–05:59 red-eye day. Idempotent.
 */
export function sortDepartureDayChronology(
  plan: AiTripPlan,
  opts?: DepartureDaySortOpts,
): void {
  const days = plan.days ?? [];
  if (days.length < 2) return;
  const last = [...days].sort((a, b) => a.day - b.day)[days.length - 1];
  if (!last) return;

  rebaseLastDayCity(plan, last);

  const originIata = opts?.originIata ?? plan.originIata;
  const items = flattenDay(last);
  const lastHasHomebound = items.some(
    (a) => isReturnFlight(a) || isHomeLanding(a, originIata) || isCheckout(a) || isAirportTransfer(a),
  );
  const { depart: inbound, arrive } = inboundClocks(plan, opts);
  const flightAct = items.find((a) => isReturnFlight(a));
  const depart =
    inbound ||
    (lastHasHomebound
      ? flightAct?.arrivalTime?.trim() || flightAct?.departureTime?.trim()
      : undefined);
  if (!depart || !lastHasHomebound) return;
  if (isOvernightDeparture({ inboundDepart: depart } as TripFlightContext)) return;

  const lang = normalizePlanLangCode(opts?.language ?? plan.contentLanguage ?? "sl");
  const depMin = parseHm(depart) ?? 18 * 60;

  const morning: Activity[] = [];
  const afternoon: Activity[] = [];
  const evening: Activity[] = [];
  const nextDayLandings: Activity[] = [];

  for (const from of ["morning", "afternoon", "evening"] as const) {
    for (const raw of last.activities?.[from] ?? []) {
      if (isHomeLanding(raw, originIata)) {
        const landClock = parseHm(raw.arrivalTime) ?? parseHm(arrive);
        if (landClock == null || landClock < depMin) {
          nextDayLandings.push(markNextDayLanding(raw, arrive ?? raw.arrivalTime, lang));
          continue;
        }
      }
      if (from === "evening") evening.push(raw);
      else if (from === "afternoon") afternoon.push(raw);
      else morning.push(raw);
    }
  }

  const chrono = sortDayActivitiesByClock({ morning, afternoon, evening });
  chrono.evening = [...chrono.evening, ...nextDayLandings];
  last.activities = chrono;
  resyncProse(last);
}
