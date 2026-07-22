/**
 * Live QA: generate 10 Gemini Pro trip plans (varied EU origins + world dests)
 * and score itinerary + Mapbox day model quality.
 *
 * Run: npx vitest run scripts/batch-plan-qa.test.ts --testTimeout 900000
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogPlanFromResponse } from "@/lib/geminiProCatalog";
import { generateTripPlan } from "@/lib/geminiPro";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import { buildGeminiTripPlanParams } from "@/lib/geminiPro.functions";
import { buildMapDay } from "@/lib/itineraryMapModel";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { geminiApiKey } from "@/lib/llm";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
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
}

loadEnvLocal();

type Scenario = {
  id: string;
  originIata: string;
  originPlace: string;
  destinationIata: string;
  destinationPlace: string;
  departDate: string;
  returnDate: string;
  flightContext: NonNullable<GenerateGeminiProTripInput["flightContext"]>;
  wishes: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "1-LJU-BKK",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "BKK",
    destinationPlace: "Thailand",
    departDate: "2026-10-26",
    returnDate: "2026-11-02",
    flightContext: {
      outboundDepart: "21:10",
      outboundArrive: "17:55",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:40",
      inboundArrive: "06:15",
    },
    wishes: "Sproščen tempo, plaže in templji, Bangkok + otok.",
  },
  {
    id: "2-MUC-NRT",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "NRT",
    destinationPlace: "Japan",
    departDate: "2026-04-08",
    returnDate: "2026-04-16",
    flightContext: {
      outboundDepart: "13:20",
      outboundArrive: "08:45",
      outboundArriveDayOffset: 1,
      inboundDepart: "10:30",
      inboundArrive: "16:00",
    },
    wishes: "Tokyo in Kyoto, hrana in templji, umirjen tempo.",
  },
  {
    id: "3-VIE-CDG",
    originIata: "VIE",
    originPlace: "Dunaj",
    destinationIata: "CDG",
    destinationPlace: "Paris",
    departDate: "2026-09-12",
    returnDate: "2026-09-17",
    flightContext: {
      outboundDepart: "08:15",
      outboundArrive: "10:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:40",
      inboundArrive: "20:25",
    },
    wishes: "Romantični Pariz, muzeji in hrana.",
  },
  {
    id: "4-MXP-JFK",
    originIata: "MXP",
    originPlace: "Milano",
    destinationIata: "JFK",
    destinationPlace: "New York",
    departDate: "2026-05-10",
    returnDate: "2026-05-17",
    flightContext: {
      outboundDepart: "11:00",
      outboundArrive: "14:20",
      outboundArriveDayOffset: 0,
      inboundDepart: "21:00",
      inboundArrive: "10:45",
    },
    wishes: "Manhattan, Brooklyn, muzeji — brez Long Island day trips.",
  },
  {
    id: "5-BUD-BCN",
    originIata: "BUD",
    originPlace: "Budimpešta",
    destinationIata: "BCN",
    destinationPlace: "Barcelona",
    departDate: "2026-06-03",
    returnDate: "2026-06-09",
    flightContext: {
      outboundDepart: "06:40",
      outboundArrive: "09:15",
      outboundArriveDayOffset: 0,
      inboundDepart: "20:10",
      inboundArrive: "22:40",
    },
    wishes: "Gaudí, plaža Barceloneta, tapas.",
  },
  {
    id: "6-ZAG-DPS",
    originIata: "ZAG",
    originPlace: "Zagreb",
    destinationIata: "DPS",
    destinationPlace: "Bali",
    departDate: "2026-08-15",
    returnDate: "2026-08-23",
    flightContext: {
      outboundDepart: "14:30",
      outboundArrive: "11:20",
      outboundArriveDayOffset: 1,
      inboundDepart: "19:50",
      inboundArrive: "05:30",
    },
    wishes: "Ubud in plaže, sproščeno, brez prenatrpanega ritma.",
  },
  {
    id: "7-FRA-CPT",
    originIata: "FRA",
    originPlace: "Frankfurt",
    destinationIata: "CPT",
    destinationPlace: "Cape Town",
    departDate: "2026-11-05",
    returnDate: "2026-11-13",
    flightContext: {
      outboundDepart: "22:05",
      outboundArrive: "09:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "19:15",
      inboundArrive: "06:50",
    },
    wishes: "Table Mountain, vinogradi, Cape Peninsula.",
  },
  {
    id: "8-AMS-KEF",
    originIata: "AMS",
    originPlace: "Amsterdam",
    destinationIata: "KEF",
    destinationPlace: "Iceland",
    departDate: "2026-02-10",
    returnDate: "2026-02-16",
    flightContext: {
      outboundDepart: "12:40",
      outboundArrive: "14:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "16:30",
      inboundArrive: "21:15",
    },
    wishes: "Reykjavik, Golden Circle, severni sij če možno.",
  },
  {
    id: "9-BER-ATH",
    originIata: "BER",
    originPlace: "Berlin",
    destinationIata: "ATH",
    destinationPlace: "Greece",
    departDate: "2026-07-04",
    returnDate: "2026-07-11",
    flightContext: {
      outboundDepart: "09:20",
      outboundArrive: "13:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "17:55",
      inboundArrive: "19:40",
    },
    wishes: "Atene + otok (Santorini ali Naxos), plaže in zgodovina.",
  },
  {
    id: "10-PRG-HKG",
    originIata: "PRG",
    originPlace: "Prague",
    destinationIata: "HKG",
    destinationPlace: "Hong Kong",
    departDate: "2026-03-18",
    returnDate: "2026-03-25",
    flightContext: {
      outboundDepart: "15:10",
      outboundArrive: "09:35",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:55",
      inboundArrive: "05:40",
    },
    wishes: "Hong Kong city + opcijsko Macau dan, street food.",
  },
];

function tripDayCount(depart: string, ret?: string): number {
  if (!ret) return 7;
  const a = Date.parse(`${depart}T00:00:00Z`);
  const b = Date.parse(`${ret}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function analyzePlan(plan: AiTripPlan, scenario: Scenario) {
  const issues: string[] = [];
  const mapDays: Array<{
    day: number;
    city: string;
    pins: number;
    hasCenter: boolean;
  }> = [];

  const names: string[] = [];
  for (const day of plan.days) {
    const slots = [
      ...(day.activities?.morning ?? []),
      ...(day.activities?.afternoon ?? []),
      ...(day.activities?.evening ?? []),
    ];
    if (slots.length === 0) issues.push(`D${day.day}: empty activities`);
    for (const a of slots) {
      const key = a.name.trim().toLowerCase();
      if (names.includes(key) && !/check-in|prihod|prevoz|odhod|let/i.test(key)) {
        issues.push(`D${day.day}: repeat POI "${a.name}"`);
      }
      names.push(key);
      if (/thailand|paris|japan|barcelona/i.test(a.name) && scenario.destinationIata === "CPT") {
        issues.push(`D${day.day}: wrong-region name "${a.name}"`);
      }
    }

    const md = buildMapDay(plan, day.day);
    mapDays.push({
      day: day.day,
      city: day.city ?? "",
      pins: md?.pins.length ?? 0,
      hasCenter: Boolean(md?.center),
    });
    if (!md) issues.push(`D${day.day}: no MapDay (Mapbox blank)`);
    else if (md.pins.length === 0 && !/let|flight|odhod|arrival|prihod/i.test(day.title ?? "")) {
      issues.push(`D${day.day}: MapDay 0 pins (${md.cityLabel})`);
    }
  }

  const enLeak = plan.days.some((d) =>
    [...(d.activities?.morning ?? []), ...(d.activities?.afternoon ?? []), ...(d.activities?.evening ?? [])]
      .some((a) => /\b(visit|enjoy|explore|recommended)\b/i.test(`${a.name} ${a.description ?? ""}`)),
  );
  if (enLeak) issues.push("English leak in SL plan copy");

  const daysWithMap = mapDays.filter((d) => d.hasCenter).length;
  const daysWithPins = mapDays.filter((d) => d.pins > 0).length;

  return {
    destinationName: plan.destinationName,
    dayCount: plan.days.length,
    cities: [...new Set(plan.days.map((d) => d.city).filter(Boolean))],
    mapCoverage: `${daysWithMap}/${plan.days.length} centers, ${daysWithPins}/${plan.days.length} with pins`,
    mapDays,
    issues,
    ok: issues.length === 0,
  };
}

const RUN_LIVE = process.env.RUN_LIVE_PLAN_QA === "1";

describe.runIf(RUN_LIVE)("batch plan QA (live Gemini)", () => {
  it(
    "generates and scores 10 worldwide plans",
    async () => {
      expect(geminiApiKey(), "GEMINI_API_KEY required").toBeTruthy();

      const results: Array<Record<string, unknown>> = [];
      const outDir = resolve(process.cwd(), ".tmp-plan-qa");
      mkdirSync(outDir, { recursive: true });

      for (const scenario of SCENARIOS) {
        const started = Date.now();
        const input: GenerateGeminiProTripInput = {
          originIata: scenario.originIata,
          destinationIata: scenario.destinationIata,
          departDate: scenario.departDate,
          returnDate: scenario.returnDate,
          pax: { adults: 2, childrenAges: [] },
          budget: "standard",
          wishTags: [],
          customWishes: scenario.wishes,
          pace: "relaxed",
          originPlace: scenario.originPlace,
          destinationPlace: scenario.destinationPlace,
          language: "sl",
          flightContext: scenario.flightContext,
        };

        const days = tripDayCount(scenario.departDate, scenario.returnDate);
        let entry: Record<string, unknown> = {
          id: scenario.id,
          route: `${scenario.originIata}→${scenario.destinationIata}`,
          days,
        };

        try {
          const raw = await generateTripPlan(buildGeminiTripPlanParams(input, days));
          const built = buildCatalogPlanFromResponse(raw, input);
          if (built.error || !built.plan) {
            entry = {
              ...entry,
              status: "fail",
              error: built.error ?? "no plan",
              ms: Date.now() - started,
            };
          } else {
            const analysis = analyzePlan(built.plan, scenario);
            writeFileSync(
              resolve(outDir, `${scenario.id}.json`),
              JSON.stringify(
                {
                  scenario,
                  summary: analysis,
                  days: built.plan.days.map((d) => ({
                    day: d.day,
                    city: d.city,
                    title: d.title,
                    morning: (d.activities?.morning ?? []).map((a) => a.name),
                    afternoon: (d.activities?.afternoon ?? []).map((a) => a.name),
                    evening: (d.activities?.evening ?? []).map((a) => a.name),
                    mapPins: (d.mapPins ?? []).map((p) => ({
                      name: p.name,
                      lat: p.lat,
                      lng: p.lng,
                    })),
                  })),
                },
                null,
                2,
              ),
            );
            entry = {
              ...entry,
              status: analysis.ok ? "ok" : "issues",
              ms: Date.now() - started,
              ...analysis,
            };
          }
        } catch (err) {
          entry = {
            ...entry,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
            ms: Date.now() - started,
          };
        }

        results.push(entry);
        console.log(
          `[QA] ${scenario.id} ${entry.status} ${entry.ms}ms issues=${Array.isArray(entry.issues) ? (entry.issues as string[]).length : "-"}`,
        );
      }

      const report = {
        generatedAt: new Date().toISOString(),
        totals: {
          ok: results.filter((r) => r.status === "ok").length,
          issues: results.filter((r) => r.status === "issues").length,
          fail: results.filter((r) => r.status === "fail" || r.status === "error").length,
        },
        results,
      };
      writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2));
      console.log("\n=== BATCH PLAN QA REPORT ===");
      console.log(JSON.stringify(report.totals, null, 2));
      for (const r of results) {
        console.log(
          `- ${r.id}: ${r.status} | ${r.mapCoverage ?? ""} | ${(r.issues as string[] | undefined)?.slice(0, 4).join("; ") ?? r.error ?? ""}`,
        );
      }

      const hardFails = results.filter((r) => r.status === "error" || r.status === "fail").length;
      // Soft gate: at least half of plans must produce a catalog plan (ok or issues).
      expect(results.length - hardFails).toBeGreaterThanOrEqual(5);
    },
    900_000,
  );
});
