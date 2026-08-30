/**
 * Live QA ×15 — 5 flight + 5 car + 5 motorhome. PDFs + Desktop copy + review notes.
 *
 * NODE_USE_ENV_PROXY=1 RUN_LIVE_PLAN_QA=1 RESUME=1 npx vitest run scripts/batch-plan-qa-15-mixed-2026-08-18.test.ts --testTimeout 14400000 --pool=forks
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

const SCENARIOS: Scenario[] = [
  {
    id: "FL-01-Manila",
    kind: "flight",
    region: "Asia",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "MNL",
    destinationPlace: "Filipini / Manila",
    departDate: "2026-10-03",
    returnDate: "2026-10-16",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Filipini: prihod v Manilo, otoki (Palawan/El Nido ali Cebu) so OK, a ZADNJI koledarski dan = SAMO pravi mednarodni odhod iz MNL nazaj v Evropo. PREPOVEDANO dati povratni let ali 'mednarodni odhod 15:20' na dan 6 ali 12 (sredina poti). 2 noči v Manili na začetku, otoki vmes, zadnja noč v Manili pred odhodom.",
    expectHints: ["manila", "palawan", "el nido", "cebu", "intramuros"],
    flightContext: {
      outboundDepart: "21:10",
      outboundArrive: "18:35",
      outboundArriveDayOffset: 1,
      inboundDepart: "21:15",
      inboundArrive: "06:40",
    },
  },
  {
    id: "FL-02-Peru",
    kind: "flight",
    region: "South America",
    originIata: "VIE",
    originPlace: "Dunaj",
    destinationIata: "LIM",
    destinationPlace: "Peru / Cusco",
    departDate: "2026-09-12",
    returnDate: "2026-09-25",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Peru: Lima + Cusco + Sacred Valley / Machu Picchu — ena država, brez Kolumbije. Aklimatizacija v Cuscú ≥2 noči pred MP. Zadnji dan = mednarodni odhod iz LIM, ne v sredini poti.",
    expectHints: ["lima", "cusco", "cuzco", "machu", "sacred"],
    flightContext: {
      outboundDepart: "11:20",
      outboundArrive: "19:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "22:40",
      inboundArrive: "18:10",
    },
  },
  {
    id: "FL-03-Japonska",
    kind: "flight",
    region: "Asia",
    originIata: "FRA",
    originPlace: "Frankfurt",
    destinationIata: "NRT",
    destinationPlace: "Japonska",
    departDate: "2026-11-02",
    returnDate: "2026-11-14",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Japonska: Tokio ≥3 noči, Kjoto ≥2 noči (ne 1 noč hit-and-run), Osaka ali Nara. Enosmerno Tokio→Kjoto. Zadnji dan = mednarodni odhod (KIX ali NRT), ne na dan 6/12 stream batch.",
    expectHints: ["tokyo", "tokio", "kyoto", "kjoto", "shibuya", "gion"],
    flightContext: {
      outboundDepart: "13:25",
      outboundArrive: "08:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "10:50",
      inboundArrive: "16:20",
    },
  },
  {
    id: "FL-04-Indija",
    kind: "flight",
    region: "Asia",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "DEL",
    destinationPlace: "Indija",
    departDate: "2026-10-20",
    returnDate: "2026-11-02",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Indija: Delhi + Agra (Taj Mahal) + Jaipur (Golden Triangle). ≥2 noči v Delhiju in Jaipurju. Zadnji dan = mednarodni odhod iz DEL.",
    expectHints: ["delhi", "agra", "jaipur", "taj"],
    flightContext: {
      outboundDepart: "10:40",
      outboundArrive: "23:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "01:25",
      inboundArrive: "06:55",
    },
  },
  {
    id: "FL-05-Maroko",
    kind: "flight",
    region: "Africa",
    originIata: "ZRH",
    originPlace: "Zürich",
    destinationIata: "RAK",
    destinationPlace: "Maroko",
    departDate: "2026-11-08",
    returnDate: "2026-11-18",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Maroko z letalom: Marrakech ≥3 noči, Essaouira ali Atlas, Fez če gre brez 8h vožnje isti dan. Zadnji dan = mednarodni odhod iz RAK. Ni evropski road-trip.",
    expectHints: ["marrakech", "marrakeš", "medina", "essaouira", "atlas"],
    flightContext: {
      outboundDepart: "08:15",
      outboundArrive: "11:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:40",
      inboundArrive: "21:35",
    },
  },
  {
    id: "AV-01-Italija",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Mežica",
    destinationIata: "FCO",
    destinationPlace: "Italija",
    departDate: "2026-09-05",
    returnDate: "2026-09-16",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avto + HOTELI vsako noč (Booking city+nights, brez izmišljenih imen hotelov). Mežica → Benetke, Garda, Firence, Rim → povratek v Mežico. PREPOVEDANO: kampi. Etape ≤5 h. Mesta ≥2 noči (ne 1 noč v Firencah/Rimu).",
    expectHints: ["venice", "benet", "florence", "firen", "rome", "rim", "garda"],
  },
  {
    id: "AV-02-Francija",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "LYS",
    destinationPlace: "Francija",
    departDate: "2026-09-18",
    returnDate: "2026-09-30",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avto + hoteli vsako noč. Ljubljana → Francija (Lyon / Provence / obala ali Alzacija — ena coerenta pot). Pariz ≥2 noči če je na poti, sicer Lyon ≥2. Povratek v Ljubljano. PREPOVEDANO kampi. Etape ≤5 h.",
    expectHints: ["lyon", "provence", "avignon", "nice", "paris", "dijon"],
  },
  {
    id: "AV-03-Balkan",
    kind: "car",
    region: "Europe",
    originIata: "MBX",
    originPlace: "Maribor",
    destinationIata: "TIA",
    destinationPlace: "Balkan (Bosna, Črna gora, Albanija)",
    departDate: "2026-08-22",
    returnDate: "2026-09-02",
    budget: "budget",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avto + hoteli vsako noč. Maribor → Bosna / Črna gora / Albanija mix, povratek v Maribor. PREPOVEDANO: Albanija→Zagreb isti dan; Kotor samo 1 noč na 12-dnevnem izletu; kampi. Meje +2–3 h. Mostar/Kotor ≥2 noči.",
    expectHints: ["mostar", "sarajevo", "kotor", "budva", "tirana", "shkod"],
  },
  {
    id: "AV-04-Grčija",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Celje",
    destinationIata: "ATH",
    destinationPlace: "Grčija",
    departDate: "2026-09-08",
    returnDate: "2026-09-20",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avto + hoteli vsako noč. Celje → Grčija (celina: Meteora, obala, Atena ali Peloponez). Realistične etape, nočitve vmes (ne 12 h isti dan). Povratek v Celje. PREPOVEDANO kampi.",
    expectHints: ["meteora", "athens", "atene", "thessaloniki", "solun", "ioannina"],
  },
  {
    id: "AV-05-Spanija",
    kind: "car",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Kranj",
    destinationIata: "BCN",
    destinationPlace: "Španija",
    departDate: "2026-10-03",
    returnDate: "2026-10-16",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avto + hoteli vsako noč. Kranj → Španija (Barcelona / Costa Brava / Valencia — ena pot). Barcelona ≥2 noči. Povratek v Kranj. PREPOVEDANO kampi. Etape ≤5 h, nočitve v Franciji vmes.",
    expectHints: ["barcelona", "girona", "valencia", "costa", "narbonne"],
  },
  {
    id: "MH-01-Italija",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Slovenj Gradec",
    destinationIata: "FCO",
    destinationPlace: "Italija",
    departDate: "2026-09-06",
    returnDate: "2026-09-17",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom: Slovenj Gradec → Italija (Benetke, Garda, Toskana, Rim) → povratek. KAMPI / sosta zunaj mestnega jedra, NE hoteli v centru. Etape ≤5 h. Vsak večer poimenuj kamp/RV park.",
    expectHints: ["venice", "benet", "garda", "florence", "firen", "rome", "rim"],
  },
  {
    id: "MH-02-Francija",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Nova Gorica",
    destinationIata: "LYS",
    destinationPlace: "Francija",
    departDate: "2026-09-19",
    returnDate: "2026-10-01",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avtodom Nova Gorica → Francija (Lyon / Provence / obala) → povratek. Kampi, ne city-center hoteli. Pariz samo če je na poti in ≥2 noči. Etape ≤5 h.",
    expectHints: ["lyon", "provence", "avignon", "arles", "nice", "aix"],
  },
  {
    id: "MH-03-Balkan",
    kind: "motorhome",
    region: "Europe",
    originIata: "MBX",
    originPlace: "Ptuj",
    destinationIata: "TIA",
    destinationPlace: "Balkan (Bosna, Črna gora, Albanija)",
    departDate: "2026-08-22",
    returnDate: "2026-09-02",
    budget: "budget",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom Ptuj → Bosna / Črna gora / Albanija → povratek. Kampi, ne hoteli v centru. PREPOVEDANO Albanija→Zagreb isti dan. Kotor ≥2 noči. Realistične meje.",
    expectHints: ["mostar", "kotor", "budva", "shkod", "tirana"],
  },
  {
    id: "MH-04-Grcija",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Koper",
    destinationIata: "ATH",
    destinationPlace: "Grčija",
    departDate: "2026-09-10",
    returnDate: "2026-09-22",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom Koper → Grčija (celina, kampi ob obali / Meteora) → povratek v Koper. Kampi, ne city hoteli. Etape ≤5 h, nočitve vmes skozi HR/AL/MK.",
    expectHints: ["meteora", "thessaloniki", "solun", "ioannina", "parga", "lefkada"],
  },
  {
    id: "MH-05-Spanija",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Kamnik",
    destinationIata: "BCN",
    destinationPlace: "Španija",
    departDate: "2026-10-04",
    returnDate: "2026-10-17",
    budget: "standard",
    pace: "calm",
    paxAdults: 2,
    wishes:
      "Avtodom Kamnik → Španija (Costa Brava / Barcelona območje kampi zunaj centra) → povratek. Kampi, ne hoteli v Barceloni. Etape ≤5 h.",
    expectHints: ["barcelona", "girona", "costa", "roses", "lloret", "narbonne"],
  },
];

const LIVE = process.env.RUN_LIVE_PLAN_QA === "1" && Boolean(geminiApiKey());
const DATE_TAG = "mixed-15-2026-08-18";
const OUT = resolve(process.cwd(), `.tmp-plan-${DATE_TAG}`);
const EXPORT = resolve(process.cwd(), `plan-exports/${DATE_TAG}`);
const DESKTOP = resolve(process.env.HOME ?? "", "Desktop/skybooplan-15-planov-2026-08-18");
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
              `[MIX15] ${s.id} batch ${range.start}-${range.end} object:`,
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
            `[MIX15] ${s.id} batch ${range.start}-${range.end} → ${daysAfter} days (attempt ${attempt})`,
          );
          break;
        }
      } catch (err) {
        console.warn(
          `[MIX15] ${s.id} batch ${range.start}-${range.end} abort/fail attempt ${attempt}:`,
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

describe.runIf(LIVE_OK)("batch mixed QA ×15 (5 FL + 5 AV + 5 MH)", () => {
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
                `[MIX15] ${s.id} stream failed, fallback generateTripPlan:`,
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
          `[MIX15] ${s.id} ${entry.status}/${entry.sense} days=${entry.days ?? "-"}/${expectedDays} ${entry.ms}ms`,
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
        `# 15 planov Skybooplan — ${DATE_TAG}`,
        "",
        `Generirano: ${report.generatedAt}`,
        "",
        `Mapa: \`${DESKTOP}\``,
        "",
        `**Skupaj:** uspešno ${ok} · z napakami ${issuesN} · FAILED ${fail} · PDF-jev ${ok + issuesN}/15`,
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

describe.runIf(!LIVE_OK)("mixed 15 QA skipped without RUN_LIVE_PLAN_QA=1", () => {
  it("documents how to run", () => {
    expect(true).toBe(true);
  });
});
