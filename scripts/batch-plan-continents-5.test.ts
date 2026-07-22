/**
 * 5 continental live plans + PDF export + Mapbox pin coverage.
 * RUN_LIVE_PLAN_QA=1 npx vitest run scripts/batch-plan-continents-5.test.ts --testTimeout 900000
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogPlanFromResponse } from "@/lib/geminiProCatalog";
import { generateTripPlan } from "@/lib/geminiPro";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import { buildGeminiTripPlanParams } from "@/lib/geminiPro.functions";
import { buildMapDay, finalizeItineraryMapCoords } from "@/lib/itineraryMapModel";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { geminiApiKey } from "@/lib/llm";
import { generatePlanPdf } from "@/lib/pdf-export";

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
      /* missing */
    }
  }
}

loadEnvLocal();

const SCENARIOS = [
  {
    id: "EU-LIS",
    continent: "Europe",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "LIS",
    destinationPlace: "Portugal",
    departDate: "2026-09-10",
    returnDate: "2026-09-16",
    flightContext: {
      outboundDepart: "06:40",
      outboundArrive: "09:55",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:10",
      inboundArrive: "22:05",
    },
    wishes: "Lisbon + Sintra/Porto vibe, hrana, tramvaji, sproščeno.",
  },
  {
    id: "US-JFK",
    continent: "USA",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "JFK",
    destinationPlace: "New York",
    departDate: "2026-10-05",
    returnDate: "2026-10-11",
    flightContext: {
      outboundDepart: "11:20",
      outboundArrive: "14:10",
      outboundArriveDayOffset: 0,
      inboundDepart: "19:30",
      inboundArrive: "09:45",
    },
    wishes: "Manhattan highlights, muzeji, Central Park, brez preveč hitenja.",
  },
  {
    id: "AS-BKK",
    continent: "Asia",
    originIata: "VIE",
    originPlace: "Dunaj",
    destinationIata: "BKK",
    destinationPlace: "Thailand",
    departDate: "2026-11-12",
    returnDate: "2026-11-20",
    flightContext: {
      outboundDepart: "21:40",
      outboundArrive: "14:55",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:50",
      inboundArrive: "06:10",
    },
    wishes: "Bangkok + Krabi/Ao Nang, templji, hrana, plaže.",
  },
  {
    id: "SA-LIM",
    continent: "South America",
    originIata: "MAD",
    originPlace: "Madrid",
    destinationIata: "LIM",
    destinationPlace: "Peru",
    departDate: "2026-08-08",
    returnDate: "2026-08-16",
    flightContext: {
      outboundDepart: "13:05",
      outboundArrive: "18:40",
      outboundArriveDayOffset: 0,
      inboundDepart: "21:15",
      inboundArrive: "15:20",
    },
    wishes: "Lima + Cusco/Machu Picchu, kultura in hrana, realističen tempo.",
  },
  {
    id: "AU-SYD",
    continent: "Australia",
    originIata: "FRA",
    originPlace: "Frankfurt",
    destinationIata: "SYD",
    destinationPlace: "Australia",
    departDate: "2026-03-04",
    returnDate: "2026-03-12",
    flightContext: {
      outboundDepart: "22:00",
      outboundArrive: "07:30",
      outboundArriveDayOffset: 2,
      inboundDepart: "16:20",
      inboundArrive: "05:50",
    },
    wishes: "Sydney: Opera House, harbour, Bondi, en dan Blue Mountains.",
  },
] as const;

function tripDayCount(depart: string, ret: string): number {
  const a = Date.parse(`${depart}T00:00:00Z`);
  const b = Date.parse(`${ret}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function analyzePins(plan: AiTripPlan) {
  let daysWithPins = 0;
  let totalPins = 0;
  let pinCounts: number[] = [];
  for (const day of plan.days) {
    const md = buildMapDay(plan, day.day);
    const n = md?.pins.length ?? 0;
    pinCounts.push(n);
    totalPins += n;
    if (n > 0) daysWithPins += 1;
  }
  const avg = plan.days.length ? totalPins / plan.days.length : 0;
  return {
    daysWithPins: `${daysWithPins}/${plan.days.length}`,
    totalPins,
    avgPinsPerDay: Number(avg.toFixed(2)),
    pinCounts,
  };
}

const RUN_LIVE = process.env.RUN_LIVE_PLAN_QA === "1";

describe.runIf(RUN_LIVE)("continental batch ×5 + PDF", () => {
  it(
    "generates 5 continental plans, writes PDFs, scores map pins",
    async () => {
      expect(geminiApiKey()).toBeTruthy();
      const outDir = resolve(process.cwd(), ".tmp-plan-continents");
      mkdirSync(outDir, { recursive: true });
      const results: Array<Record<string, unknown>> = [];

      const only = process.env.CONTINENT_ONLY?.trim();
      const selected = only
        ? SCENARIOS.filter((s) => s.id === only || s.continent === only)
        : SCENARIOS;
      expect(selected.length).toBeGreaterThan(0);

      for (const s of selected) {
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
          continent: s.continent,
          route: `${s.originIata}→${s.destinationIata}`,
          days,
        };
        try {
          const raw = await generateTripPlan(buildGeminiTripPlanParams(input, days));
          const built = buildCatalogPlanFromResponse(raw, input);
          if (built.error || !built.plan) {
            entry = { ...entry, status: "fail", error: built.error, ms: Date.now() - started };
          } else {
            finalizeItineraryMapCoords(built.plan);
            const pins = analyzePins(built.plan);
            writeFileSync(
              resolve(outDir, `${s.id}.json`),
              JSON.stringify(
                {
                  scenario: s,
                  pins,
                  destinationName: built.plan.destinationName,
                  days: built.plan.days,
                },
                null,
                2,
              ),
            );

            const pdf = await generatePlanPdf({
              title: `${s.originIata} → ${s.destinationIata} (${s.continent})`,
              destination: built.plan.destinationName || s.destinationPlace,
              start_date: s.departDate,
              end_date: s.returnDate,
              itinerary: built.plan as never,
              language: "sl",
              pax: 2,
              wishes: s.wishes,
            });
            const pdfPath = resolve(outDir, pdf.fileName.replace(/\.pdf$/i, "") + `_${s.id}.pdf`);
            writeFileSync(pdfPath, Buffer.from(pdf.buffer));

            entry = {
              ...entry,
              status: "ok",
              ms: Date.now() - started,
              destinationName: built.plan.destinationName,
              ...pins,
              pdf: pdfPath,
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
          `[CONT5] ${s.id} ${entry.status} pins=${entry.avgPinsPerDay ?? "-"} ${entry.ms}ms`,
          entry.error ?? "",
        );
      }

      const report = {
        generatedAt: new Date().toISOString(),
        pinFix:
          "collectPins always backfills from activities; MAX_DAY_PINS=7; radius 80km; SA/AU city hubs added",
        totals: {
          ok: results.filter((r) => r.status === "ok").length,
          fail: results.filter((r) => r.status !== "ok").length,
          avgPinsPerDay: Number(
            (
              results
                .filter((r) => typeof r.avgPinsPerDay === "number")
                .reduce((a, r) => a + (r.avgPinsPerDay as number), 0) /
                Math.max(1, results.filter((r) => typeof r.avgPinsPerDay === "number").length)
            ).toFixed(2),
          ),
        },
        results,
      };
      writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      expect(report.totals.ok).toBeGreaterThanOrEqual(only ? 1 : 3);
    },
    900_000,
  );
});
