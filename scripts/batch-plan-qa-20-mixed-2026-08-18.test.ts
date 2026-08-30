/**
 * Live QA ×20 — 7 flight + 7 car + 6 motorhome. Diverse origins, human copy.
 *
 * NODE_USE_ENV_PROXY=1 RUN_LIVE_PLAN_QA=1 RESUME=1 npx vitest run scripts/batch-plan-qa-20-mixed-2026-08-18.test.ts --testTimeout 18000000 --pool=forks
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { buildCatalogPlanFromResponse, finalizeMergedStreamPlan } from "@/lib/geminiProCatalog";
import { createTripPlanStream, generateTripPlan } from "@/lib/geminiPro";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import {
  buildGeminiTripPlanParams,
  GEMINI_STREAM_MAX_BATCHES,
  hasAcceptablePlanDayCoverage,
  nextIncompleteDayRange,
  streamBatchSize,
  tripDayCount,
} from "@/lib/geminiPro.functions";
import {
  alignBatchDays,
  mergeStreamedTripPlans,
  planLastCity,
  planVisitedCities,
} from "@/lib/geminiStreamBatches";
import { partialTripPlanToPreviewPlan } from "@/lib/geminiStreamMap";
import { applyItineraryGuards } from "@/lib/itineraryGuards";
import { finalizeItineraryMapCoords } from "@/lib/itineraryMapModel";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";
import { collectMotorhomeRoadTripStops } from "@/lib/motorhomeRoute";
import { buildPdfPlanTitle } from "@/lib/pdfPlanTitle";
import { generatePlanPdf } from "@/lib/pdf-export";
import { geminiApiKey } from "@/lib/llm";
import { haversineKm } from "@/lib/geoMath";
import { HARD_DRIVE_HOURS, TARGET_DRIVE_HOURS } from "@/lib/plannerQuality";

function loadEnvLocal() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      /* missing */
    }
  }
}

loadEnvLocal();

type Kind = "flight" | "car" | "motorhome";

type Scenario = {
  id: string;
  kind: Kind;
  region: string;
  originIata: string;
  originPlace: string;
  destinationIata: string;
  destinationPlace: string;
  departDate: string;
  returnDate: string;
  budget: "budget" | "standard" | "premium";
  pace: "intensive" | "relaxed" | "calm";
  paxAdults: number;
  wishes: string;
  expectHints: string[];
  flightContext?: GenerateGeminiProTripInput["flightContext"];
};

const VOICE =
  " Piši človeško: konkretni nasveti (ure, cene, kako priti, kje kupiti karto), imenovani lokali. PREPOVEDANO brošuro: 'Uživajte v', 'kulturni dragulj', 'avtentična kuhinja', 'lahkoten sprehod v okolici namestitve'.";

