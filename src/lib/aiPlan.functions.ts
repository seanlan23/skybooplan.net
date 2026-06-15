import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FULL_PLAN_SYSTEM, SKELETON_SYSTEM } from "@/lib/aiPlan.prompts";
import {
  buildArrivalLogistics,
  buildDepartureLogistics,
  buildOriginDepartureHint,
  buildOriginDepartureLogistics,
  buildFlightSchedulingPayload,
  isEarlyDeparture,
  arrivalDaySlot,
  arrivalTripDay,
  isInFlightTripDay,
  isLateArrival,
  isRedEyeArrival,
  isOvernightDeparture,
  isTightArrivalDay,
  isAfternoonDeparture,
  isEveningDeparture,
  isLateNightDeparture,
  isTightDeparture,
  type LogisticsActivity,
  type TripFlightContext,
} from "@/lib/flightScheduling";
import { enrichDayActivities } from "@/lib/dayEnrichers";
import {
  applyCanadaBudgetFloor,
  applyHotelRestBudgetFloor,
  applyMotorhomeBudgetFloor,
  applySafariBudgetFloor,
  classifyDayBudgetKind,
  computeTripTotalBudgetEur,
  dayBudgetParams,
  estimateDayBudgetEur,
} from "@/lib/tripBudget";
import {
  buildMetroClusteringPayload,
  highlightFuzzyKey,
  isSprawlingMetroRegion,
  lookupPoiCoords,
  maxIntraDayKm,
  orderHighlightsByProximity,
  prepareRegionHighlights,
  rebalanceRegionHighlightsByProximity,
  resolveHighlightCoords,
} from "@/lib/tripGeo";
import { dailyMealsBudgetEur, getPriceTier } from "@/lib/tripLocale";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { normalizePlanLangCode, STRICT_LLM_LANGUAGE_RULE } from "@/lib/planLanguages";
import {
  currencyWritingRule,
  normalizePlanCurrency,
  priceCurrencyPayload,
  STRICT_LLM_CURRENCY_RULE,
  type PlanCurrency,
} from "@/lib/planCurrency";
import { languageWritingRule, resolveTripLocale } from "@/lib/tripLocale";
import {
  annotateDayAstronomy,
  attachSkeletonAstronomy,
  buildTripAstronomy,
  type SkeletonAstronomy,
} from "@/lib/lunarTides";
import {
  buildTripClimate,
  isCentralVietnamCity,
  isCentralVietnamFloodDate,
} from "@/lib/seasonalHints";
import {
  fixPoiNameForSlot,
  fixSlotTimeMismatch,
  sanitizeActivity,
  sanitizeForLang,
  sanitizeLegacyTemplateLeak,
} from "@/lib/textSanitize";
import {
  detectAccommodationMode,
  motorhomeLocalTransportTips,
  motorhomePromptRules,
  motorhomeTravelDayDescription,
  motorhomeTransportBetween,
  type AccommodationMode,
  detectHotelRestInterval,
  isHotelRestDay,
} from "@/lib/tripMode";
import {
  dedupeSameDayGeoConflicts,
  ensureAyutthayaArrivalHighlights,
  ensureInboundArrivalHighlights,
  filterArrivalDayHighlights,
  filterDepartureDayHighlights,
  filterInboundTravelDayHighlights,
  filterTravelOutDayHighlights,
  isAiPlaceholderText,
  isBeachLoungingPoi,
  isClosedDeprecatedPoi,
  isEarlyClosingPoi,
  isEveningOnlyPoi,
  isFullDayExcursion,
  isHeavyRegionalTravel,
  isHillTempleExcursion,
  isMorningOnlyPoi,
  isNightlifeOnlyPoi,
  isRegionalTravelHighlight,
  isSunsetOnlyPoi,
  isSunsetTemplePoi,
  isTransportLikeHighlight,
  isWrongCityPoi,
  fixPoiPriceLabel,
  isPoiOpenOnTripDay,
  reconcileWeekdayGatedActivities,
  resolveMarketTravelConflicts,
} from "@/lib/tripContent";
import { collapseSmallIslandStays, isSmallIsland } from "@/lib/islandStays";
import {
  buildCuratedRoutePayload,
  lookupCuratedTransportLeg,
  resolveCuratedBlueprint,
  templateToBlueprintBlocks,
  type RegionBlueprintBlock,
} from "@/lib/curatedRoutes";
import {
  enrichPrioritiesPayload,
  getInterestAnchor,
  resolveInterestBlueprint,
} from "@/lib/interestAnchors";
import {
  lastRegionMatchesReturnHub,
  resolveMultiCountryBlueprint,
} from "@/lib/multiCountryRoutes";
import { extractTripIntent, tripIntentPromptRule } from "@/lib/tripIntent";
import { attachActivityCoordinates } from "@/lib/mapPoiResolver";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { lookupDestination } from "@/lib/destinationCoords";
import { buildPrioritiesPayload, PLANNER_INTEREST_KEYS } from "@/lib/plannerInterests";
import {
  applyCatalogPicksToRegions,
  catalogSkeletonBudget,
  catalogSkeletonSummary,
} from "@/lib/applyPickedAttractions";
import { MIN_CATALOG_PICKS } from "@/lib/attractionCatalog";
import {
  ensureTripBangkokMustSeeHighlights,
  stripRepeatBangkokMustSee,
} from "@/lib/bangkokMustSee";
import { eveningVenueKey } from "@/lib/dayEnrichers";
import type { LlmRole } from "@/lib/llm";
import { injectVietnamCuratedHighlights } from "@/lib/vietnamCuratedHighlights";

function assertGeminiApiKey(): void {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing Gemini API Key");
  }
}

/**
 * Gemini JSON klic — dynamic import @/lib/llm (streaming via @google/genai) da SDK ne pride v client bundle.
 */
async function geminiGenerateJson<T>(
  opts: {
    role: LlmRole;
    system: string;
    user: string;
    trace?: (msg: string) => void;
    label?: string;
    maxTokens?: number;
    timeoutMs?: number;
  },
  meta?: { httpStatus?: number },
): Promise<T | null> {
  assertGeminiApiKey();
  const timingLabel = opts.label ?? opts.role;
  try {
    const { generateJson, resolveModel } = await import("@/lib/llm");
    const model = resolveModel(opts.role, "google");
    console.time(`GeminiBackend:${timingLabel}`);
    const outcome = await generateJson<T>({
      ...opts,
      provider: "google",
      model,
    });
    console.timeEnd(`GeminiBackend:${timingLabel}`);
    if (meta) meta.httpStatus = outcome.httpStatus;
    return outcome.data;
  } catch (error) {
    console.timeEnd(`GeminiBackend:${timingLabel}`);
    console.error("GEMINI_ERROR_DEBUG:", error);
    opts.trace?.(`gemini fatal: ${error instanceof Error ? error.message : String(error)}`);
    if (meta) meta.httpStatus = 500;
    return null;
  }
}

const Input = z.object({
  destinationIata: z.string().min(2).max(80),
  originIata: z.string().min(2).max(80),
  /** Open-jaw return airport (e.g. LAX when inbound is JFK). */
  returnFromIata: z.string().min(2).max(80).optional(),
  departDate: z.string().min(10).max(10),
  returnDate: z.string().min(10).max(10).optional().or(z.literal("")),
  pax: z.number().min(1).max(9),
  language: z.enum(["en", "sl", "es", "fr", "it", "de"]).optional(),
  currency: z.enum(["EUR", "USD"]).optional(),
  pace: z.enum(["intensive", "relaxed", "calm"]).optional(),
  wishes: z.string().max(2000).optional(),
  priorities: z.array(z.enum(PLANNER_INTEREST_KEYS)).max(10).optional(),
  customPrompt: z.string().max(8000).optional(),
  mode: z.enum(["trip", "stays"]).optional(),
  flightContext: z
    .object({
      outboundDepart: z.string(),
      outboundArrive: z.string(),
      outboundArriveDayOffset: z.number(),
      inboundDepart: z.string().optional(),
      inboundArrive: z.string().optional(),
    })
    .optional(),
  /** User-picked attractions from catalog (manual / pick mode). */
  pickedAttractionIds: z.array(z.string().min(4).max(80)).max(40).optional(),
});

export type DayCategory = "stay" | "eat" | "activity" | "sight" | "transport" | "beach" | "nature";

export type ActivityTransportType = "flight" | "ferry" | "train" | "van" | "bus" | "taxi";

export type Activity = {
  name: string;
  type?: string;
  /** Transport mode for movement activities — drives icon + duration badge in UI. */
  transportType?: ActivityTransportType;
  /** Exact travel duration label from LLM, e.g. "1h 10min". */
  transportDuration?: string;
  price?: string;
  priceLabel?: string;
  description?: string;
  arrivalTime?: string;
  departureTime?: string;
  estimatedCostEur?: number;
  timeSlot?: string;
  lat?: number;
  lng?: number;
  /** Google Places photo for this activity (server-enriched). */
  imageUrl?: string;
  /** English Unsplash search term from Gemini. */
  unsplashQuery?: string;
  tripAdvisorStyleDetails?: import("@/lib/geminiPro.shared").TripAdvisorStyleDetails;
};

export type Suggestion = {
  name: string;
  description: string;
  priceLabel: string;
};

export type DayTransport = {
  type: string;
  duration: string;
  cost: string;
  description: string;
};

export type DayTransportLeg = {
  type: "flight" | "ferry" | "train" | "van";
  from: string;
  to: string;
  duration: string;
  estimatedPrice: number;
};

export type GroundTransportMode = "car" | "motorhome" | "train";

export type GroundJourneyStop = {
  name: string;
  note?: string;
  day?: number;
};

export type GroundJourney = {
  mode: GroundTransportMode;
  originLabel: string;
  destinationLabel: string;
  totalDistanceKm?: number;
  totalDuration?: string;
  stops: GroundJourneyStop[];
};

export type IslandAccessRoute = {
  defId: string;
  direction: "arrival" | "departure";
};

export type { IslandStayBlock } from "@/lib/islandStays";

export type DayPlan = {
  day: number;
  date: string;
  /** Last calendar day when a small-island stay is collapsed into one block. */
  dayEnd?: number;
  dateEnd?: string;
  /** Flexible island stay — beaches, boats, snorkeling without per-day slots. */
  islandStay?: import("@/lib/islandStays").IslandStayBlock;
  title: string;
  morning: string;
  afternoon: string;
  evening: string;
  activities?: {
    morning?: Activity[];
    afternoon?: Activity[];
    evening?: Activity[];
  };
  suggestions?: Suggestion[];
  transport?: DayTransport;
  /** Premium cards for internal flights, ferries, trains. */
  transportation?: DayTransportLeg[];
  /** Multi-modal island access (flight → van → ferry) for map + UI. */
  islandAccessRoute?: IslandAccessRoute;
  /** Outbound journey from home (car / motorhome / train). */
  journeyPhase?: "outbound" | "destination";
  travelHack: string;
  transportationTips: string;
  localWarnings: string;
  dailyBudgetEur: number;
  /** Driving distance for the day (km) — from Gemini or Mapbox. */
  drivingDistanceKm?: number;
  /** Driving duration label e.g. "3h 45m". */
  drivingDurationHours?: string;
  lat: number;
  lng: number;
  focusName: string;
  city: string;
  /** Hero photo for map marker (Google Places / Unsplash). */
  imageUrl?: string;
  /** English Unsplash search term for this city/phase. */
  unsplashQuery?: string;
  category: DayCategory;
  /** No hotel search while still en route on an international flight. */
  inFlightDay?: boolean;
  /** POI pins for the active day on the map (skeleton preview). */
  mapPins?: Array<{
    name: string;
    lat: number;
    lng: number;
    category?: string;
    description?: string;
    arrivalTime?: string;
    departureTime?: string;
    estimatedCostEur?: number;
    imageUrl?: string;
    unsplashQuery?: string;
    tripAdvisorStyleDetails?: import("@/lib/geminiPro.shared").TripAdvisorStyleDetails;
  }>;
};

export type ReturnFlightEu = {
  departureTime: string;
  arrivalTimeEu: string;
  fromAirport: string;
  toAirport: string;
  summary: string;
};

export type { TravelRequirements, TravelVisaInfo } from "@/lib/travelRequirements";

export type WeatherSummary = {
  currentCondition: string;
  avgTemperature: string;
  seasonType: string;
  clothingAdvice: string;
};

export type WeatherWidget = {
  season: string;
  avgTemp: string;
  clothing: string;
};

export type SafetyWarning = {
  title?: string;
  message: string;
};

export type AiTripPlan = {
  destinationName: string;
  summary: string;
  /** Critical safety alert — shown as red card when set. */
  safetyWarning?: SafetyWarning | null;
  /** Weather + season + clothing widget from LLM. */
  weatherWidget?: WeatherWidget;
  /** @deprecated Legacy — prefer weatherWidget. */
  weatherSummary?: WeatherSummary;
  totalBudgetEur: number;
  centerLat: number;
  centerLng: number;
  days: DayPlan[];
  originIata?: string;
  destinationIata?: string;
  accommodationMode?: "hotel" | "motorhome";
  hotelRestEveryNDays?: number;
  returnFlightEu?: ReturnFlightEu;
  /** Smart travel requirements by likely resident nationality (origin hub). */
  travelRequirements?: import("@/lib/travelRequirements").TravelRequirements;
  /** Ground transport from origin city to destination (car / motorhome / train). */
  groundTransportMode?: GroundTransportMode;
  originPlace?: string;
  destinationPlace?: string;
  groundJourney?: GroundJourney;
};

/** Phase A — city/region blocks shown in ~30s before day-by-day expansion. */
export type SkeletonHighlight = {
  day: number;
  name: string;
  description: string;
  priceLabel: string;
  lat: number;
  lng: number;
  /** e.g. "2h", "pol dneva", "cel dan" — AI sets by real visit time */
  visitDuration?: string;
};

export type TripRegionTransport = {
  type: string;
  duration: string;
  costLabel?: string;
  howTo?: string;
};

export type TripRegion = {
  city: string;
  startDay: number;
  endDay: number;
  startDate: string;
  endDate: string;
  summary: string;
  localTransportTips: string;
  travelTips: string;
  highlights: SkeletonHighlight[];
  lat: number;
  lng: number;
  transportToNext?: TripRegionTransport;
};

export type TripSkeleton = {
  destinationName: string;
  summary: string;
  totalBudgetEur: number;
  originIata: string;
  destinationIata: string;
  returnFromIata?: string;
  departDate: string;
  returnDate?: string;
  accommodationMode?: "hotel" | "motorhome";
  /** Motorhome trips: show Booking hotels only on these interval days (e.g. every 5 days). */
  hotelRestEveryNDays?: number;
  regions: TripRegion[];
  /** Phase 3 — optional tide calendars per coastal region (server-prefetched). */
  astronomy?: SkeletonAstronomy;
};

export type GenerateAiSkeletonResult = {
  skeleton: TripSkeleton | null;
  error: string | null;
  debug?: string[];
};

export type GenerateAiPlanResult = {
  plan: AiTripPlan | null;
  error: string | null;
  errorCode?:
    | "REGISTER_REQUIRED"
    | "PAYMENT_REQUIRED"
    | "DAILY_LIMIT"
    | "INVALID_ITINERARY"
    | null;
  quota?: { tier: string; remaining: number };
  violations?: { rule: string; message: string; dayNumbers: number[] }[];
  debug?: string[];
};

const BATCH_THRESHOLD_DAYS = 8;

function anchorBbox(lat: number, lng: number, delta = 0.35): [number, number, number, number] {
  return [lng - delta, lat - delta, lng + delta, lat + delta];
}

/** All known IATA hubs — used to validate/fix AI coordinates worldwide. */
const CITY_ANCHORS: Record<
  string,
  { name: string; lat: number; lng: number; bbox: [number, number, number, number] }
> = Object.fromEntries(
  Object.entries(DESTINATION_BY_IATA).map(([iata, meta]) => [
    iata,
    {
      name: meta.name,
      lat: meta.lat,
      lng: meta.lng,
      bbox: anchorBbox(meta.lat, meta.lng),
    },
  ]),
);

const CLOSED_AIRPORTS = [
  { pattern: /tegel|txl|flughafen berlin-tegel/gi, replacement: "Berlin Brandenburg Airport (BER)" },
  { pattern: /donaldson|berlin schönefeld(?!\s*\(ber\))/gi, replacement: "Berlin Brandenburg Airport (BER)" },
];

const LANG_MAP: Record<string, string> = {
  sl: "slovenščini", en: "English", de: "Deutsch", it: "italiano", fr: "français", es: "español",
};

function daysBetween(a: string, b?: string) {
  if (!b) return 5;
  const d1 = new Date(`${a}T00:00:00Z`).getTime();
  const d2 = new Date(`${b}T00:00:00Z`).getTime();
  return Math.max(1, Math.min(21, Math.round((d2 - d1) / 86_400_000)));
}

