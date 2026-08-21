import { lookupDestination } from "@/lib/destinationCoords";
import { planLangCopy } from "@/lib/planLangCopy";
import {
  airportArrivalHint,
  airportTransferDescription,
  hotelTransferDescription,
  type TripLocale,
} from "@/lib/tripLocale";

/** EU/EEA + CH + GB — off-site airport parking comparators are common. */
const EU_PARKING_ORIGIN_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "GB",
  "NO",
  "IS",
]);

export type TripFlightContext = {
  outboundDepart: string;
  outboundArrive: string;
  outboundArriveDayOffset: number;
  inboundDepart?: string;
  inboundArrive?: string;
  /** Stops on outbound / inbound (0 = nonstop). Undefined = unknown. */
  outboundStops?: number;
  inboundStops?: number;
  outboundVia?: string;
  inboundVia?: string;
};

export type LogisticsActivity = {
  name: string;
  type: string;
  description: string;
  priceLabel?: string;
  arrivalTime?: string;
  departureTime?: string;
};

function parseHm(hm: string): number {
  // Accept "18:55", "18:55+1", "18.55"
  const cleaned = hm.trim().replace(/\+\d+\s*$/, "");
  const match = cleaned.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return 0;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Same-clock range under ~40 min is never a real long-haul (VIE–MEX “14:00–14:15”). */
export function inboundArriveForDisplay(
  depart?: string,
  arrive?: string,
): string | undefined {
  const dep = depart?.trim();
  const arr = arrive?.trim();
  if (!arr) return undefined;
  if (!dep) return arr;
  const mins = (parseHm(arr) - parseHm(dep) + 24 * 60) % (24 * 60);
  if (mins > 0 && mins < 40) return undefined;
  return arr;
}

/** Hours before outbound departure to be at the origin airport (check-in + security). */
export function originAirportLeadHours(depart: string): number {
  const depMin = parseHm(depart);
  if (depMin <= 9 * 60) return 3;
  if (depMin <= 14 * 60) return 2.5;
  return 2.5;
}

/** Slovenian hour noun: 1 ura, 2 uri, 2,5 ure, 3 ure, 5 ur. */
export function formatSlHours(hours: number): string {
  const n = Math.round(hours * 10) / 10;
  const label = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  if (n === 1) return `${label} ura`;
  if (n === 2) return `${label} uri`;
  if (n >= 5) return `${label} ur`;
  return `${label} ure`;
}

/** Fixed lead-time phrase — never emit "2.5–3" or "3–3". */
export function originAirportLeadPhrase(depart: string, langCode = "sl"): string {
  const leadH = originAirportLeadHours(depart);
  if (leadH >= 3) {
    return planLangCopy(langCode, {
      sl: "vsaj 3 ure pred odletom",
      en: "at least 3 hours early",
      de: "mindestens 3 Stunden vor Abflug",
      it: "almeno 3 ore prima del decollo",
      es: "al menos 3 horas antes del despegue",
      fr: "au moins 3 heures avant le décollage",
    });
  }
  return planLangCopy(langCode, {
    sl: "2–3 ure pred odletom",
    en: "2–3 hours early",
    de: "2–3 Stunden vor Abflug",
    it: "2–3 ore prima del decollo",
    es: "2–3 horas antes del despegue",
    fr: "2–3 heures avant le décollage",
  });
}

/** Travel-hack copy for the home / outbound airport (parking, early arrival). */
export function buildOriginDepartureHint(
  originIata: string,
  flights: TripFlightContext,
  langCode = "sl",
): string {
  const hub = lookupDestination(originIata);
  const iata = originIata.toUpperCase();
  const name = hub?.name ?? iata;
  const dep = flights.outboundDepart;
  const leadPhrase = originAirportLeadPhrase(dep, langCode);
  const euParking =
    hub?.country && EU_PARKING_ORIGIN_COUNTRIES.has(hub.country);

  const parking = euParking
    ? planLangCopy(langCode, {
        sl: " Če se pripelješ z avtom, primerjaj parkiranje prek Parkvia, Parkos ali MyWay (terminal vs. zunanji P+R + shuttle) — pogosto ceneje za večdnevne počitnice.",
        en: " Driving? Compare terminal vs off-site parking via Parkvia, Parkos, or MyWay — often cheaper for multi-day trips.",
        de: " Mit dem Auto? Vergleiche Terminal- vs. Außenparkplatz über Parkvia, Parkos oder MyWay — oft günstiger für mehrtägige Reisen.",
        it: " In auto? Confronta parcheggio terminal vs esterno con Parkvia, Parkos o MyWay — spesso più economico per viaggi di più giorni.",
        es: " ¿En coche? Compara parking de terminal vs exterior con Parkvia, Parkos o MyWay — a menudo más barato en viajes largos.",
        fr: " En voiture ? Comparez parking terminal vs extérieur via Parkvia, Parkos ou MyWay — souvent moins cher pour les séjours.",
      })
    : "";

  return planLangCopy(langCode, {
    sl: `Odhod z domačega letališča ${name} (${iata}) ob ${dep}. Na mednarodni let pridi ${leadPhrase} (check-in, oddaja prtljage, varnostna kontrola).${parking}`,
    en: `Home airport ${name} (${iata}), flight departs ${dep}. Arrive ${leadPhrase} (check-in, bags, security).${parking}`,
    de: `Heimatflughafen ${name} (${iata}), Abflug ${dep}. Sei ${leadPhrase} am Flughafen (Check-in, Gepäck, Sicherheitskontrolle).${parking}`,
    it: `Aeroporto di casa ${name} (${iata}), decollo ${dep}. Arriva ${leadPhrase} (check-in, bagagli, controlli).${parking}`,
    es: `Aeropuerto de origen ${name} (${iata}), salida ${dep}. Llega ${leadPhrase} (check-in, maletas, seguridad).${parking}`,
    fr: `Aéroport de départ ${name} (${iata}), décollage ${dep}. Arrivez ${leadPhrase} (check-in, bagages, sécurité).${parking}`,
  });
}

/** Day-1 morning steps at the outbound airport before the international leg. */
export function buildOriginDepartureLogistics(
  originIata: string,
  flights: TripFlightContext,
  langCode = "sl",
): LogisticsActivity[] {
  const hub = lookupDestination(originIata);
  const iata = originIata.toUpperCase();
  const name = hub?.name ?? iata;
  const dep = flights.outboundDepart;
  const leadPhrase = originAirportLeadPhrase(dep, langCode);
  // Structured clocks from boarding-pass — not LLM. Arrive leadH before depart.
  const leadMin = Math.round(originAirportLeadHours(dep) * 60);
  const atAirport = addHmMinutes(dep, -leadMin);

  return [
    {
      // One short airport card — check-in lives in the description, not a second template row.
      name: planLangCopy(langCode, {
        sl: `Na letališču ${name} (${iata})`,
        en: `At ${name} Airport (${iata})`,
        de: `Am Flughafen ${name} (${iata})`,
        it: `All'aeroporto di ${name} (${iata})`,
        es: `En el aeropuerto de ${name} (${iata})`,
        fr: `À l'aéroport de ${name} (${iata})`,
      }),
      type: "TRANSPORT",
      description: planLangCopy(langCode, {
        sl: `Bodi na ${iata} ${leadPhrase} (${dep}) — check-in, prtljaga, varnost.`,
        en: `Be at ${iata} ${leadPhrase} (${dep}) — check-in, bags, security.`,
        de: `Sei ${leadPhrase} (${dep}) am Flughafen ${iata} — Check-in, Gepäck, Sicherheit.`,
        it: `Sii a ${iata} ${leadPhrase} (${dep}) — check-in, bagagli, controlli.`,
        es: `Estate en ${iata} ${leadPhrase} (${dep}) — check-in, maletas, seguridad.`,
        fr: `Soyez à ${iata} ${leadPhrase} (${dep}) — enregistrement, bagages, sécurité.`,
      }),
      arrivalTime: atAirport,
    },
    {
      name: planLangCopy(langCode, {
        sl: `Mednarodni let (${iata})`,
        en: `International flight (${iata})`,
        de: `Internationaler Flug (${iata})`,
        it: `Volo internazionale (${iata})`,
        es: `Vuelo internacional (${iata})`,
        fr: `Vol international (${iata})`,
      }),
      type: "TRANSPORT",
      description: planLangCopy(langCode, {
        sl: `Odhod ${dep} z ${iata}.`,
        en: `Departs ${dep} from ${iata}.`,
        de: `Abflug ${dep} von ${iata}.`,
        it: `Partenza ${dep} da ${iata}.`,
        es: `Sale a las ${dep} desde ${iata}.`,
        fr: `Départ ${dep} de ${iata}.`,
      }),
      arrivalTime: dep,
    },
  ];
}

/** AI + UI notes: align day 1 and last day with real flight times. */
export function buildFlightSchedulingPayload(
  flights: TripFlightContext,
  totalDays: number,
): Record<string, unknown> {
  const arriveMin = parseHm(flights.outboundArrive);
  const scheduling: Record<string, string> = {};

  const arrivalDay = arrivalTripDay(flights);
  const dayKey = arrivalDay === 1 ? "day1" : `day${arrivalDay}`;

  scheduling.originDeparture =
    `Outbound departs ${flights.outboundDepart} from home airport — arrive ${originAirportLeadHours(flights.outboundDepart)}–3h early; EU drivers: compare parking (Parkvia, Parkos, off-site P+R)`;
  if (isRedEyeArrival(flights)) {
    scheduling[dayKey] =
      `Inbound lands ${flights.outboundArrive} (+${flights.outboundArriveDayOffset}d) — morning transfer/check-in, rest 1–2h, then light afternoon stroll or one easy sight; no full-day tours`;
  } else if (arriveMin >= 21 * 60) {
    scheduling[dayKey] =
      `Inbound lands ${flights.outboundArrive} (+${flights.outboundArriveDayOffset}d) — transfer/check-in only; no major sights`;
  } else if (isLateArrival(flights)) {
    scheduling[dayKey] =
      `Inbound lands ${flights.outboundArrive} — light evening stroll near accommodation only`;
  } else if (arriveMin >= 15 * 60) {
    scheduling[dayKey] =
      `Inbound lands ${flights.outboundArrive} — light evening stroll or rest near hotel only`;
  } else if (arriveMin >= 11 * 60) {
    scheduling[dayKey] =
      `Inbound lands ${flights.outboundArrive} — easy afternoon activity max 1 light sight`;
  } else {
    scheduling[dayKey] =
      `Inbound lands ${flights.outboundArrive} — nearly full day after hotel; pace first day gently`;
  }

  if (flights.inboundDepart) {
    const depMin = parseHm(flights.inboundDepart);
    if (depMin < 6 * 60) {
      scheduling.lastDay =
        `Return departs ${flights.inboundDepart} (overnight) — day ${totalDays} is airport transfer only; full Hanoi sightseeing on day ${totalDays - 1}`;
    } else if (depMin <= 9 * 60) {
      scheduling.lastDay =
        `Return departs ${flights.inboundDepart} — day ${totalDays} is airport transfer only; sights end day ${totalDays - 1}`;
    } else if (depMin <= 13 * 60) {
      scheduling.lastDay =
        `Return departs ${flights.inboundDepart} — morning only (1 quick stop), leave for airport ~3h before`;
    } else if (depMin <= 17 * 60) {
      scheduling.lastDay =
        `Return departs ${flights.inboundDepart} — check-out and airport transfer only; leave ${depMin <= 13 * 60 ? 3 : 2.5}h early, no afternoon sights`;
    } else if (depMin >= 21 * 60) {
      scheduling.lastDay =
        `Return departs ${flights.inboundDepart} — nearly full last day after check-out; leave for airport ~3h before departure (not mid-afternoon)`;
    } else {
      scheduling.lastDay =
        `Return departs ${flights.inboundDepart} — max 1 light morning sight; leave for airport ~3h before; no late evening sights`;
    }
  }

  return {
    flights,
    flightScheduling: scheduling,
  };
}

export function flightContextFromLegs(
  outbound: {
    depart: string;
    arrive: string;
    arriveDayOffset: number;
    stops?: number;
    via?: string;
  },
  inbound?: { depart: string; arrive: string; stops?: number; via?: string },
): TripFlightContext {
  return {
    outboundDepart: outbound.depart,
    outboundArrive: outbound.arrive,
    outboundArriveDayOffset: outbound.arriveDayOffset,
    inboundDepart: inbound?.depart,
    inboundArrive: inbound?.arrive,
    ...(outbound.stops != null ? { outboundStops: outbound.stops } : {}),
    ...(inbound?.stops != null ? { inboundStops: inbound.stops } : {}),
    ...(outbound.via ? { outboundVia: outbound.via } : {}),
    ...(inbound?.via ? { inboundVia: inbound.via } : {}),
  };
}

/** Calendar trip day when the inbound flight actually lands (day 1 + offset). */
export function arrivalTripDay(flights?: TripFlightContext): number {
  return 1 + (flights?.outboundArriveDayOffset ?? 0);
}

/** True for days before the plane lands — no destination activities yet. */
export function isInFlightTripDay(tripDay: number, flights?: TripFlightContext): boolean {
  if (!flights) return false;
  return tripDay < arrivalTripDay(flights);
}

/** +1d landing before noon — red-eye, needs recovery; NOT the same as “afternoon landing next day”. */
export function isRedEyeArrival(flights?: TripFlightContext): boolean {
  if (!flights) return false;
  return flights.outboundArriveDayOffset > 0 && parseHm(flights.outboundArrive) < 12 * 60;
}

/** Evening / late-afternoon landing — light day only. 17:55 must NOT be treated as a free afternoon. */
export function isLateArrival(flights?: TripFlightContext): boolean {
  if (!flights) return false;
  return parseHm(flights.outboundArrive) >= 17 * 60;
}

/** Which UI block (dopoldan/popoldan/večer) matches the real landing time. */
export function arrivalDaySlot(
  flights?: TripFlightContext,
): "morning" | "afternoon" | "evening" {
  if (!flights) return "afternoon";
  const arriveMin = parseHm(flights.outboundArrive);
  // 17:00+ → evening (Etihad MUC→HKT 17:55 must not unlock “dopoldan/popoldan” fillers).
  if (arriveMin >= 17 * 60) return "evening";
  if (arriveMin >= 12 * 60) return "afternoon";
  return "morning";
}

/** Midday/evening landing — skip breakfast and midday fillers before airport logistics. */
export function isTightArrivalDay(flights?: TripFlightContext): boolean {
  if (!flights) return false;
  if (isRedEyeArrival(flights)) return true;
  if (isLateArrival(flights)) return true;
  const slot = arrivalDaySlot(flights);
  return slot === "afternoon" || slot === "evening";
}

/** Return flight in the small hours — last calendar day is airport transfer only. */
export function isOvernightDeparture(flights?: TripFlightContext): boolean {
  if (!flights?.inboundDepart) return false;
  return parseHm(flights.inboundDepart) < 6 * 60;
}

/** Human label for boarding-pass-style local arrival time at destination. */
export function formatArrivalTime(flights: TripFlightContext, langCode: string | boolean): string {
  const lang = typeof langCode === "boolean" ? (langCode ? "sl" : "en") : langCode;
  const t = flights.outboundArrive;
  if (flights.outboundArriveDayOffset > 0) {
    const d = flights.outboundArriveDayOffset;
    return planLangCopy(lang, {
      sl: `${t} (+${d} ${d === 1 ? "dan" : "dni"} od odhoda, lokalni čas na destinaciji)`,
      en: `${t} (+${d} day${d === 1 ? "" : "s"} from departure, local time at destination)`,
      de: `${t} (+${d} Tag${d === 1 ? "" : "e"} ab Abflug, Ortszeit am Ziel)`,
      it: `${t} (+${d} giorn${d === 1 ? "o" : "i"} dalla partenza, ora locale a destinazione)`,
      es: `${t} (+${d} día${d === 1 ? "" : "s"} desde la salida, hora local en destino)`,
      fr: `${t} (+${d} jour${d === 1 ? "" : "s"} après le départ, heure locale à destination)`,
    });
  }
  return planLangCopy(lang, {
    sl: `${t} (lokalni čas na destinaciji)`,
    en: `${t} (local time at destination)`,
    de: `${t} (Ortszeit am Ziel)`,
    it: `${t} (ora locale a destinazione)`,
    es: `${t} (hora local en destino)`,
    fr: `${t} (heure locale à destination)`,
  });
}

/** Short clock for activity copy / prompts — avoid repeating the long (+1 dan…) phrase. */
export function formatArrivalTimeShort(flights: TripFlightContext, langCode: string | boolean): string {
  const lang = typeof langCode === "boolean" ? (langCode ? "sl" : "en") : langCode;
  const t = flights.outboundArrive;
  if (flights.outboundArriveDayOffset > 0) {
    const d = flights.outboundArriveDayOffset;
    return planLangCopy(lang, {
      sl: `${t} (+${d}d, lokalni čas)`,
      en: `${t} (+${d}d local)`,
      de: `${t} (+${d}d Ortszeit)`,
      it: `${t} (+${d}g, ora locale)`,
      es: `${t} (+${d}d, hora local)`,
      fr: `${t} (+${d}j, heure locale)`,
    });
  }
  return planLangCopy(lang, {
    sl: `${t} (lokalni čas)`,
    en: `${t} (local time)`,
    de: `${t} (Ortszeit)`,
    it: `${t} (ora locale)`,
    es: `${t} (hora local)`,
    fr: `${t} (heure locale)`,
  });
}

export function isEarlyDeparture(flights?: TripFlightContext): boolean {
  if (!flights?.inboundDepart) return false;
  return parseHm(flights.inboundDepart) <= 13 * 60;
}

/** Return flight by ~14:30 — no sights at all, airport focus only. */
export function isTightDeparture(flights?: TripFlightContext): boolean {
  if (!flights?.inboundDepart) return false;
  return parseHm(flights.inboundDepart) <= 14 * 60 + 30;
}

/** Return by ≤17:00 — must leave hotel ~2.5h early; no popoldan/večer ogledi. */
export function isAfternoonDeparture(flights?: TripFlightContext): boolean {
  if (!flights?.inboundDepart) return false;
  const depMin = parseHm(flights.inboundDepart);
  return depMin > 14 * 60 + 30 && depMin <= 17 * 60;
}

/** Return 17:00–20:59 — one light morning sight; airport transfer mid-afternoon. */
export function isEveningDeparture(flights?: TripFlightContext): boolean {
  if (!flights?.inboundDepart) return false;
  const depMin = parseHm(flights.inboundDepart);
  return depMin > 17 * 60 && depMin < 21 * 60;
}

/** Return ≥21:00 — full sightseeing day; airport transfer only in the evening. */
export function isLateNightDeparture(flights?: TripFlightContext): boolean {
  if (!flights?.inboundDepart) return false;
  return parseHm(flights.inboundDepart) >= 21 * 60;
}

/** Minutes after wheels-down before leaving the airport (immigration + bags). */
export const ARRIVAL_TRANSFER_OFFSET_MIN = 45;
/** Minutes after wheels-down when hotel/RV check-in starts. */
export const ARRIVAL_HOTEL_OFFSET_MIN = 90;

/** Hotel → airport travel time for sprawling long-haul hubs (AirTrain/subway). */
export function departureTransferLeadMin(iata?: string): number {
  const code = (iata ?? "").trim().toUpperCase();
  if (
    /^(JFK|EWR|LGA|LAX|SFO|ORD|MIA|LHR|LGW|STN|CDG|ORY|NRT|HND|SIN|DXB|ICN)$/.test(
      code,
    )
  ) {
    return 90;
  }
  return 30;
}

/** Minutes before depart: checkout, leave hotel, be at terminal. */
export function departureLogisticsOffsetsMin(iata?: string): {
  checkoutMin: number;
  transferMin: number;
  airportMin: number;
  leaveHours: number;
} {
  const transferLead = departureTransferLeadMin(iata);
  const airportMin = 3 * 60;
  const transferMin = airportMin + transferLead;
  const checkoutMin = transferMin + 30;
  return {
    checkoutMin,
    transferMin,
    airportMin,
    leaveHours: transferMin / 60,
  };
}

/** Day 1: airport → transfer → check-in — then sights if time allows. */
export function buildArrivalLogistics(
  city: string,
  flights: TripFlightContext | undefined,
  locale: TripLocale,
  opts?: { accommodationMode?: "hotel" | "motorhome" },
): LogisticsActivity[] {
  const lang = locale.langCode;
  const motorhome = opts?.accommodationMode === "motorhome";
  const arriveLabel = flights ? formatArrivalTimeShort(flights, lang) : "14:00";
  const late = isLateArrival(flights);
  const airportHint = airportArrivalHint(city, locale);

  const landHm = flights?.outboundArrive?.trim() || "14:00";
  // Fixed stagger — never pile transfer + hotel on wheels-down (MUC–SYD 16:50 bug).
  const transferAt = addHmMinutes(landHm, ARRIVAL_TRANSFER_OFFSET_MIN);
  const hotelAt = addHmMinutes(landHm, ARRIVAL_HOTEL_OFFSET_MIN);

  return [
    {
      name: planLangCopy(lang, {
        sl: "Prihod na letališče",
        en: "Airport arrival",
        de: "Ankunft am Flughafen",
        it: "Arrivo in aeroporto",
        es: "Llegada al aeropuerto",
        fr: "Arrivée à l'aéroport",
      }),
      type: "TRANSPORT",
      arrivalTime: landHm,
      description: planLangCopy(lang, {
        sl: `Polet pristane na destinaciji ob ${arriveLabel}. Po izhodu sledi kontrola, prevzem prtljage in orientacija v arrival hallu. ${airportHint}`,
        en: `Your flight lands at ${arriveLabel}. Clear immigration, collect luggage, and orient yourself in arrivals. ${airportHint}`,
        de: `Dein Flug landet um ${arriveLabel}. Danach Einreise, Gepäck und Orientierung in der Ankunftshalle. ${airportHint}`,
        it: `Il volo atterra alle ${arriveLabel}. Poi controlli, ritiro bagagli e orientamento in arrivi. ${airportHint}`,
        es: `Tu vuelo aterriza a las ${arriveLabel}. Luego inmigración, equipaje y orientación en llegadas. ${airportHint}`,
        fr: `Votre vol atterrit à ${arriveLabel}. Puis contrôles, bagages et orientation aux arrivées. ${airportHint}`,
      }),
    },
    {
      name: motorhome
        ? planLangCopy(lang, {
            sl: `Prevoz do najema avtodoma / avtokampa (${locale.transferLabel})`,
            en: `Transfer to RV rental / campsite (${locale.transferLabel})`,
            de: `Transfer zur Wohnmobil-Vermietung / Campingplatz (${locale.transferLabel})`,
            it: `Transfer al noleggio camper / campeggio (${locale.transferLabel})`,
            es: `Traslado al alquiler de autocaravana / camping (${locale.transferLabel})`,
            fr: `Transfert location camping-car / camping (${locale.transferLabel})`,
          })
        : planLangCopy(lang, {
            sl: `Prevoz do hotela (${locale.transferLabel})`,
            en: `Transfer to hotel (${locale.transferLabel})`,
            de: `Transfer zum Hotel (${locale.transferLabel})`,
            it: `Transfer all'hotel (${locale.transferLabel})`,
            es: `Traslado al hotel (${locale.transferLabel})`,
            fr: `Transfert à l'hôtel (${locale.transferLabel})`,
          }),
      type: "TRANSPORT",
      priceLabel: locale.transferPrice,
      arrivalTime: transferAt,
      description: motorhome
        ? planLangCopy(lang, {
            sl: `Okoli ${transferAt} z letališča do najemnice avtodoma ali prvega avtokampa izven mestnega jedra. V center mesta kasneje z javnim prevozom ali P+R — ne parkiraj RV-ja v centru.`,
            en: `Around ${transferAt}, leave the airport for the RV rental depot or first campsite outside the city centre. Use transit or P+R for downtown later — do not park the RV downtown.`,
            de: `Gegen ${transferAt} vom Flughafen zur Wohnmobil-Vermietung oder zum ersten Campingplatz außerhalb der Innenstadt. Ins Zentrum später mit ÖPNV oder P+R — Wohnmobil nicht in der City parken.`,
          })
        : hotelTransferDescription(city, locale),
    },
    {
      name: motorhome
        ? planLangCopy(lang, {
            sl: "Prihod v kamp",
            en: "Arrival at camp",
            de: "Ankunft auf dem Camp",
          })
        : planLangCopy(lang, {
            sl: "Prihod v hotel",
            en: "Hotel arrival",
            de: "Ankunft im Hotel",
          }),
      type: "STAY",
      arrivalTime: hotelAt,
      description: planLangCopy(lang, {
        sl: late
          ? `Namestitev okoli ${hotelAt} (pristanek ${arriveLabel}). 1–2 uri počitka — danes brez večjih ogledov.`
          : `Namestitev okoli ${hotelAt}. 1–2 uri počitka, potem samo lahek program.`,
        en: late
          ? `Check in around ${hotelAt} (landed ${arriveLabel}). Rest 1–2 hours — no major sights today.`
          : `Check in around ${hotelAt}. Rest 1–2 hours, then only a light programme.`,
        de: late
          ? `Ankunft gegen ${hotelAt} (Landung ${arriveLabel}). 1–2 Stunden Pause — heute keine großen Besichtigungen.`
          : `Ankunft gegen ${hotelAt}. 1–2 Stunden Pause, danach nur ein leichtes Programm.`,
      }),
    },
  ];
}

/** Add minutes to "HH:MM" (wraps past midnight for display only). */
export function addHmMinutes(hm: string, add: number): string {
  const base = parseHm(hm);
  const total = ((base + add) % (24 * 60) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Last day: checkout / RV return → airport timing based on return flight. */
export function buildDepartureLogistics(
  city: string,
  flights: TripFlightContext,
  locale: TripLocale,
  opts?: { accommodationMode?: "hotel" | "motorhome" },
): LogisticsActivity[] {
  const lang = locale.langCode;
  const motorhome = opts?.accommodationMode === "motorhome";
  const dep = flights.inboundDepart ?? "12:00";
  const depMin = parseHm(dep);
  const inboundArrive = inboundArriveForDisplay(dep, flights.inboundArrive);
  const offsets = departureLogisticsOffsetsMin(locale.destinationIata);
  const leaveHours = offsets.leaveHours;

  const leaveHint =
    depMin <= 9 * 60
      ? planLangCopy(lang, {
          sl: "zaradi zgodnjega leta vstani zgodaj",
          en: "early wake-up for your morning flight",
          de: "wegen des frühen Flugs früh aufstehen",
          it: "sveglia presto per il volo mattutino",
          es: "madruga por el vuelo temprano",
          fr: "réveil tôt pour le vol du matin",
        })
      : depMin <= 13 * 60
        ? planLangCopy(lang, {
            sl: "dopoldanski let — brez dodatnih ogledov, samo prevoz na letališče",
            en: "morning flight — no extra sights, airport transfer only",
            de: "Vormittagsflug — keine Extra-Sightseeing-Touren, nur Transfer zum Flughafen",
            it: "volo mattutino — niente visite extra, solo transfer aeroporto",
            es: "vuelo de mañana — sin visitas extra, solo traslado al aeropuerto",
            fr: "vol du matin — pas de visites en plus, seulement transfert aéroport",
          })
        : depMin <= 17 * 60
          ? motorhome
            ? planLangCopy(lang, {
                sl: `popoldanski let ob ${dep} — brez popoldanskih ogledov, po vrnitvi avtodoma neposredno na letališče`,
                en: `afternoon flight at ${dep} — no afternoon sights; return RV then go straight to the airport`,
                de: `Nachmittagsflug um ${dep} — keine Nachmittags-Sightseeing-Touren; Wohnmobil zurückgeben und direkt zum Flughafen`,
                it: `volo pomeridiano alle ${dep} — niente visite; restituisci il camper e vai in aeroporto`,
                es: `vuelo de tarde a las ${dep} — sin visitas; devuelve la autocaravana y ve al aeropuerto`,
                fr: `vol de l'après-midi à ${dep} — pas de visites; rendez le camping-car puis aéroport`,
              })
            : planLangCopy(lang, {
                sl: `popoldanski let ob ${dep} — brez popoldanskih ogledov, po check-outu neposredno na letališče`,
                en: `afternoon flight at ${dep} — no afternoon sights; go straight to the airport after check-out`,
                de: `Nachmittagsflug um ${dep} — keine Nachmittags-Sightseeing-Touren; nach Check-out direkt zum Flughafen`,
                it: `volo pomeridiano alle ${dep} — niente visite; dopo il check-out vai in aeroporto`,
                es: `vuelo de tarde a las ${dep} — sin visitas; tras el check-out ve al aeropuerto`,
                fr: `vol de l'après-midi à ${dep} — pas de visites; après le check-out, aéroport`,
              })
          : depMin >= 21 * 60
            ? planLangCopy(lang, {
                sl: `pozni večernji let ob ${dep} — po check-outu še skoraj cel dan na voljo; na letališče šele ~3 ure pred odletom`,
                en: `late evening flight at ${dep} — nearly full day after check-out; head to airport ~3h before departure`,
                de: `später Abendflug um ${dep} — nach Check-out fast den ganzen Tag Zeit; erst ~3 Stunden vor Abflug zum Flughafen`,
                it: `volo serale tardi alle ${dep} — quasi tutta la giornata dopo il check-out; in aeroporto ~3 ore prima`,
                es: `vuelo nocturno a las ${dep} — casi todo el día tras el check-out; al aeropuerto ~3 h antes`,
                fr: `vol tard le soir à ${dep} — presque toute la journée après check-out; aéroport ~3 h avant`,
              })
            : planLangCopy(lang, {
                sl: "večernji let — največ 1 lahek dopoldanski ogled, na letališče ~3 ure pred odletom",
                en: "evening flight — at most 1 light morning sight; at airport ~3h before departure",
                de: "Abendflug — höchstens 1 leichter Vormittags-Stopp; ~3 Stunden vor Abflug am Flughafen",
                it: "volo serale — al massimo 1 visita leggera al mattino; in aeroporto ~3 ore prima",
                es: "vuelo de tarde/noche — como máximo 1 visita ligera por la mañana; aeropuerto ~3 h antes",
                fr: "vol du soir — au plus 1 visite légère le matin; aéroport ~3 h avant",
              });

  const checkoutName = motorhome
    ? planLangCopy(lang, {
        sl: "Vrnitev avtodoma v najemnico",
        en: "Return motorhome to rental depot",
        de: "Wohnmobil zur Vermietung zurückbringen",
        it: "Restituzione del camper al noleggio",
        es: "Devolución de la autocaravana al alquiler",
        fr: "Retour du camping-car au loueur",
      })
    : planLangCopy(lang, {
        sl: "Odhod iz hotela (check-out)",
        en: "Hotel check-out",
        de: "Hotel Check-out",
        it: "Check-out dall'hotel",
        es: "Check-out del hotel",
        fr: "Check-out de l'hôtel",
      });

  const checkoutDesc = motorhome
    ? depMin <= 17 * 60
      ? planLangCopy(lang, {
          sl: `Zjutraj vrni avtodom v najemnico (prazna posoda, čiščenje po navodilih), prevzemi osebno prtljago in se odpravi na letališče — ${leaveHint}.`,
          en: `Return the RV to the rental depot in the morning (empty tanks, basic clean), collect your bags, and head to the airport — ${leaveHint}.`,
          de: `Morgens Wohnmobil zurückgeben (leere Tanks, Grundreinigung), Gepäck holen und zum Flughafen — ${leaveHint}.`,
          it: `La mattina restituisci il camper (serbatoi vuoti, pulizia base), prendi i bagagli e vai in aeroporto — ${leaveHint}.`,
          es: `Por la mañana devuelve la autocaravana (depósitos vacíos, limpieza básica), recoge el equipaje y ve al aeropuerto — ${leaveHint}.`,
          fr: `Le matin, rendez le camping-car (réservoirs vides, ménage basique), prenez les bagages et allez à l'aéroport — ${leaveHint}.`,
        })
      : planLangCopy(lang, {
          sl: `Zjutraj vrni avtodom v najemnico, opravi končni pregled in prevzemi prtljago. ${leaveHint}.`,
          en: `Return the RV in the morning, complete the final inspection, and collect your luggage. ${leaveHint}.`,
          de: `Morgens Wohnmobil zurückgeben, Endkontrolle und Gepäck holen. ${leaveHint}.`,
          it: `La mattina restituisci il camper, fai il controllo finale e prendi i bagagli. ${leaveHint}.`,
          es: `Por la mañana devuelve la autocaravana, haz la inspección final y recoge el equipaje. ${leaveHint}.`,
          fr: `Le matin, rendez le camping-car, faites le contrôle final et prenez les bagages. ${leaveHint}.`,
        })
    : depMin <= 17 * 60
      ? planLangCopy(lang, {
          sl: `Zjutraj zaključi check-out in se odpravi na letališče — ${leaveHint}.`,
          en: `Check out in the morning and head to the airport — ${leaveHint}.`,
          de: `Morgens auschecken und zum Flughafen — ${leaveHint}.`,
          it: `La mattina fai il check-out e vai in aeroporto — ${leaveHint}.`,
          es: `Por la mañana haz el check-out y ve al aeropuerto — ${leaveHint}.`,
          fr: `Le matin, faites le check-out et allez à l'aéroport — ${leaveHint}.`,
        })
      : planLangCopy(lang, {
          sl: `Check-out pred odhodom na letališče — ${leaveHint}. Prtljago vzemi s seboj ali shrani na recepciji do transferja.`,
          en: `Check out before the airport transfer — ${leaveHint}. Take bags with you or store them at reception until you leave.`,
          de: `Check-out vor dem Transfer zum Flughafen — ${leaveHint}. Gepäck mitnehmen oder bis zum Transfer an der Rezeption lassen.`,
          it: `Check-out prima del transfer in aeroporto — ${leaveHint}. Porta i bagagli o lasciali in reception fino alla partenza.`,
          es: `Check-out antes del traslado al aeropuerto — ${leaveHint}. Lleva el equipaje o déjalo en recepción hasta salir.`,
          fr: `Check-out avant le transfert aéroport — ${leaveHint}. Prenez les bagages ou laissez-les à la réception jusqu'au départ.`,
        });

  const airportDesc =
    depMin <= 13 * 60
      ? planLangCopy(lang, {
          sl: `Na letališču oddaj prtljago, opravi check-in in varnostni pregled. Zgodnji/popoldanski odhod — danes ni časa za dodatne oglede v mestu.`,
          en: `Check in and clear security. Early/midday departure — no extra city sightseeing today.`,
          de: `Am Flughafen Gepäck aufgeben, Check-in und Sicherheitskontrolle. Früher/mittäglicher Abflug — heute keine Extra-Sightseeing-Touren in der Stadt.`,
          it: `In aeroporto: bagagli, check-in e controlli. Partenza mattutina/mezzogiorno — niente visite in città oggi.`,
          es: `En el aeropuerto: facturación, check-in y seguridad. Salida temprano/mediodía — sin visitas en la ciudad hoy.`,
          fr: `À l'aéroport : bagages, check-in et contrôles. Départ matin/midi — pas de visites en ville aujourd'hui.`,
        })
      : depMin <= 17 * 60
        ? planLangCopy(lang, {
            sl: `Na letališču oddaj prtljago in opravi check-in. Popoldanski odhod — brez dodatnih ogledov po prevozu.`,
            en: `Check in and clear security. Afternoon departure — no sights after transfer.`,
            de: `Am Flughafen Gepäck aufgeben und Check-in. Nachmittagsflug — nach dem Transfer keine Sightseeing-Touren mehr.`,
            it: `In aeroporto: bagagli e check-in. Partenza pomeridiana — niente visite dopo il transfer.`,
            es: `En el aeropuerto: facturación y check-in. Salida de tarde — sin visitas tras el traslado.`,
            fr: `À l'aéroport : bagages et check-in. Départ l'après-midi — pas de visites après le transfert.`,
          })
        : depMin >= 21 * 60
          ? planLangCopy(lang, {
              sl: `Na letališču oddaj prtljago in opravi check-in. Pozni odhod ob ${dep} — na letališče pridi ~3 ure pred odletom, ne popoldne.`,
              en: `Check in and clear security. Late departure at ${dep} — arrive at airport ~3h before, not mid-afternoon.`,
              de: `Am Flughafen Gepäck aufgeben und Check-in. Später Abflug um ${dep} — ~3 Stunden vorher am Flughafen, nicht am Nachmittag.`,
              it: `In aeroporto: bagagli e check-in. Partenza tardi alle ${dep} — arriva ~3 ore prima, non nel pomeriggio.`,
              es: `En el aeropuerto: facturación y check-in. Salida tarde a las ${dep} — llega ~3 h antes, no por la tarde.`,
              fr: `À l'aéroport : bagages et check-in. Départ tard à ${dep} — arrivez ~3 h avant, pas l'après-midi.`,
            })
          : planLangCopy(lang, {
              sl: `Na letališču oddaj prtljago in opravi check-in. Večernji odhod ob ${dep} — največ 1 lahek dopoldanski ogled, na letališču ~3 ure prej.`,
              en: `Check in and clear security. Evening departure at ${dep} — at most one light morning stop; at airport ~3h early.`,
              de: `Am Flughafen Gepäck aufgeben und Check-in. Abendflug um ${dep} — höchstens ein leichter Vormittags-Stopp; ~3 Stunden früher am Flughafen.`,
              it: `In aeroporto: bagagli e check-in. Partenza serale alle ${dep} — al massimo una visita leggera al mattino; in aeroporto ~3 ore prima.`,
              es: `En el aeropuerto: facturación y check-in. Salida por la tarde/noche a las ${dep} — como máximo una parada ligera por la mañana; aeropuerto ~3 h antes.`,
              fr: `À l'aéroport : bagages et check-in. Départ du soir à ${dep} — au plus une courte visite le matin; aéroport ~3 h avant.`,
            });

  const fmt = (minsBefore: number) => {
    const total = ((depMin - minsBefore) % (24 * 60) + 24 * 60) % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  // Strict increasing sequence before depart (same as patchAirportActivityTimes).
  const checkoutAt = fmt(offsets.checkoutMin);
  const transferAt = fmt(offsets.transferMin);
  const airportAt = fmt(offsets.airportMin);

  return [
    {
      name: checkoutName,
      type: "STAY",
      description: checkoutDesc,
      arrivalTime: checkoutAt,
    },
    {
      name: planLangCopy(lang, {
        sl: `Prevoz na letališče (${locale.transferLabel})`,
        en: `Airport transfer (${locale.transferLabel})`,
        de: `Flughafentransfer (${locale.transferLabel})`,
        it: `Transfer in aeroporto (${locale.transferLabel})`,
        es: `Traslado al aeropuerto (${locale.transferLabel})`,
        fr: `Transfert aéroport (${locale.transferLabel})`,
      }),
      type: "TRANSPORT",
      priceLabel: locale.transferPrice,
      description: airportTransferDescription(city, locale, dep, leaveHours),
      arrivalTime: transferAt,
    },
    {
      name: planLangCopy(lang, {
        sl: "Prihod na letališče in check-in",
        en: "Airport check-in",
        de: "Check-in am Flughafen",
        it: "Check-in in aeroporto",
        es: "Check-in en el aeropuerto",
        fr: "Enregistrement à l'aéroport",
      }),
      type: "TRANSPORT",
      description: airportDesc,
      arrivalTime: airportAt,
    },
    {
      name: planLangCopy(lang, {
        sl: "Mednarodni povratni let",
        en: "International return flight",
        de: "Internationaler Rückflug",
        it: "Volo internazionale di ritorno",
        es: "Vuelo internacional de regreso",
        fr: "Vol international retour",
      }),
      type: "TRANSPORT",
      description: planLangCopy(lang, {
        sl: `Odhod ${dep}${inboundArrive ? `, prihod ${inboundArrive}` : ""}.`,
        en: `Depart ${dep}${inboundArrive ? `, arrive ${inboundArrive}` : ""}.`,
        de: `Abflug ${dep}${inboundArrive ? `, Ankunft ${inboundArrive}` : ""}.`,
        it: `Partenza ${dep}${inboundArrive ? `, arrivo ${inboundArrive}` : ""}.`,
        es: `Salida ${dep}${inboundArrive ? `, llegada ${inboundArrive}` : ""}.`,
        fr: `Départ ${dep}${inboundArrive ? `, arrivée ${inboundArrive}` : ""}.`,
      }),
      arrivalTime: dep,
      departureTime: inboundArrive,
    },
  ];
}
