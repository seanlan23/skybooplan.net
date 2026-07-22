/**
 * Focused live QA: 5 varied EU→world plans.
 * RUN_LIVE_PLAN_QA=1 npx vitest run scripts/batch-plan-qa-5.test.ts --testTimeout 600000
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
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    try {
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
    } catch {
      /* missing file */
    }
  }
}

loadEnvLocal();

const SCENARIOS = [
  {
    id: "A-LJU-ATH",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "ATH",
    destinationPlace: "Greece",
    departDate: "2026-07-08",
    returnDate: "2026-07-14",
    flightContext: {
      outboundDepart: "09:40",
      outboundArrive: "12:55",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:20",
      inboundArrive: "19:50",
    },
    wishes: "Atene + Santorini, sproščeno, plaže in zgodovina.",
  },
  {
    id: "B-VIE-NRT",
    originIata: "VIE",
    originPlace: "Dunaj",
    destinationIata: "NRT",
    destinationPlace: "Japan",
    departDate: "2026-04-12",
    returnDate: "2026-04-18",
    flightContext: {
      outboundDepart: "14:00",
      outboundArrive: "09:10",
      outboundArriveDayOffset: 1,
      inboundDepart: "11:00",
      inboundArrive: "16:40",
    },
    wishes: "Tokyo 6 dni, hrana in templji, umirjen tempo.",
  },
  {
    id: "C-MUC-BCN",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "BCN",
    destinationPlace: "Barcelona",
    departDate: "2026-09-03",
    returnDate: "2026-09-08",
    flightContext: {
      outboundDepart: "07:15",
      outboundArrive: "09:20",
      outboundArriveDayOffset: 0,
      inboundDepart: "19:40",
      inboundArrive: "21:45",
    },
    wishes: "Gaudí, plaža, tapas — brez Madride.",
  },
  {
    id: "D-MXP-BKK",
    originIata: "MXP",
    originPlace: "Milano",
    destinationIata: "BKK",
    destinationPlace: "Thailand",
    departDate: "2026-11-02",
    returnDate: "2026-11-09",
    flightContext: {
      outboundDepart: "22:05",
      outboundArrive: "16:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:55",
      inboundArrive: "06:20",
    },
    wishes: "Bangkok + Krabi/Ao Nang, sproščeno.",
  },
  {
    id: "E-BUD-KEF",
    originIata: "BUD",
    originPlace: "Budimpešta",
    destinationIata: "KEF",
    destinationPlace: "Iceland",
    departDate: "2026-02-18",
    returnDate: "2026-02-23",
    flightContext: {
      outboundDepart: "11:30",
      outboundArrive: "14:55",
      outboundArriveDayOffset: 0,
      inboundDepart: "15:40",
      inboundArrive: "21:10",
    },
    wishes: "Reykjavik + Golden Circle, zima.",
  },
] as const;