function isoDateAtOffset(base: string, offset: number) {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type BatchHandoff = {
  visitedCities: string[];
  lastCity: string;
  lastFocusName: string;
  remainingBudgetEur: number;
};

type RoutingRepairPayload = {
  violations: string[];
  regenerateDays: { start: number; end: number };
};

type FullPlanTask = "full_plan" | "continue_plan" | "repair_plan" | "continue_plan_repair";

function resolveFullPlanTask(
  startDay: number,
  handoff?: BatchHandoff,
  routingRepair?: RoutingRepairPayload,
): FullPlanTask {
  if (routingRepair && handoff) return "continue_plan_repair";
  if (routingRepair) return "repair_plan";
  if (startDay > 1 || handoff) return "continue_plan";
  return "full_plan";
}

/** Trip parameters only — format/rules live in SKELETON_SYSTEM / FULL_PLAN_SYSTEM prompts. */
function buildTripUserMessage(opts: {
  originIata: string;
  destinationIata: string;
  departDate: string;
  returnDate?: string;
  nDays: number;
  startDay: number;
  endDay: number;
  pax: number;
  langCode: string;
  displayCurrency: PlanCurrency;
  paceLabel: string;
  isStays: boolean;
  wishes?: string;
  priorities?: string[];
  customPrompt?: string;
  handoff?: BatchHandoff;
  routingRepair?: RoutingRepairPayload;
  flightContext?: TripFlightContext;
  tripClimate?: string[];
  regionClimate?: Array<{ city: string; hints: string[] }>;
  tripAstronomy?: string[];
}): string {
  const locale = resolveTripLocale(opts.destinationIata, "", opts.langCode, opts.displayCurrency);
  const payload: Record<string, unknown> = {
    task: resolveFullPlanTask(opts.startDay, opts.handoff, opts.routingRepair),
    originIata: opts.originIata,
    destinationIata: opts.destinationIata,
    departDate: opts.departDate,
    returnDate: opts.returnDate ?? null,
    totalDays: opts.nDays,
    generateDays: { start: opts.startDay, end: opts.endDay },
    dateRange: {
      start: isoDateAtOffset(opts.departDate, opts.startDay - 1),
      end: isoDateAtOffset(opts.departDate, opts.endDay - 1),
    },
    travelers: opts.pax,
    pace: opts.paceLabel,
    languageCode: opts.langCode,
    language: LANG_MAP[opts.langCode] ?? opts.langCode,
    writingRule: languageWritingRule(opts.langCode),
    displayCurrency: opts.displayCurrency,
    priceCurrency: priceCurrencyPayload(opts.displayCurrency),
    currencyRule: currencyWritingRule(opts.displayCurrency),
    destinationCountry: locale.countryName,
    mode: opts.isStays ? "stays" : "trip",
  };
  if (opts.wishes?.trim()) payload.wishes = opts.wishes.trim();
  const prioritiesBase = buildPrioritiesPayload(opts.priorities ?? [], opts.langCode);
  if (prioritiesBase) {
    payload.priorities = enrichPrioritiesPayload(
      prioritiesBase,
      opts.destinationIata,
      opts.priorities ?? [],
      opts.langCode,
    );
  }
  if (opts.customPrompt?.trim()) payload.customPrompt = opts.customPrompt.trim();
  if (opts.handoff) payload.handoff = opts.handoff;
  if (opts.routingRepair) payload.routingRepair = opts.routingRepair;
  if (opts.flightContext) {
    Object.assign(payload, buildFlightSchedulingPayload(opts.flightContext, opts.nDays));
  }
  if (opts.tripClimate?.length) payload.tripClimate = opts.tripClimate;
  if (opts.regionClimate?.length) payload.regionClimate = opts.regionClimate;
  if (opts.tripAstronomy?.length) payload.tripAstronomy = opts.tripAstronomy;
  return JSON.stringify(payload, null, 2);
}

function buildSkeletonUserMessage(opts: {
  originIata: string;
  destinationIata: string;
  returnFromIata?: string;
  departDate: string;
  returnDate?: string;
  nDays: number;
  pax: number;
  langCode: string;
  displayCurrency: PlanCurrency;
  paceLabel: string;
  isStays: boolean;
  wishes?: string;
  priorities?: string[];
  customPrompt?: string;
  coverageRepair?: { error: string; lastEndDay: number };
  regionBlueprint?: RegionBlueprintBlock[];
  flightContext?: TripFlightContext;
  tripClimate?: string[];
  regionClimate?: Array<{ city: string; hints: string[] }>;
  tripAstronomy?: string[];
}): string {
  const locale = resolveTripLocale(opts.destinationIata, "", opts.langCode, opts.displayCurrency);
  const payload: Record<string, unknown> = {
    task: opts.coverageRepair ? "skeleton_repair" : "skeleton",
    originIata: opts.originIata,
    destinationIata: opts.destinationIata,
    departDate: opts.departDate,
    returnDate: opts.returnDate ?? null,
    totalDays: opts.nDays,
    coverage: {
      firstDay: 1,
      lastDay: opts.nDays,
      lastDate: isoDateAtOffset(opts.departDate, opts.nDays - 1),
    },
    travelers: opts.pax,
    pace: opts.paceLabel,
    languageCode: opts.langCode,
    language: LANG_MAP[opts.langCode] ?? opts.langCode,
    writingRule: languageWritingRule(opts.langCode),
    displayCurrency: opts.displayCurrency,
    priceCurrency: priceCurrencyPayload(opts.displayCurrency),
    currencyRule: currencyWritingRule(opts.displayCurrency),
    destinationCountry: locale.countryName,
    mode: opts.isStays ? "stays" : "trip",
  };
  if (opts.returnFromIata) {
    payload.returnFromIata = opts.returnFromIata;
    const retHub = lookupDestination(opts.returnFromIata);
    if (retHub) {
      payload.returnHub = {
        iata: opts.returnFromIata,
        city: retHub.name,
        country: retHub.country,
      };
      if (retHub.country !== locale.country) {
        payload.openJawRule =
          opts.langCode === "sl" || opts.langCode.startsWith("sl")
            ? `Odprt krog: prihod v ${locale.countryName}, odhod iz ${retHub.country}. Zadnja regija MORA biti ${retHub.name} (${opts.returnFromIata}) — NE Hanoi/HCMC če let domov iz Bangkoka.`
            : `Open-jaw: arrive ${locale.countryName}, depart from ${retHub.country}. Final region MUST be ${retHub.name} (${opts.returnFromIata}) for the return flight.`;
      }
    }
  }
  if (opts.wishes?.trim()) payload.wishes = opts.wishes.trim();
  const tripIntent = extractTripIntent(opts.wishes, {
    destinationIata: opts.destinationIata,
    returnFromIata: opts.returnFromIata,
    pace: opts.paceLabel,
  });
  if (tripIntent.countries.length > 0 || tripIntent.routeId) {
    payload.tripIntent = tripIntent;
    const rule = tripIntentPromptRule(tripIntent, opts.langCode);
    if (rule) payload.tripIntentRule = rule;
  }
  const prioritiesBase = buildPrioritiesPayload(opts.priorities ?? [], opts.langCode);
  if (prioritiesBase) {
    payload.priorities = enrichPrioritiesPayload(
      prioritiesBase,
      opts.destinationIata,
      opts.priorities ?? [],
      opts.langCode,
    );
    const retCountry = opts.returnFromIata
      ? lookupDestination(opts.returnFromIata)?.country
      : undefined;
    if (
      retCountry &&
      retCountry !== locale.country &&
      (opts.priorities ?? []).includes("beaches")
    ) {
      const returnBeaches = getInterestAnchor(retCountry, "beaches");
      if (returnBeaches) {
        payload.returnCountryBeachAnchor = { country: retCountry, ...returnBeaches };
      }
    }
  }
  if (opts.customPrompt?.trim()) payload.customPrompt = opts.customPrompt.trim();
  const accommodation = detectAccommodationMode(opts.wishes, opts.customPrompt);
  if (accommodation === "motorhome") {
    payload.accommodationMode = "motorhome";
    payload.motorhomeRules = motorhomePromptRules(
      opts.langCode === "sl" || opts.langCode.startsWith("sl"),
    );
    const hotelRest = detectHotelRestInterval(opts.wishes, opts.customPrompt);
    if (hotelRest) payload.hotelRestEveryNDays = hotelRest;
  }
  if (opts.coverageRepair) payload.coverageRepair = opts.coverageRepair;
  if (opts.regionBlueprint?.length) {
    payload.regionBlueprint = annotateCollapsedStayBlueprint(opts.regionBlueprint);
  }
  payload.scheduling = buildSchedulingHint(opts.paceLabel, opts.nDays);
  if (opts.flightContext) {
    Object.assign(payload, buildFlightSchedulingPayload(opts.flightContext, opts.nDays));
  }
  if (opts.tripClimate?.length) payload.tripClimate = opts.tripClimate;
  if (opts.regionClimate?.length) payload.regionClimate = opts.regionClimate;
  if (opts.tripAstronomy?.length) payload.tripAstronomy = opts.tripAstronomy;
  const curated = buildCuratedRoutePayload(
    opts.nDays,
    opts.destinationIata,
    opts.priorities,
    opts.wishes,
    opts.returnFromIata,
  );
  if (curated) Object.assign(payload, curated);
  const metro = buildMetroClusteringPayload(opts.destinationIata, opts.nDays, opts.langCode);
  if (metro) payload.metroClustering = metro;
  return JSON.stringify(payload, null, 2);
}

function annotateCollapsedStayBlueprint(
  blocks: RegionBlueprintBlock[],
): Array<RegionBlueprintBlock & { collapsedStay?: boolean }> {
  return blocks.map((b) => {
    const span = b.endDay - b.startDay + 1;
    if (span < 2 || !isSmallIsland(b.city)) return b;
    return { ...b, collapsedStay: true };
  });
}

function buildSchedulingHint(paceLabel: string, nDays: number) {
  const base = {
    calm: {
      highlightsPerDay: "2–3 (one major sight can fill half/full day)",
      avgTotal: "~2.5 per day",
      note: "Slow pace — depth over quantity; still fill morning, afternoon, and evening.",
    },
    relaxed: {
      highlightsPerDay: "3–4 (mix half-day anchor + lighter stops)",
      avgTotal: "~3 per day",
      note: "Quality over quantity — unique POIs in each slot.",
    },
    intensive: {
      highlightsPerDay: "3–4 (cluster nearby; full-day tours stand alone)",
      avgTotal: "~3.5 per day",
      note: "Cluster by neighbourhood — vary visit duration realistically.",
    },
  }[paceLabel] ?? {
    highlightsPerDay: "3–4",
    avgTotal: "~3 per day",
    note: "Vary by visit duration — every day needs dopoldan, popoldan, večer content.",
  };

  return {
    ...base,
    totalDays: nDays,
    rules: [
      "Every calendar day needs 2–4 unique named real POIs — zero blank days or generic titles",
      "Inter-city travel days: transport in morning + real afternoon/evening sights in destination",
      "Major sights often need half-day or full-day — do not pack four big sights on one day",
      "Include visitDuration on each highlight (2h, pol dneva, cel dan)",
      "Descriptions 120–280 chars — unique practical tips, timing must match slot (no sunset label in morning)",
    ],
  };
}

/** Suggested city/day split — steers the model on long trips and powers programmatic fallback. */
function buildRegionBlueprint(nDays: number, destinationIata: string): RegionBlueprintBlock[] | undefined {
  const iata = destinationIata.toUpperCase();

  if (iata === "BKK") {
    return templateToBlueprintBlocks(
      [["Bangkok", 3], ["Ayutthaya", 1], ["Chiang Mai", 4], ["Phuket", 0], ["Bangkok", 2]],
      nDays,
    );
  }
  if (iata === "SGN" || iata === "DAD") {
    return templateToBlueprintBlocks(
      [
        ["Ho Chi Minh City", 3],
        ["Mekong Delta", 1],
        ["Hoi An", 3],
        ["Hue", 2],
        ["Hanoi", 3],
        ["Ha Long Bay", 2],
        ["Ho Chi Minh City", 0],
      ],
      nDays,
    );
  }
  if (iata === "HAN") {
    return templateToBlueprintBlocks(
      [
        ["Hanoi", 4],
        ["Ha Long Bay", 2],
        ["Hue", 2],
        ["Hoi An", 3],
        ["Ho Chi Minh City", 0],
      ],
      nDays,
    );
  }
  if (iata === "MXP" || iata === "ROM" || iata === "FCO") {
    return templateToBlueprintBlocks(
      [["Rome", 4], ["Florence", 3], ["Venice", 3], ["Milan", 0]],
      nDays,
    );
  }
  if (iata === "PAR") {
    return templateToBlueprintBlocks([["Paris", 0], ["Lyon", 3], ["Paris", 2]], nDays);
  }
  if (iata === "LON") {
    return templateToBlueprintBlocks([["London", 0], ["Edinburgh", 3], ["London", 2]], nDays);
  }
  if (iata === "BCN") {
    return templateToBlueprintBlocks([["Barcelona", 0], ["Madrid", 3], ["Barcelona", 2]], nDays);
  }
  if (iata === "MAD") {
    return templateToBlueprintBlocks([["Madrid", 0], ["Barcelona", 3], ["Madrid", 2]], nDays);
  }
  if (iata === "AGP") {
    return templateToBlueprintBlocks([["Málaga", 0], ["Seville", 3], ["Málaga", 2]], nDays);
  }
  if (iata === "JFK" || iata === "LAX") {
    const city = iata === "JFK" ? "New York" : "Los Angeles";
    return templateToBlueprintBlocks([[city, 0]], nDays);
  }
  if (iata === "JRO" || iata === "ZNZ") {
    return templateToBlueprintBlocks(
      [["Arusha", 2], ["Serengeti", 5], ["Zanzibar", 0]],
      nDays,
    );
  }
  if (iata === "NRT" || iata === "HND") {
    return templateToBlueprintBlocks([["Tokyo", 0], ["Kyoto", 4], ["Tokyo", 2]], nDays);
  }
  if (iata === "YYZ" || iata === "YVR" || iata === "YOW" || iata === "YYC") {
    return templateToBlueprintBlocks(
      [
        ["Toronto", 3],
        ["Niagara Falls", 2],
        ["Ottawa", 2],
        ["Banff", 3],
        ["Vancouver", 3],
        ["Toronto", 0],
      ],
      nDays,
    );
  }

  return undefined;
}

/** Steer route from user wishes — e.g. Gibraltar + Madrid on return before hub. */
function resolveRegionBlueprint(
  nDays: number,
  destinationIata: string,
  wishes?: string,
  priorities?: string[],
  returnFromIata?: string,
): RegionBlueprintBlock[] | undefined {
  const tripIntent = extractTripIntent(wishes, {
    destinationIata,
    returnFromIata,
  });
  const curatedRoute = resolveCuratedBlueprint(
    nDays,
    destinationIata,
    templateToBlueprintBlocks,
    priorities,
    wishes,
    returnFromIata,
  );
  if (curatedRoute?.length) return curatedRoute;

  const multiCountry = resolveMultiCountryBlueprint(
    nDays,
    destinationIata,
    returnFromIata,
    wishes,
    tripIntent,
  );
  if (multiCountry?.length) return multiCountry;

  const destCountry = lookupDestination(destinationIata)?.country;
  const retCountry = returnFromIata ? lookupDestination(returnFromIata)?.country : undefined;
  const skipSingleCountryAnchors = destCountry && retCountry && destCountry !== retCountry;

  if (!skipSingleCountryAnchors) {
    const interestRoute = resolveInterestBlueprint(
      nDays,
      destinationIata,
      priorities,
      templateToBlueprintBlocks,
    );
    if (interestRoute?.length) return interestRoute;
  }
  const w = (wishes ?? "").toLowerCase();
  const iata = destinationIata.toUpperCase();
  const hub =
    iata === "MAD" ? "Madrid" : iata === "AGP" ? "Málaga" : iata === "BCN" ? "Barcelona" : null;

  const wantsGibraltar = /gibraltar|girbraltar|gibraltarj/.test(w);
  const wantsBarcelona = /barcelona/.test(w);
  const wantsCoast = /obali|obalo|coast|valencia|malaga|málaga|andaluz/.test(w);

  if (hub && (iata === "BCN" || iata === "MAD" || iata === "AGP") && wantsGibraltar) {
    if (iata === "MAD" && wantsBarcelona) {
      return templateToBlueprintBlocks(
        [
          ["Madrid", 2],
          ["Barcelona", 3],
          [wantsCoast ? "Valencia" : "Seville", 2],
          ["Gibraltar", 2],
          ["Madrid", 0],
        ],
        nDays,
      );
    }
    const blocks: Array<[string, number]> = [
      [hub, 3],
      [wantsCoast ? "Valencia" : "Seville", 2],
      ["Gibraltar", 2],
    ];
    if (/madrid/.test(w) && hub !== "Madrid") {
      blocks.push(["Madrid", 2]);
    }
    blocks.push([hub, 0]);
    return templateToBlueprintBlocks(blocks, nDays);
  }

  if (/route\s*66|rt\s*66|mother road/i.test(w)) {
    const eastHub = new Set(["EWR", "JFK", "LGA", "PHL", "BOS", "DCA", "IAD"]);
    const blocks: Array<[string, number]> = [];
    if (eastHub.has(iata)) {
      blocks.push(["New York", 2]);
    }
    blocks.push(
      ["Chicago", eastHub.has(iata) ? 1 : 2],
      ["St. Louis", 2],
      ["Oklahoma City", 2],
      ["Amarillo", 2],
      ["Albuquerque", 2],
      ["Flagstaff", 2],
      ["Los Angeles", 0],
    );
    return templateToBlueprintBlocks(blocks, nDays);
  }

  return buildRegionBlueprint(nDays, destinationIata);
}

/** Single-hub fallback when AI coverage fails — works for any IATA worldwide. */
function buildRegionBlueprintFallback(
  nDays: number,
  destinationIata: string,
): RegionBlueprintBlock[] {
  const hub = CITY_ANCHORS[destinationIata.toUpperCase()];
  return [{ city: hub?.name ?? destinationIata, startDay: 1, endDay: nDays }];
}

function interRegionHopKm(fromCity: string, toCity: string): number {
  const a = lookupRegionCoords(fromCity);
  const b = lookupRegionCoords(toCity);
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function transportBetweenCities(
  fromCity: string,
  toCity: string,
  accommodation: AccommodationMode = "hotel",
  country?: string,
): TripRegion["transportToNext"] {
  const curated = lookupCuratedTransportLeg(fromCity, toCity, country);
  if (curated) {
    return {
      type: curated.type,
      duration: curated.duration,
      costLabel: curated.costLabel,
      howTo: curated.howTo,
    };
  }

  const from = fromCity.toLowerCase();
  const to = toCity.toLowerCase();
  const km = interRegionHopKm(fromCity, toCity);
  const sameHub = from === to;

  if (accommodation === "motorhome" && !sameHub) {
    const effectiveKm = km > 0 ? km : 500;
    if (effectiveKm >= 80) {
      return motorhomeTransportBetween(effectiveKm, fromCity, toCity);
    }
  }

  if (sameHub) {
    return {
      type: "local",
      duration: "30m",
      costLabel: "€5",
      howTo: "Uporabi lokalni prevoz ali taksi.",
    };
  }

  if (km >= 1200) {
    return {
      type: "flight",
      duration: "4–6h",
      costLabel: "180–350 €",
      howTo:
        "Notranji let + prevoz do hotela — rezerviraj vnaprej. Prvi dan v novi regiji je prevoz, ne ogledi.",
    };
  }
  if (km >= 500) {
    if (accommodation === "motorhome") {
      return motorhomeTransportBetween(km, fromCity, toCity);
    }
    return {
      type: "flight",
      duration: "2–4h",
      costLabel: "100–220 €",
      howTo: "Krajši notranji let ali dolga vožnja — načrtuj cel dan za prevoz.",
    };
  }
  if (/niagara/.test(to) || /niagara/.test(from)) {
    return {
      type: "train",
      duration: "2h",
      costLabel: "25–45 €",
      howTo: "VIA Rail ali avtobus iz Toronta — rezerviraj sedež vnaprej.",
    };
  }
  return {
    type: km > 200 ? "train" : "local",
    duration: km > 200 ? "2–3h" : "1h 30m",
    costLabel: km > 200 ? "40–90 €" : "€15–40",
    howTo: "Rezerviraj vnaprej za nižjo ceno.",
  };
}

function resolveRegionHop(
  fromCity: string,
  toCity: string,
  fallback: TripRegion["transportToNext"] | undefined,
  destinationIata?: string,
  accommodation: AccommodationMode = "hotel",
): TripRegion["transportToNext"] | undefined {
  const country = destinationIata
    ? lookupDestination(destinationIata)?.country
    : undefined;
  const curated = lookupCuratedTransportLeg(fromCity, toCity, country);
  if (curated) {
    return {
      type: curated.type,
      duration: curated.duration,
      costLabel: curated.costLabel,
      howTo: curated.howTo,
    };
  }
  if (fallback?.type) return fallback;
  return transportBetweenCities(fromCity, toCity, accommodation, country);
}

function addTransportBetweenRegions(
  regions: TripRegion[],
  accommodation: AccommodationMode = "hotel",
  destinationIata?: string,
): TripRegion[] {
  const country = destinationIata
    ? lookupDestination(destinationIata)?.country
    : undefined;
  return regions.map((r, i) => {
    if (i >= regions.length - 1) return { ...r, transportToNext: undefined };
    const next = regions[i + 1]!;
    const hop = transportBetweenCities(r.city, next.city, accommodation, country);
    const hasCurated = lookupCuratedTransportLeg(r.city, next.city, country) != null;
    if (
      !hasCurated &&
      accommodation === "hotel" &&
      r.transportToNext?.type &&
      interRegionHopKm(r.city, next.city) < 350
    ) {
      return r;
    }
    return { ...r, transportToNext: hop };
  });
}

/** First day of a distant region = full travel day (no teleporting Ottawa→Banff). */
function enforceLongHaulTravelDays(
  regions: TripRegion[],
  accommodation: AccommodationMode = "hotel",
  trace?: (msg: string) => void,
): TripRegion[] {
  const LONG_KM = accommodation === "motorhome" ? 280 : 350;
  const out = regions.map((r) => ({ ...r, highlights: [...(r.highlights ?? [])] }));

  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]!;
    const curr = out[i]!;
    let km = interRegionHopKm(prev.city, curr.city);
    if (km === 0 && prev.city.toLowerCase() !== curr.city.toLowerCase()) {
      km = accommodation === "motorhome" ? 450 : 0;
    }
    if (km < LONG_KM) continue;

    const travelDay = curr.startDay;
    const onTravelDay = curr.highlights.filter((h) => h.day === travelDay);
    const moved = onTravelDay.map((h) => ({
      ...h,
      day: Math.min(curr.endDay, travelDay + 1),
    }));
    const rest = curr.highlights.filter((h) => h.day !== travelDay);

    const hop = transportBetweenCities(prev.city, curr.city, accommodation, undefined);
    prev.transportToNext = hop;

    const travelHighlight: SkeletonHighlight = {
      day: travelDay,
      name: `Prevoz: ${prev.city} → ${curr.city}`,
      visitDuration: "cel dan",
      description:
        accommodation === "motorhome"
          ? motorhomeTravelDayDescription(km, curr.city)
          : km >= 1200
            ? `Celodnevni prevoz — notranji let in transfer do hotela (cca. ${Math.round(km)} km). Brez ogledov; raziskovanje ${curr.city} začneš šele naslednji dan.`
            : `Večji del dneva prevoz (${Math.round(km)} km) — brez večjih ogledov; šele naslednji dan polni program.`,
      priceLabel: hop?.costLabel ?? "100–200 €",
      lat: curr.lat,
      lng: curr.lng,
    };

    curr.highlights = [travelHighlight, ...rest, ...moved];
    trace?.(`travel: day ${travelDay} = ${prev.city}→${curr.city} (${Math.round(km)} km)`);
  }

  return out;
}