const SCENARIOS: Scenario[] = [
  {
    id: "FL-01-NYC",
    kind: "flight",
    region: "North America",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "JFK",
    destinationPlace: "New York",
    departDate: "2026-11-05",
    returnDate: "2026-11-14",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "NYC: Brooklyn + Manhattan, 1 muzej/dan, Statue+Ellis pol dneva. Zadnji dan = odhod z JFK (ne v sredini poti). Metro/OMNY, ne Oyster." +
      VOICE,
    expectHints: ["brooklyn", "manhattan", "central park", "metro", "omny", "jfk"],
    flightContext: {
      outboundDepart: "10:40",
      outboundArrive: "14:10",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:30",
      inboundArrive: "08:15",
    },
  },
  {
    id: "FL-02-Tajska",
    kind: "flight",
    region: "Asia",
    originIata: "VIE",
    originPlace: "Dunaj",
    destinationIata: "BKK",
    destinationPlace: "Tajska",
    departDate: "2026-11-08",
    returnDate: "2026-11-21",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Tajska: Bangkok ≥3 noči, potem Krabi ali Chiang Mai — ne 8 mest. Zadnji dan = odhod iz BKK, ne v sredini. BTS/Grab, ne tuk-tuk scam." +
      VOICE,
    expectHints: ["bangkok", "bts", "grand palace", "krabi", "chiang"],
    flightContext: {
      outboundDepart: "21:50",
      outboundArrive: "14:20",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:40",
      inboundArrive: "05:55",
    },
  },
  {
    id: "FL-03-Vietnam",
    kind: "flight",
    region: "Asia",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "SGN",
    destinationPlace: "Vietnam",
    departDate: "2026-10-18",
    returnDate: "2026-10-30",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Vietnam: Saigon ≥2 noči, Hoi An ali Hanoi+Ha Long. Open-jaw OK (SGN→HAN). Zadnji dan = mednarodni odhod, ne dan 6." +
      VOICE,
    expectHints: ["saigon", "ho chi minh", "hoi an", "hanoi", "ben thanh"],
    flightContext: {
      outboundDepart: "19:10",
      outboundArrive: "13:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "22:15",
      inboundArrive: "06:05",
    },
  },
  {
    id: "FL-04-CapeTown",
    kind: "flight",
    region: "Africa",
    originIata: "FRA",
    originPlace: "Frankfurt",
    destinationIata: "CPT",
    destinationPlace: "Cape Town",
    departDate: "2026-11-12",
    returnDate: "2026-11-24",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Cape Town ≥4 noči (Table Mountain, Cape Point, Stellenbosch). Ne Kruger isti teden. Zadnji dan = odhod iz CPT." +
      VOICE,
    expectHints: ["table mountain", "cape point", "stellenbosch", "camps bay", "waterfront"],
    flightContext: {
      outboundDepart: "21:05",
      outboundArrive: "10:20",
      outboundArriveDayOffset: 1,
      inboundDepart: "19:00",
      inboundArrive: "06:40",
    },
  },
  {
    id: "FL-05-Island",
    kind: "flight",
    region: "Europe",
    originIata: "VIE",
    originPlace: "Dunaj",
    destinationIata: "KEF",
    destinationPlace: "Island",
    departDate: "2026-09-10",
    returnDate: "2026-09-18",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Island: Reykjavik ≥2 noči, Golden Circle, južna obala. Najem avta na otoku je OK. Zadnji dan = odhod iz KEF, ne v sredini." +
      VOICE,
    expectHints: ["reykjavik", "golden circle", "gullfoss", "skogafoss", "blue lagoon"],
    flightContext: {
      outboundDepart: "12:40",
      outboundArrive: "14:55",
      outboundArriveDayOffset: 0,
      inboundDepart: "07:20",
      inboundArrive: "13:10",
    },
  },
  {
    id: "FL-06-Yucatan",
    kind: "flight",
    region: "North America",
    originIata: "AMS",
    originPlace: "Amsterdam",
    destinationIata: "CUN",
    destinationPlace: "Jukatan / Cancún",
    departDate: "2026-11-03",
    returnDate: "2026-11-14",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Jukatan: Cancún prihod, Tulum ≥2 noči, Valladolid/Chichén, zadnja noč ob letališču. Zadnji dan = odhod iz CUN." +
      VOICE,
    expectHints: ["tulum", "chichen", "cenote", "valladolid", "cancun"],
    flightContext: {
      outboundDepart: "10:15",
      outboundArrive: "15:40",
      outboundArriveDayOffset: 0,
      inboundDepart: "17:55",
      inboundArrive: "09:20",
    },
  },
  {
    id: "FL-07-Bali",
    kind: "flight",
    region: "Asia",
    originIata: "ZRH",
    originPlace: "Zürich",
    destinationIata: "DPS",
    destinationPlace: "Bali",
    departDate: "2026-10-08",
    returnDate: "2026-10-21",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Bali: Ubud ≥3 noči, obala (Canggu ali Uluwatu), ne 1 noč v Ubudu. Zadnji dan = odhod iz DPS, ne dan 6/12." +
      VOICE,
    expectHints: ["ubud", "canggu", "uluwatu", "rice terrace", "temple"],
    flightContext: {
      outboundDepart: "20:40",
      outboundArrive: "18:10",
      outboundArriveDayOffset: 1,
      inboundDepart: "21:05",
      inboundArrive: "06:30",
    },
  },
  {
    id: "AV-01-Hrvaska",
    kind: "car",
    region: "Europe",
    originIata: "GRZ",
    originPlace: "Gradec",
    destinationIata: "SPU",
    destinationPlace: "Hrvaška / Dalmacija",
    departDate: "2026-09-04",
    returnDate: "2026-09-14",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avto + hoteli vsako noč. Gradec → Dalmacija (Split ≥2 noči, Hvar ali Brač trajekt OK, Dubrovnik če etape ≤5 h). Povratek v Gradec. PREPOVEDANO kampi." +
      VOICE,
    expectHints: ["split", "dubrovnik", "trogir", "hvar", "zadar"],
  },
  {
    id: "AV-02-Portugalska",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "LIS",
    destinationPlace: "Portugalska",
    departDate: "2026-09-18",
    returnDate: "2026-10-02",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avto + hoteli. Ljubljana → Portugalska (Porto ≥2, Lisboa ≥2). Etape ≤5 h, nočitve v Franciji/Španiji vmes. PREPOVEDANO kampi. Povratek v Ljubljano." +
      VOICE,
    expectHints: ["porto", "lisboa", "lisbon", "coimbra", "sintra"],
  },
  {
    id: "AV-03-Alpe",
    kind: "car",
    region: "Europe",
    originIata: "MBX",
    originPlace: "Maribor",
    destinationIata: "MUC",
    destinationPlace: "Bavarska / Tirolska",
    departDate: "2026-09-08",
    returnDate: "2026-09-17",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avto + hoteli. Maribor → Tirolska / Bavarska (Innsbruck, Zugspitze, München ≥2 noči). Kratke gorske etape ≤5 h. PREPOVEDANO kampi. Povratek v Maribor." +
      VOICE,
    expectHints: ["innsbruck", "munich", "münchen", "garmisch", "salzburg"],
  },
  {
    id: "AV-04-Benelux",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Celje",
    destinationIata: "AMS",
    destinationPlace: "Nizozemska / Belgija",
    departDate: "2026-10-02",
    returnDate: "2026-10-13",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avto + hoteli. Celje → Benelux (Amsterdam ≥2, Brugge ali Bruselj ≥2). Etape ≤5 h, nočitve v Nemčiji vmes. PREPOVEDANO kampi. Povratek v Celje." +
      VOICE,
    expectHints: ["amsterdam", "brugge", "bruges", "brussels", "rotterdam"],
  },
  {
    id: "AV-05-Ceska",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Kranj",
    destinationIata: "PRG",
    destinationPlace: "Češka",
    departDate: "2026-09-22",
    returnDate: "2026-10-01",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avto + hoteli. Kranj → Češka (Praga ≥3 noči, Český Krumlov ali Brno). PREPOVEDANO kampi. Etape ≤5 h. Povratek v Kranj." +
      VOICE,
    expectHints: ["prague", "praha", "krumlov", "charles", "brno"],
  },
  {
    id: "AV-06-Svica",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Nova Gorica",
    destinationIata: "ZRH",
    destinationPlace: "Švica",
    departDate: "2026-09-11",
    returnDate: "2026-09-20",
    budget: "premium",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avto + hoteli. Nova Gorica → Švica (Luzern, Interlaken, Zermatt če gre brez 7 h). Parkiraj zunaj, v center z vlakom. PREPOVEDANO kampi. Povratek." +
      VOICE,
    expectHints: ["lucerne", "luzern", "interlaken", "zermatt", "geneva"],
  },
  {
    id: "AV-07-Poljska",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Murska Sobota",
    destinationIata: "KRK",
    destinationPlace: "Poljska / Krakov",
    departDate: "2026-10-06",
    returnDate: "2026-10-16",
    budget: "budget",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avto + hoteli. Murska Sobota → Poljska (Krakov ≥3 noči, Zakopane ali Wrocław). Etape ≤5 h. PREPOVEDANO kampi. Povratek." +
      VOICE,
    expectHints: ["krakow", "kraków", "zakopane", "wawel", "auschwitz"],
  },
  {
    id: "MH-01-Hrvaska",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Slovenj Gradec",
    destinationIata: "SPU",
    destinationPlace: "Hrvaška / Dalmacija",
    departDate: "2026-09-05",
    returnDate: "2026-09-15",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom Slovenj Gradec → Dalmacija. KAMPI ob obali, ne hoteli v Splitu. Split/Trogir ≥2 noči na kampu. Etape ≤5 h. Povratek." +
      VOICE,
    expectHints: ["split", "trogir", "zadar", "krka", "makarska"],
  },
  {
    id: "MH-02-Portugalska",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "LIS",
    destinationPlace: "Portugalska",
    departDate: "2026-09-19",
    returnDate: "2026-10-03",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avtodom LJU → Portugalska (Algarve / Lisboa kampi zunaj centra). Kampi, ne city hoteli. Etape ≤5 h, nočitve vmes. Povratek." +
      VOICE,
    expectHints: ["algarve", "lisboa", "lagos", "porto", "sintra"],
  },
  {
    id: "MH-03-Alpe",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Celje",
    destinationIata: "INN",
    destinationPlace: "Alpe / Tirolska",
    departDate: "2026-09-09",
    returnDate: "2026-09-18",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom Celje → Tirolska / Bavarska. Stellplatz/kampi, ne hoteli v Innsbrucku. Kratke gorske etape. Povratek." +
      VOICE,
    expectHints: ["innsbruck", "garmisch", "tirol", "salzburg", "zugspitze"],
  },
  {
    id: "MH-04-Nemcija",
    kind: "motorhome",
    region: "Europe",
    originIata: "MBX",
    originPlace: "Maribor",
    destinationIata: "NUE",
    destinationPlace: "Nemčija / Romantic Road",
    departDate: "2026-09-21",
    returnDate: "2026-10-02",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avtodom Maribor → Romantic Road (Rothenburg, Füssen, München območje). Kampi, ne city hoteli. Etape ≤5 h. Povratek." +
      VOICE,
    expectHints: ["rothenburg", "fussen", "neuschwanstein", "nuremberg", "munich"],
  },
  {
    id: "MH-05-Danija",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Ptuj",
    destinationIata: "CPH",
    destinationPlace: "Danska",
    departDate: "2026-08-28",
    returnDate: "2026-09-12",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avtodom Ptuj → Danska (Kopenhagen kamp zunaj, Skagen ali Jutland). 3 dni tja, 3 nazaj, vmes kampi. PREPOVEDANO 12 h isti dan. Povratek." +
      VOICE,
    expectHints: ["copenhagen", "kopenhagen", "skagen", "aarhus", "odense"],
  },
  {
    id: "MH-06-Bretanja",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Koper",
    destinationIata: "RNS",
    destinationPlace: "Bretanja / Francija",
    departDate: "2026-09-16",
    returnDate: "2026-09-30",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom Koper → Bretanja (Saint-Malo, Quiberon, kampi ob obali). Ni Lyon/Provence. Kampi, ne hoteli. Etape ≤5 h. Povratek." +
      VOICE,
    expectHints: ["saint-malo", "bretagne", "quiberon", "rennes", "mont saint"],
  },
];

