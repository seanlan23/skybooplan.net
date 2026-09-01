import type { AiTripPlan, DayPlan, ResortStay } from "@/lib/aiPlan.functions";
import type { GeminiPlanMapOpts } from "@/lib/geminiPlanMap";
import { normalizeSafetyWarning, normalizeWeatherWidget } from "@/lib/geminiPlanMap";
import { addDays, inclusiveCalendarDayCount } from "@/lib/dateUtils";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { lookupDestination } from "@/lib/destinationCoords";
import { sanitizeReturnFlightEu } from "@/lib/returnFlightAirports";
import { normalizePlanLangCode } from "@/lib/planLanguages";
import { cleanText } from "@/lib/textSanitize";
import { ensureTransferPickupCopy } from "@/lib/resortTransferModel";
import {
  parseSingleBasePlan,
  singleBaseHasRenderableContent,
  type ArrivalProtocol,
  type DepartureProtocol,
  type LooseSingleBasePlan,
  type OptionalExcursion,
  type ResortGuide,
} from "@/lib/singleBaseContract";

function txt(value: unknown): string {
  return typeof value === "string" ? cleanText(value).trim() : "";
}

function fillArrival(
  raw: LooseSingleBasePlan["arrival_protocol"],
  opts?: GeminiPlanMapOpts,
): ArrivalProtocol {
  return {
    visa_and_entry: txt(raw?.visa_and_entry),
    immigration: txt(raw?.immigration),
    baggage: txt(raw?.baggage),
    transfer_pickup: ensureTransferPickupCopy(txt(raw?.transfer_pickup), {
      destinationIata: opts?.destinationIata,
      destinationPlace: opts?.destinationPlace,
    }, opts?.language),
    cash_and_esim: txt(raw?.cash_and_esim),
  };
}

function fillResort(raw: LooseSingleBasePlan["resort_guide"]): ResortGuide {
  return {
    check_in_out: txt(raw?.check_in_out),
    all_inclusive_etiquette: txt(raw?.all_inclusive_etiquette),
    tipping: txt(raw?.tipping),
    relaxing_at_resort: txt(raw?.relaxing_at_resort),
  };
}

function fillDeparture(raw: LooseSingleBasePlan["departure_protocol"]): DepartureProtocol {
  return {
    return_transfer: txt(raw?.return_transfer),
    airport_lead_time: txt(raw?.airport_lead_time),
    flight_alignment: txt(raw?.flight_alignment),
  };
}

function fillExcursions(raw: LooseSingleBasePlan["optional_excursions"]): OptionalExcursion[] {
  return (raw ?? [])
    .map((e) => ({
      title: txt(e.title),
      description: txt(e.description),
      estimated_cost_eur: typeof e.estimated_cost_eur === "number" ? e.estimated_cost_eur : 0,
      book_safely_where: txt(e.book_safely_where),
    }))
    .filter((e) => e.title || e.description);
}

export function resortStayProgress(stay: ResortStay | undefined): number {
  if (!stay) return 0;
  const has = (o: Record<string, string>) => Object.values(o).some((v) => v.trim());
  let n = 0;
  if (has(stay.arrivalProtocol)) n += 1;
  if (has(stay.resortGuide)) n += 1;
  if (stay.optionalExcursions.some((e) => e.title.trim())) n += 1;
  if (has(stay.departureProtocol)) n += 1;
  return n;
}

export function resortStayFromLoose(
  data: LooseSingleBasePlan,
  opts?: GeminiPlanMapOpts,
): ResortStay {
  return {
    arrivalProtocol: fillArrival(data.arrival_protocol, opts),
    resortGuide: fillResort(data.resort_guide),
    optionalExcursions: fillExcursions(data.optional_excursions),
    departureProtocol: fillDeparture(data.departure_protocol),
  };
}

function stayCity(data: LooseSingleBasePlan, opts: GeminiPlanMapOpts): string {
  const hotelCity = data.hotels?.find((h) => h.city?.trim())?.city?.trim();
  if (hotelCity) return hotelCity;
  const meta = data.trip_metadata?.destination?.trim();
  if (meta) return meta;
  if (opts.destinationPlace?.trim()) return opts.destinationPlace.trim();
  const iata = opts.destinationIata?.trim();
  if (iata) {
    const dest = lookupDestination(iata);
    if (dest?.name) return dest.name;
  }
  return data.trip_title?.trim() || "Resort";
}