/** Replace region structure with blueprint blocks while keeping AI copy/highlights where possible. */
function rebuildRegionsFromBlueprint(
  blueprint: RegionBlueprintBlock[],
  nDays: number,
  departDate: string,
  aiRegions: TripRegion[],
  trace?: (msg: string) => void,
): TripRegion[] {
  const merged: TripRegion[] = [];
  for (const block of blueprint) {
    const blockStart = block.startDay;
    const blockEnd = Math.min(block.endDay, nDays);
    if (blockStart > nDays) continue;

    const aiMatch = aiRegions.find((r) => r.city.toLowerCase() === block.city.toLowerCase());
    const coords = lookupRegionCoords(block.city);
    const span = blockEnd - blockStart + 1;

    merged.push({
      city: block.city,
      startDay: blockStart,
      endDay: blockEnd,
      startDate: isoDateAtOffset(departDate, blockStart - 1),
      endDate: isoDateAtOffset(departDate, blockEnd - 1),
      summary:
        aiMatch?.summary?.trim() ||
        `${block.city} — ${span} ${span === 1 ? "dan" : "dni"} raziskovanja regije.`,
      localTransportTips: aiMatch?.localTransportTips ?? "",
      travelTips: aiMatch?.travelTips ?? "",
      highlights: (aiMatch?.highlights ?? []).filter(
        (h) => h.day >= blockStart && h.day <= blockEnd,
      ),
      lat: aiMatch?.lat && isValidCoord(aiMatch.lat, aiMatch.lng) ? aiMatch.lat : (coords?.lat ?? 0),
      lng: aiMatch?.lng && isValidCoord(aiMatch.lat, aiMatch.lng) ? aiMatch.lng : (coords?.lng ?? 0),
    });
  }
  trace?.(`blueprint rebuild: ${merged.map((r) => r.city).join(" → ")}`);
  return merged;
}

async function postProcessSkeletonRegions(
  skeleton: TripSkeleton,
  nDays: number,
  destinationIata: string,
  trace: (msg: string) => void,
  flights?: TripFlightContext,
): Promise<TripSkeleton> {
  const accommodationMode = skeleton.accommodationMode ?? "hotel";
  let s = skeleton;
  if (flights) {
    s = {
      ...s,
      regions: alignSkeletonRegionsToArrival(s.regions, nDays, s.departDate, flights),
    };
    s = {
      ...s,
      regions: capReturnHubLeisureDays(s.regions, nDays, s.departDate, trace),
    };
  }
  s = await enrichSkeletonRegions(s, destinationIata, trace);
  s = {
    ...s,
    regions: s.regions.map((r) =>
      prepareRegionHighlights(r, destinationIata, nDays, trace, s.departDate),
    ),
  };
  s = {
    ...s,
    regions: enforceLongHaulTravelDays(
      addTransportBetweenRegions(s.regions, accommodationMode, destinationIata),
      accommodationMode,
      trace,
    ),
  };
  s = {
    ...s,
    regions: resolveMarketTravelConflicts(s.regions, s.departDate, trace),
  };
  s = {
    ...s,
    regions: deduplicateTripHighlights(s.regions, trace),
  };
  if (accommodationMode === "motorhome") {
    const locale = resolveTripLocale(
      destinationIata,
      s.destinationName,
      sanitizeLangCode,
      sanitizeDisplayCurrency,
    );
    s = {
      ...s,
      regions: s.regions.map((r) => ({
        ...r,
        localTransportTips: clampSkeletonText(
          sanitizeLegacyTemplateLeak(motorhomeLocalTransportTips(r.city, locale.slo)),
          160,
        ),
      })),
    };
  }
  return s;
}

/** When AI stops early, merge its regions with a destination blueprint. */
function patchSkeletonFromBlueprint(
  aiRegions: TripRegion[],
  nDays: number,
  destinationIata: string,
  departDate: string,
  trace: (msg: string) => void,
  wishes?: string,
  returnFromIata?: string,
): TripRegion[] {
  const blueprint =
    resolveRegionBlueprint(nDays, destinationIata, wishes, undefined, returnFromIata) ??
    buildRegionBlueprintFallback(nDays, destinationIata);
  const sorted = [...aiRegions].sort((a, b) => a.startDay - b.startDay);
  const aiEnd = sorted.at(-1)?.endDay ?? 0;

  if (aiEnd >= nDays) {
    return addTransportBetweenRegions(
      repairSkeletonCoverage(sorted, nDays, departDate, trace),
      "hotel",
      destinationIata,
    );
  }

  trace(`coverage patch: AI ended day ${aiEnd}, applying blueprint (${blueprint.length} blocks)`);

  const merged: TripRegion[] = [];
  for (const r of sorted) {
    if (r.startDay > nDays) break;
    merged.push({
      ...r,
      endDay: Math.min(r.endDay, nDays),
      endDate: isoDateAtOffset(departDate, Math.min(r.endDay, nDays) - 1),
      highlights: r.highlights.filter((h) => h.day <= nDays),
    });
  }

  let startDay = (merged.at(-1)?.endDay ?? 0) + 1;
  if (startDay > nDays) return addTransportBetweenRegions(merged, "hotel", destinationIata);

  for (const block of blueprint) {
    if (startDay > nDays) break;
    if (block.endDay < startDay) continue;

    const blockStart = Math.max(block.startDay, startDay);
    const blockEnd = Math.min(block.endDay, nDays);
    if (blockEnd < blockStart) continue;

    const aiMatch = sorted.find(
      (r) =>
        r.city.toLowerCase() === block.city.toLowerCase() &&
        r.startDay <= blockEnd &&
        r.endDay >= blockStart,
    );
    const coords = lookupRegionCoords(block.city);
    const span = blockEnd - blockStart + 1;

    merged.push({
      city: block.city,
      startDay: blockStart,
      endDay: blockEnd,
      startDate: isoDateAtOffset(departDate, blockStart - 1),
      endDate: isoDateAtOffset(departDate, blockEnd - 1),
      summary:
        aiMatch?.summary.trim() ||
        `${block.city} — ${span} ${span === 1 ? "dan" : span === 2 ? "dni" : span <= 4 ? "dni" : "dni"} raziskovanja regije.`,
      localTransportTips: aiMatch?.localTransportTips ?? "",
      travelTips: aiMatch?.travelTips ?? "",
      highlights:
        aiMatch?.highlights.filter((h) => h.day >= blockStart && h.day <= blockEnd) ?? [],
      lat: aiMatch?.lat && isValidCoord(aiMatch.lat, aiMatch.lng) ? aiMatch.lat : (coords?.lat ?? 0),
      lng: aiMatch?.lng && isValidCoord(aiMatch.lat, aiMatch.lng) ? aiMatch.lng : (coords?.lng ?? 0),
    });
    startDay = blockEnd + 1;
  }

  if (startDay <= nDays && merged.length) {
    const last = merged[merged.length - 1]!;
    merged[merged.length - 1] = {
      ...last,
      endDay: nDays,
      endDate: isoDateAtOffset(departDate, nDays - 1),
    };
    trace(`coverage patch: extended ${last.city} to day ${nDays}`);
  }

  return addTransportBetweenRegions(merged, "hotel", destinationIata);
}

function ensureEveryDayHasHighlight(regions: TripRegion[]): TripRegion[] {
  return regions.map((r) => {
    const highlights = [...r.highlights];

    for (let d = r.startDay; d <= r.endDay; d++) {
      const hasNamed = highlights.some(
        (h) => h.day === d && !isGenericHighlight(h, r),
      );
      if (!hasNamed) {
        highlights.push({
          day: d,
          name: r.city,
          description: clampSkeletonText(`Razišči ${r.city}.`, 100),
          priceLabel: "—",
          lat: r.lat,
          lng: r.lng,
        });
      }
    }

    return { ...r, highlights: highlights.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name)) };
  });
}

function minHighlightsPerDayForPace(paceLabel: string): number {
  if (paceLabel === "intensive") return 3;
  if (paceLabel === "calm") return 2;
  return 3;
}

function minAvgHighlightsPerDayForPace(paceLabel: string): number {
  if (paceLabel === "intensive") return 3;
  if (paceLabel === "calm") return 2;
  return 2.5;
}

function clampSkeletonRegions(regions: TripRegion[]): TripRegion[] {
  return regions.map((r) => ({
    ...r,
    summary: clampSkeletonText(r.summary, 180),
    localTransportTips: clampSkeletonText(r.localTransportTips, 160),
    travelTips: clampSkeletonText(r.travelTips, 120),
    highlights: r.highlights.map((h) => ({
      ...h,
      description: clampSkeletonText(h.description, 320),
    })),
  }));
}

let sanitizeLangCode = "sl";
let sanitizeDisplayCurrency: PlanCurrency = "EUR";

function sanitizeOutdatedText(text: string): string {
  let out = text;
  for (const { pattern, replacement } of CLOSED_AIRPORTS) {
    out = out.replace(pattern, replacement);
  }
  return sanitizeForLang(out, sanitizeLangCode);
}

function clampSkeletonText(text: string, maxLen: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLen) return trimmed;
  const slice = trimmed.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

function isGenericHighlight(h: SkeletonHighlight, region: { city: string }): boolean {
  const name = h.name.trim().toLowerCase();
  const city = region.city.trim().toLowerCase();
  return (
    name === city ||
    name === `${city} — lokalno` ||
    name.includes("raziskovanje")
  );
}

/** Normalized key for cross-day duplicate detection (Wat Arun = wat arun). */
export function highlightIdentity(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fuzzy dedup — Griffith Observatory = Griffith Park Observatory. */
export function highlightDedupKey(name: string): string {
  return highlightFuzzyKey(name) || highlightIdentity(name);
}

function collectTripHighlightKeys(regions: TripRegion[]): Set<string> {
  const keys = new Set<string>();
  for (const region of regions) {
    for (const h of region.highlights ?? []) {
      if (isGenericHighlight(h, region)) continue;
      const key = highlightDedupKey(h.name);
      if (key) keys.add(key);
    }
  }
  return keys;
}

/** Each named sight appears at most once in the whole trip. */
export function deduplicateTripHighlights(
  regions: TripRegion[],
  trace?: (msg: string) => void,
): TripRegion[] {
  const seen = new Map<string, { day: number; city: string }>();

  return regions.map((region) => ({
    ...region,
    highlights: (region.highlights ?? []).filter((h) => {
      if (isGenericHighlight(h, region)) return true;
      const key = highlightDedupKey(h.name);
      if (!key) return true;
      const prev = seen.get(key);
      if (prev) {
        trace?.(
          `dedup: "${h.name}" day ${h.day} skipped (already day ${prev.day} in ${prev.city})`,
        );
        return false;
      }
      seen.set(key, { day: h.day, city: region.city });
      return true;
    }),
  }));
}

function isValidCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function coordNearRegion(
  lat: number,
  lng: number,
  regionLat: number,
  regionLng: number,
  maxKm = 120,
): boolean {
  return haversineKm(lat, lng, regionLat, regionLng) <= maxKm;
}

function nearRegionCenter(
  lat: number,
  lng: number,
  center: { lat: number; lng: number },
  maxKm = 3,
): boolean {
  return haversineKm(lat, lng, center.lat, center.lng) <= maxKm;
}

function inBbox(lng: number, lat: number, bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

async function geocodeMapbox(query: string, token: string): Promise<[number, number] | null> {
  try {
    const q = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?types=place,locality,neighborhood,poi,address&limit=1&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
    const c = data.features?.[0]?.center;
    if (!c || c.length !== 2) return null;
    const [lng, lat] = c;
    return isValidCoord(lat, lng) ? [lng, lat] : null;
  } catch {
    return null;
  }
}

function normalizeActivity(a: unknown): Activity {
  const o = (a ?? {}) as Record<string, unknown>;
  return {
    name: sanitizeOutdatedText(textValue(o.name, textValue(o.type, "Aktivnost"))),
    type: textValue(o.type, "activity"),
    price: textValue(o.price, "Free"),
    priceLabel: textValue(o.priceLabel, textValue(o.price, "")),
    description: sanitizeOutdatedText(textValue(o.description)),
  };
}

function activitiesToMarkdown(activities: Activity[] | undefined) {
  if (!activities?.length) return "";
  return activities
    .map((a) => {
      const badges = [a.type, a.price || a.priceLabel].filter(Boolean).join(" · ");
      return `- **${a.name}**${badges ? ` (${badges})` : ""}${a.description ? `: ${a.description}` : ""}`;
    })
    .join("\n\n");
}

function normalizeDay(dayRaw: unknown, fallbackDay: number, departDate: string): DayPlan {
  const raw = (dayRaw ?? {}) as Record<string, unknown>;
  const slotSource = (raw.activities ?? {}) as Record<string, unknown>;
  const activities = {
    morning: Array.isArray(slotSource.morning) ? slotSource.morning.slice(0, 2).map((a) => normalizeActivity(a)) : [],
    afternoon: Array.isArray(slotSource.afternoon) ? slotSource.afternoon.slice(0, 1).map((a) => normalizeActivity(a)) : [],
    evening: Array.isArray(slotSource.evening) ? slotSource.evening.slice(0, 1).map((a) => normalizeActivity(a)) : [],
  };
  const day = numberValue(raw.day, fallbackDay);
  const allowed: DayCategory[] = ["stay", "eat", "activity", "sight", "transport", "beach", "nature"];
  const category = allowed.includes(raw.category as DayCategory) ? (raw.category as DayCategory) : "activity";
  const city = sanitizeOutdatedText(textValue(raw.city));
  const focusName = sanitizeOutdatedText(textValue(raw.focusName, city));
  const title = sanitizeOutdatedText(textValue(raw.title, `Dan ${day}`));

  return {
    day,
    date: textValue(raw.date, isoDateAtOffset(departDate, day - 1)),
    title,
    morning: activitiesToMarkdown(activities.morning),
    afternoon: activitiesToMarkdown(activities.afternoon),
    evening: activitiesToMarkdown(activities.evening),
    activities,
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.slice(0, 1).map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return {
            name: sanitizeOutdatedText(textValue(o.name, "Predlog")),
            description: sanitizeOutdatedText(textValue(o.description)),
            priceLabel: textValue(o.priceLabel, "moderate"),
          };
        })
      : [],
    transport: undefined,
    travelHack: sanitizeOutdatedText(textValue(raw.travelHack)),
    transportationTips: sanitizeOutdatedText(textValue(raw.transportationTips)),
    localWarnings: sanitizeOutdatedText(textValue(raw.localWarnings)),
    dailyBudgetEur: numberValue(raw.dailyBudgetEur, 0),
    lat: numberValue(raw.lat, 0),
    lng: numberValue(raw.lng, 0),
    focusName: focusName || city || title,
    city: city || focusName,
    category,
  };
}