function tripDayCount(depart: string, ret: string): number {
  const a = Date.parse(`${depart}T00:00:00Z`);
  const b = Date.parse(`${ret}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function analyze(plan: AiTripPlan) {
  const issues: string[] = [];
  const names: string[] = [];
  let mapCenters = 0;
  let mapWithPins = 0;
  let pinsWithQuery = 0;
  let totalPins = 0;

  const dayNums = plan.days.map((d) => d.day);
  if (new Set(dayNums).size !== dayNums.length) {
    issues.push(`duplicate day_number in plan (${dayNums.join(",")})`);
  }

  for (const day of plan.days) {
    const slots = [
      ...(day.activities?.morning ?? []),
      ...(day.activities?.afternoon ?? []),
      ...(day.activities?.evening ?? []),
    ];
    if (slots.length === 0) issues.push(`D${day.day}: empty activities`);
    for (const a of slots) {
      const key = a.name.trim().toLowerCase();
      // Flag sightseeing repeats across days — skip meals/logistics soft fillers.
      if (
        names.includes(key) &&
        /sight|museum|palace|temple|wat |beach|market|paragon|observatory/i.test(
          `${a.name} ${a.type ?? ""}`,
        ) &&
        !/check-in|prihod|prevoz|odhod|let|osvežitev|zajtrk|kosilo|večerja|seafood/i.test(key)
      ) {
        issues.push(`D${day.day}: repeat POI "${a.name}"`);
      }
      names.push(key);
    }
    const md = buildMapDay(plan, day.day);
    if (!md) issues.push(`D${day.day}: no MapDay`);
    else {
      mapCenters++;
      if (md.pins.length > 0) mapWithPins++;
    }
    for (const p of day.mapPins ?? []) {
      totalPins++;
      if (p.unsplashQuery?.trim()) pinsWithQuery++;
    }
  }

  const enLeak = plan.days.some((d) =>
    [...(d.activities?.morning ?? []), ...(d.activities?.afternoon ?? []), ...(d.activities?.evening ?? [])].some(
      (a) => /\b(visit|enjoy|explore|recommended)\b/i.test(`${a.name} ${a.description ?? ""}`),
    ),
  );
  if (enLeak) issues.push("English leak in SL copy");

  return {
    destinationName: plan.destinationName,
    cities: [...new Set(plan.days.map((d) => d.city).filter(Boolean))],
    mapCoverage: `${mapCenters}/${plan.days.length} centers, ${mapWithPins}/${plan.days.length} with pins`,
    unsplashQueryCoverage: totalPins ? `${pinsWithQuery}/${totalPins} pins have unsplashQuery` : "0 pins",
    issues,
    ok: issues.length === 0,
  };
}

const RUN_LIVE = process.env.RUN_LIVE_PLAN_QA === "1";

describe.runIf(RUN_LIVE)("batch plan QA ×5", () => {
  it(
    "generates and scores 5 worldwide plans",
    async () => {
      expect(geminiApiKey()).toBeTruthy();
      const outDir = resolve(process.cwd(), ".tmp-plan-qa");
      mkdirSync(outDir, { recursive: true });
      const results: Array<Record<string, unknown>> = [];

      for (const s of SCENARIOS) {
        const started = Date.now();
        const input: GenerateGeminiProTripInput = {
          originIata: s.originIata,
          destinationIata: s.destinationIata,
          departDate: s.departDate,
          returnDate: s.returnDate,
          pax: { adults: 2, childrenAges: [] },
          budget: "standard",
          wishTags: [],
          customWishes: s.wishes,
          pace: "relaxed",
          originPlace: s.originPlace,
          destinationPlace: s.destinationPlace,
          language: "sl",
          flightContext: { ...s.flightContext },
        };
        const days = tripDayCount(s.departDate, s.returnDate);
        let entry: Record<string, unknown> = {
          id: s.id,
          route: `${s.originIata}→${s.destinationIata}`,
          days,
        };
        try {
          const raw = await generateTripPlan(buildGeminiTripPlanParams(input, days));
          const built = buildCatalogPlanFromResponse(raw, input);
          if (built.error || !built.plan) {
            entry = { ...entry, status: "fail", error: built.error, ms: Date.now() - started };
          } else {
            const analysis = analyze(built.plan);
            writeFileSync(
              resolve(outDir, `${s.id}.json`),
              JSON.stringify({ scenario: s, summary: analysis, days: built.plan.days }, null, 2),
            );
            entry = { ...entry, status: analysis.ok ? "ok" : "issues", ms: Date.now() - started, ...analysis };
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
        console.log(`[QA5] ${s.id} ${entry.status} ${entry.ms}ms`, entry.issues ?? entry.error);
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
      writeFileSync(resolve(outDir, "report-5.json"), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report.totals, null, 2));
      expect(results.length - report.totals.fail).toBeGreaterThanOrEqual(3);
    },
    600_000,
  );
});
