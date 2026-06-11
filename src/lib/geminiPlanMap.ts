import type { Activity, AiTripPlan, DayPlan, ReturnFlightEu } from "@/lib/aiPlan.functions";
import type { TripAdvisorStyleDetails, TripPlanResponse, TripBudgetTier } from "@/lib/geminiPro.shared";
import {
  normalizeMapPoiCategory,
} from "@/lib/mapPoiCategory";
import {
  classifyDayBudgetKind,
  computeTripTotalBudgetEur,
  dayBudgetParams,
  estimateDayBudgetEur,
  applyMotorhomeBudgetFloor,
  applyHotelRestBudgetFloor,
} from "@/lib/tripBudget";
import { addDays } from "@/lib/dateUtils";
import {
  detectAccommodationMode,
  detectHotelRestInterval,
  isHotelRestDay,
} from "@/lib/tripMode";

export type GeminiPlanMapOpts = {
  originIata?: string;
  destinationIata?: string;
  /** Trip start — used to derive ISO day.date when Gemini returns a label instead. */
  departDate?: string;
  /** Full user wishes blob (custom text + tags) for accommodation detection. */
  wishesText?: string;
};

function resolveIsoDayDate(raw: string, departDate: string | undefined, dayNumber: number): string {
  const fromRaw = raw?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (fromRaw) return fromRaw;
  const base = departDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (base) return addDays(base, dayNumber - 1);
  return raw;
}

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parseHour(time: string): number | null {
  const m = time.match(/(\d{1,2})[:\.]?(\d{2})?/);
  if (!m) return null;
  return Number(m[1]);
}

type DaySlot = "morning" | "afternoon" | "evening";

function parseActivitySlot(time: string, index: number, total: number): DaySlot {
  const t = time.toLowerCase().trim();
  if (/večer|vecer|evening|night|zvečer|zvecer|noč/i.test(t)) return "evening";
  if (/popoldan|afternoon|after\s*noon|early\s*afternoon/i.test(t)) return "afternoon";
  if (/dopoldan|morning|jutro|zgodaj|cel\s*dan|all\s*day|full\s*day/i.test(t)) return "morning";

  const hour = parseHour(time);
  if (hour !== null) {
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    return "evening";
  }

  if (total <= 1) return "morning";
  if (index === 0) return "morning";
  if (index === total - 1) return "evening";
  return "afternoon";
}

function isDepartureLogisticsDay(day: DayPlan, totalDays: number): boolean {
  if (day.day !== totalDays) return false;
  const blob = `${day.title} ${day.city} ${day.morning} ${day.afternoon}`.toLowerCase();
  return (
    /logistika|odhod|departure|letališč|letališče|airport|suvarnabhumi|domov/i.test(blob) ||
    /samut prakan|don muang/i.test(day.city.toLowerCase())
  );
}

function isGenericTransportTip(tip: string): boolean {
  const t = tip.trim();
  if (!t) return true;
  if (t.length > 220) return false;
  const generic =
    /javni prevoz|metro|taxi|grab|uber|priporočamo|najbolj enostavno|uporabite|prevozite se/i.test(
      t,
    );
  const specific =
    /avtodom|RV|kamp|parkir|zaprt|poplav|veter|promet|cest\w*\s*\d|route\s*66|zamud|opozoril/i.test(
      t,
    );
  return generic && !specific;
}

function toActivity(
  act: {
    title: string;
    description?: string;
    arrivalTime?: string;
    departureTime?: string;
    estimatedCostEur?: number;
    timeSlot?: string;
    category?: string;
    coordinates?: { lat: number; lng: number };
    imageUrl?: string;
    unsplashQuery?: string;
    tripAdvisorStyleDetails?: TripAdvisorStyleDetails;
  },
  poiGuideByName?: Map<string, TripAdvisorStyleDetails>,
): Activity {
  const cost =
    typeof act.estimatedCostEur === "number" && act.estimatedCostEur >= 0
      ? act.estimatedCostEur
      : undefined;
  const guide =
    act.tripAdvisorStyleDetails ??
    poiGuideByName?.get(act.title.trim().toLowerCase());
  return {
    name: act.title,
    description: act.description?.trim() || undefined,
    arrivalTime: act.arrivalTime?.trim() || undefined,
    departureTime: act.departureTime?.trim() || undefined,
    estimatedCostEur: cost,
    priceLabel: cost != null ? `€${cost}` : undefined,
    timeSlot: act.timeSlot,
    type: act.category,
    lat: act.coordinates?.lat,
    lng: act.coordinates?.lng,
    imageUrl: act.imageUrl,
    unsplashQuery: act.unsplashQuery?.trim() || undefined,
    tripAdvisorStyleDetails: guide,
  };
}