async function enrichCoordinates(
  plan: AiTripPlan,
  destinationIata: string,
  trace: (msg: string) => void,
): Promise<AiTripPlan> {
  const token = process.env.MAPBOX_PUBLIC_TOKEN;
  const anchor = CITY_ANCHORS[destinationIata.toUpperCase()];
  const cache = new Map<string, [number, number]>();

  for (const day of plan.days) {
    if (isValidCoord(day.lat, day.lng)) continue;

    const knownCity = lookupRegionCoords(day.city);
    const queries = [
      day.focusName && day.city ? `${day.focusName}, ${day.city}` : "",
      day.focusName && plan.destinationName ? `${day.focusName}, ${plan.destinationName}` : "",
      day.city && plan.destinationName ? `${day.city}, ${plan.destinationName}` : "",
      day.city,
    ].filter(Boolean);

    let resolved: [number, number] | null = null;
    for (const query of queries) {
      if (cache.has(query)) {
        resolved = cache.get(query)!;
        break;
      }
      if (token) {
        const hit = await geocodeMapbox(query, token);
        if (hit) {
          cache.set(query, hit);
          resolved = hit;
          break;
        }
      }
    }

    if (!resolved && knownCity) resolved = [knownCity.lng, knownCity.lat];
    if (!resolved && anchor) resolved = [anchor.lng, anchor.lat];

    if (resolved) {
      day.lng = Math.round(resolved[0] * 10000) / 10000;
      day.lat = Math.round(resolved[1] * 10000) / 10000;
      trace(`geocoded day ${day.day} "${day.focusName}" → [${day.lat}, ${day.lng}]`);
    }
  }

  if (anchor) {
    plan.centerLat = anchor.lat;
    plan.centerLng = anchor.lng;
  } else if (plan.days[0]) {
    plan.centerLat = plan.days[0].lat;
    plan.centerLng = plan.days[0].lng;
  }

  return plan;
}

function parseJson<T>(raw: string): T | null {
  const cleaned = raw.trim().replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    if (start === -1) return null;
    const end = cleaned.lastIndexOf("}");
    if (end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

export const generateAiPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<GenerateAiPlanResult> => {
    const IS_DEV = process.env.NODE_ENV !== "production";
    const debugTrace: string[] = [];
    const trace = (msg: string) => {
      console.log(`[AiPlan] ${msg}`);
      if (IS_DEV) debugTrace.push(msg);
    };
    const withDebug = (result: GenerateAiPlanResult): GenerateAiPlanResult =>
      IS_DEV && debugTrace.length ? { ...result, debug: [...debugTrace] } : result;

    if (!process.env.GEMINI_API_KEY) {
      return withDebug({ plan: null, error: "GEMINI_API_KEY ni nastavljen" });
    }

    const nDays = daysBetween(data.departDate, data.returnDate || undefined);
    const langCode = normalizePlanLangCode(data.language);
    const displayCurrency = normalizePlanCurrency(data.currency);
    sanitizeDisplayCurrency = displayCurrency;
    const lang = LANG_MAP[langCode] ?? langCode;
    const isStays = data.mode === "stays";
    const paceLabel =
      data.pace === "intensive" ? "intensive" : data.pace === "calm" ? "calm" : "relaxed";
    const regionBlueprint = resolveRegionBlueprint(
      nDays,
      data.destinationIata,
      data.wishes,
      data.priorities,
      data.returnFromIata,
    );
    const destHub = lookupDestination(data.destinationIata);
    const { tripClimate, regionClimate } = buildTripClimate({
      destinationIata: data.destinationIata,
      departDate: data.departDate,
      returnDate: data.returnDate || undefined,
      lang: langCode,
      priorities: data.priorities,
      wishes: data.wishes,
      regionCities: regionBlueprint?.map((b) => b.city),
    });
    const { tripHints: tripAstronomy } = buildTripAstronomy({
      departDate: data.departDate,
      returnDate: data.returnDate || undefined,
      lang: langCode,
      lat: destHub?.lat,
      lng: destHub?.lng,
      regionCities: regionBlueprint?.map((b) => b.city),
    });

    const mid = Math.ceil(nDays / 2);
    const batchCount =
      nDays <= BATCH_THRESHOLD_DAYS ? 1 : 2;

    trace(
      `start ${data.originIata}→${data.destinationIata}, ${nDays} days ` +
        `(${batchCount} LLM batch${batchCount > 1 ? "es" : ""})`,
    );

    const makeBatches = () =>
      nDays <= BATCH_THRESHOLD_DAYS
        ? [{ start: 1, end: nDays, handoff: undefined as BatchHandoff | undefined }]
        : [
            { start: 1, end: mid, handoff: undefined as BatchHandoff | undefined },
            { start: mid + 1, end: nDays, handoff: undefined as BatchHandoff | undefined },
          ];

    const ROUTING_BLOCK_RULES = new Set(["duplicate_destination_segment", "non_linear_route"]);

    const buildRoutingRepair = (
      violations: { rule: string; message: string }[],
      startDay = 1,
      endDay = nDays,
    ): RoutingRepairPayload => ({
      violations: violations.map((v) => v.message),
      regenerateDays: { start: startDay, end: endDay },
    });

    const buildHandoff = (
      days: DayPlan[],
      planMeta: Omit<AiTripPlan, "days">,
      nextStartDay: number,
    ): BatchHandoff => {
      const visitedCities: string[] = [];
      let lastCityName = "";
      for (const d of days) {
        if (d.city && d.city.toLowerCase() !== lastCityName.toLowerCase()) {
          visitedCities.push(d.city);
          lastCityName = d.city;
        }
      }
      const lastDay = days[days.length - 1];
      const spentSoFar = days.reduce((sum, d) => sum + (d.dailyBudgetEur || 0), 0);
      return {
        visitedCities,
        lastCity: lastDay.city,
        lastFocusName: lastDay.focusName,
        remainingBudgetEur: Math.max(0, numberValue(planMeta.totalBudgetEur, 0) - spentSoFar),
      };
    };

    const violationsOnlySecondBatch = (
      violations: { dayNumbers: number[] }[],
      splitDay: number,
    ) =>
      violations.length > 0 &&
      violations.every((v) => v.dayNumbers.every((d) => d > splitDay));

    try {
      const { validateItinerary } = await import("./planValidation");
      let lastBlocking: { rule: string; message: string; dayNumbers: number[] }[] = [];
      let savedFirstBatch: {
        meta: Omit<AiTripPlan, "days">;
        days: DayPlan[];
      } | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        const batches = makeBatches();
        const retrySecondBatchOnly: boolean =
          attempt > 0 &&
          savedFirstBatch !== null &&
          batchCount > 1 &&
          violationsOnlySecondBatch(lastBlocking, mid);

        if (attempt > 0) {
          trace(
            retrySecondBatchOnly
              ? `retrying batch ${mid + 1}-${nDays} only (keeping days 1-${mid})`
              : "retrying with routing repair instructions",
          );
        }

        let meta: Omit<AiTripPlan, "days"> | null = retrySecondBatchOnly
          ? savedFirstBatch!.meta
          : null;
        const allDays: DayPlan[] = retrySecondBatchOnly ? [...savedFirstBatch!.days] : [];
        const routingRepair =
          attempt > 0
            ? buildRoutingRepair(
                lastBlocking,
                retrySecondBatchOnly ? mid + 1 : 1,
                nDays,
              )
            : undefined;

        if (retrySecondBatchOnly) {
          batches[1].handoff = buildHandoff(allDays, meta!, mid + 1);
        }

        const startBatchIdx: number = retrySecondBatchOnly ? 1 : 0;

        for (let i = startBatchIdx; i < batches.length; i++) {
          const batch = batches[i]!;
          const userMessage = buildTripUserMessage({
            originIata: data.originIata,
            destinationIata: data.destinationIata,
            departDate: data.departDate,
            returnDate: data.returnDate || undefined,
            nDays,
            startDay: batch.start,
            endDay: batch.end,
            pax: data.pax,
            langCode,
            displayCurrency,
            paceLabel,
            isStays,
            wishes: data.wishes,
            priorities: data.priorities,
            customPrompt: data.customPrompt,
            handoff: batch.handoff,
            routingRepair:
              routingRepair && (retrySecondBatchOnly ? i === 1 : i === 0)
                ? routingRepair
                : undefined,
            flightContext: data.flightContext,
            tripClimate,
            regionClimate,
            tripAstronomy,
          });

          const parsed = await geminiGenerateJson<Partial<AiTripPlan>>({
            role: "full_plan",
            system: FULL_PLAN_SYSTEM,
            user: userMessage,
            trace: (msg) => trace(`batch ${batch.start}-${batch.end}: ${msg}`),
            label: `full plan days ${batch.start}-${batch.end}`,
            maxTokens: 16_000,
            timeoutMs: 300_000,
          });

          if (!parsed) {
            return withDebug({ plan: null, error: "AI predolgo odgovarja, poskusi znova." });
          }
          if (!parsed?.days?.length) {
            trace(`batch ${batch.start}-${batch.end}: parse failed — not valid JSON`);
            return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
          }

          if (!meta) {
            meta = {
              destinationName: sanitizeOutdatedText(textValue(parsed.destinationName, data.destinationIata)),
              summary: sanitizeOutdatedText(textValue(parsed.summary, "")),
              totalBudgetEur: numberValue(parsed.totalBudgetEur, 300),
              centerLat: numberValue(parsed.centerLat, 0),
              centerLng: numberValue(parsed.centerLng, 0),
            };
          }

          const batchDays = parsed.days
            .map((d, idx) => normalizeDay(d, batch.start + idx, data.departDate))
            .filter((d) => d.day >= batch.start && d.day <= batch.end);

          allDays.push(...batchDays);
          trace(`batch ${batch.start}-${batch.end}: ${batchDays.length} days parsed`);

          if (i + 1 < batches.length && batchDays.length && meta) {
            batches[i + 1].handoff = buildHandoff(allDays, meta, batches[i + 1].start);
          }

          if (i === 0 && batches.length > 1 && batchDays.length >= mid && meta) {
            savedFirstBatch = { meta: { ...meta }, days: [...batchDays] };
          }
        }

        const normalizedDays = allDays
          .sort((a, b) => a.day - b.day)
          .filter((d, i, arr) => i === arr.findIndex((x) => x.day === d.day))
          .slice(0, nDays);

        if (normalizedDays.length < nDays) {
          trace(`incomplete: got ${normalizedDays.length}/${nDays} days`);
          return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
        }

        const accommodationMode = detectAccommodationMode(data.wishes, data.customPrompt);
        const hotelRestEveryNDays =
          accommodationMode === "motorhome"
            ? detectHotelRestInterval(data.wishes, data.customPrompt) ?? undefined
            : undefined;

        let plan: AiTripPlan = {
          destinationName: meta!.destinationName,
          summary: meta!.summary,
          totalBudgetEur: meta!.totalBudgetEur,
          centerLat: meta!.centerLat,
          centerLng: meta!.centerLng,
          days: normalizedDays,
          originIata: data.originIata,
          destinationIata: data.destinationIata,
          accommodationMode,
          hotelRestEveryNDays,
        };

        plan = await enrichCoordinates(plan, data.destinationIata, trace);

        const violations = validateItinerary(plan);
        const blocking = violations.filter((v) => ROUTING_BLOCK_RULES.has(v.rule));

        if (blocking.length === 0) {
          if (violations.length) console.warn("AI plan soft warnings:", violations);
          trace(`complete: ${plan.days.length} days via LLM (attempt ${attempt + 1})`);
          return withDebug({ plan, error: null, violations: violations.length ? violations : undefined });
        }

        lastBlocking = blocking;
        trace(`routing blocked attempt ${attempt + 1}: ${blocking.map((b) => b.message).join("; ")}`);
        if (attempt === 1) {
          return withDebug({
            plan: null,
            error: "error.invalidItinerary",
            errorCode: "INVALID_ITINERARY",
            violations,
          });
        }
      }

      return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
    } catch (err) {
      trace(`fatal: ${err instanceof Error ? err.message : String(err)}`);
      console.error("AI plan failed:", err);
      return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
    }
  });

function extractHighlightsFromRaw(
  raw: Record<string, unknown>,
  regionCtx: { startDay: number; endDay: number; city: string },
): Partial<SkeletonHighlight>[] {
  const direct = raw.highlights ?? raw.attractions ?? raw.thingsToDo ?? raw.sights ?? raw.activities;
  if (Array.isArray(direct) && direct.length > 0) return direct as Partial<SkeletonHighlight>[];

  if (Array.isArray(raw.days)) {
    return (raw.days as Record<string, unknown>[]).flatMap((d) => {
      const day = numberValue(d.day ?? d.startDay, 0);
      const items = d.highlights ?? d.attractions ?? d.activities;
      if (!Array.isArray(items)) return [];
      return items.map((item) => {
        const o = (item ?? {}) as Record<string, unknown>;
        return {
          ...(o as Partial<SkeletonHighlight>),
          day: numberValue(o.day, day),
        };
      });
    });
  }

  // Single summary string — split sentences into one highlight per day as fallback
  const summary = textValue(raw.summary);
  if (summary && regionCtx.endDay >= regionCtx.startDay) {
    const sentences = summary.split(/(?<=[.!?])\s+/).filter((s) => s.length > 12);
    const out: Partial<SkeletonHighlight>[] = [];
    for (let d = regionCtx.startDay; d <= regionCtx.endDay; d++) {
      const idx = d - regionCtx.startDay;
      const sentence = sentences[idx] ?? sentences[sentences.length - 1];
      if (!sentence) continue;
      out.push({
        day: d,
        name: `${regionCtx.city} — dan ${d - regionCtx.startDay + 1}`,
        description: sentence,
        priceLabel: "—",
      });
    }
    return out;
  }

  return [];
}

function normalizeSkeletonHighlight(
  raw: Partial<SkeletonHighlight>,
  region: { startDay: number; endDay: number; city: string },
): SkeletonHighlight | null {
  const rec = raw as Record<string, unknown>;
  const day = numberValue(raw.day, 0);
  const name = sanitizeOutdatedText(textValue(raw.name, textValue(rec.title)));
  if (!name || isAiPlaceholderText(name) || day < region.startDay || day > region.endDay) return null;
  const visitDuration = textValue(
    raw.visitDuration,
    textValue(rec.duration, textValue(rec.visitTime)),
  );

  return {
    day,
    name,
    description: clampSkeletonText(
      sanitizeOutdatedText(textValue(raw.description, name)),
      320,
    ),
    priceLabel: textValue(raw.priceLabel, textValue(rec.price, "—")),
    lat: numberValue(raw.lat, 0),
    lng: numberValue(raw.lng, 0),
    visitDuration: visitDuration || undefined,
  };
}

function inferHighlightType(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (
    /^prevoz:/i.test(name.trim()) ||
    (/→|->/.test(text) && /\b(vlak|train|let|flight|avtobus|bus|ferry|plane|notranji)\b/.test(text))
  ) {
    return "TRANSPORT";
  }
  if (/restaurant|street food|dinner|lunch|bar|cafe|kulinar|hrana|restavracij|night market|sky bar|rooftop|khaosan|večerja/.test(text)) {
    return "EAT";
  }
  if (
    /temple|palace|museum|observatory|observator|wat |pagoda|monument|sight|castle|church|gallery|getty|sign|bridge|palača|muzej|tempelj|znamenit|grand palace|farmers market|tržnica/.test(
      text,
    )
  ) {
    return "SIGHT";
  }
  if (/market|tržnica/.test(text) && !/night|nočn/.test(text)) {
    return "EAT";
  }
  if (/beach|island|snorkel|dive|boat|kayak|trek|hike|adventure|national park|vodni|otok|plaž|pier|park/.test(text)) {
    return "ACTIVITY";
  }
  if (/hotel|airport|letališč|transfer|arrival|prihod|check.?in/.test(text)) {
    return "TRANSPORT";
  }
  return "SIGHT";
}

function highlightPreferredSlot(h: SkeletonHighlight): "morning" | "afternoon" | "evening" {
  const type = inferHighlightType(h.name, h.description);
  const text = `${h.name} ${h.description} ${h.visitDuration ?? ""}`.toLowerCase();

  if (isHillTempleExcursion(h.name, h.description)) return "morning";
  if (isEveningOnlyPoi(h.name, h.description)) return "evening";
  if (isNightlifeOnlyPoi(h.name, h.description)) return "evening";
  if (isSunsetOnlyPoi(h.name, h.description)) return "evening";
  if (isRegionalTravelHighlight(h)) return "morning";
  if (isEarlyClosingPoi(h.name, h.description)) return "morning";
  if (isSunsetTemplePoi(h.name, h.description)) return "evening";
  if (isMorningOnlyPoi(h.name, h.description)) return "morning";
  if (type === "EAT" && /night|večer|dinner|večerja|street food/.test(text)) return "evening";
  if (/sunset|sončni zahod|ob mraku|at dusk/.test(text)) return "evening";
  if (
    /najboljši čas za obisk je popoldne|najboljši čas[^.]{0,50}popold(?:an|ne)|best time[^.]{0,50}afternoon|ideal[^.]{0,30}afternoon|primeren za popoldan/i.test(
      text,
    )
  ) {
    return "afternoon";
  }
  if (
    /najboljši čas za obisk je (?:zjutraj|dopoldne)|idealen za jutranji|najboljši čas[^.]{0,50}zjutraj|best[^.]{0,30}morning|zgodaj zjutraj|early morning|jutranji obisk/i.test(
      text,
    )
  ) {
    return "morning";
  }
  if (/gateway arch|observation deck|skydeck|360 chicago/i.test(text) && !/sunset|večer|evening/i.test(text)) {
    return "afternoon";
  }
  if (/zgodaj zjutraj|early morning|zjutraj|dopoldan|morning/.test(text)) return "morning";
  if (/popoldan|popoldne|afternoon|kosilo|lunch/.test(text)) return "afternoon";
  if (/pol dneva|cel dan|half day|full day/.test(text)) return "morning";
  if (type === "EAT" || /market|tržnica|farmers/.test(text)) return "afternoon";
  if (/beach|plaž|pier|park|ride|drive/.test(text)) return "afternoon";
  if (type === "SIGHT") return "morning";
  return "morning";
}

function highlightToActivity(h: SkeletonHighlight, langCode = "sl"): Activity {
  const rawPrice = h.priceLabel && h.priceLabel !== "—" ? h.priceLabel : undefined;
  const act: Activity = {
    name: h.name,
    description: h.description,
    priceLabel: fixPoiPriceLabel(h.name, rawPrice, langCode),
    type: inferHighlightType(h.name, h.description),
  };
  return sanitizeActivity(act, langCode);
}

function activityForSlot(
  act: Activity,
  slot: "morning" | "afternoon" | "evening",
): Activity {
  const name = fixPoiNameForSlot(act.name, slot);
  return {
    ...act,
    name,
    description: fixSlotTimeMismatch(act.description, slot, name),
  };
}

