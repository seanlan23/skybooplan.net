/**
 * Live smoke: MUC→BKK + MUC→CMB after itinerary logic fixes.
 * NODE_USE_ENV_PROXY=1 RUN_LIVE_PLAN_QA=1 npx vitest run scripts/batch-plan-logic-smoke.test.ts --testTimeout 1200000 --pool=forks
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatActivityClockLabel, isFlightRangeActivity, isPointInTimeActivity } from "@/lib/activityTime";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { hasContiguousDayNumbers } from "@/lib/daySequence";
import { buildCatalogPlanFromResponse } from "@/lib/geminiProCatalog";
import { generateTripPlan } from "@/lib/geminiPro";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import {
  buildGeminiTripPlanParams,
  hasAcceptablePlanDayCoverage,
  tripDayCount,
} from "@/lib/geminiPro.functions";
import { finalizeItineraryMapCoords } from "@/lib/itineraryMapModel";
import { geminiApiKey } from "@/lib/llm";
import { generatePlanPdf } from "@/lib/pdf-export";

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

const LIVE = process.env.RUN_LIVE_PLAN_QA === "1" && Boolean(geminiApiKey());
const DATE_TAG = "logic-smoke-2026-07-24";
const OUT = resolve(process.cwd(), "plan-exports", DATE_TAG);

function countLongArrivalSpam(plan: AiTripPlan): number {
  const re = /\+\d+\s*(?:dan|dni|day|days).*?(?:destinaciji|destination)/gi;
  let n = 0;
  for (const day of plan.days) {
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const a of day.activities?.[slot] ?? []) {
        const hits = a.description?.match(re);
        if (hits) n += hits.length;
      }
    }
  }
  return n;
}

function invertedPointClocks(plan: AiTripPlan): string[] {
  const bad: string[] = [];
  for (const day of plan.days) {
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const a of day.activities?.[slot] ?? []) {
        if (isFlightRangeActivity(a) || !isPointInTimeActivity(a)) continue;
        const label = formatActivityClockLabel(a);
        if (!label) continue;
        // Point-in-time must never show overnight range.
        if (/ – /.test(label) && /\(\+1\)/.test(label)) {
          bad.push(`D${day.day} ${a.name}: ${label}`);
        }
      }
    }
  }
  return bad;
}

const SCENARIOS = [
  {
    id: "MUC-BKK",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "BKK",
    destinationPlace: "Thailand",
    departDate: "2026-09-19",
    returnDate: "2026-09-26",
    wishes: "Bangkok + Ayutthaya + Chiang Mai, templji, hrana — sproščeno.",
    flightContext: {
      outboundDepart: "22:30",
      outboundArrive: "18:10",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:40",
      inboundArrive: "06:15",
    },
  },
  {
    id: "MUC-CMB",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "CMB",
    destinationPlace: "Sri Lanka",
    departDate: "2026-10-05",
    returnDate: "2026-10-12",
    wishes: "Colombo, Kandy, Negombo — kultura, 7 dni.",
    flightContext: {
      outboundDepart: "21:15",
      outboundArrive: "14:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "17:55",
      inboundArrive: "08:30",
    },
  },
] as const;

describe.runIf(LIVE)("logic smoke MUC→BKK / MUC→CMB", () => {
  it(
    "generates contiguous days with sane clocks and low spam",
    async () => {
      mkdirSync(OUT, { recursive: true });
      const report: Array<Record<string, unknown>> = [];

      for (const s of SCENARIOS) {
        const expectedDays = tripDayCount(s.departDate, s.returnDate);
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

        let plan: AiTripPlan | null = null;
        let lastError: string | null = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const raw = await generateTripPlan(buildGeminiTripPlanParams(input, expectedDays));
            const built = buildCatalogPlanFromResponse(raw, input);
            if (built.error || !built.plan) {
              lastError = built.error ?? "no plan";
              continue;
            }
            plan = built.plan;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
          }
        }
        expect(plan, `${s.id} plan (${lastError})`).toBeTruthy();
        finalizeItineraryMapCoords(plan!);

        const spam = countLongArrivalSpam(plan!);
        const inverted = invertedPointClocks(plan!);
        const contiguous = hasContiguousDayNumbers(plan!.days);
        const coverage = hasAcceptablePlanDayCoverage(
          Math.max(...plan!.days.map((d) => d.day)),
          expectedDays,
        );

        const pdf = await generatePlanPdf({
          title: `${s.originIata} → ${s.destinationIata}`,
          destination: plan!.destinationName || s.destinationPlace,
          start_date: s.departDate,
          end_date: s.returnDate,
          itinerary: plan as never,
          language: "sl",
          pax: 2,
          wishes: s.wishes,
          travel_pace: "relaxed",
        });
        writeFileSync(resolve(OUT, `${s.id}.pdf`), Buffer.from(pdf.buffer));
        writeFileSync(
          resolve(OUT, `${s.id}.json`),
          JSON.stringify({ days: plan!.days, destinationName: plan!.destinationName }, null, 2),
        );

        report.push({
          id: s.id,
          expectedDays,
          maxDay: Math.max(...plan!.days.map((d) => d.day)),
          contiguous,
          coverage,
          spam,
          inverted,
        });
        writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ report }, null, 2));

        expect(contiguous, `${s.id} day gaps`).toBe(true);
        expect(coverage, `${s.id} coverage`).toBe(true);
        expect(spam, `${s.id} arrival spam`).toBeLessThanOrEqual(2);
        expect(inverted, `${s.id} inverted clocks`).toEqual([]);
      }
    },
    1_200_000,
  );
});

describe.runIf(!LIVE)("logic smoke (skipped without RUN_LIVE_PLAN_QA=1)", () => {
  it("documents how to run", () => {
    expect(true).toBe(true);
  });
});
