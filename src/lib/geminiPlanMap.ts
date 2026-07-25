import type { Activity, AiTripPlan, DayPlan, DayTransportLeg, ReturnFlightEu } from "@/lib/aiPlan.functions";
import type {
  TripAdvisorStyleDetails,
  TripPlanResponse,
  TripBudgetTier,
  WeatherSummary,
  WeatherWidget,
} from "@/lib/geminiPro.shared";
import type { SafetyWarning } from "@/lib/aiPlan.functions";
import { ACTIVITY_TRANSPORT_TYPES } from "@/lib/geminiPro.shared";
import { mapTravelRequirementsFromJson } from "@/lib/travelRequirements";
import {
  normalizeMapPoiCategory,
  resolveMapPoiCategory,
} from "@/lib/mapPoiCategory";
import { expandPlanDaysToExpected } from "@/lib/daySequence";
import { finalizeItineraryMapCoords } from "@/lib/itineraryMapModel";
import { dedupeCrossDayBoilerplate } from "@/lib/textSanitize";
import { attachActivityCoordinates } from "@/lib/mapPoiResolver";
import { stripMisplacedCityPois } from "@/lib/cityPoiGuard";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { lookupPoiCoords } from "@/lib/tripGeo";
import {
  classifyDayBudgetKind,
  computeTripTotalBudgetEur,
  dayBudgetParams,
  estimateDayBudgetEur,
  applyMotorhomeBudgetCeil,
  applyMotorhomeBudgetFloor,
  normalizeMotorhomeDailyBudgetPerPerson,
  applyHotelRestBudgetFloor,
  applyCanadaBudgetFloor,
  applyUsBudgetFloor,
  applySafariBudgetFloor,
  normalizeGeminiDailyBudgetPerPerson,
  applyGlobalDayBudgetCeil,
  applyValueDestinationDayBudgetCeil,
  isValueDestinationBudget,
  sumListedActivityEur,
} from "@/lib/tripBudget";
import { addDays } from "@/lib/dateUtils";
import { sortActivitiesByTime } from "@/lib/dayPlanUi";
import { enrichDayActivities } from "@/lib/dayEnrichers";
import { reconcileWeekdayGatedActivities } from "@/lib/tripContent";
import { resolveTripLocale } from "@/lib/tripLocale";
import {
  detectAccommodationMode,
  detectHotelRestInterval,
  isHotelRestDay,
} from "@/lib/tripMode";
import type { Lang } from "@/lib/i18n";
import type { GroundTransportMode } from "@/lib/aiPlan.functions";
import { enrichIslandAirportTransfers } from "@/lib/islandAirportTransfers";
import { repairTransportLegs } from "@/lib/transportLegRepair";
import { sanitizeReturnFlightSummary } from "@/lib/returnFlightSummary";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";
import { driveTypeLabel } from "@/lib/planLangCopy";
import { normalizePlanLangCode } from "@/lib/planLanguages";
import {
  fixHotelCopyErrors,
  fixMotorhomeCopyErrors,
  sanitizeActivity,
  sanitizeForLang,
} from "@/lib/textSanitize";

export type GeminiPlanMapOpts = {
  originIata?: string;
  destinationIata?: string;
  /** Trip start — used to derive ISO day.date when Gemini returns a label instead. */
  departDate?: string;
  /** Full user wishes blob (custom text + tags) for accommodation detection. */
  wishesText?: string;
  language?: Lang;
  originPlace?: string;
  destinationPlace?: string;
  groundTransportMode?: GroundTransportMode;
  budget?: TripBudgetTier;
  pax?: number;
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

/** Calendar span from day numbers — never use `days.length` when Gemini duplicated day_number. */
export function planCalendarDayCount(days: Array<{ day: number }>): number {
  if (!days.length) return 0;
  return Math.max(...days.map((d) => d.day));
}

function dayActivityScore(day: DayPlan): number {
  const a = day.activities;
  if (!a) return day.mapPins?.length ?? 0;
  return (
    (a.morning?.length ?? 0) +
    (a.afternoon?.length ?? 0) +
    (a.evening?.length ?? 0) +
    (day.mapPins?.length ?? 0)
  );
}

/** Gemini sometimes re-emits the same day_number in two itinerar phases — keep the richer copy. */
export function dedupePlanDaysByNumber(days: DayPlan[]): DayPlan[] {
  const byDay = new Map<number, DayPlan>();
  for (const d of days) {
    const prev = byDay.get(d.day);
    if (!prev || dayActivityScore(d) > dayActivityScore(prev)) {
      byDay.set(d.day, d);
    }
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
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
  // Keep detailed multi-sentence tips (apps, ferries, tuk-tuk warnings, etc.)
  if (t.length >= 60) return false;
  // Drop only ultra-short platitudes with no location context
  return /^(uporab(lj)?ite?\s+(aplikacijo\s+)?(grab|bolt|uber)|javni prevoz|najbolj enostavno)/i.test(t);
}

type RawActivity = TripPlanResponse["itinerar"][number]["days"][number]["activities"][number];

function normalizeLegType(value: unknown): DayTransportLeg["type"] | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase();
  if (v === "flight" || v === "ferry" || v === "train") return v;
  if (v === "van" || v === "bus" || v === "taxi") return "van";
  return null;
}

function normalizeActivityTransportType(
  value: unknown,
): Activity["transportType"] | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.toLowerCase();
  return (ACTIVITY_TRANSPORT_TYPES as readonly string[]).includes(v)
    ? (v as Activity["transportType"])
    : undefined;
}