/** Spread highlights across dopoldan / popoldan / večer by type and visit time. */
export function distributeHighlightsToSlots(
  highlights: SkeletonHighlight[],
  langCode = "sl",
): {
  morning: Activity[];
  afternoon: Activity[];
  evening: Activity[];
} {
  const morning: Activity[] = [];
  const afternoon: Activity[] = [];
  const evening: Activity[] = [];
  if (highlights.length === 0) return { morning, afternoon, evening };

  const ordered = orderHighlightsByProximity(highlights);
  const buckets = [morning, afternoon, evening];

  for (let i = 0; i < ordered.length; i++) {
    const h = ordered[i]!;
    const act = highlightToActivity(h, langCode);
    const preferred = highlightPreferredSlot(h);

    if (isMorningOnlyPoi(h.name, h.description)) {
      morning.push(activityForSlot(act, "morning"));
      continue;
    }

    if (isHillTempleExcursion(h.name, h.description)) {
      morning.push(activityForSlot(act, "morning"));
      continue;
    }

    if (isSunsetTemplePoi(h.name, h.description)) {
      evening.push(activityForSlot(act, "evening"));
      continue;
    }

    if (isNightlifeOnlyPoi(h.name, h.description)) {
      evening.push(activityForSlot(act, "evening"));
      continue;
    }

    if (isEveningOnlyPoi(h.name, h.description)) {
      evening.push(activityForSlot(act, "evening"));
      continue;
    }

    const order =
      preferred === "evening"
        ? [evening, afternoon, morning]
        : preferred === "afternoon"
          ? [afternoon, morning, evening]
          : [morning, afternoon, evening];

    let bucket = order.find((b) => {
      if (b === evening && b.length >= 1 && (act.type === "SIGHT" || act.type === "ACTIVITY")) {
        return false;
      }
      if (
        b === morning &&
        isHillTempleExcursion(h.name, h.description) &&
        morning.filter((a) => a.type === "SIGHT").length >= 1
      ) {
        return false;
      }
      if (
        b === morning &&
        morning.some((a) => isHillTempleExcursion(a.name, a.description)) &&
        act.type === "SIGHT"
      ) {
        return false;
      }
      return b.length < 2;
    });
    if (!bucket) bucket = preferred === "evening" ? afternoon : morning;
    const slot: "morning" | "afternoon" | "evening" =
      bucket === evening ? "evening" : bucket === afternoon ? "afternoon" : "morning";
    bucket.push(activityForSlot(act, slot));
  }

  for (let i = evening.length - 1; i >= 0; i--) {
    const a = evening[i]!;
    if (isMorningOnlyPoi(a.name, a.description)) {
      evening.splice(i, 1);
      morning.push(activityForSlot(a, "morning"));
    }
  }

  for (const list of [morning, afternoon]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i]!;
      if (isNightlifeOnlyPoi(a.name, a.description) || isEveningOnlyPoi(a.name, a.description)) {
        list.splice(i, 1);
        if (evening.length < 2) {
          evening.push(activityForSlot(a, "evening"));
        }
      }
    }
  }

  return reconcileActivitySlots({ morning, afternoon, evening });
}

type ActivitySlots = { morning: Activity[]; afternoon: Activity[]; evening: Activity[] };

function isTransportActivity(a: Activity): boolean {
  const t = `${a.name} ${a.description ?? ""}`.toLowerCase();
  return (
    a.type === "TRANSPORT" ||
    /^prevoz:/i.test(a.name.trim()) ||
    (/→|->/.test(t) && /\b(vlak|train|let|flight|avtobus|bus|ferry|plane)\b/.test(t))
  );
}

/** Keep travel blocks separate from sights; sunset viewpoints belong in the evening. */
function stripWrongCityActivities(slots: ActivitySlots, city: string): ActivitySlots {
  const keep = (list: Activity[]) =>
    list.filter((a) => !isWrongCityPoi(a.name, a.description ?? "", city));
  return {
    morning: keep(slots.morning),
    afternoon: keep(slots.afternoon),
    evening: keep(slots.evening),
  };
}

const RECONCILE_SLOTS_MAX_DEPTH = 4;

function reconcileActivitySlots(
  slots: ActivitySlots,
  opts?: { inboundTravelDay?: boolean; travelOutDay?: boolean; city?: string },
  depth = 0,
): ActivitySlots {
  if (depth > RECONCILE_SLOTS_MAX_DEPTH) {
    console.warn(
      `[reconcileActivitySlots] max depth ${RECONCILE_SLOTS_MAX_DEPTH} — returning slots as-is`,
    );
    return opts?.city ? stripWrongCityActivities(slots, opts.city) : slots;
  }
  const morning = [...slots.morning];
  const afternoon = [...slots.afternoon];
  const evening = [...slots.evening];

  const moveToEvening: Activity[] = [];
  const moveToMorning: Activity[] = [];
  for (const list of [morning, afternoon]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i]!;
      if (
        isSunsetOnlyPoi(a.name, a.description) ||
        isSunsetTemplePoi(a.name, a.description) ||
        isNightlifeOnlyPoi(a.name, a.description) ||
        isEveningOnlyPoi(a.name, a.description)
      ) {
        list.splice(i, 1);
        moveToEvening.push(
          activityForSlot(a, "evening"),
        );
      }
    }
  }
  for (let i = evening.length - 1; i >= 0; i--) {
    const a = evening[i]!;
    if (isMorningOnlyPoi(a.name, a.description)) {
      evening.splice(i, 1);
      moveToMorning.push(activityForSlot(a, "morning"));
    }
  }
  for (const a of moveToEvening) {
    if (evening.length < 2) evening.push(a);
    else if (afternoon.length < 2) afternoon.push(a);
  }
  for (const a of moveToMorning) {
    if (morning.length < 3) morning.push(a);
  }

  for (let i = afternoon.length - 1; i >= 0; i--) {
    const a = afternoon[i]!;
    if (isSunsetTemplePoi(a.name, a.description)) {
      afternoon.splice(i, 1);
      if (evening.length < 2) {
        evening.push(activityForSlot(a, "evening"));
      }
    } else if (isEarlyClosingPoi(a.name, a.description)) {
      afternoon.splice(i, 1);
      if (morning.length < 2) {
        morning.push(activityForSlot(a, "morning"));
      }
    } else if (isHillTempleExcursion(a.name, a.description)) {
      afternoon.splice(i, 1);
      const morningBusy = morning.some((m) =>
        /emerald pool|hot spring|klong thom/i.test(`${m.name} ${m.description}`),
      );
      if (!morningBusy && morning.length < 2) {
        morning.push(activityForSlot(a, "morning"));
      }
    }
  }

  if (opts?.inboundTravelDay) {
    const travelMorning = morning.filter(isTransportActivity);
    const travelOther = [...afternoon, ...evening].filter(isTransportActivity);
    const sightsMorning = morning.filter((a) => !isTransportActivity(a));
    const sightsAfternoon = afternoon.filter((a) => !isTransportActivity(a));
    const sightsEvening = evening.filter((a) => !isTransportActivity(a));

    return {
      morning: travelMorning.length ? travelMorning : travelOther.slice(0, 1),
      afternoon: [...sightsMorning, ...sightsAfternoon].slice(0, 2),
      evening: sightsEvening.slice(0, 2),
    };
  }

  const travelMorning = morning.filter(isArrivalLogisticsActivity);
  const sightsMorning = morning.filter((a) => !isArrivalLogisticsActivity(a));
  if (travelMorning.length > 0 && sightsMorning.length > 0) {
    return reconcileActivitySlots(
      {
        morning: travelMorning,
        afternoon: [...sightsMorning, ...afternoon].slice(0, 3),
        evening,
      },
      opts,
      depth + 1,
    );
  }

  const out = { morning, afternoon, evening };
  return opts?.city ? stripWrongCityActivities(out, opts.city) : out;
}

function skeletonDayTitle(
  region: TripRegion,
  dayNum: number,
  highlights: SkeletonHighlight[],
  activities?: { morning: Activity[]; afternoon: Activity[]; evening: Activity[] },
  opts?: { departureOnly?: boolean },
): string {
  if (opts?.departureOnly) return `Odhod z letališča (${region.city})`;
  if (dayNum === region.startDay) return `Prihod v ${region.city}`;
  const anchor =
    highlights[0]?.name ??
    activities?.morning[0]?.name ??
    activities?.afternoon[0]?.name ??
    activities?.evening[0]?.name;
  if (anchor && highlights.length <= 1) return anchor;
  if (anchor) return `${region.city}: ${anchor}`;
  const dayInRegion = dayNum - region.startDay + 1;
  return `Raziskovanje ${region.city} (dan ${dayInRegion})`;
}

function slotIsEmpty(activities?: {
  morning: Activity[];
  afternoon: Activity[];
  evening: Activity[];
}): boolean {
  if (!activities) return true;
  return (
    activities.morning.length + activities.afternoon.length + activities.evening.length === 0
  );
}

/** Last resort — never ship a day card with zero slot content. */
function padEmptyDayActivities(
  activities: { morning: Activity[]; afternoon: Activity[]; evening: Activity[] } | undefined,
  region: TripRegion,
  dayNum: number,
  langCode: string,
  opts?: { travelOutDay?: boolean; inboundTravelDay?: boolean },
): { morning: Activity[]; afternoon: Activity[]; evening: Activity[] } {
  if (activities && !slotIsEmpty(activities)) return activities;

  const slo = langCode === "sl" || langCode.startsWith("sl");
  const dayInRegion = dayNum - region.startDay + 1;
  const catalog = injectVietnamCuratedHighlights(
    [{ city: region.city, startDay: region.startDay, endDay: region.endDay, highlights: [] }],
    langCode,
  )[0]?.highlights ?? [];

  const curated = catalog.find((h) => h.day === dayNum) ?? catalog[(dayInRegion - 1) % Math.max(1, catalog.length)];

  if (curated) {
    const act = highlightToActivity(curated as SkeletonHighlight, langCode);
    if (opts?.inboundTravelDay) {
      return { morning: [], afternoon: [act], evening: [] };
    }
    if (opts?.travelOutDay) {
      return { morning: [act], afternoon: [], evening: [] };
    }
    return { morning: [act], afternoon: [], evening: [] };
  }

  const fallback: Activity = {
    name: region.city,
    type: "SIGHT",
    description: slo
      ? `Razišči ${region.city} — lokalna kavarna, tržnica ali sprehod po okolici.`
      : `Explore ${region.city} — café, market, or neighbourhood stroll.`,
    priceLabel: slo ? "brezplačno" : "free",
  };
  return { morning: [fallback], afternoon: [], evening: [] };
}

function stripDepartureEveningSlot(
  activities: { morning: Activity[]; afternoon: Activity[]; evening: Activity[] },
  flights?: TripFlightContext,
): { morning: Activity[]; afternoon: Activity[]; evening: Activity[] } {
  if (!flights?.inboundDepart) return activities;
  if (
    isEveningDeparture(flights) ||
    isTightDeparture(flights) ||
    isAfternoonDeparture(flights) ||
    isEarlyDeparture(flights)
  ) {
    return { ...activities, evening: [] };
  }
  return activities;
}

function dayCategoryFromHighlights(highlights: SkeletonHighlight[]): DayCategory {
  const primary = highlights[0];
  if (!primary) return "sight";
  const type = inferHighlightType(primary.name, primary.description);
  if (type === "EAT") return "eat";
  if (type === "SIGHT") return "sight";
  if (type === "TRANSPORT") return "transport";
  return "activity";
}

export type BuildSkeletonDayPlansOpts = {
  flights?: TripFlightContext;
  lang?: string;
  originIata?: string;
  destinationIata?: string;
  returnFromIata?: string;
  destinationName?: string;
  pax?: number;
  paceLabel?: string;
};

function prependOriginDepartureActivities(
  activities: { morning: Activity[]; afternoon: Activity[]; evening: Activity[] },
  originIata: string | undefined,
  flights: TripFlightContext | undefined,
  langCode: string,
): { morning: Activity[]; afternoon: Activity[]; evening: Activity[] } {
  if (!originIata || !flights?.outboundDepart) return activities;
  const originActs = buildOriginDepartureLogistics(originIata, flights, langCode).map(
    logisticsToActivity,
  );
  return {
    ...activities,
    morning: [...originActs, ...activities.morning].slice(0, 4),
  };
}

function day1OriginTravelHack(
  day: number,
  originIata: string | undefined,
  flights: TripFlightContext | undefined,
  langCode: string,
): string {
  if (day !== 1 || !originIata || !flights?.outboundDepart) return "";
  return buildOriginDepartureHint(originIata, flights, langCode);
}

function tripHasPhiPhiExcursion(skeleton: TripSkeleton): boolean {
  for (const region of skeleton.regions) {
    for (const h of region.highlights ?? []) {
      if (isFullDayExcursion(h) && /phi phi|maya bay/i.test(`${h.name} ${h.description}`)) {
        return true;
      }
    }
  }
  return false;
}

function logisticsToActivity(a: LogisticsActivity): Activity {
  return {
    name: a.name,
    type: a.type,
    description: a.description,
    priceLabel: a.priceLabel,
  };
}

function isArrivalLogisticsActivity(a: Activity): boolean {
  const t = `${a.name} ${a.description ?? ""}`.toLowerCase();
  return (
    isTransportActivity(a) ||
    a.type === "STAY" ||
    /check-in|prihod na letališče|airport arrival|osvežitev|počit|refresh|short rest/i.test(t)
  );
}

function isHeavyArrivalSight(a: Activity): boolean {
  const t = `${a.name} ${a.description ?? ""}`.toLowerCase();
  return (
    (a.type === "SIGHT" || a.type === "ACTIVITY") &&
    /museum|muzej|remnants|palace|citadel|trdnjava|war |znamenit|temple|tempelj/i.test(t)
  );
}

function isHeavySkeletonHighlight(h: SkeletonHighlight): boolean {
  const t = `${h.name} ${h.description}`.toLowerCase();
  return /museum|muzej|remnants|palace|citadel|trdnjava|war |temple|tempelj|znamenit/i.test(t);
}

function mergeDay1Activities(
  slots: { morning: Activity[]; afternoon: Activity[]; evening: Activity[] },
  logistics: LogisticsActivity[],
  flights: TripFlightContext | undefined,
): { morning: Activity[]; afternoon: Activity[]; evening: Activity[] } {
  const logisticsActs = logistics.map(logisticsToActivity);
  const sights = [...slots.morning, ...slots.afternoon, ...slots.evening].filter(
    (a) => !isHeavyArrivalSight(a),
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
    return { morning: [], afternoon: [], evening: logisticsActs };
  }
  if (slot === "afternoon") {
    return {
      morning: [],
      afternoon: logisticsActs,
      evening: [],
    };
  }
  return {
    morning: logisticsActs,
    afternoon: sights.slice(0, 1),
    evening: sights.slice(1, 2),
  };
}

function mergeLastDayActivities(
  slots: { morning: Activity[]; afternoon: Activity[]; evening: Activity[] },
  logistics: LogisticsActivity[],
  flights: TripFlightContext,
): { morning: Activity[]; afternoon: Activity[]; evening: Activity[] } {
  const logisticsActs = logistics.map(logisticsToActivity);

  if (isTightDeparture(flights) || isEarlyDeparture(flights) || isAfternoonDeparture(flights)) {
    return {
      morning: logisticsActs,
      afternoon: [],
      evening: [],
    };
  }

  const sights = [...slots.morning, ...slots.afternoon, ...slots.evening];
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
    afternoon: [...logisticsActs, ...sights.slice(1, 2)],
    evening: sights.slice(2, 3),
  };
}

/** Shift region days when inbound lands day 2+ — days 1..offset-1 stay in-flight only. */
function alignSkeletonRegionsToArrival(
  regions: TripRegion[],
  nDays: number,
  departDate: string,
  flights?: TripFlightContext,
): TripRegion[] {
  const arrival = arrivalTripDay(flights);
  if (!flights || arrival <= 1) return regions;

  const sorted = [...regions].sort((a, b) => a.startDay - b.startDay);
  const first = sorted[0];
  if (!first || first.startDay >= arrival) return regions;

  const shift = arrival - first.startDay;
  let shifted = sorted.map((r) => ({
    ...r,
    startDay: r.startDay + shift,
    endDay: r.endDay + shift,
    startDate: isoDateAtOffset(departDate, r.startDay + shift - 1),
    endDate: isoDateAtOffset(departDate, r.endDay + shift - 1),
    highlights: (r.highlights ?? []).map((h) => ({ ...h, day: h.day + shift })),
  }));

  let overflow = shifted.reduce((max, r) => Math.max(max, r.endDay), 0) - nDays;
  while (overflow > 0) {
    const islandIdx = shifted.findIndex(
      (r, i) =>
        i > 0 &&
        i < shifted.length - 1 &&
        r.endDay - r.startDay + 1 > 3 &&
        /el nido|boracay|bohol|palawan|phuket|lipe|krabi|samui|gili/i.test(r.city),
    );
    if (islandIdx >= 0) {
      shifted[islandIdx]!.endDay -= 1;
      for (let j = islandIdx + 1; j < shifted.length; j++) {
        const r = shifted[j]!;
        r.startDay -= 1;
        r.endDay -= 1;
        r.startDate = isoDateAtOffset(departDate, r.startDay - 1);
        r.endDate = isoDateAtOffset(departDate, r.endDay - 1);
        r.highlights = r.highlights
          .map((h) => ({ ...h, day: h.day - 1 }))
          .filter((h) => h.day >= r.startDay && h.day <= r.endDay);
      }
      overflow -= 1;
      continue;
    }
    const last = shifted[shifted.length - 1]!;
    if (last.endDay - last.startDay + 1 > 3 && /manila|bangkok/i.test(last.city)) {
      last.startDay += 1;
      last.startDate = isoDateAtOffset(departDate, last.startDay - 1);
      last.highlights = last.highlights.filter((h) => h.day >= last.startDay);
      overflow -= 1;
      continue;
    }
    break;
  }

  return shifted.map((r) => ({
    ...r,
    endDay: Math.min(r.endDay, nDays),
    endDate: isoDateAtOffset(departDate, Math.min(r.endDay, nDays) - 1),
    highlights: (r.highlights ?? []).filter(
      (h) => h.day >= r.startDay && h.day <= Math.min(r.endDay, nDays),
    ),
  }));
}

/** Final hub (Manila/Bangkok) — max ~4 days: buffer + leisure + flight day. */
function capReturnHubLeisureDays(
  regions: TripRegion[],
  nDays: number,
  departDate: string,
  trace?: (msg: string) => void,
): TripRegion[] {
  if (regions.length < 2) return regions;
  const last = regions[regions.length - 1]!;
  if (!/manila|bangkok/i.test(last.city)) return regions;
  const span = last.endDay - last.startDay + 1;
  const maxSpan = 4;
  if (span <= maxSpan) return regions;
  const newStart = last.startDay + (span - maxSpan);
  trace?.(`cap return hub ${last.city}: ${span}d → ${maxSpan}d`);
  return regions.map((r, i) =>
    i === regions.length - 1
      ? {
          ...r,
          startDay: newStart,
          startDate: isoDateAtOffset(departDate, newStart - 1),
          highlights: (r.highlights ?? []).filter((h) => h.day >= newStart),
        }
      : r,
  );
}