const LIVE = process.env.RUN_LIVE_PLAN_QA === "1" && Boolean(geminiApiKey());
const DATE_TAG = "mixed-20-2026-08-18";
const OUT = resolve(process.cwd(), `.tmp-plan-${DATE_TAG}`);
const EXPORT = resolve(process.cwd(), `plan-exports/${DATE_TAG}`);
const DESKTOP = resolve(process.env.HOME ?? "", "Desktop/skybooplan-20-planov-2026-08-18");
const BATCH_MS = 480_000;

function planBlob(plan: AiTripPlan): string {
  return plan.days
    .flatMap((d) => [
      d.city,
      d.title,
      d.morning,
      d.afternoon,
      d.evening,
      ...(d.activities?.morning ?? []).map((a) => `${a.name} ${a.description}`),
      ...(d.activities?.afternoon ?? []).map((a) => `${a.name} ${a.description}`),
      ...(d.activities?.evening ?? []).map((a) => `${a.name} ${a.description}`),
    ])
    .join(" ");
}

function parseHm(t?: string | null): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function driveHours(day: DayPlan): number {
  const raw = String(day.drivingDurationHours ?? day.transport?.duration ?? "");
  return Number(raw.replace(",", ".").match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
}

function dayActs(day: DayPlan) {
  return [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
}

function buildInput(s: Scenario): GenerateGeminiProTripInput {
  return {
    originIata: s.originIata,
    destinationIata: s.destinationIata,
    departDate: s.departDate,
    returnDate: s.returnDate,
    pax: { adults: s.paxAdults, childrenAges: [] },
    budget: s.budget,
    wishTags: [],
    customWishes: s.wishes,
    pace: s.pace,
    originPlace: s.originPlace,
    destinationPlace: s.destinationPlace,
    language: "sl",
    ...(s.kind === "flight"
      ? { flightContext: s.flightContext }
      : { groundTransportMode: s.kind }),
  };
}

async function generateStreamedPlan(s: Scenario): Promise<AiTripPlan> {
  const expectedDays = tripDayCount(s.departDate, s.returnDate);
  const input = buildInput(s);
  const batchSize = streamBatchSize(expectedDays);
  const pax = s.paxAdults;
  let accumulated: AiTripPlan | null = null;

  for (let batch = 0; batch < GEMINI_STREAM_MAX_BATCHES; batch++) {
    if (accumulated && hasAcceptablePlanDayCoverage(accumulated.days.length, expectedDays)) {
      break;
    }
    const range = nextIncompleteDayRange(accumulated?.days.length ?? 0, expectedDays, batchSize);
    if (!range) break;

    const baseParams = buildGeminiTripPlanParams(input, expectedDays);
    const planParams = {
      ...baseParams,
      dayRange: {
        start: range.start,
        end: range.end,
        visitedCities: planVisitedCities(accumulated),
        lastCity: planLastCity(accumulated),
      },
    };

    let progressed = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const daysBefore = accumulated?.days.length ?? 0;
      try {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), BATCH_MS);
        try {
          const result = createTripPlanStream(planParams, { abortSignal: abort.signal });
          for await (const partial of result.partialObjectStream) {
            if (abort.signal.aborted) break;
            const preview = partialTripPlanToPreviewPlan(partial, {
              originIata: input.originIata,
              destinationIata: input.destinationIata,
              departDate: input.departDate,
              wishesText: s.wishes,
              groundTransportMode: input.groundTransportMode,
              originPlace: input.originPlace,
              destinationPlace: input.destinationPlace,
              language: "sl",
              budget: input.budget,
              pax,
              pace: input.pace,
              enrich: false,
            });
            if (!preview?.days.length) continue;
            accumulated = mergeStreamedTripPlans(
              accumulated,
              alignBatchDays(preview, range),
              pax,
            );
          }
          try {
            const finalObject = await result.object;
            const built = buildCatalogPlanFromResponse(finalObject, input, {
              expandToExpectedDays: false,
            });
            if (built.plan) {
              accumulated = mergeStreamedTripPlans(
                accumulated,
                alignBatchDays(built.plan, range),
                pax,
              );
            }
          } catch (objectErr) {
            console.warn(
              `[MIX20] ${s.id} batch ${range.start}-${range.end} object:`,
              objectErr instanceof Error ? objectErr.message : objectErr,
            );
          }
        } finally {
          clearTimeout(timer);
        }
        const daysAfter = accumulated?.days.length ?? 0;
        if (daysAfter > daysBefore) {
          progressed = true;
          console.log(
            `[MIX20] ${s.id} batch ${range.start}-${range.end} → ${daysAfter} days (attempt ${attempt})`,
          );
          break;
        }
      } catch (err) {
        console.warn(
          `[MIX20] ${s.id} batch ${range.start}-${range.end} abort/fail attempt ${attempt}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    if (!progressed) break;
  }

  if (!accumulated?.days.length) {
    throw new Error("stream produced no days");
  }
  return finalizeMergedStreamPlan(accumulated, input);
}

async function generateFallbackPlan(s: Scenario): Promise<AiTripPlan> {
  const expectedDays = tripDayCount(s.departDate, s.returnDate);
  const input = buildInput(s);
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await generateTripPlan(buildGeminiTripPlanParams(input, expectedDays));
      const built = buildCatalogPlanFromResponse(raw, input);
      if (built.plan) return built.plan;
      lastError = built.error ?? "no plan";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError ?? "fallback generate failed");
}

function analyze(plan: AiTripPlan, s: Scenario, expectedDays: number) {
  const issues: string[] = [];
  const warnings: string[] = [];
  const blob = planBlob(plan);
  const blobL = blob.toLowerCase();
  const cities = [...new Set(plan.days.map((d) => d.city).filter(Boolean))];
  const lastDay = Math.max(...plan.days.map((d) => d.day), 0);
  const last = plan.days[plan.days.length - 1];

  if (!hasAcceptablePlanDayCoverage(lastDay, expectedDays)) {
    issues.push(`coverage ${lastDay}/${expectedDays}`);
  }

  const hintHits = s.expectHints.filter((h) => blobL.includes(h.toLowerCase()));
  if (hintHits.length === 0) {
    warnings.push(`no expectHints matched (${s.expectHints.join(", ")})`);
  }

  const intlRe =
    /mednarodn[ei]\s+odhod|return flight|inboundDepart|povratn[ei]\s+let|international (?:flight|depart)/i;
  for (const day of plan.days) {
    const text = `${day.title} ${day.city} ${JSON.stringify(day.activities ?? {})}`;
    if (day.day !== lastDay && intlRe.test(text)) {
      const clock = text.match(/15:20/) ? " (vključno 15:20)" : "";
      issues.push(
        `D${day.day} ima mednarodni odhod / povratni let na NEzadnjem dnevu${clock}`,
      );
    }
    if (day.day !== lastDay && /15:20/.test(text) && /odhod|let|flight|letališč/i.test(text)) {
      issues.push(`D${day.day} ura 15:20 ob letališču/odhodu (sum na stamp batch-end)`);
    }
  }

  for (const day of plan.days) {
    const hours = driveHours(day);
    if (
      (s.kind === "car" || s.kind === "motorhome") &&
      hours > HARD_DRIVE_HOURS &&
      !/nočitev vmes|split with an overnight/i.test(`${day.title} ${day.transportationTips ?? ""}`)
    ) {
      issues.push(`D${day.day} vožnja ~${hours} h (>${HARD_DRIVE_HOURS} h) brez razdelitve`);
    } else if ((s.kind === "car" || s.kind === "motorhome") && hours > TARGET_DRIVE_HOURS + 0.25) {
      warnings.push(`D${day.day} vožnja ~${hours} h (cilj ≤${TARGET_DRIVE_HOURS} h)`);
    }
    if (
      /alban|tiran|berat|vlor|sarand|kotor|shkod/i.test(day.city ?? "") &&
      /zagreb|ljubljana|dunaj|vienna|split/i.test(`${day.title} ${JSON.stringify(day.activities)}`) &&
      hours >= 8
    ) {
      issues.push(`D${day.day} sum na Albanija/Kotor → Zagreb/Split isti dan`);
    }
  }

  if (expectedDays >= 7) {
    const runs = new Map<string, number>();
    let prev = "";
    let run = 0;
    const flush = () => {
      if (prev) runs.set(prev, Math.max(runs.get(prev) ?? 0, run));
    };
    for (const day of plan.days) {
      if (day.inFlightDay) continue;
      const key = (day.city ?? "").trim().toLowerCase();
      if (!key) continue;
      if (key === prev) run += 1;
      else {
        flush();
        prev = key;
        run = 1;
      }
    }
    flush();
    const major =
      /kyoto|kjoto|paris|pariz|kotor|florence|firenc|rome|rim\b|tokyo|tokio|barcelona|lyon|cusco|delhi|jaipur|marrakech/i;
    for (const [city, n] of runs) {
      if (n === 1 && major.test(city)) {
        issues.push(`1 noč hit-and-run v ${city} (pot ≥7 dni)`);
      }
    }
  }

  const namedHotel =
    /\bhotel\s+[A-ZČŠŽ][\w'’-]{2,}|Tinidee|Hilton |Marriott |Ibis |Novotel /i;
  if (s.kind !== "motorhome") {
    for (const h of plan.hotels ?? []) {
      const name = String((h as { name?: string }).name ?? "");
      if (namedHotel.test(name) && !/booking|city|območj/i.test(name)) {
        warnings.push(`hotels[] ime "${name}" (raje samo city+nights)`);
      }
    }
    for (const day of plan.days) {
      for (const a of dayActs(day)) {
        if (/prihod v hotel|check-in/i.test(a.name) && namedHotel.test(a.name + a.description)) {
          warnings.push(`D${day.day} konkretno ime hotela v aktivnosti`);
        }
      }
    }
  }

  for (const day of plan.days) {
    for (const a of dayActs(day)) {
      if (
        /^(lokaln[ae]\s+večerja|lokalno\s+kosilo|local dinner|local lunch)$/i.test(a.name.trim()) &&
        !/[A-ZČŠŽ][\w]{2,}/.test(a.description ?? "")
      ) {
        issues.push(`D${day.day} generični obrok "${a.name}" brez lokala`);
      }
    }
  }

  const brochure =
    /uživajte v (avtentični|fine dining|prijetni|čudoviti)|kulturni( in zgodovinski)? dragulj|lahkoten sprehod v okolici|spoznavanje s prvim okoljem/i;
  if (brochure.test(blob)) {
    warnings.push("brošurni/generični slog v opisih");
  }

  if (s.kind === "motorhome") {
    if (plan.accommodationMode !== "motorhome") {
      issues.push("motorhome plan nima accommodationMode=motorhome");
    }
    const hotelish = /hotel v centru|city.?center hotel|check-in.*hotel/i;
    if (hotelish.test(blob) && !/kamp|camp|sosta|rv park/i.test(blobL)) {
      issues.push("avtodom izgleda kot hotelski plan (ni kampov)");
    }
    const stops = collectMotorhomeRoadTripStops(plan);
    if (stops.length < 2) issues.push("motorhome Maps stops < 2");
    if (stops.length >= 2) {
      const start = stops[0]!.toLowerCase();
      const end = stops[stops.length - 1]!.toLowerCase();
      if (start !== end) {
        issues.push(`Maps se ne zapre na origin ("${stops[0]}" → "${stops[stops.length - 1]}")`);
      }
    }
  }

  if (s.kind === "car") {
    if (plan.accommodationMode === "motorhome") {
      issues.push("avto plan ima accommodationMode=motorhome");
    }
    if (/\bkamp\b|campground|sosta|rv park/i.test(blobL) && /nočit|overnight|sleep/i.test(blobL)) {
      warnings.push("avto plan omenja kamp kot nočitev");
    }
  }

  if (s.kind === "flight" && last) {
    const lastText = `${last.title} ${JSON.stringify(last.activities ?? {})}`;
    if (!/let|flight|odhod|letališč|airport|povrat/i.test(lastText)) {
      warnings.push(`zadnji dan D${last.day} nima očitnega mednarodnega odhoda`);
    }
  }

  if (s.kind === "car" || s.kind === "motorhome") {
    for (let i = 1; i < plan.days.length; i++) {
      const a = plan.days[i - 1]!;
      const b = plan.days[i]!;
      if (
        typeof a.lat === "number" &&
        typeof a.lng === "number" &&
        typeof b.lat === "number" &&
        typeof b.lng === "number"
      ) {
        const km = haversineKm([a.lng, a.lat], [b.lng, b.lat]);
        if (km > 900) issues.push(`D${a.day}→D${b.day} hop ~${Math.round(km)} km`);
        else if (km > 650) warnings.push(`D${a.day}→D${b.day} hop ~${Math.round(km)} km`);
      }
    }
  }

  const sense =
    issues.length === 0 ? (warnings.length === 0 ? "OK" : "OK_WITH_WARNINGS") : "FAIL";

  return {
    destinationName: plan.destinationName,
    cities,
    expectedDays,
    maxDay: lastDay,
    hintHits,
    issues,
    warnings,
    ok: issues.length === 0,
    sense,
    mapsStops:
      s.kind === "motorhome" || s.kind === "car"
        ? collectMotorhomeRoadTripStops(plan).slice(0, 16)
        : undefined,
  };
}

function writePlanReport(
  destDir: string,
  s: Scenario,
  analysis: ReturnType<typeof analyze>,
  extra?: { status: string; error?: string; days?: number },
) {
  const lines = [
    `# ${s.id} — napake`,
    "",
    `- Vrsta: ${s.kind}`,
    `- Pot: ${s.originPlace} → ${s.destinationPlace}`,
    `- Datumi: ${s.departDate} – ${s.returnDate} (${analysis.expectedDays} dni)`,
    `- Status: ${extra?.status ?? analysis.sense}`,
    `- Mesta: ${(analysis.cities ?? []).join(", ") || "—"}`,
    "",
    "## Napake",
    "",
    ...(analysis.issues.length ? analysis.issues.map((x) => `- ${x}`) : ["- (ni avtomatskih napak)"]),
    "",
    "## Opozorila",
    "",
    ...(analysis.warnings.length
      ? analysis.warnings.map((x) => `- ${x}`)
      : ["- (ni opozoril)"]),
    "",
    extra?.error ? `## Generator\n\n${extra.error}\n` : "",
  ];
  writeFileSync(resolve(destDir, `${s.id}-napake.md`), lines.join("\n"));
}

const LIVE_OK = LIVE;

describe.runIf(LIVE_OK)("batch mixed QA ×20 (7 FL + 7 AV + 6 MH)", () => {
  it(
    "generates 15 plans, PDFs, Desktop copy, reports",
    async () => {
      expect(geminiApiKey()).toBeTruthy();
      mkdirSync(OUT, { recursive: true });
      mkdirSync(EXPORT, { recursive: true });
      mkdirSync(DESKTOP, { recursive: true });

      const resume = process.env.RESUME !== "0";
      const results: Array<Record<string, unknown>> = [];

      for (const s of SCENARIOS) {
        const jsonPath = resolve(OUT, `${s.id}.json`);
        const started = Date.now();
        const expectedDays = tripDayCount(s.departDate, s.returnDate);
        let entry: Record<string, unknown> = {
          id: s.id,
          kind: s.kind,
          region: s.region,
          route: `${s.originPlace} → ${s.destinationPlace}`,
          expectedDays,
        };

        try {
          let plan: AiTripPlan | null = null;
          if (resume && existsSync(jsonPath)) {
            plan = JSON.parse(readFileSync(jsonPath, "utf8")) as AiTripPlan;
            if (!plan?.days?.length) plan = null;
            else entry.cached = true;
          }

          if (!plan) {
            try {
              plan = await generateStreamedPlan(s);
            } catch (streamErr) {
              console.warn(
                `[MIX20] ${s.id} stream failed, fallback generateTripPlan:`,
                streamErr instanceof Error ? streamErr.message : streamErr,
              );
              plan = await generateFallbackPlan(s);
            }
            writeFileSync(jsonPath, JSON.stringify(plan, null, 2));
          }

          applyItineraryGuards(plan, { arrivalDay: 1, language: "sl" });
          if (s.kind === "motorhome") enrichMotorhomePlanTips(plan, "sl");
          finalizeItineraryMapCoords(plan);
          writeFileSync(jsonPath, JSON.stringify(plan, null, 2));

          const analysis = analyze(plan, s, expectedDays);
          const title = buildPdfPlanTitle({
            groundTransportMode:
              plan.groundTransportMode ?? (s.kind === "flight" ? undefined : s.kind),
            accommodationMode: plan.accommodationMode,
            originPlace: plan.originPlace ?? s.originPlace,
            destinationPlace: plan.destinationPlace ?? s.destinationPlace,
            destinationName: plan.destinationName,
            from: s.originIata,
            to: s.destinationIata,
          });

          const pdf = await generatePlanPdf({
            title,
            destination: plan.destinationName || s.destinationPlace,
            start_date: s.departDate,
            end_date: s.returnDate,
            itinerary: plan as never,
            language: "sl",
            pax: s.paxAdults,
            wishes: s.wishes,
            travel_pace: s.pace,
          });
          const pdfBuf = Buffer.from(pdf.buffer);
          writeFileSync(resolve(OUT, `${s.id}.pdf`), pdfBuf);
          writeFileSync(resolve(EXPORT, `${s.id}.pdf`), pdfBuf);
          writeFileSync(resolve(DESKTOP, `${s.id}.pdf`), pdfBuf);
          writeFileSync(resolve(DESKTOP, `${s.id}.json`), readFileSync(jsonPath));

          writePlanReport(DESKTOP, s, analysis, {
            status: analysis.ok ? "ok" : "issues",
            days: plan.days.length,
          });

          entry = {
            ...entry,
            status: analysis.ok ? "ok" : "issues",
            ms: Date.now() - started,
            days: plan.days.length,
            title,
            ...analysis,
            pdf: `${s.id}.pdf`,
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          entry = {
            ...entry,
            status: "error",
            sense: "FAIL",
            error,
            ms: Date.now() - started,
          };
          const failNote = [
            `# ${s.id} — FAILED`,
            "",
            error,
            "",
            "Placeholder: generator ni vrnil načrta. PDF ni ustvarjen.",
            "",
          ].join("\n");
          writeFileSync(resolve(DESKTOP, `${s.id}-FAILED.md`), failNote);
          writeFileSync(resolve(DESKTOP, `${s.id}-napake.md`), failNote);
        }

        results.push(entry);
        writeFileSync(resolve(OUT, "report-live.json"), JSON.stringify({ results }, null, 2));
        console.log(
          `[MIX20] ${s.id} ${entry.status}/${entry.sense} days=${entry.days ?? "-"}/${expectedDays} ${entry.ms}ms`,
          entry.error ?? (Array.isArray(entry.issues) ? entry.issues : "") ?? "",
        );
      }

      const ok = results.filter((r) => r.status === "ok").length;
      const issuesN = results.filter((r) => r.status === "issues").length;
      const fail = results.filter((r) => r.status === "fail" || r.status === "error").length;
      const report = {
        generatedAt: new Date().toISOString(),
        desktopFolder: DESKTOP,
        totals: { ok, issues: issuesN, fail, generated: ok + issuesN },
        results,
      };
      writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
      writeFileSync(resolve(EXPORT, "report.json"), JSON.stringify(report, null, 2));
      writeFileSync(resolve(DESKTOP, "report.json"), JSON.stringify(report, null, 2));

      const md = [
        `# 20 planov Skybooplan — ${DATE_TAG}`,
        "",
        `Generirano: ${report.generatedAt}`,
        "",
        `Mapa: \`${DESKTOP}\``,
        "",
        `**Skupaj:** uspešno ${ok} · z napakami ${issuesN} · FAILED ${fail} · PDF-jev ${ok + issuesN}/20`,
        "",
        "| ID | Vrsta | Pot | Dni | Sense | PDF |",
        "|---|---|---|---|---|---|",
        ...results.map((r) => {
          return `| ${r.id} | ${r.kind} | ${r.route} | ${r.days ?? "—"}/${r.expectedDays ?? "—"} | ${r.sense ?? r.status} | \`${r.id}.pdf\` |`;
        }),
        "",
        "## Napake / opozorila",
        "",
        ...results.map((r) => {
          const detail =
            r.error || (Array.isArray(r.issues) ? (r.issues as string[]).join("; ") : "");
          const warns =
            Array.isArray(r.warnings) && (r.warnings as string[]).length
              ? ` _(warn: ${(r.warnings as string[]).join("; ")})_`
              : "";
          if (r.status === "ok" && !warns) return `- **${r.id}**: OK`;
          return `- **${r.id}** (${r.sense ?? r.status}): ${detail || "n/a"}${warns}`;
        }),
        "",
      ].join("\n");
      writeFileSync(resolve(EXPORT, "REPORT.md"), md);
      writeFileSync(resolve(DESKTOP, "REPORT.md"), md);

      console.log(JSON.stringify(report.totals, null, 2));
      expect(ok + issuesN).toBeGreaterThanOrEqual(1);
    },
    14_400_000,
  );
});

describe.runIf(!LIVE_OK)("mixed 20 QA skipped without RUN_LIVE_PLAN_QA=1", () => {
  it("documents how to run", () => {
    expect(true).toBe(true);
  });
});