function parseRouteFromTitle(title: string): { from?: string; to?: string } {
  const match = title.match(/(.+?)\s*(?:→|->|—|–|-)\s*(.+)/);
  if (!match) return {};
  return { from: match[1]!.trim(), to: match[2]!.trim() };
}

function sanitizeTransportLegs(legs: DayTransportLeg[] | undefined): DayTransportLeg[] {
  return (legs ?? []).filter(
    (leg) =>
      normalizeLegType(leg.type) &&
      leg.from?.trim() &&
      leg.to?.trim() &&
      leg.duration?.trim(),
  );
}

function buildTransportLegsFromActivities(
  activities: RawActivity[],
  fallbackFrom: string,
  fallbackTo: string,
): DayTransportLeg[] {
  const legs: DayTransportLeg[] = [];

  for (const act of activities) {
    const duration = act.duration?.trim();
    const type =
      normalizeLegType(act.transport_type) ??
      (act.category === "airport" ? "flight" : null);
    if (!type || !duration) continue;

    const route = parseRouteFromTitle(act.title);
    legs.push({
      type,
      from: route.from || fallbackFrom,
      to: route.to || fallbackTo,
      duration,
      estimatedPrice:
        typeof act.estimatedCostEur === "number" && act.estimatedCostEur >= 0
          ? act.estimatedCostEur
          : 0,
    });
  }

  return legs;
}

function resolveDayTransportation(
  day: TripPlanResponse["itinerar"][number]["days"][number],
  phaseCity: string,
  previousCity: string,
  ctx: {
    dayNumber: number;
    destinationIata?: string;
    activities?: {
      morning: Activity[];
      afternoon: Activity[];
      evening: Activity[];
    };
  },
): DayTransportLeg[] | undefined {
  const explicit = sanitizeTransportLegs(day.transportation as DayTransportLeg[] | undefined);
  const base =
    explicit.length > 0
      ? explicit
      : buildTransportLegsFromActivities(
          day.activities ?? [],
          previousCity || phaseCity,
          phaseCity,
        );

  return repairTransportLegs(base.length > 0 ? base : undefined, {
    dayNumber: ctx.dayNumber,
    city: phaseCity,
    destinationIata: ctx.destinationIata,
    previousCity,
    activities: ctx.activities,
  });
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
    transport_type?: string;
    duration?: string;
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
  const transportType =
    normalizeActivityTransportType(act.transport_type) ??
    (act.category === "airport" ? "flight" : undefined);
  const transportDuration = act.duration?.trim() || undefined;

  return {
    name: act.title,
    description: act.description?.trim() || undefined,
    arrivalTime: act.arrivalTime?.trim() || undefined,
    departureTime: act.departureTime?.trim() || undefined,
    estimatedCostEur: cost,
    priceLabel: cost != null ? `€${cost}` : undefined,
    timeSlot: act.timeSlot,
    type: act.category,
    transportType,
    transportDuration,
    lat: act.coordinates?.lat,
    lng: act.coordinates?.lng,
    imageUrl: act.imageUrl,
    unsplashQuery: act.unsplashQuery?.trim() || undefined,
    tripAdvisorStyleDetails: guide,
  };
}

function normalizeSlotToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function slotFromTimeSlot(timeSlot: string | undefined): DaySlot {
  const t = normalizeSlotToken(timeSlot ?? "");
  if (/vecer|evening|night|zvecer|noč|noc/.test(t)) return "evening";
  if (/popoldan|afternoon/.test(t)) return "afternoon";
  if (/dopoldan|morning|jutro/.test(t)) return "morning";
  return "morning";
}

function joinSlotActivities(items: Activity[]): string {
  return items
    .map((a) => (a.description ? `${a.name}: ${a.description}` : a.name))
    .filter(Boolean)
    .join("\n\n");
}

function syncDayActivitySlots(
  day: DayPlan,
  slots: { morning: Activity[]; afternoon: Activity[]; evening: Activity[] },
): void {
  day.activities = {
    morning: sortActivitiesByTime(slots.morning),
    afternoon: sortActivitiesByTime(slots.afternoon),
    evening: sortActivitiesByTime(slots.evening),
  };
  const afternoonText = joinSlotActivities(slots.afternoon);
  day.morning =
    joinSlotActivities(slots.morning) ||
    (afternoonText ? "" : "Prosti dan / raziskovanje okolice.");
  day.afternoon = afternoonText;
  day.evening = joinSlotActivities(slots.evening);
}

function slotActivities(
  activities: TripPlanResponse["itinerar"][number]["days"][number]["activities"],
  poiGuideByName: Map<string, TripAdvisorStyleDetails>,
) {
  const morningActs: Activity[] = [];
  const afternoonActs: Activity[] = [];
  const eveningActs: Activity[] = [];

  const acts = [...(activities ?? [])].sort((a, b) =>
    (a.arrivalTime ?? a.time ?? "").localeCompare(b.arrivalTime ?? b.time ?? ""),
  );
  for (let i = 0; i < acts.length; i++) {
    const act = acts[i]!;
    const clock = act.arrivalTime ?? act.time ?? "";
    // Prefer clock hour over LLM timeSlot — Gemini often tags 22:30 departures as "dopoldan".
    const slot =
      parseHour(clock) !== null
        ? parseActivitySlot(clock, i, acts.length)
        : act.timeSlot != null
          ? slotFromTimeSlot(act.timeSlot)
          : parseActivitySlot(clock, i, acts.length);
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
    morning: morningText || (afternoonText ? "" : "Prosti dan / raziskovanje okolice."),
    afternoon: afternoonText,
    evening: join(eveningActs),
    structured: {
      morning: sortActivitiesByTime(morningActs),
      afternoon: sortActivitiesByTime(afternoonActs),
      evening: sortActivitiesByTime(eveningActs),
    },
  };
}

export function normalizeWeatherSummary(raw: unknown): WeatherSummary | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const w = raw as Record<string, unknown>;
  const currentCondition = String(w.currentCondition ?? "").trim();
  const avgTemperature = String(w.avgTemperature ?? "").trim();
  const seasonType = String(w.seasonType ?? "").trim();
  const clothingAdvice = String(w.clothingAdvice ?? "").trim();
  if (!currentCondition || !avgTemperature || !seasonType || !clothingAdvice) return undefined;
  return { currentCondition, avgTemperature, seasonType, clothingAdvice };
}

export function normalizeWeatherWidget(
  raw: unknown,
  legacySummary?: unknown,
): WeatherWidget | undefined {
  if (raw && typeof raw === "object") {
    const w = raw as Record<string, unknown>;
    const season = String(w.season ?? "").trim();
    const avgTemp = String(w.avgTemp ?? w.avgTemperature ?? "").trim();
    const clothing = String(w.clothing ?? w.clothingAdvice ?? "").trim();
    if (season && avgTemp && clothing) return { season, avgTemp, clothing };
  }
  const legacy = normalizeWeatherSummary(legacySummary);
  if (legacy) {
    return {
      season: legacy.seasonType,
      avgTemp: legacy.avgTemperature,
      clothing: legacy.clothingAdvice,
    };
  }
  return undefined;
}