/** Steal 1 day from long island stay so Bangkok has travel buffer + flight day. */
function enforceReturnBufferRegions(skeleton: TripSkeleton): TripSkeleton {
  const regions = [...skeleton.regions];
  const last = regions[regions.length - 1];
  const prev = regions[regions.length - 2];
  if (!last || !prev || !/bangkok/i.test(last.city)) return skeleton;
  const lastSpan = last.endDay - last.startDay + 1;
  if (lastSpan >= 2) return skeleton;
  const prevSpan = prev.endDay - prev.startDay + 1;
  if (prevSpan < 4 || !/lipe|krabi|phuket|samui/i.test(prev.city)) return skeleton;

  prev.endDay -= 1;
  last.startDay = prev.endDay + 1;
  return { ...skeleton, regions };
}

/** One DayPlan per calendar day — same card layout as full AI plan. */
export function buildSkeletonDayPlans(
  skeleton: TripSkeleton,
  opts?: BuildSkeletonDayPlansOpts,
): DayPlan[] {
  skeleton = enforceReturnBufferRegions(skeleton);
  const lastRegion = skeleton.regions[skeleton.regions.length - 1];
  const nDays = lastRegion?.endDay ?? 0;
  const days: DayPlan[] = [];
  const locale = resolveTripLocale(
    opts?.destinationIata ?? skeleton.destinationIata,
    opts?.destinationName ?? skeleton.destinationName,
    opts?.lang ?? "sl",
  );
  const priceTier = getPriceTier(locale.country);
  const destIata = opts?.destinationIata ?? skeleton.destinationIata;
  const departIata = opts?.returnFromIata ?? skeleton.returnFromIata ?? destIata;

  const preparedRegions = new Map<string, TripRegion>();
  for (const r of skeleton.regions) {
    const key = `${r.city}-${r.startDay}`;
    preparedRegions.set(
      key,
      prepareRegionHighlights(r, destIata, nDays, undefined, skeleton.departDate),
    );
  }

  const usedEveningVenues = new Set<string>();
  const phiPhiExcursionDone = tripHasPhiPhiExcursion(skeleton);
  const flights = opts?.flights;
  const arrivalDayNum = arrivalTripDay(flights);
  const deferredHighlights = new Map<number, SkeletonHighlight[]>();

  for (let d = 1; d <= nDays; d++) {
    const priorHighlightText = skeleton.regions
      .flatMap((r) => r.highlights ?? [])
      .filter((h) => h.day < d)
      .map((h) => `${h.name} ${h.description}`)
      .join(" ");

    const region = skeleton.regions.find((r) => d >= r.startDay && d <= r.endDay);
    if (!region) {
      if (isInFlightTripDay(d, flights)) {
        const langCode = opts?.lang ?? "sl";
        const originIata = opts?.originIata ?? skeleton.originIata;
        const originActs =
          d === 1 && originIata && flights?.outboundDepart
            ? buildOriginDepartureLogistics(originIata, flights, langCode).map(logisticsToActivity)
            : [
                {
                  name: locale.slo ? "Mednarodni let" : "International flight",
                  type: "TRANSPORT" as const,
                  description: locale.slo
                    ? `Še v letu proti destinaciji — dan ${d} od ${nDays}. Po pristanku (dan ${arrivalDayNum}) sledi check-in in ogledi.`
                    : `Still en route — trip day ${d} of ${nDays}. After landing (day ${arrivalDayNum}), check-in and sights begin.`,
                },
              ];
        days.push({
          day: d,
          date: isoDateAtOffset(skeleton.departDate, d - 1),
          title:
            d === 1 && originIata
              ? locale.slo
                ? `Odhod z ${originIata.toUpperCase()}`
                : `Departure from ${originIata.toUpperCase()}`
              : locale.slo
                ? "Mednarodni let"
                : "International flight",
          morning: "",
          afternoon: "",
          evening: "",
          activities: {
            morning: originActs,
            afternoon: [],
            evening: [],
          },
          travelHack: day1OriginTravelHack(d, originIata, flights, langCode),
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 0,
          lat: 0,
          lng: 0,
          focusName: locale.slo ? "Mednarodni let" : "International flight",
          city: skeleton.destinationName,
          category: "transport",
          inFlightDay: true,
        });
      }
      continue;
    }

    const prepared = preparedRegions.get(`${region.city}-${region.startDay}`) ?? region;
    let dayHighlights = (prepared.highlights ?? []).filter((h) => h.day === d);
    const deferred = deferredHighlights.get(d);
    if (deferred?.length) {
      dayHighlights = [...dayHighlights, ...deferred];
      deferredHighlights.delete(d);
    }
    if (
      d === nDays - 1 &&
      flights?.inboundDepart &&
      isOvernightDeparture(flights) &&
      region.endDay >= nDays - 1
    ) {
      const fromLastDay = (prepared.highlights ?? []).filter((h) => h.day === nDays);
      if (fromLastDay.length) {
        dayHighlights = [
          ...dayHighlights,
          ...fromLastDay.map((h) => ({ ...h, day: nDays - 1 })),
        ];
      }
    }
    if (d === nDays && flights?.inboundDepart && isOvernightDeparture(flights)) {
      dayHighlights = [];
    }
    if (d === arrivalDayNum) {
      dayHighlights = filterArrivalDayHighlights(dayHighlights, flights);
      if (isRedEyeArrival(flights)) {
        const heavy = dayHighlights.filter(isHeavySkeletonHighlight);
        dayHighlights = dayHighlights.filter((h) => !isHeavySkeletonHighlight(h));
        if (heavy.length && d < region.endDay) {
          const next = d + 1;
          deferredHighlights.set(next, [
            ...(deferredHighlights.get(next) ?? []),
            ...heavy.map((h) => ({ ...h, day: next })),
          ]);
        }
      }
    }
    if (d === region.endDay && region.transportToNext) {
      dayHighlights = filterTravelOutDayHighlights(dayHighlights, region.transportToNext);
    }
    const prevRegionForDay = skeleton.regions.find((r) => r.endDay === d - 1);
    const regionDaySpan = region.endDay - region.startDay + 1;
    const prevHopRaw = prevRegionForDay?.transportToNext;
    const prevHop =
      prevRegionForDay && prevHopRaw
        ? resolveRegionHop(
            prevRegionForDay.city,
            region.city,
            prevHopRaw,
            destIata,
            skeleton.accommodationMode,
          )
        : prevHopRaw;
    const curatedHop = lookupCuratedTransportLeg(
      prevRegionForDay?.city ?? "",
      region.city,
      lookupDestination(destIata)?.country,
    );
    const hopIsHeavy =
      curatedHop?.heavyTravel ?? (prevHop != null && isHeavyRegionalTravel(prevHop));
    const shortInbound =
      d === region.startDay && prevHop != null && !hopIsHeavy;
    const inboundTravelDay =
      d > 1 &&
      d === region.startDay &&
      !shortInbound &&
      regionDaySpan > 1 &&
      (dayHighlights.some(isRegionalTravelHighlight) || (prevHop != null && hopIsHeavy));
    if (inboundTravelDay && regionDaySpan <= 1) {
      dayHighlights = filterInboundTravelDayHighlights(dayHighlights);
    } else if (inboundTravelDay) {
      dayHighlights = ensureInboundArrivalHighlights(
        dayHighlights,
        region.city,
        d,
        opts?.lang ?? "sl",
      );
    }
    dayHighlights = dayHighlights.filter((h) => !isTransportLikeHighlight(h));
    if (d === nDays && flights?.inboundDepart) {
      dayHighlights = filterDepartureDayHighlights(dayHighlights, departIata, flights.inboundDepart);
    }
    dayHighlights = dayHighlights.filter(
      (h) => !isWrongCityPoi(h.name, h.description, region.city),
    );
    dayHighlights = dedupeSameDayGeoConflicts(dayHighlights, region.city);
    dayHighlights = dayHighlights.filter((h) =>
      isPoiOpenOnTripDay(h.name, h.description, skeleton.departDate, d),
    );
    dayHighlights = dayHighlights.filter(
      (h) => !isClosedDeprecatedPoi(h.name, h.description),
    );
    const dayDatePre = isoDateAtOffset(skeleton.departDate, d - 1);
    if (isCentralVietnamCity(region.city) && isCentralVietnamFloodDate(dayDatePre)) {
      dayHighlights = dayHighlights.filter(
        (h) => !isBeachLoungingPoi(h.name, h.description),
      );
    }
    if (/bangkok/i.test(region.city) && /grand palace|wat pho|wat arun/i.test(priorHighlightText)) {
      dayHighlights = stripRepeatBangkokMustSee(dayHighlights);
    }
    if (/ayutthaya/i.test(region.city) && shortInbound && d === region.startDay) {
      dayHighlights = ensureAyutthayaArrivalHighlights(dayHighlights, d);
    }
    const primary = dayHighlights[0];
    const langCode = opts?.lang ?? "sl";
    const travelOutDay = d === region.endDay && !!region.transportToNext;
    let slots = distributeHighlightsToSlots(dayHighlights, langCode);
    slots = reconcileWeekdayGatedActivities(slots, skeleton.departDate, d, langCode);
    slots = reconcileActivitySlots(slots, { inboundTravelDay, travelOutDay, city: region.city });
    const isFirstInRegion = d === region.startDay;
    const regionLat =
      region.lat && isValidCoord(region.lat, region.lng) ? region.lat : (lookupRegionCoords(region.city)?.lat ?? 0);
    const regionLng =
      region.lat && isValidCoord(region.lat, region.lng) ? region.lng : (lookupRegionCoords(region.city)?.lng ?? 0);

    let activities:
      | { morning: Activity[]; afternoon: Activity[]; evening: Activity[] }
      | undefined;

    if (isInFlightTripDay(d, flights)) {
      activities = {
        morning: [
          {
            name: locale.slo ? "Mednarodni let" : "International flight",
            type: "TRANSPORT",
            description: locale.slo
              ? `Še v letu proti destinaciji — dan ${d} od ${nDays}. Po pristanku (dan ${arrivalDayNum}) sledi check-in in ogledi.`
              : `Still en route — trip day ${d} of ${nDays}. After landing (day ${arrivalDayNum}), check-in and sights begin.`,
          },
        ],
        afternoon: [],
        evening: [],
      };
    } else if (d === arrivalDayNum) {
      activities = mergeDay1Activities(
        slots,
        buildArrivalLogistics(region.city, flights, locale, {
          accommodationMode: skeleton.accommodationMode,
        }),
        flights,
      );
      if (d === 1) {
        activities = prependOriginDepartureActivities(
          activities,
          opts?.originIata ?? skeleton.originIata,
          flights,
          langCode,
        );
      }
    } else if (d === nDays && flights?.inboundDepart) {
      const travelAndDepartSameDay =
        inboundTravelDay ||
        (prevRegionForDay?.transportToNext != null &&
          isHeavyRegionalTravel(prevRegionForDay.transportToNext));
      if (travelAndDepartSameDay) {
        const hop = prevRegionForDay?.transportToNext;
        activities = {
          morning: [
            {
              name: hop
                ? `Prevoz: ${prevRegionForDay!.city} → ${region.city}`
                : locale.slo
                  ? "Celodnevni prevoz do domačega letališča"
                  : "Full-day travel to home airport hub",
              type: "TRANSPORT",
              description: hop?.howTo
                ? hop.howTo
                : locale.slo
                  ? "Mednarodni let isti dan — to NI izvedljivo z otoka. V načrtu mora biti vsaj 1 buffer dan v mestu odhoda (npr. Bangkok) pred letom."
                  : "International flight same day — not feasible from islands; need 1 buffer night in departure hub.",
            },
          ],
          afternoon: [],
          evening: [],
        };
      } else {
        const laxRush =
          departIata.toUpperCase() === "LAX" &&
          flights.inboundDepart &&
          (() => {
            const [h, m] = flights.inboundDepart!.split(":").map(Number);
            return (h ?? 0) * 60 + (m ?? 0) <= 18 * 60;
          })();
        const stripAllSights =
          laxRush ||
          isTightDeparture(flights) ||
          isEarlyDeparture(flights) ||
          isAfternoonDeparture(flights);
        const lateNight = isLateNightDeparture(flights);
        const eveningDep = isEveningDeparture(flights);
        let highlightsForLastDay = stripAllSights
          ? []
          : lateNight
            ? dayHighlights
            : eveningDep
              ? dayHighlights.slice(0, 1)
              : dayHighlights;
        highlightsForLastDay = filterDepartureDayHighlights(
          highlightsForLastDay,
          departIata,
          flights.inboundDepart,
        );
        activities = mergeLastDayActivities(
          distributeHighlightsToSlots(highlightsForLastDay, langCode),
          buildDepartureLogistics(region.city, flights, locale, {
            accommodationMode: skeleton.accommodationMode,
          }),
          flights,
        );
      }
    } else if (inboundTravelDay && prevRegionForDay && prevHop) {
      const prevoz: Activity = {
        name: locale.slo
          ? `Prevoz: ${prevRegionForDay.city} → ${region.city}`
          : `Transfer: ${prevRegionForDay.city} → ${region.city}`,
        type: "TRANSPORT",
        description: prevHop.howTo ?? "",
        priceLabel: prevHop.costLabel,
      };
      activities = {
        morning: [prevoz, ...slots.morning].slice(0, 2),
        afternoon: slots.afternoon,
        evening: slots.evening,
      };
    } else if (inboundTravelDay) {
      activities =
        slots.morning.length + slots.afternoon.length + slots.evening.length > 0
          ? slots
          : padEmptyDayActivities(undefined, region, d, langCode, { inboundTravelDay: true });
    } else if (shortInbound && prevRegionForDay && prevHop) {
      const prevoz: Activity = {
        name: locale.slo
          ? `Prevoz: ${prevRegionForDay.city} → ${region.city}`
          : `Transfer: ${prevRegionForDay.city} → ${region.city}`,
        type: "TRANSPORT",
        description: prevHop.howTo ?? "",
        priceLabel: prevHop.costLabel,
      };
      activities = {
        morning: [prevoz, ...slots.morning].slice(0, 2),
        afternoon: slots.afternoon,
        evening: slots.evening,
      };
    } else if (dayHighlights.length > 0) {
      activities = slots;
    } else if (isFirstInRegion) {
      activities = {
        morning: [
          {
            name: region.city,
            type: "SIGHT",
            description: region.summary,
          },
        ],
        afternoon: [],
        evening: [],
      };
    }

    activities = padEmptyDayActivities(activities, region, d, langCode, {
      travelOutDay,
      inboundTravelDay,
    });

    const skipEnrichOnPureDeparture =
      d === nDays &&
      flights?.inboundDepart &&
      (isTightDeparture(flights) ||
        isEarlyDeparture(flights) ||
        isAfternoonDeparture(flights) ||
        isEveningDeparture(flights) ||
        inboundTravelDay);

    if (activities && !skipEnrichOnPureDeparture) {
      const dayInRegion = d - region.startDay + 1;
      const phiPhiDoneBeforeDay = phiPhiExcursionDone &&
        skeleton.regions.some((r) =>
          (r.highlights ?? []).some(
            (h) =>
              h.day < d &&
              isFullDayExcursion(h) &&
              /phi phi|maya bay/i.test(`${h.name} ${h.description}`),
          ),
        );
      activities = enrichDayActivities(activities, region.city, dayInRegion, locale, {
        isTripDay1: d === arrivalDayNum,
        isArrivalDay: d === arrivalDayNum || d === region.startDay,
        lateArrival: d === arrivalDayNum && isLateArrival(flights),
        tightArrivalDay: d === arrivalDayNum && isTightArrivalDay(flights),
        redEyeArrival: d === arrivalDayNum && isRedEyeArrival(flights),
        destinationIata: destIata,
        plannedSights: dayHighlights.length,
        dayHighlightNames: dayHighlights.map((h) => h.name),
        usedEveningVenues,
        paceLabel: opts?.paceLabel,
        phiPhiExcursionDone: phiPhiDoneBeforeDay,
        inboundTravelDay,
        priorScheduledText: priorHighlightText,
        tripDate: isoDateAtOffset(skeleton.departDate, d - 1),
      });
      activities = stripWrongCityActivities(activities, region.city);
      activities = reconcileWeekdayGatedActivities(activities, skeleton.departDate, d, langCode);
      activities = reconcileActivitySlots(activities, { city: region.city });
      const dayDate = isoDateAtOffset(skeleton.departDate, d - 1);
      const tide =
        skeleton.astronomy?.tideByRegion?.[region.city]?.[dayDate] ?? null;
      if (!isSmallIsland(region.city)) {
        activities = annotateDayAstronomy(activities, dayDate, langCode, tide);
      }
      for (const slot of ["morning", "afternoon", "evening"] as const) {
        for (const a of activities[slot] ?? []) {
          const key = eveningVenueKey(a.name);
          if (key === "chinatown" || key === "asiatique" || key === "night-bazaar") {
            usedEveningVenues.add(key);
          }
        }
      }
    }

    if (activities && d === nDays && flights?.inboundDepart) {
      activities = stripDepartureEveningSlot(activities, flights);
    }

    let transport: DayTransport | undefined;
    if ((inboundTravelDay || shortInbound) && prevHop) {
      transport = {
        type: prevHop.type,
        duration: prevHop.duration,
        cost: prevHop.costLabel ?? "",
        description: prevHop.howTo ?? "",
      };
    } else if (d === region.endDay && region.transportToNext) {
      const nextRegion = skeleton.regions.find((r) => r.startDay === d + 1);
      if (!nextRegion) {
        transport = {
          type: region.transportToNext.type,
          duration: region.transportToNext.duration,
          cost: region.transportToNext.costLabel ?? "",
          description: region.transportToNext.howTo ?? "",
        };
      }
    } else if (d === arrivalDayNum) {
      const arrive = flights?.outboundArrive ?? "14:00";
      transport = {
        type: locale.transferLabel,
        duration: "20–90 min",
        cost: locale.transferPrice,
        description: locale.slo
          ? `Prihod na letališče ob ${arrive}, nato prevoz do hotela (${locale.transferLabel}).`
          : `Land around ${arrive}, then transfer to hotel via ${locale.transferLabel}.`,
      };
    } else if (d === nDays && flights?.inboundDepart) {
      transport = {
        type: locale.slo ? `${locale.transferLabel} → letališče` : `${locale.transferLabel} → airport`,
        duration: "20–90 min",
        cost: locale.transferPrice,
        description: locale.slo
          ? `Odhod domov ob ${flights.inboundDepart} — na letališče odidi 2,5–3 ure prej (promet + varnostna kontrola).`
          : `Return flight at ${flights.inboundDepart} — leave 2.5–3 hours early for traffic and security.`,
      };
    }

    const mapPins = dayHighlights
      .filter(
        (h) =>
          isValidCoord(h.lat, h.lng) &&
          (regionLat === 0 || coordNearRegion(h.lat, h.lng, regionLat, regionLng)),
      )
      .map((h) => ({ name: h.name, lat: h.lat, lng: h.lng }));

    const primaryCoord =
      primary?.lat &&
      isValidCoord(primary.lat, primary.lng) &&
      (regionLat === 0 || coordNearRegion(primary.lat, primary.lng, regionLat, regionLng))
        ? { lat: primary.lat, lng: primary.lng }
        : regionLat && regionLng
          ? { lat: regionLat, lng: regionLng }
          : null;

    days.push(
      attachActivityCoordinates({
      day: d,
      date: isoDateAtOffset(skeleton.departDate, d - 1),
      title: skeletonDayTitle(region, d, dayHighlights, activities, {
        departureOnly:
          d === nDays &&
          !!flights?.inboundDepart &&
          isOvernightDeparture(flights) &&
          (activities?.morning.length ?? 0) > 0 &&
          !(activities?.afternoon.length || activities?.evening.length),
      }),
      morning: "",
      afternoon: "",
      evening: "",
      activities,
      travelHack: [
        day1OriginTravelHack(
          d,
          opts?.originIata ?? skeleton.originIata,
          flights,
          langCode,
        ),
        isFirstInRegion && region.travelTips
          ? sanitizeLegacyTemplateLeak(region.travelTips)
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      transportationTips:
        isFirstInRegion && region.localTransportTips
          ? sanitizeLegacyTemplateLeak(region.localTransportTips)
          : "",
      localWarnings:
        isCentralVietnamCity(region.city) && isCentralVietnamFloodDate(dayDatePre)
          ? locale.slo
            ? "Deževna sezona — An Bang in staro mestno lahko poplavljeno; indoor rezerva (kuharstvo, lampioni) ima prednost pred plažo."
            : "Rainy season — An Bang and old town may flood; indoor backup (cooking, lanterns) beats beach lounging."
          : "",
      dailyBudgetEur: (() => {
        const sprawling = isSprawlingMetroRegion(region, destIata, nDays);
        const mealsFull = dailyMealsBudgetEur(priceTier);
        const kind = classifyDayBudgetKind(activities, {
          isArrival: d === arrivalDayNum,
          isDeparture: d === nDays && !!flights?.inboundDepart,
          regionCity: region.city,
        });
        const params = dayBudgetParams(priceTier, kind, sprawling, mealsFull);
        const raw = estimateDayBudgetEur(activities, transport?.cost, {
          ...params,
          pax: Math.max(1, opts?.pax ?? 1),
        });
        const floored = applyCanadaBudgetFloor(
          applySafariBudgetFloor(raw, kind, activities),
          kind,
          activities,
          region.city,
          locale.country,
        );
        if (skeleton.accommodationMode === "motorhome") {
          const motorhomeFloored = applyMotorhomeBudgetFloor(
            floored,
            kind,
            Math.max(1, opts?.pax ?? 1),
          );
          const interval = skeleton.hotelRestEveryNDays;
          if (interval && isHotelRestDay(d, interval, { totalDays: nDays })) {
            return applyHotelRestBudgetFloor(motorhomeFloored, true, Math.max(1, opts?.pax ?? 1));
          }
          return motorhomeFloored;
        }
        return floored;
      })(),
      lat: primaryCoord?.lat ?? region.lat,
      lng: primaryCoord?.lng ?? region.lng,
      focusName: primary?.name ?? region.city,
      city: region.city,
      category: dayCategoryFromHighlights(dayHighlights),
      transport,
      mapPins: mapPins.length ? mapPins : undefined,
      }),
    );
  }

  return collapseSmallIslandStays(days, skeleton, opts?.lang ?? "sl");
}

/** Convert skeleton to a plan for map pins and photo resolution. */
export function skeletonToPreviewPlan(
  skeleton: TripSkeleton,
  opts?: BuildSkeletonDayPlansOpts,
): AiTripPlan {
  const first = skeleton.regions[0];
  const days = buildSkeletonDayPlans(skeleton, opts);
  const pax = Math.max(1, opts?.pax ?? 1);
  return {
    destinationName: skeleton.destinationName,
    summary: skeleton.summary,
    totalBudgetEur: computeTripTotalBudgetEur(days, pax),
    centerLat: first?.lat ?? 0,
    centerLng: first?.lng ?? 0,
    originIata: skeleton.originIata,
    destinationIata: skeleton.destinationIata,
    accommodationMode: skeleton.accommodationMode,
    hotelRestEveryNDays: skeleton.hotelRestEveryNDays,
    days: days.length > 0
      ? days
      : skeleton.regions.map((r) => ({
          day: r.startDay,
          date: r.startDate,
          title: r.city,
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: r.travelTips,
          transportationTips: r.localTransportTips,
          localWarnings: "",
          dailyBudgetEur: 0,
          lat: r.lat,
          lng: r.lng,
          focusName: r.city,
          city: r.city,
          category: "sight" as const,
        })),
  };
}

function normalizeSkeletonRegion(
  raw: Partial<TripRegion>,
  departDate: string,
): TripRegion | null {
  const city = textValue(raw.city);
  const startDay = numberValue(raw.startDay, 0);
  const endDay = numberValue(raw.endDay, 0);
  if (!city || startDay < 1 || endDay < startDay) return null;
  const regionCtx = { startDay, endDay, city };
  const highlights = extractHighlightsFromRaw(raw as Record<string, unknown>, regionCtx)
    .map((h) => normalizeSkeletonHighlight(h, regionCtx))
    .filter((h): h is SkeletonHighlight => h !== null);
  return {
    city,
    startDay,
    endDay,
    startDate: isoDateAtOffset(departDate, startDay - 1),
    endDate: isoDateAtOffset(departDate, endDay - 1),
    summary: clampSkeletonText(sanitizeOutdatedText(textValue(raw.summary, city)), 180),
    localTransportTips: clampSkeletonText(
      sanitizeOutdatedText(textValue(raw.localTransportTips)),
      160,
    ),
    travelTips: clampSkeletonText(sanitizeOutdatedText(textValue(raw.travelTips)), 120),
    highlights,
    lat: numberValue(raw.lat, 0),
    lng: numberValue(raw.lng, 0),
    transportToNext:
      raw.transportToNext && textValue(raw.transportToNext.type)
        ? {
            type: textValue(raw.transportToNext.type, "transport"),
            duration: textValue(raw.transportToNext.duration, ""),
            costLabel: textValue(raw.transportToNext.costLabel),
            howTo: sanitizeOutdatedText(textValue(raw.transportToNext.howTo)),
          }
        : undefined,
  };
}

function skeletonNeedsDetailFill(regions: TripRegion[], paceLabel: string): boolean {
  const minPerDay = minHighlightsPerDayForPace(paceLabel);
  const minAvg = minAvgHighlightsPerDayForPace(paceLabel);

  for (const r of regions) {
    const days = r.endDay - r.startDay + 1;
    const named = (r.highlights ?? []).filter((h) => !isGenericHighlight(h, r));

    for (let d = r.startDay; d <= r.endDay; d++) {
      const dayNamed = named.filter((h) => h.day === d);
      if (dayNamed.length === 0) return true;
    }

    if (named.length < days * minAvg) return true;
    if (paceLabel === "intensive") {
      for (let d = r.startDay; d <= r.endDay; d++) {
        if (named.filter((h) => h.day === d).length < minPerDay) return true;
      }
    }

    if (!(r.localTransportTips ?? "").trim() || !(r.travelTips ?? "").trim()) return true;
  }
  return false;
}

async function resolveRegionCoords(
  city: string,
  destName: string,
  destinationIata: string,
  aiLat: number,
  aiLng: number,
  token: string | undefined,
  trace: (msg: string) => void,
): Promise<{ lat: number; lng: number }> {
  const known = lookupRegionCoords(city);
  if (known) return known;

  if (isValidCoord(aiLat, aiLng)) return { lat: aiLat, lng: aiLng };

  const queries = [`${city}, ${destName}`, city];
  if (token) {
    for (const q of queries) {
      const hit = await geocodeMapbox(q, token);
      if (hit) {
        trace(`geocoded region "${city}" → [${hit[1]}, ${hit[0]}]`);
        return { lat: hit[1], lng: hit[0] };
      }
    }
  }

  const hub = CITY_ANCHORS[destinationIata.toUpperCase()];
  if (hub) return { lat: hub.lat, lng: hub.lng };
  return { lat: aiLat, lng: aiLng };
}

async function enrichSkeletonRegions(
  skeleton: TripSkeleton,
  destinationIata: string,
  trace: (msg: string) => void,
): Promise<TripSkeleton> {
  const token = process.env.MAPBOX_PUBLIC_TOKEN;
  const destName = skeleton.destinationName;

  const regions = await Promise.all(
    skeleton.regions.map(async (r) => {
      const coords = await resolveRegionCoords(
        r.city,
        destName,
        destinationIata,
        r.lat,
        r.lng,
        token,
        trace,
      );

      const regionCenter = { lat: coords.lat, lng: coords.lng };
      const highlights = await Promise.all(
        (r.highlights ?? []).map(async (h) => {
          const poiFirst = resolveHighlightCoords(h, regionCenter);
          if (isValidCoord(poiFirst.lat, poiFirst.lng) && lookupPoiCoords(h.name)) {
            return poiFirst;
          }

          let lat = h.lat;
          let lng = h.lng;
          if (isValidCoord(lat, lng) && !coordNearRegion(lat, lng, coords.lat, coords.lng)) {
            lat = 0;
            lng = 0;
          }
          if (isValidCoord(lat, lng) && !nearRegionCenter(lat, lng, regionCenter)) {
            return { ...h, lat, lng };
          }

          const poi = lookupPoiCoords(h.name);
          if (poi) return { ...h, ...poi };

          if (token) {
            const hit = await geocodeMapbox(`${h.name}, ${r.city}, ${destName}`, token);
            if (hit && coordNearRegion(hit[1], hit[0], coords.lat, coords.lng)) {
              return { ...h, lat: hit[1], lng: hit[0] };
            }
          }

          return resolveHighlightCoords(h, regionCenter);
        }),
      );

      const sprawling = isSprawlingMetroRegion(
        { ...r, lat: coords.lat, lng: coords.lng, highlights },
        destinationIata,
        skeleton.regions.at(-1)?.endDay ?? 0,
      );
      const maxKm = maxIntraDayKm(destinationIata, sprawling);
      const rebalanced = rebalanceRegionHighlightsByProximity(
        { ...r, lat: coords.lat, lng: coords.lng, highlights },
        {
          maxIntraDayKm: maxKm,
          maxPerDay: 5,
          preserveDays: [r.startDay, r.endDay],
        },
        trace,
      );

      return { ...rebalanced, lat: coords.lat, lng: coords.lng };
    }),
  );

  return { ...skeleton, regions };
}

function countNamedHighlights(regions: TripRegion[]): number {
  return regions.reduce(
    (n, r) => n + (r.highlights ?? []).filter((h) => !isGenericHighlight(h, r)).length,
    0,
  );
}

function regionNeedsFill(region: TripRegion, paceLabel: string): boolean {
  const days = region.endDay - region.startDay + 1;
  const named = (region.highlights ?? []).filter((h) => !isGenericHighlight(h, region));
  if (named.length < Math.ceil(days * minAvgHighlightsPerDayForPace(paceLabel))) return true;
  for (let d = region.startDay; d <= region.endDay; d++) {
    if (named.filter((h) => h.day === d).length === 0) return true;
  }
  if (!(region.localTransportTips ?? "").trim() || !(region.travelTips ?? "").trim()) return true;
  return false;
}

function buildRegionFillSystem(
  langCode: string,
  destinationIata: string,
  destinationName: string,
  displayCurrency: PlanCurrency,
): string {
  const locale = resolveTripLocale(destinationIata, destinationName, langCode, displayCurrency);
  const transportModes = locale.localTransportModes;
  const sym = displayCurrency === "USD" ? "$" : "€";
  const priceRule = `All priceLabel values in ${displayCurrency} (${sym}) only — realistic for ${locale.countryName}, never mix currencies.`;
  return `${STRICT_LLM_LANGUAGE_RULE}

${STRICT_LLM_CURRENCY_RULE}

You are an experienced trip planner filling ONE region of a preview itinerary.
Return ONLY valid JSON:
{
  "localTransportTips": "2 sentences: ${transportModes} — ${priceRule} (max 200 chars)",
  "travelTips": "2 practical insider tips (max 180 chars)",
  "highlights": [
    { "day": 1, "name": "Ben Thanh Market", "visitDuration": "2h", "description": "2–3 stavki: kaj vidiš, zakaj je vredno, praktičen nasvet (120–280 znakov)", "priceLabel": "brezplačno", "lat": 10.772, "lng": 106.698 },
    { "day": 2, "name": "War Remnants Museum", "visitDuration": "pol dneva", "description": "2–3 stavki z uro obiska in nasvetom", "priceLabel": "5 €", "lat": 10.779, "lng": 106.692 }
  ]
}
${languageWritingRule(langCode)}
Rules:
- highlights MUST cover EVERY day from startDay to endDay — 2–4 unique POIs per day, zero blank days
- Vary count by visit time: major sight = pol dneva/cel dan (often alone); light days still need afternoon + evening
- Inter-city travel on startDay: morning transport + real afternoon/evening sights in destination city
- If region.collapsedStay: spread beaches/boats across the multi-night stay — still cover each day
- Fill dayGaps up to target — unique POI per highlight
- NEVER repeat a sight from usedHighlightNames — pick a different POI for that day (no Griffith Observatory twice under a different name)
- If metroClustering in user JSON: same-day highlights within maxKmSameDay; one geographic zone per day
- Real POI names only — never use city name as attraction name
- visitDuration on each (2h, pol dneva, cel dan)
- description = 2–3 sentences (120–280 chars) — unique text per highlight, timing matches slot
- If flightScheduling.day1 in user JSON: day 1 sights only AFTER implied check-in — light schedule if late arrival
- If flightScheduling.lastDay: respect airport timing on final day of trip
- ${priceRule}
- Accurate lat/lng within the region city — never coords from a different city/island`;
}

async function fillOneRegion(
  region: TripRegion,
  skeleton: TripSkeleton,
  langCode: string,
  paceLabel: string,
  trace: (msg: string) => void,
  flightContext?: TripFlightContext,
  totalDays?: number,
  tripHighlightKeys?: Set<string>,
): Promise<TripRegion> {
  if (!regionNeedsFill(region, paceLabel)) return region;

  const days = region.endDay - region.startDay + 1;
  const named = (region.highlights ?? []).filter((h) => !isGenericHighlight(h, region));
  const collapsedStay = days >= 2 && isSmallIsland(region.city);
  const maxPerDay = paceLabel === "intensive" ? 5 : 4;
  const minHighlights = collapsedStay
    ? Math.max(named.length, Math.ceil(days * 2))
    : Math.max(days * 2, Math.ceil(days * minAvgHighlightsPerDayForPace(paceLabel)));

  const dayGaps: Array<{ day: number; have: number; target: number }> = [];
  for (let d = region.startDay; d <= region.endDay; d++) {
    const have = named.filter((h) => h.day === d).length;
    const target = paceLabel === "intensive" ? 4 : 3;
    if (have < target) dayGaps.push({ day: d, have, target });
  }

  const locale = resolveTripLocale(
    skeleton.destinationIata,
    skeleton.destinationName,
    langCode,
    sanitizeDisplayCurrency,
  );
  const payload = {
    languageCode: langCode,
    language: LANG_MAP[langCode] ?? langCode,
    writingRule: languageWritingRule(langCode),
    displayCurrency: sanitizeDisplayCurrency,
    priceCurrency: priceCurrencyPayload(sanitizeDisplayCurrency),
    currencyRule: currencyWritingRule(sanitizeDisplayCurrency),
    destinationCountry: locale.countryName,
    pace: paceLabel,
    destination: skeleton.destinationName,
    region: {
      city: region.city,
      startDay: region.startDay,
      endDay: region.endDay,
      summary: region.summary,
      minHighlights,
      dayGaps,
      existingHighlights: named.map((h) => ({
        day: h.day,
        name: h.name,
        visitDuration: h.visitDuration ?? null,
      })),
      usedHighlightNames: [...(tripHighlightKeys ?? [])],
      ...(collapsedStay ? { collapsedStay: true } : {}),
    },
    scheduling: buildSchedulingHint(paceLabel, skeleton.regions.at(-1)?.endDay ?? days),
    ...(flightContext && totalDays
      ? buildFlightSchedulingPayload(
          flightContext,
          totalDays,
        )
      : {}),
    ...(() => {
      const metro = buildMetroClusteringPayload(
        skeleton.destinationIata,
        totalDays ?? days,
        langCode,
      );
      return metro ? { metroClustering: metro } : {};
    })(),
  };

  const filled = await geminiGenerateJson<{
    localTransportTips?: string;
    travelTips?: string;
    highlights?: Partial<SkeletonHighlight>[];
  }>({
    role: "skeleton",
    system: buildRegionFillSystem(
      langCode,
      skeleton.destinationIata,
      skeleton.destinationName,
      sanitizeDisplayCurrency,
    ),
    user: JSON.stringify(payload),
    trace,
    label: `fill ${region.city} d${region.startDay}-${region.endDay}`,
    maxTokens: 8_000,
    timeoutMs: 300_000,
  });

  if (!filled?.highlights?.length) return region;

  const regionCtx = { startDay: region.startDay, endDay: region.endDay, city: region.city };
  const filledHighlights = filled.highlights
    .map((h) => normalizeSkeletonHighlight(h, regionCtx))
    .filter((h): h is SkeletonHighlight => h !== null);

  const merged = named.slice();
  const regionKeys = new Set(merged.map((h) => highlightDedupKey(h.name)));
  for (const h of filledHighlights) {
    const key = highlightDedupKey(h.name);
    const duplicateDay = merged.some((x) => x.day === h.day && x.name === h.name);
    const duplicateTrip =
      Boolean(key) &&
      ((tripHighlightKeys?.has(key) && !regionKeys.has(key)) || regionKeys.has(key));
    const dayCount = merged.filter((x) => x.day === h.day).length;
    if (
      !duplicateDay &&
      !duplicateTrip &&
      dayCount < maxPerDay &&
      !isGenericHighlight(h, region)
    ) {
      merged.push(h);
      if (key) regionKeys.add(key);
    }
  }

  trace(
    `fill ${region.city} d${region.startDay}-${region.endDay}: ${named.length} → ${merged.length} highlights`,
  );

  return {
    ...region,
    localTransportTips:
      region.localTransportTips.trim() ||
      clampSkeletonText(sanitizeOutdatedText(textValue(filled.localTransportTips)), 160),
    travelTips:
      region.travelTips.trim() ||
      clampSkeletonText(sanitizeOutdatedText(textValue(filled.travelTips)), 120),
    highlights: merged,
  };
}

function synthesizeSkeletonMeta(
  destinationIata: string,
  nDays: number,
  pax: number,
  regions: TripRegion[],
  langCode: string,
): { destinationName: string; summary: string; totalBudgetEur: number } {
  const dest = lookupDestination(destinationIata);
  const destinationName = dest?.name ?? destinationIata;
  const route = regions.map((r) => r.city).join(" → ");
  const slo = langCode === "sl" || langCode.startsWith("sl");
  const summary = slo
    ? `${nDays}-dnevno potovanje: ${route}.`
    : `${nDays}-day trip: ${route}.`;
  return {
    destinationName,
    summary,
    totalBudgetEur: Math.round(42 * pax * nDays),
  };
}

/** Fill tips + per-day placeholders without extra Gemini calls (quota-safe). */
function applyProgrammaticSkeletonFill(
  skeleton: TripSkeleton,
  langCode: string,
): TripSkeleton {
  const locale = resolveTripLocale(
    skeleton.destinationIata,
    skeleton.destinationName,
    langCode,
    sanitizeDisplayCurrency,
  );
  const slo = locale.slo;
  const sym = locale.displayCurrency === "USD" ? "$" : "€";
  const priceHint = slo
    ? `cene v ${locale.displayCurrency} (${sym})`
    : `prices in ${locale.displayCurrency} (${sym})`;
  let regions = ensureEveryDayHasHighlight(skeleton.regions);
  regions = injectVietnamCuratedHighlights(regions, langCode);
  regions = regions.map((r) => ({
    ...r,
    localTransportTips:
      r.localTransportTips.trim() ||
      clampSkeletonText(
        slo
          ? `${locale.localTransportModes} — ${priceHint}.`
          : `${locale.localTransportModes} — ${priceHint}.`,
        160,
      ),
    travelTips:
      r.travelTips.trim() ||
      clampSkeletonText(
        slo
          ? "Jutranje aktivnosti na prostem; po potrebi prilagodi izlete vremenu."
          : "Plan outdoor mornings; adjust excursions for weather.",
        120,
      ),
  }));
  return { ...skeleton, regions };
}

function buildBlueprintFallbackSkeleton(
  blueprint: RegionBlueprintBlock[],
  nDays: number,
  departDate: string,
  destinationIata: string,
  langCode: string,
  trace: (msg: string) => void,
): TripRegion[] {
  trace(`blueprint fallback: ${blueprint.map((b) => b.city).join(" → ")} (no extra AI calls)`);
  let regions = rebuildRegionsFromBlueprint(blueprint, nDays, departDate, [], trace);
  regions = repairSkeletonCoverage(regions, nDays, departDate, trace);
  regions = addTransportBetweenRegions(regions, "hotel", destinationIata);
  return injectVietnamCuratedHighlights(ensureEveryDayHasHighlight(regions), langCode);
}

async function fillSkeletonDetails(
  skeleton: TripSkeleton,
  langCode: string,
  paceLabel: string,
  trace: (msg: string) => void,
  flightContext?: TripFlightContext,
): Promise<TripSkeleton> {
  if (!skeletonNeedsDetailFill(skeleton.regions, paceLabel)) return skeleton;

  trace("filling highlights per region via gemini");

  let regions = skeleton.regions;
  const tripKeys = collectTripHighlightKeys(regions);
  for (const region of regions) {
    if (!regionNeedsFill(region, paceLabel)) continue;
    const totalDays = skeleton.regions.at(-1)?.endDay ?? 0;
    const updated = await fillOneRegion(
      region,
      skeleton,
      langCode,
      paceLabel,
      trace,
      flightContext,
      totalDays,
      tripKeys,
    );
    for (const h of updated.highlights ?? []) {
      if (!isGenericHighlight(h, updated)) {
        const key = highlightDedupKey(h.name);
        if (key) tripKeys.add(key);
      }
    }
    regions = regions.map((r) =>
      r.startDay === region.startDay && r.city === region.city ? updated : r,
    );
  }

  const named = countNamedHighlights(regions);
  const nDays = regions.at(-1)?.endDay ?? 0;
  trace(`filled highlights: ${named} named across ${nDays} days`);
  return { ...skeleton, regions };
}

function validateSkeletonCoverage(regions: TripRegion[], nDays: number): string | null {
  const sorted = [...regions].sort((a, b) => a.startDay - b.startDay);
  if (!sorted.length) return "no regions";
  if (sorted[0].startDay !== 1) return "must start day 1";
  if (sorted[sorted.length - 1].endDay !== nDays) return `must end day ${nDays}`;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startDay !== sorted[i - 1].endDay + 1) return "gap in day coverage";
  }
  return null;
}