function slotFromTimeSlot(timeSlot: string | undefined): DaySlot {
  const t = (timeSlot ?? "").toLowerCase();
  if (t === "vecer" || t === "evening") return "evening";
  if (t === "popoldan" || t === "afternoon") return "afternoon";
  if (t === "dopoldan" || t === "morning") return "morning";
  return "morning";
}

function slotActivities(
  activities: TripPlanResponse["itinerar"][number]["days"][number]["activities"],
  poiGuideByName: Map<string, TripAdvisorStyleDetails>,
) {
  const morningActs: Activity[] = [];
  const afternoonActs: Activity[] = [];
  const eveningActs: Activity[] = [];

  const acts = activities ?? [];
  for (let i = 0; i < acts.length; i++) {
    const act = acts[i]!;
    const slot =
      act.timeSlot != null
        ? slotFromTimeSlot(act.timeSlot)
        : parseActivitySlot(act.arrivalTime ?? act.time ?? "", i, acts.length);
    const item = toActivity(act, poiGuideByName);
    if (slot === "morning") morningActs.push(item);
    else if (slot === "afternoon") afternoonActs.push(item);
    else eveningActs.push(item);
  }

  const join = (items: Activity[]) =>
    items
      .map((a) => (a.description ? `${a.name}: ${a.description}` : a.name))
      .join("\n\n");

  const morningText = join(morningActs);
  const afternoonText = join(afternoonActs);

  return {
    morning: morningText || (afternoonText ? "—" : "Prosti dan / raziskovanje okolice."),
    afternoon: afternoonText || "—",
    evening: join(eveningActs) || "—",
    structured: {
      morning: morningActs,
      afternoon: afternoonActs,
      evening: eveningActs,
    },
  };
}

