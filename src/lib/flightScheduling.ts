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
    });
  }
  return planLangCopy(langCode, {
    sl: "2–3 ure pred odletom",
    en: "2–3 hours early",
    de: "2–3 Stunden vor Abflug",
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
      })
    : "";

  return planLangCopy(langCode, {
    sl: `Odhod z domačega letališča ${name} (${iata}) ob ${dep}. Na mednarodni let pridi ${leadPhrase} (check-in, oddaja prtljage, varnostna kontrola).${parking}`,
    en: `Home airport ${name} (${iata}), flight departs ${dep}. Arrive ${leadPhrase} (check-in, bags, security).${parking}`,
    de: `Heimatflughafen ${name} (${iata}), Abflug ${dep}. Sei ${leadPhrase} am Flughafen (Check-in, Gepäck, Sicherheitskontrolle).${parking}`,
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
  const hint = buildOriginDepartureHint(originIata, flights, langCode);

  return [
    {
      name: planLangCopy(langCode, {
        sl: `Odhod: ${name} (${iata})`,
        en: `Departure: ${name} (${iata})`,
        de: `Abflug: ${name} (${iata})`,
      }),
      type: "TRANSPORT",
      description: hint,
    },
    {
      name: planLangCopy(langCode, {
        sl: "Check-in in varnostni pregled",
        en: "Check-in and security",
        de: "Check-in und Sicherheitskontrolle",
      }),
      type: "TRANSPORT",
      description: planLangCopy(langCode, {
        sl: `Na letališču ${iata} oddaj prtljago (če jo imaš), opravi check-in in varnostni pregled. Za mednarodne lete računaj ${leadPhrase} ob ${dep} — ob konicah in počitniških terminih raje še več rezerve.`,
        en: `Check in, drop bags if needed, and clear security at ${iata}. Allow ${leadPhrase} before your ${dep} departure — more in peak season.`,
        de: `Am Flughafen ${iata} Gepäck aufgeben (falls nötig), Check-in und Sicherheitskontrolle. Für internationale Flüge plane ${leadPhrase} vor ${dep} — in Stoßzeiten lieber mehr Puffer.`,
      }),
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
    });
  }
  return planLangCopy(lang, {
    sl: `${t} (lokalni čas na destinaciji)`,
    en: `${t} (local time at destination)`,
    de: `${t} (Ortszeit am Ziel)`,
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
    });
  }
  return planLangCopy(lang, {
    sl: `${t} (lokalni čas)`,
    en: `${t} (local time)`,
    de: `${t} (Ortszeit)`,
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
  // Rough transfer window after wheels-down (immigration + bag + taxi).
  const transferEnd = addHmMinutes(landHm, 90);

  return [
    {
      name: planLangCopy(lang, {
        sl: "Prihod na letališče",
        en: "Airport arrival",
        de: "Ankunft am Flughafen",
      }),
      type: "TRANSPORT",
      arrivalTime: landHm,
      description: planLangCopy(lang, {
        sl: `Polet pristane na destinaciji ob ${arriveLabel}. Po izhodu sledi kontrola, prevzem prtljage in orientacija v arrival hallu. ${airportHint}`,
        en: `Your flight lands at ${arriveLabel}. Clear immigration, collect luggage, and orient yourself in arrivals. ${airportHint}`,
        de: `Dein Flug landet um ${arriveLabel}. Danach Einreise, Gepäck und Orientierung in der Ankunftshalle. ${airportHint}`,
      }),
    },
    {
      name: motorhome
        ? planLangCopy(lang, {
            sl: `Prevoz do najema avtodoma / avtokampa (${locale.transferLabel})`,
            en: `Transfer to RV rental / campsite (${locale.transferLabel})`,
            de: `Transfer zur Wohnmobil-Vermietung / Campingplatz (${locale.transferLabel})`,
          })
        : planLangCopy(lang, {
            sl: `Prevoz do hotela (${locale.transferLabel})`,
            en: `Transfer to hotel (${locale.transferLabel})`,
            de: `Transfer zum Hotel (${locale.transferLabel})`,
          }),
      type: "TRANSPORT",
      priceLabel: locale.transferPrice,
      arrivalTime: landHm,
      departureTime: transferEnd,
      description: motorhome
        ? planLangCopy(lang, {
            sl: `Z letališča do najemnice avtodoma ali prvega avtokampa izven mestnega jedra. V center mesta kasneje z javnim prevozom ali P+R — ne parkiraj RV-ja v centru.`,
            en: `From the airport to the RV rental depot or first campsite outside the city centre. Use transit or P+R for downtown later — do not park the RV downtown.`,
            de: `Vom Flughafen zur Wohnmobil-Vermietung oder zum ersten Campingplatz außerhalb der Innenstadt. Ins Zentrum später mit ÖPNV oder P+R — Wohnmobil nicht in der City parken.`,
          })
        : hotelTransferDescription(city, locale),
    },
    {
      name: planLangCopy(lang, {
        sl: "Check-in, osvežitev in kratek odmor",
        en: "Check-in, refresh, and short rest",
        de: "Check-in, frisch machen und kurze Pause",
      }),
      type: "STAY",
      arrivalTime: transferEnd,
      description: planLangCopy(lang, {
        sl: late
          ? motorhome
            ? `Na avtokampu se namestiš, osvežiš in počakaš 1–2 uri po letu. Zaradi poznega prihoda (${arriveLabel}) danes brez večjih ogledov — le lahek večernji sprehod v bližini kampa, če imaš energijo.`
            : `V hotelu se namestiš, osvežiš in narediš vsaj 1–2 uri počitka po letu. Zaradi poznega prihoda (${arriveLabel}) danes brez večjih ogledov — le lahek večernji sprehod v bližini, če imaš še energijo.`
          : motorhome
            ? `Po prevzemu avtodoma se namestiš na kampu, osvežiš in počakaš 1–2 uri. Šele nato nadaljuješ z lažjimi ogledi — brez hitenja z letališča v center z RV-jem.`
            : `Po prihodu v hotel se namestiš, osvežiš, napolniš vodo in počakaš 1–2 uri, da se prilagodiš podnebju in časovnemu pasu. Šele nato nadaljuješ z ogledi po načrtu — brez hitenja takoj z letališča na znamenitosti.`,
        en: late
          ? motorhome
            ? `Set up at the campsite and rest 1–2 hours. With a late arrival (${arriveLabel}), skip major sights — optional light stroll near camp only.`
            : `Check in, freshen up, and rest 1–2 hours. With a late arrival (${arriveLabel}), skip major sights today — optional light evening stroll near the hotel only.`
          : motorhome
            ? `Check in at the campsite, freshen up, and rest 1–2 hours. Only then continue with lighter sights — don't rush downtown with the RV.`
            : `Check in, freshen up, hydrate, and rest 1–2 hours after the flight. Only then continue with planned sights — don't rush straight from the airport.`,
        de: late
          ? motorhome
            ? `Auf dem Campingplatz einrichten und 1–2 Stunden ruhen. Bei später Ankunft (${arriveLabel}) heute keine großen Sightseeing-Touren — höchstens ein leichter Spaziergang am Camp.`
            : `Einchecken, frisch machen und 1–2 Stunden ruhen. Bei später Ankunft (${arriveLabel}) heute keine großen Sightseeing-Touren — höchstens ein leichter Abendspaziergang in der Nähe.`
          : motorhome
            ? `Nach der Wohnmobil-Übernahme auf dem Camp einrichten, frisch machen und 1–2 Stunden ruhen. Danach erst leichtere Ausflüge — nicht direkt vom Flughafen mit dem RV in die Innenstadt.`
            : `Nach dem Check-in im Hotel frisch machen, trinken und 1–2 Stunden ruhen, um dich an Klima und Zeitzone zu gewöhnen. Danach erst nach Plan weiter — nicht direkt vom Flughafen zu den Sehenswürdigkeiten.`,
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
  const leaveHours =
    depMin <= 9 * 60 ? 2.5 : depMin <= 13 * 60 ? 3 : depMin <= 17 * 60 ? 2.5 : 2;

  const leaveHint =
    depMin <= 9 * 60
      ? planLangCopy(lang, {
          sl: "zaradi zgodnjega leta vstani zgodaj",
          en: "early wake-up for your morning flight",
          de: "wegen des frühen Flugs früh aufstehen",
        })
      : depMin <= 13 * 60
        ? planLangCopy(lang, {
            sl: "dopoldanski let — brez dodatnih ogledov, samo prevoz na letališče",
            en: "morning flight — no extra sights, airport transfer only",
            de: "Vormittagsflug — keine Extra-Sightseeing-Touren, nur Transfer zum Flughafen",
          })
        : depMin <= 17 * 60
          ? motorhome
            ? planLangCopy(lang, {
                sl: `popoldanski let ob ${dep} — brez popoldanskih ogledov, po vrnitvi avtodoma neposredno na letališče`,
                en: `afternoon flight at ${dep} — no afternoon sights; return RV then go straight to the airport`,
                de: `Nachmittagsflug um ${dep} — keine Nachmittags-Sightseeing-Touren; Wohnmobil zurückgeben und direkt zum Flughafen`,
              })
            : planLangCopy(lang, {
                sl: `popoldanski let ob ${dep} — brez popoldanskih ogledov, po check-outu neposredno na letališče`,
                en: `afternoon flight at ${dep} — no afternoon sights; go straight to the airport after check-out`,
                de: `Nachmittagsflug um ${dep} — keine Nachmittags-Sightseeing-Touren; nach Check-out direkt zum Flughafen`,
              })
          : depMin >= 21 * 60
            ? planLangCopy(lang, {
                sl: `pozni večernji let ob ${dep} — po check-outu še skoraj cel dan na voljo; na letališče šele ~3 ure pred odletom`,
                en: `late evening flight at ${dep} — nearly full day after check-out; head to airport ~3h before departure`,
                de: `später Abendflug um ${dep} — nach Check-out fast den ganzen Tag Zeit; erst ~3 Stunden vor Abflug zum Flughafen`,
              })
            : planLangCopy(lang, {
                sl: "večernji let — največ 1 lahek dopoldanski ogled, na letališče ~3 ure pred odletom",
                en: "evening flight — at most 1 light morning sight; at airport ~3h before departure",
                de: "Abendflug — höchstens 1 leichter Vormittags-Stopp; ~3 Stunden vor Abflug am Flughafen",
              });

  const checkoutName = motorhome
    ? planLangCopy(lang, {
        sl: "Vrnitev avtodoma v najemnico",
        en: "Return motorhome to rental depot",
        de: "Wohnmobil zur Vermietung zurückbringen",
      })
    : planLangCopy(lang, {
        sl: "Odhod iz hotela (check-out)",
        en: "Hotel check-out",
        de: "Hotel Check-out",
      });

  const checkoutDesc = motorhome
    ? depMin <= 17 * 60
      ? planLangCopy(lang, {
          sl: `Zjutraj vrni avtodom v najemnico (prazna posoda, čiščenje po navodilih), prevzemi osebno prtljago in se odpravi na letališče — ${leaveHint}.`,
          en: `Return the RV to the rental depot in the morning (empty tanks, basic clean), collect your bags, and head to the airport — ${leaveHint}.`,
          de: `Morgens Wohnmobil zurückgeben (leere Tanks, Grundreinigung), Gepäck holen und zum Flughafen — ${leaveHint}.`,
        })
      : planLangCopy(lang, {
          sl: `Zjutraj vrni avtodom v najemnico, opravi končni pregled in prevzemi prtljago. ${leaveHint}.`,
          en: `Return the RV in the morning, complete the final inspection, and collect your luggage. ${leaveHint}.`,
          de: `Morgens Wohnmobil zurückgeben, Endkontrolle und Gepäck holen. ${leaveHint}.`,
        })
    : depMin <= 17 * 60
      ? planLangCopy(lang, {
          sl: `Zjutraj zaključi check-out in se odpravi na letališče — ${leaveHint}.`,
          en: `Check out in the morning and head to the airport — ${leaveHint}.`,
          de: `Morgens auschecken und zum Flughafen — ${leaveHint}.`,
        })
      : planLangCopy(lang, {
          sl: `Zjutraj zaključi check-out, prtljago shrani na recepciji (če imaš še kratek ogled) ali vzemi s seboj. ${leaveHint}.`,
          en: `Complete check-out in the morning. Store bags at reception if you have a short final stop, or take them with you. ${leaveHint}.`,
          de: `Morgens auschecken. Gepäck an der Rezeption lassen (bei kurzem Stopp) oder mitnehmen. ${leaveHint}.`,
        });

  const airportDesc =
    depMin <= 13 * 60
      ? planLangCopy(lang, {
          sl: `Na letališču oddaj prtljago, opravi check-in in varnostni pregled. Zgodnji/popoldanski odhod — danes ni časa za dodatne oglede v mestu.`,
          en: `Check in and clear security. Early/midday departure — no extra city sightseeing today.`,
          de: `Am Flughafen Gepäck aufgeben, Check-in und Sicherheitskontrolle. Früher/mittäglicher Abflug — heute keine Extra-Sightseeing-Touren in der Stadt.`,
        })
      : depMin <= 17 * 60
        ? planLangCopy(lang, {
            sl: `Na letališču oddaj prtljago in opravi check-in. Popoldanski odhod — brez dodatnih ogledov po prevozu.`,
            en: `Check in and clear security. Afternoon departure — no sights after transfer.`,
            de: `Am Flughafen Gepäck aufgeben und Check-in. Nachmittagsflug — nach dem Transfer keine Sightseeing-Touren mehr.`,
          })
        : depMin >= 21 * 60
          ? planLangCopy(lang, {
              sl: `Na letališču oddaj prtljago in opravi check-in. Pozni odhod ob ${dep} — na letališče pridi ~3 ure pred odletom, ne popoldne.`,
              en: `Check in and clear security. Late departure at ${dep} — arrive at airport ~3h before, not mid-afternoon.`,
              de: `Am Flughafen Gepäck aufgeben und Check-in. Später Abflug um ${dep} — ~3 Stunden vorher am Flughafen, nicht am Nachmittag.`,
            })
          : planLangCopy(lang, {
              sl: `Na letališču oddaj prtljago in opravi check-in. Večernji odhod ob ${dep} — največ 1 lahek dopoldanski ogled, na letališču ~3 ure prej.`,
              en: `Check in and clear security. Evening departure at ${dep} — at most one light morning stop; at airport ~3h early.`,
              de: `Am Flughafen Gepäck aufgeben und Check-in. Abendflug um ${dep} — höchstens ein leichter Vormittags-Stopp; ~3 Stunden früher am Flughafen.`,
            });

  return [
    {
      name: checkoutName,
      type: "STAY",
      description: checkoutDesc,
    },
    {
      name: planLangCopy(lang, {
        sl: `Prevoz na letališče (${locale.transferLabel})`,
        en: `Airport transfer (${locale.transferLabel})`,
        de: `Flughafentransfer (${locale.transferLabel})`,
      }),
      type: "TRANSPORT",
      priceLabel: locale.transferPrice,
      description: airportTransferDescription(city, locale, dep, leaveHours),
    },
    {
      name: planLangCopy(lang, {
        sl: "Prihod na letališče in odlet",
        en: "Airport arrival and departure",
        de: "Ankunft am Flughafen und Abflug",
      }),
      type: "TRANSPORT",
      description: airportDesc,
    },
  ];
}