function stayCoords(city: string, opts: GeminiPlanMapOpts): { lat: number; lng: number } {
  const fromCity = lookupRegionCoords(city);
  if (fromCity) return fromCity;
  if (opts.destinationPlace) {
    const fromPlace = lookupRegionCoords(opts.destinationPlace);
    if (fromPlace) return fromPlace;
  }
  if (opts.destinationIata) {
    const dest = lookupDestination(opts.destinationIata);
    if (dest && Number.isFinite(dest.lat) && Number.isFinite(dest.lng)) {
      return { lat: dest.lat, lng: dest.lng };
    }
  }
  return { lat: 0, lng: 0 };
}

function syntheticStayDay(
  city: string,
  coords: { lat: number; lng: number },
  opts: GeminiPlanMapOpts,
  title: string,
): DayPlan {
  const date = opts.departDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
  return {
    day: 1,
    date,
    title: title || city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 0,
    lat: coords.lat,
    lng: coords.lng,
    focusName: city,
    city,
    category: "stay",
    unsplashQuery: city,
  };
}

/** Gemini single-base JSON → UI/PDF plan (no hourly day cards). */
export function singleBaseJsonToPlan(
  raw: unknown,
  opts: GeminiPlanMapOpts,
): AiTripPlan | null {
  const parsed = parseSingleBasePlan(raw, { loose: true });
  if (!parsed.success) return null;
  if (!singleBaseHasRenderableContent(parsed.data)) return null;

  const data = parsed.data;
  const city = stayCity(data, opts);
  const coords = stayCoords(city, opts);
  const title = txt(data.trip_title) || city;
  const summary = txt(data.overview) || txt(data.trip_metadata?.season_warning) || title;
  const depart = opts.departDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const nights = (() => {
    if (depart) {
      const end = opts.returnDate;
      if (end) {
        const days = inclusiveCalendarDayCount(depart, end);
        if (days && days > 1) return days - 1;
      }
    }
    const listed = data.hotels?.[0]?.nights;
    if (typeof listed === "number" && listed > 0) return listed;
    return undefined;
  })();

  const hotelFrom = depart ?? data.hotels?.[0]?.from_date;
  const hotelTo =
    (depart && nights ? addDays(depart, nights) : undefined) ?? data.hotels?.[0]?.to_date;

  return {
    destinationName: txt(data.trip_metadata?.destination) || city,
    summary,
    contentLanguage: normalizePlanLangCode(opts.language ?? "sl"),
    safetyWarning: normalizeSafetyWarning(data.safetyWarning) ?? null,
    weatherWidget: normalizeWeatherWidget(data.weatherWidget, undefined),
    totalBudgetEur: typeof data.total_budget_eur === "number" ? data.total_budget_eur : 0,
    centerLat: coords.lat,
    centerLng: coords.lng,
    days: [syntheticStayDay(city, coords, opts, title)],
    originIata: opts.originIata,
    destinationIata: opts.destinationIata,
    destinationPlace: opts.destinationPlace ?? city,
    originPlace: opts.originPlace,
    accommodationMode: "hotel",
    travelPace: opts.pace,
    tripStyle: "single_base",
    resortStay: resortStayFromLoose(data, opts),
    hotels: [
      {
        city,
        name: data.hotels?.[0]?.name?.trim() || undefined,
        nights,
        from_date: hotelFrom,
        to_date: hotelTo,
        note: data.hotels?.[0]?.note?.trim() || undefined,
      },
    ],
    wishes: opts.wishesText,
    returnFlightEu: data.trip_metadata?.return_flight_eu?.departure_time
      ? sanitizeReturnFlightEu(
          {
            departureTime: data.trip_metadata.return_flight_eu.departure_time ?? "",
            arrivalTimeEu: data.trip_metadata.return_flight_eu.arrival_time_eu ?? "",
            fromAirport: data.trip_metadata.return_flight_eu.from_airport ?? "",
            toAirport: data.trip_metadata.return_flight_eu.to_airport ?? "",
            summary: txt(data.trip_metadata.return_flight_eu.summary),
          },
          {
            destinationIata: opts.destinationIata,
            originIata: opts.originIata,
            language: opts.language,
          },
        )
      : undefined,
  };
}