/** Map Gemini Pro JSON → catalog `AiTripPlan` (AiPlanView, TripMap, HotelsSection). */
export function tripPlanResponseToAiTripPlan(
  data: TripPlanResponse,
  opts?: GeminiPlanMapOpts,
): AiTripPlan {
  const days: DayPlan[] = [];
  let latSum = 0;
  let lngSum = 0;
  let coordCount = 0;
  const meta = data.trip_metadata;
  const logistics = data.logistics_and_tips;
  let lastCity = "";
  const seenTransportTips = new Set<string>();

  for (const phase of data.itinerar ?? []) {
    const city = phase.city.trim();
    const phaseLat = phase.lat;
    const phaseLng = phase.lng;

    const poiGuideByName = new Map<string, TripAdvisorStyleDetails>(
      (phase.pois ?? []).map((p) => [p.name.trim().toLowerCase(), p.tripAdvisorStyleDetails]),
    );

    for (const day of phase.days ?? []) {
      const slots = slotActivities(day.activities, poiGuideByName);
      const pinKey = (lat: number, lng: number) => `${lat.toFixed(4)}:${lng.toFixed(4)}`;
      const seenPins = new Set<string>();
      const mapPins: NonNullable<DayPlan["mapPins"]> = [];

      const addPin = (opts: {
        name: string;
        lat: number;
        lng: number;
        category: ReturnType<typeof normalizeMapPoiCategory>;
        description?: string;
        arrivalTime?: string;
        departureTime?: string;
        estimatedCostEur?: number;
        imageUrl?: string;
        unsplashQuery?: string;
        tripAdvisorStyleDetails?: TripAdvisorStyleDetails;
      }) => {
        if (!isValidCoord(opts.lat, opts.lng)) return;
        const key = pinKey(opts.lat, opts.lng);
        if (seenPins.has(key)) return;
        seenPins.add(key);
        mapPins.push({
          name: opts.name,
          lat: opts.lat,
          lng: opts.lng,
          category: opts.category,
          description: opts.description?.trim() || undefined,
          arrivalTime: opts.arrivalTime?.trim() || undefined,
          departureTime: opts.departureTime?.trim() || undefined,
          estimatedCostEur: opts.estimatedCostEur,
          imageUrl: opts.imageUrl,
          unsplashQuery: opts.unsplashQuery,
          tripAdvisorStyleDetails: opts.tripAdvisorStyleDetails,
        });
      };

      const poiUnsplashByName = new Map(
        (phase.pois ?? []).map((p) => [p.name.trim().toLowerCase(), p.unsplashQuery?.trim()]),
      );

      for (const a of day.activities ?? []) {
        if (a.coordinates && isValidCoord(a.coordinates.lat, a.coordinates.lng)) {
          addPin({
            name: a.title,
            lat: a.coordinates.lat,
            lng: a.coordinates.lng,
            category: normalizeMapPoiCategory(a.category),
            description: a.description,
            arrivalTime: a.arrivalTime,
            departureTime: a.departureTime,
            estimatedCostEur: a.estimatedCostEur,
            imageUrl: a.imageUrl,
            unsplashQuery:
              a.unsplashQuery?.trim() ||
              poiUnsplashByName.get(a.title.trim().toLowerCase()),
            tripAdvisorStyleDetails:
              a.tripAdvisorStyleDetails ?? poiGuideByName.get(a.title.trim().toLowerCase()),
          });
        }
      }

      for (const poi of phase.pois ?? []) {
        addPin({
          name: poi.name,
          lat: poi.lat,
          lng: poi.lng,
          category: "sightseeing",
          description: poi.description,
          imageUrl: poi.imageUrl,
          unsplashQuery: poi.unsplashQuery?.trim(),
          tripAdvisorStyleDetails: poi.tripAdvisorStyleDetails,
        });
      }

      const lat = isValidCoord(phaseLat, phaseLng) ? phaseLat : 0;
      const lng = isValidCoord(phaseLat, phaseLng) ? phaseLng : 0;
      const isNewCity = city !== lastCity;
      lastCity = city;

      if (isValidCoord(lat, lng)) {
        latSum += lat;
        lngSum += lng;
        coordCount += 1;
      }

      const isFirstDay = day.day_number === 1;
      const travelHack =
        isFirstDay && meta?.season_warning?.trim() ? meta.season_warning.trim() : "";
      const transportationTipsRaw = day.transportTip?.trim() || "";
      let transportationTips = isGenericTransportTip(transportationTipsRaw)
        ? ""
        : transportationTipsRaw;
      if (transportationTips) {
        const norm = transportationTips.toLowerCase().replace(/\s+/g, " ").slice(0, 160);
        if (seenTransportTips.has(norm)) transportationTips = "";
        else seenTransportTips.add(norm);
      }
      const localWarnings =
        isFirstDay && meta?.visa_required
          ? "Preveri vizne zahteve pred odhodom."
          : "";

      days.push({
        day: day.day_number,
        date: resolveIsoDayDate(day.date, opts?.departDate, day.day_number),
        title: day.title,
        morning: slots.morning,
        afternoon: slots.afternoon,
        evening: slots.evening,
        activities: slots.structured,
        transportation: day.transportation?.length ? day.transportation : undefined,
        travelHack,
        transportationTips,
        localWarnings,
        dailyBudgetEur: day.dailyBudget ?? 0,
        drivingDistanceKm: day.drivingDistanceKm,
        drivingDurationHours: day.drivingDurationHours,
        transport:
          day.drivingDistanceKm > 0
            ? {
                type: "Vožnja",
                duration: day.drivingDurationHours,
                cost: "",
                description: `${day.drivingDistanceKm} km`,
              }
            : undefined,
        lat,
        lng,
        focusName: mapPins[0]?.name ?? day.activities?.[0]?.title ?? day.title,
        city,
        unsplashQuery: phase.unsplashQuery?.trim(),
        imageUrl: undefined,
        category: "activity",
        mapPins: mapPins.length > 0 ? mapPins : undefined,
      });
    }
  }

  days.sort((a, b) => a.day - b.day);

  const totalDays = days.length;
  for (const day of days) {
    if (isDepartureLogisticsDay(day, totalDays)) {
      day.inFlightDay = true;
      day.category = "transport";
    }
  }

  const logisticsSummary = [
    logistics?.transport?.flights?.trim(),
    logistics?.finance?.trim(),
    logistics?.internet?.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  const wishesText = opts?.wishesText ?? "";
  const accommodationMode = detectAccommodationMode(wishesText);
  const hotelRestEveryNDays =
    accommodationMode === "motorhome"
      ? detectHotelRestInterval(wishesText) ?? undefined
      : undefined;

  let returnFlightEu: ReturnFlightEu | undefined;
  const rf = meta?.return_flight_eu;
  if (rf?.departure_time && rf.arrival_time_eu) {
    returnFlightEu = {
      departureTime: rf.departure_time,
      arrivalTimeEu: rf.arrival_time_eu,
      fromAirport: rf.from_airport,
      toAirport: rf.to_airport,
      summary: rf.summary,
    };
  } else {
    returnFlightEu = extractReturnFlightFromLastDay(days, opts?.originIata);
  }

  return {
    destinationName: meta?.destination ?? "Potovanje",
    summary:
      meta?.season_warning?.trim() ||
      logisticsSummary ||
      `Načrt poti: ${meta?.destination ?? ""}`,
    totalBudgetEur: 0,
    centerLat: coordCount > 0 ? latSum / coordCount : 0,
    centerLng: coordCount > 0 ? lngSum / coordCount : 0,
    days,
    originIata: opts?.originIata,
    destinationIata: opts?.destinationIata,
    accommodationMode,
    hotelRestEveryNDays,
    returnFlightEu,
  };
}

function extractReturnFlightFromLastDay(
  days: DayPlan[],
  originIata?: string,
): ReturnFlightEu | undefined {
  const last = days[days.length - 1];
  if (!last) return undefined;

  const slots = ["morning", "afternoon", "evening"] as const;
  for (const slot of slots) {
    for (const act of last.activities?.[slot] ?? []) {
      const blob = `${act.name} ${act.description ?? ""}`.toLowerCase();
      if (
        !/let|flight|airport|odlet|odhod|povratek|domov|evrop|eu\b|ljubljana|frankfurt|amsterdam|pariz|vienna|munich|zagreb/i.test(
          blob,
        )
      ) {
        continue;
      }
      if (!act.arrivalTime && !act.departureTime) continue;
      return {
        departureTime: act.arrivalTime ?? act.departureTime ?? "",
        arrivalTimeEu: act.departureTime ?? "",
        fromAirport: last.city ?? "Letališče",
        toAirport: originIata ?? "EU",
        summary: act.description ?? act.name,
      };
    }
  }
  return undefined;
}

export function enrichGeminiCatalogPlan(
  plan: AiTripPlan,
  opts: { budget: TripBudgetTier; pax: number; wishesText?: string },
): void {
  const tier = opts.budget === "budget" ? "budget" : opts.budget === "premium" ? "premium" : "mid";
  const mealsFullDay = tier === "premium" ? 68 : tier === "mid" ? 45 : 28;
  const totalDays = plan.days.length;
  const travelers = Math.max(1, opts.pax);
  const wishesText = opts.wishesText ?? "";

  if (!plan.accommodationMode) {
    plan.accommodationMode = detectAccommodationMode(wishesText);
  }
  if (plan.accommodationMode === "motorhome" && !plan.hotelRestEveryNDays) {
    plan.hotelRestEveryNDays = detectHotelRestInterval(wishesText) ?? undefined;
  }

  const motorhome = plan.accommodationMode === "motorhome";
  const hotelRestInterval = plan.hotelRestEveryNDays;

  for (const day of plan.days) {
    const isArrival = day.day === 1;
    const isDeparture = isDepartureLogisticsDay(day, totalDays);
    if (isDeparture) {
      day.inFlightDay = true;
      day.category = "transport";
    }

    const kind = classifyDayBudgetKind(day.activities, {
      isArrival,
      isDeparture,
      regionCity: day.city,
    });

    if (day.dailyBudgetEur > 0) {
      if (motorhome) {
        day.dailyBudgetEur = applyMotorhomeBudgetFloor(day.dailyBudgetEur, kind, travelers);
        if (
          hotelRestInterval &&
          isHotelRestDay(day.day, hotelRestInterval, { totalDays })
        ) {
          day.dailyBudgetEur = applyHotelRestBudgetFloor(day.dailyBudgetEur, true, travelers);
        }
      }
      continue;
    }

    let daily = estimateDayBudgetEur(
      day.activities,
      undefined,
      { ...dayBudgetParams(tier, kind, true, mealsFullDay), pax: travelers },
    );

    if (motorhome) {
      daily = applyMotorhomeBudgetFloor(daily, kind, travelers);
      if (
        hotelRestInterval &&
        isHotelRestDay(day.day, hotelRestInterval, { totalDays })
      ) {
        daily = applyHotelRestBudgetFloor(daily, true, travelers);
      }
    }

    day.dailyBudgetEur = daily;
  }

  plan.totalBudgetEur = computeTripTotalBudgetEur(plan.days, travelers);
}

export function isCatalogTripPlan(value: unknown): value is AiTripPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as AiTripPlan;
  return Array.isArray(plan.days) && plan.days.length > 0 && typeof plan.destinationName === "string";
}