export function normalizeSafetyWarning(raw: unknown): SafetyWarning | null | undefined {
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  if (typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  const message = String(s.message ?? s.text ?? s.warning ?? "").trim();
  if (!message) return null;
  const title = String(s.title ?? "").trim() || undefined;
  return { title, message };
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
  let previousCity = "";
  const seenTransportTips = new Set<string>();
  const seenTravelHacks = new Set<string>();

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
            category: resolveMapPoiCategory({
              name: a.title,
              description: a.description,
              type: a.category,
              transportType: normalizeActivityTransportType(a.transport_type),
            }),
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
        // Skip generic city-named POIs — activities already provide real stop titles.
        if (poi.name.trim().toLowerCase() === city.toLowerCase()) continue;
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
      if (isNewCity && lastCity) previousCity = lastCity;
      lastCity = city;

      const dayTransportation = resolveDayTransportation(day, city, previousCity, {
        dayNumber: day.day_number,
        destinationIata: opts?.destinationIata,
        activities: slots.structured,
      });

      if (isValidCoord(lat, lng)) {
        latSum += lat;
        lngSum += lng;
        coordCount += 1;
      }

      const isFirstDay = day.day_number === 1;
      let travelHack = day.travelHack?.trim() ?? "";
      if (travelHack) {
        const hackNorm = travelHack.toLowerCase().replace(/\s+/g, " ").slice(0, 140);
        if (seenTravelHacks.has(hackNorm)) travelHack = "";
        else seenTravelHacks.add(hackNorm);
      }
      if (!travelHack && isFirstDay && meta?.season_warning?.trim()) {
        travelHack = meta.season_warning.trim();
      }
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

      const landCenter =
        lookupRegionCoords(city) ?? lookupPoiCoords(city) ?? { lat, lng };
      days.push(
        attachActivityCoordinates(
          stripMisplacedCityPois({
            day: day.day_number,
            date: resolveIsoDayDate(day.date, opts?.departDate, day.day_number),
            title: day.title,
            morning: slots.morning,
            afternoon: slots.afternoon,
            evening: slots.evening,
            activities: slots.structured,
            transportation: dayTransportation,
            travelHack,
            transportationTips,
            localWarnings,
            dailyBudgetEur: day.dailyBudget ?? 0,
            drivingDistanceKm: day.drivingDistanceKm,
            drivingDurationHours: day.drivingDurationHours,
            transport:
              day.drivingDistanceKm > 0
                ? {
                    type: driveTypeLabel(opts?.language ?? "sl"),
                    duration: day.drivingDurationHours,
                    cost: "",
                    description: `${day.drivingDistanceKm} km`,
                  }
                : undefined,
            lat: landCenter.lat,
            lng: landCenter.lng,
            focusName: mapPins[0]?.name ?? day.activities?.[0]?.title ?? day.title,
            city,
            unsplashQuery: phase.unsplashQuery?.trim(),
            imageUrl: undefined,
            category: "activity",
            mapPins: mapPins.length > 0 ? mapPins : undefined,
          }),
        ),
      );
    }
  }

  const uniqueDays = dedupePlanDaysByNumber(days);
  days.length = 0;
  days.push(...uniqueDays);

  const totalDays = planCalendarDayCount(days);
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
  // Motorhome / car / train — never invent an international flight home.
  if (!opts?.groundTransportMode) {
    const rf = meta?.return_flight_eu;
    if (rf?.departure_time && rf.arrival_time_eu) {
      const fromAirport = rf.from_airport;
      const toAirport = rf.to_airport;
      returnFlightEu = {
        departureTime: rf.departure_time,
        arrivalTimeEu: rf.arrival_time_eu,
        fromAirport,
        toAirport,
        // Never trust Gemini "Direct flight" for long-haul — UI sanitizes again.
        summary: sanitizeReturnFlightSummary(rf.summary, {
          fromIata: fromAirport,
          toIata: toAirport,
          language: opts?.language ?? "sl",
          depart: rf.departure_time,
          arrive: rf.arrival_time_eu,
        }),
      };
    } else {
      returnFlightEu = extractReturnFlightFromLastDay(days, opts?.originIata);
    }
  }

  const lang = opts?.language ?? "sl";
  const rawSummary =
    meta?.season_warning?.trim() ||
    logisticsSummary ||
    `Načrt poti: ${meta?.destination ?? ""}`;

  const weatherWidget = normalizeWeatherWidget(data.weatherWidget, data.weatherSummary);
  const safetyWarning = normalizeSafetyWarning(data.safetyWarning);

  return {
    destinationName: meta?.destination ?? "Potovanje",
    summary: rawSummary,
    contentLanguage: normalizePlanLangCode(lang),
    safetyWarning: safetyWarning ?? null,
    weatherWidget,
    totalBudgetEur: 0,
    centerLat: coordCount > 0 ? latSum / coordCount : 0,
    centerLng: coordCount > 0 ? lngSum / coordCount : 0,
    days,
    originIata: opts?.originIata,
    destinationIata: opts?.destinationIata,
    originPlace: opts?.originPlace?.trim() || undefined,
    destinationPlace: opts?.destinationPlace?.trim() || undefined,
    groundTransportMode: opts?.groundTransportMode,
    accommodationMode,
    hotelRestEveryNDays,
    returnFlightEu,
    travelRequirements: mapTravelRequirementsFromJson(data.travel_requirements),
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
  opts: {
    budget: TripBudgetTier;
    pax: number;
    wishesText?: string;
    language?: string;
    departDate?: string;
    returnDate?: string;
    /** When set, pad/expand days[] to full trip length (motorhome often under-emits). */
    expectedDays?: number;
  },
): void {
  const tier = opts.budget === "budget" ? "budget" : opts.budget === "premium" ? "premium" : "mid";
  plan.days = dedupePlanDaysByNumber(plan.days);
  const expectedDays =
    opts.expectedDays && opts.expectedDays > 0
      ? opts.expectedDays
      : planCalendarDayCount(plan.days);
  expandPlanDaysToExpected(plan, {
    expectedDays,
    language: opts.language,
    departDate: opts.departDate,
  });
  const totalDays = planCalendarDayCount(plan.days);
  const travelers = Math.max(1, opts.pax);
  const wishesText = opts.wishesText ?? "";
  const planLang = opts.language ?? "sl";

  if (!plan.accommodationMode) {
    plan.accommodationMode = detectAccommodationMode(wishesText);
  }
  if (plan.accommodationMode === "motorhome" && !plan.hotelRestEveryNDays) {
    plan.hotelRestEveryNDays = detectHotelRestInterval(wishesText) ?? undefined;
  }

  const motorhome =
    plan.accommodationMode === "motorhome" ||
    plan.groundTransportMode === "motorhome";
  if (motorhome && plan.accommodationMode !== "motorhome") {
    plan.accommodationMode = "motorhome";
  }
  const hotelRestInterval = plan.hotelRestEveryNDays;
  const locale = resolveTripLocale(
    plan.destinationIata ?? "",
    plan.destinationName,
    planLang,
  );
  const valueDest = isValueDestinationBudget(
    locale.country,
    `${plan.destinationName ?? ""} ${plan.destinationIata ?? ""}`,
  );
  const mealsFullDay = valueDest
    ? tier === "premium"
      ? 40
      : tier === "mid"
        ? 28
        : 18
    : tier === "premium"
      ? 68
      : tier === "mid"
        ? 45
        : 28;
  const usedEveningVenues = new Set<string>();
  const cityDayIndex = new Map<string, number>();
  let priorScheduledText = "";

  for (let i = 0; i < plan.days.length; i++) {
    // Snap Gemini day centers onto curated land coords (avoids lake/jungle centroids).
    const raw = plan.days[i]!;
    const land =
      lookupRegionCoords(raw.city ?? "") ??
      lookupPoiCoords(raw.city ?? "") ??
      lookupPoiCoords(raw.focusName ?? "");
    if (land) {
      plan.days[i] = { ...raw, lat: land.lat, lng: land.lng };
    }

    const day = plan.days[i]!;
    const isArrival = day.day === 1;
    const isDeparture = isDepartureLogisticsDay(day, totalDays);

    if (day.activities && day.city && !isDeparture && !day.inFlightDay) {
      const city = day.city;
      const dayInRegion = (cityDayIndex.get(city) ?? 0) + 1;
      cityDayIndex.set(city, dayInRegion);
      const bangkokStayDays = plan.days.filter(
        (d) => /bangkok/i.test(d.city ?? "") && !d.inFlightDay,
      ).length;

      let enriched = enrichDayActivities(
        {
          morning: [...day.activities.morning],
          afternoon: [...day.activities.afternoon],
          evening: [...day.activities.evening],
        },
        city,
        dayInRegion,
        locale,
        {
          destinationIata: plan.destinationIata,
          isTripDay1: isArrival,
          isArrivalDay: isArrival,
          isDepartureDay: isDeparture,
          bangkokStayDays,
          usedEveningVenues,
          tripDate: day.date,
          priorScheduledText,
          motorhome,
        },
      );
      // Chatuchak / weekend markets — same gate as skeleton path.
      enriched = reconcileWeekdayGatedActivities(
        enriched,
        opts.departDate,
        day.day,
        locale.langCode,
      );
      syncDayActivitySlots(day, enriched);
      priorScheduledText += [
        ...enriched.morning,
        ...enriched.afternoon,
        ...enriched.evening,
      ]
        .map((a) => `${a.name} ${a.description ?? ""}`)
        .join(" ");
    }

    // After enrichers: drop Bangkok temples that Gemini (or pools) put on wrong cities.
    plan.days[i] = attachActivityCoordinates(stripMisplacedCityPois(plan.days[i]!));
    const finalDay = plan.days[i]!;

    if (isDeparture) {
      finalDay.inFlightDay = true;
      finalDay.category = "transport";
    }

    const kind = classifyDayBudgetKind(finalDay.activities, {
      isArrival,
      isDeparture,
      regionCity: finalDay.city,
    });

    let daily = estimateDayBudgetEur(
      finalDay.activities,
      undefined,
      { ...dayBudgetParams(tier, kind, true, mealsFullDay), pax: travelers },
    );

    if (finalDay.dailyBudgetEur > 0) {
      daily = motorhome
        ? normalizeMotorhomeDailyBudgetPerPerson(
            finalDay.dailyBudgetEur,
            daily,
            travelers,
          )
        : normalizeGeminiDailyBudgetPerPerson(
            finalDay.dailyBudgetEur,
            daily,
            sumListedActivityEur(finalDay.activities),
            travelers,
          );
    }

    daily = applyUsBudgetFloor(
      applyCanadaBudgetFloor(
        applySafariBudgetFloor(daily, kind, finalDay.activities),
        kind,
        finalDay.activities,
        finalDay.city ?? "",
        locale.country,
      ),
      kind,
      finalDay.activities,
      finalDay.city ?? "",
      locale.country,
    );

    if (motorhome) {
      daily = applyMotorhomeBudgetFloor(daily, kind, travelers);
      if (
        hotelRestInterval &&
        isHotelRestDay(finalDay.day, hotelRestInterval, { totalDays })
      ) {
        daily = applyHotelRestBudgetFloor(daily, true, travelers);
      }
      daily = applyMotorhomeBudgetCeil(daily, kind);
    } else {
      daily = applyGlobalDayBudgetCeil(daily, kind, tier);
      daily = applyValueDestinationDayBudgetCeil(daily, kind, tier, {
        country: locale.country,
        city: `${finalDay.city ?? ""} ${plan.destinationName ?? ""} ${plan.destinationIata ?? ""}`,
      });
    }

    finalDay.dailyBudgetEur = daily;

    // Force activity/title language (Gemini often leaks English into SL/DE plans).
    const city = finalDay.city ?? "";
    const lodgingFix = (s: string) =>
      motorhome ? fixMotorhomeCopyErrors(s, city) : fixHotelCopyErrors(s);
    finalDay.title = lodgingFix(
      sanitizeForLang(finalDay.title ?? "", planLang, locale.country),
    );
    if (finalDay.activities) {
      finalDay.activities = {
        morning: finalDay.activities.morning.map((a) => {
          const clean = sanitizeActivity(a, planLang, locale.country, city);
          return {
            ...clean,
            name: lodgingFix(clean.name),
            description: lodgingFix(clean.description ?? ""),
          };
        }),
        afternoon: finalDay.activities.afternoon.map((a) => {
          const clean = sanitizeActivity(a, planLang, locale.country, city);
          return {
            ...clean,
            name: lodgingFix(clean.name),
            description: lodgingFix(clean.description ?? ""),
          };
        }),
        evening: finalDay.activities.evening.map((a) => {
          const clean = sanitizeActivity(a, planLang, locale.country, city);
          return {
            ...clean,
            name: lodgingFix(clean.name),
            description: lodgingFix(clean.description ?? ""),
          };
        }),
      };
    }
  }

  plan.totalBudgetEur = computeTripTotalBudgetEur(plan.days, travelers);
  enrichIslandAirportTransfers(plan, {
    destinationIata: plan.destinationIata,
    language: plan.contentLanguage ?? planLang,
  });
  dedupeCrossDayBoilerplate(plan);
  if (motorhome) {
    enrichMotorhomePlanTips(plan, planLang);
  }
  // One map-coord pass: city centroids win; runway AI dumps stripped from sightseeing days.
  finalizeItineraryMapCoords(plan);
}

export function isCatalogTripPlan(value: unknown): value is AiTripPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as AiTripPlan;
  return Array.isArray(plan.days) && plan.days.length > 0 && typeof plan.destinationName === "string";
}