/** Extend or trim the last region when AI is off by ≤2 days. */
function repairSkeletonCoverage(
  regions: TripRegion[],
  nDays: number,
  departDate: string,
  trace: (msg: string) => void,
): TripRegion[] {
  const sorted = [...regions].sort((a, b) => a.startDay - b.startDay);
  const last = sorted[sorted.length - 1];
  if (!last) return regions;

  const delta = nDays - last.endDay;
  if (delta === 0) return sorted;

  if (Math.abs(delta) <= 2) {
    trace(`coverage repair: ${last.city} endDay ${last.endDay} → ${nDays}`);
    return sorted.map((r, i) => {
      if (i !== sorted.length - 1) return r;
      return {
        ...r,
        endDay: nDays,
        endDate: isoDateAtOffset(departDate, nDays - 1),
        highlights: r.highlights.filter((h) => h.day <= nDays),
      };
    });
  }

  return sorted;
}

export const generateAiPlanSkeleton = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<GenerateAiSkeletonResult> => {
    const IS_DEV = process.env.NODE_ENV !== "production";
    const debugTrace: string[] = [];
    const trace = (msg: string) => {
      console.log(`[AiPlan:Skeleton] ${msg}`);
      if (IS_DEV) debugTrace.push(msg);
    };
    const withDebug = (result: GenerateAiSkeletonResult): GenerateAiSkeletonResult =>
      IS_DEV && debugTrace.length ? { ...result, debug: [...debugTrace] } : result;

    if (!process.env.GEMINI_API_KEY) {
      return withDebug({ skeleton: null, error: "GEMINI_API_KEY ni nastavljen" });
    }
    trace(
      `GEMINI ready: key len=${process.env.GEMINI_API_KEY.length}, model=${process.env.SKELETON_MODEL ?? "gemini-flash-latest"}`,
    );

    const nDays = daysBetween(data.departDate, data.returnDate || undefined);
    const langCode = normalizePlanLangCode(data.language);
    const displayCurrency = normalizePlanCurrency(data.currency);
    sanitizeLangCode = langCode;
    sanitizeDisplayCurrency = displayCurrency;
    const lang = LANG_MAP[langCode] ?? langCode;
    const paceLabel =
      data.pace === "intensive" ? "intensive" : data.pace === "calm" ? "calm" : "relaxed";
    const regionBlueprint = resolveRegionBlueprint(
      nDays,
      data.destinationIata,
      data.wishes,
      data.priorities,
      data.returnFromIata,
    );
    const destHub = lookupDestination(data.destinationIata);
    const { tripClimate, regionClimate } = buildTripClimate({
      destinationIata: data.destinationIata,
      departDate: data.departDate,
      returnDate: data.returnDate || undefined,
      lang: langCode,
      priorities: data.priorities,
      wishes: data.wishes,
      regionCities: regionBlueprint?.map((b) => b.city),
    });
    const { tripHints: tripAstronomy } = buildTripAstronomy({
      departDate: data.departDate,
      returnDate: data.returnDate || undefined,
      lang: langCode,
      lat: destHub?.lat,
      lng: destHub?.lng,
      regionCities: regionBlueprint?.map((b) => b.city),
    });
    trace(
      `start skeleton ${data.originIata}→${data.destinationIata}, ${nDays} days` +
        (regionBlueprint?.length
          ? ` (blueprint: ${regionBlueprint.map((b) => b.city).join(" → ")})`
          : " (AI plans route freely)"),
    );

    try {
      const { findDuplicateCitySegments } = await import("./planValidation");

      const skeletonBase = {
        originIata: data.originIata,
        destinationIata: data.destinationIata,
        returnFromIata: data.returnFromIata,
        departDate: data.departDate,
        returnDate: data.returnDate || undefined,
        nDays,
        pax: data.pax,
        langCode,
        displayCurrency,
        paceLabel,
        isStays: data.mode === "stays",
        wishes: data.wishes,
        priorities: data.priorities,
        customPrompt: data.customPrompt,
        regionBlueprint,
        flightContext: data.flightContext,
        tripClimate,
        regionClimate,
        tripAstronomy,
      };

      let parsedMeta: {
        destinationName?: string;
        summary?: string;
        totalBudgetEur?: number;
      } | null = null;
      let regions: TripRegion[] = [];
      let coverageErr: string | null = "no regions";

      const useCatalogPicks =
        (data.pickedAttractionIds?.length ?? 0) >= MIN_CATALOG_PICKS &&
        !!regionBlueprint?.length;

      if (useCatalogPicks) {
        trace(`catalog mode: ${data.pickedAttractionIds!.length} user picks`);
        regions = rebuildRegionsFromBlueprint(
          regionBlueprint!,
          nDays,
          data.departDate,
          [],
          trace,
        );
        regions = applyCatalogPicksToRegions(regions, data.pickedAttractionIds!, langCode);
        const destLabel =
          lookupDestination(data.destinationIata)?.name ?? data.destinationIata;
        parsedMeta = {
          destinationName: sanitizeOutdatedText(destLabel),
          summary: catalogSkeletonSummary(
            data.pickedAttractionIds!,
            langCode,
            destLabel,
          ),
          totalBudgetEur: catalogSkeletonBudget(data.pickedAttractionIds!, data.pax),
        };
        coverageErr = validateSkeletonCoverage(regions, nDays);
      }

      let geminiRateLimited = false;
      let usedBlueprintFallback = false;
      const maxSkeletonAttempts = regionBlueprint?.length ? 1 : 2;

      for (let attempt = 0; useCatalogPicks ? false : attempt < maxSkeletonAttempts; attempt++) {
        const coverageRepair =
          attempt > 0 && coverageErr
            ? { error: coverageErr, lastEndDay: regions.at(-1)?.endDay ?? 0 }
            : undefined;

        if (attempt > 0) trace(`retrying skeleton with coverage_repair (last endDay ${coverageRepair?.lastEndDay})`);

        const geminiMeta: { httpStatus?: number } = {};
        const parsed = await geminiGenerateJson<{
          destinationName?: string;
          summary?: string;
          totalBudgetEur?: number;
          regions?: Partial<TripRegion>[];
        }>(
          {
            role: "skeleton",
            system: SKELETON_SYSTEM,
            user: buildSkeletonUserMessage({ ...skeletonBase, coverageRepair }),
            trace,
            label: attempt === 0 ? "skeleton" : "skeleton repair",
            maxTokens: 14_000,
            timeoutMs: 300_000,
          },
          geminiMeta,
        );

        if (geminiMeta.httpStatus === 429) geminiRateLimited = true;

        if (!parsed?.regions?.length) {
          trace(`skeleton attempt ${attempt + 1}: parse failed`);
          if (regionBlueprint?.length) break;
          continue;
        }

        parsedMeta = parsed;
        regions = parsed.regions
          .map((r) => normalizeSkeletonRegion(r, data.departDate))
          .filter((r): r is TripRegion => r !== null)
          .sort((a, b) => a.startDay - b.startDay);
        regions = repairSkeletonCoverage(regions, nDays, data.departDate, trace);
        regions = deduplicateTripHighlights(regions, trace);
        if (
          regionBlueprint?.length &&
          !lastRegionMatchesReturnHub(regions, data.returnFromIata)
        ) {
          trace(
            `return hub mismatch (need ${data.returnFromIata}) — rebuilding from blueprint`,
          );
          regions = rebuildRegionsFromBlueprint(
            regionBlueprint,
            nDays,
            data.departDate,
            regions,
            trace,
          );
        }
        coverageErr = validateSkeletonCoverage(regions, nDays);

        if (!coverageErr) break;
        trace(`coverage invalid attempt ${attempt + 1}: ${coverageErr} (last endDay ${regions.at(-1)?.endDay ?? "?"})`);
      }

      if (coverageErr) {
        regions = patchSkeletonFromBlueprint(
          regions,
          nDays,
          data.destinationIata,
          data.departDate,
          trace,
          data.wishes,
          data.returnFromIata,
        );
        coverageErr = validateSkeletonCoverage(regions, nDays);
      }

      if ((coverageErr || !parsedMeta) && regionBlueprint?.length) {
        regions = buildBlueprintFallbackSkeleton(
          regionBlueprint,
          nDays,
          data.departDate,
          data.destinationIata,
          langCode,
          trace,
        );
        parsedMeta = synthesizeSkeletonMeta(
          data.destinationIata,
          nDays,
          data.pax,
          regions,
          langCode,
        );
        coverageErr = validateSkeletonCoverage(regions, nDays);
        usedBlueprintFallback = true;
      } else if (!parsedMeta && !coverageErr && regions.length) {
        parsedMeta = synthesizeSkeletonMeta(
          data.destinationIata,
          nDays,
          data.pax,
          regions,
          langCode,
        );
      }

      if (coverageErr || !parsedMeta) {
        trace(`coverage failed: ${coverageErr ?? "no parse"}`);
        if (geminiRateLimited) {
          return withDebug({ skeleton: null, error: "error.geminiRateLimit" });
        }
        return withDebug({ skeleton: null, error: "AI plan se trenutno ne da generirati." });
      }

      const skipAiRegionFill = usedBlueprintFallback || geminiRateLimited;

      if (!useCatalogPicks && skeletonNeedsDetailFill(regions, paceLabel)) {
        console.time("SkeletonFillDetails");
        let skeletonDraft: TripSkeleton = {
          destinationName: sanitizeOutdatedText(
            textValue(parsedMeta.destinationName, data.destinationIata),
          ),
          summary: sanitizeOutdatedText(textValue(parsedMeta.summary, "")),
          totalBudgetEur: numberValue(parsedMeta.totalBudgetEur, 300),
          originIata: data.originIata,
          destinationIata: data.destinationIata,
          departDate: data.departDate,
          returnDate: data.returnDate || undefined,
          regions,
        };
        if (skipAiRegionFill) {
          trace("skipping per-region Gemini fill — programmatic tips only");
          skeletonDraft = applyProgrammaticSkeletonFill(skeletonDraft, langCode);
        } else {
          skeletonDraft = await fillSkeletonDetails(
            skeletonDraft,
            langCode,
            paceLabel,
            trace,
            data.flightContext,
          );
        }
        regions = skeletonDraft.regions;
        console.timeEnd("SkeletonFillDetails");
      }

      regions = deduplicateTripHighlights(regions, trace);
      regions = ensureTripBangkokMustSeeHighlights(
        regions,
        data.flightContext ? arrivalTripDay(data.flightContext) : 2,
      );
      regions = ensureEveryDayHasHighlight(regions);
      regions = injectVietnamCuratedHighlights(regions, langCode);
      regions = clampSkeletonRegions(regions);

      const accommodationMode = detectAccommodationMode(data.wishes, data.customPrompt);
      const hotelRestEveryNDays =
        accommodationMode === "motorhome"
          ? detectHotelRestInterval(data.wishes, data.customPrompt) ?? undefined
          : undefined;

      let skeleton: TripSkeleton = {
        destinationName: sanitizeOutdatedText(
          textValue(parsedMeta.destinationName, data.destinationIata),
        ),
        summary: clampSkeletonText(
          sanitizeOutdatedText(textValue(parsedMeta.summary, "")),
          350,
        ),
        totalBudgetEur: numberValue(parsedMeta.totalBudgetEur, 300),
        originIata: data.originIata,
        destinationIata: data.destinationIata,
        returnFromIata: data.returnFromIata,
        departDate: data.departDate,
        returnDate: data.returnDate || undefined,
        accommodationMode,
        hotelRestEveryNDays,
        regions,
      };

      console.time("SkeletonPostProcess");
      skeleton = await postProcessSkeletonRegions(
        skeleton,
        nDays,
        data.destinationIata,
        trace,
        data.flightContext,
      );

      const astronomy = await attachSkeletonAstronomy(
        skeleton.regions,
        skeleton.departDate,
        skeleton.returnDate,
      );
      if (astronomy.tideByRegion) {
        skeleton = { ...skeleton, astronomy };
        trace(`astronomy: tide data for ${Object.keys(astronomy.tideByRegion).join(", ")}`);
      }

      let preview = skeletonToPreviewPlan(skeleton, {
        flights: data.flightContext,
        lang: langCode,
        originIata: data.originIata,
        destinationIata: data.destinationIata,
        returnFromIata: data.returnFromIata,
        pax: data.pax,
      });
      console.timeEnd("SkeletonPostProcess");
      let cityViolations = findDuplicateCitySegments(preview);

      if (cityViolations.length && regionBlueprint?.length) {
        trace(
          `routing retry: ${cityViolations.map((v) => v.message).join("; ")} → blueprint`,
        );
        const rebuilt = rebuildRegionsFromBlueprint(
          regionBlueprint,
          nDays,
          data.departDate,
          skeleton.regions,
          trace,
        );
        skeleton = await postProcessSkeletonRegions(
          {
            ...skeleton,
            regions: ensureEveryDayHasHighlight(rebuilt),
          },
          nDays,
          data.destinationIata,
          trace,
          data.flightContext,
        );
        preview = skeletonToPreviewPlan(skeleton, {
          flights: data.flightContext,
          lang: langCode,
          originIata: data.originIata,
          destinationIata: data.destinationIata,
          returnFromIata: data.returnFromIata,
          pax: data.pax,
        });
        cityViolations = findDuplicateCitySegments(preview);
      }

      if (cityViolations.length) {
        trace(`routing blocked: ${cityViolations.map((v) => v.message).join("; ")}`);
        return withDebug({ skeleton: null, error: "error.invalidItinerary" });
      }

      trace(
        `complete: ${skeleton.regions.length} regions, ${skeleton.regions.reduce((n, r) => n + r.highlights.length, 0)} highlights`,
      );
      return withDebug({ skeleton, error: null });
    } catch (err) {
      trace(`fatal: ${err instanceof Error ? err.message : String(err)}`);
      return withDebug({ skeleton: null, error: "AI plan se trenutno ne da generirati." });
    }
  });
