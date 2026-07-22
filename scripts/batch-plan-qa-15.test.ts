/**
 * Overnight worldwide QA ×15 — varied origins, destinations, paces, budgets.
 * NODE_USE_ENV_PROXY=1 RUN_LIVE_PLAN_QA=1 npx vitest run scripts/batch-plan-qa-15.test.ts --testTimeout 3600000 --pool=forks
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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

type Scenario = {
  id: string;
  region: string;
  originIata: string;
  originPlace: string;
  destinationIata: string;
  destinationPlace: string;
  departDate: string;
  returnDate: string;
  budget: "budget" | "standard" | "luxury";
  pace: "relaxed" | "balanced" | "packed";
  paxAdults: number;
  childrenAges: number[];
  wishes: string;
  flightContext: {
    outboundDepart: string;
    outboundArrive: string;
    outboundArriveDayOffset: number;
    inboundDepart: string;
    inboundArrive: string;
  };
};

const SCENARIOS: Scenario[] = [
  {
    id: "01-PRG-AMS",
    region: "Europe",
    originIata: "PRG",
    originPlace: "Prague",
    destinationIata: "AMS",
    destinationPlace: "Netherlands",
    departDate: "2026-04-15",
    returnDate: "2026-04-19",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Amsterdam kanali, muzeji, Day trip Haarlem — brez Brugg.",
    flightContext: {
      outboundDepart: "08:10",
      outboundArrive: "09:40",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:30",
      inboundArrive: "20:00",
    },
  },
  {
    id: "02-ZAG-IST",
    region: "Europe/Asia",
    originIata: "ZAG",
    originPlace: "Zagreb",
    destinationIata: "IST",
    destinationPlace: "Turkey",
    departDate: "2026-05-20",
    returnDate: "2026-05-26",
    budget: "budget",
    pace: "relaxed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Istanbul: Stari del, Bospor, hrana, 1 dan Azijska stran.",
    flightContext: {
      outboundDepart: "10:05",
      outboundArrive: "13:20",
      outboundArriveDayOffset: 0,
      inboundDepart: "16:45",
      inboundArrive: "17:55",
    },
  },
  {
    id: "03-VIE-DXB",
    region: "Middle East",
    originIata: "VIE",
    originPlace: "Vienna",
    destinationIata: "DXB",
    destinationPlace: "Dubai",
    departDate: "2026-11-08",
    returnDate: "2026-11-13",
    budget: "luxury",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Dubai luxury: Old Dubai + marina, desert safari 1 dan, spa večer.",
    flightContext: {
      outboundDepart: "14:20",
      outboundArrive: "22:55",
      outboundArriveDayOffset: 0,
      inboundDepart: "01:40",
      inboundArrive: "05:50",
    },
  },
  {
    id: "04-MXP-CAI",
    region: "Africa",
    originIata: "MXP",
    originPlace: "Milan",
    destinationIata: "CAI",
    destinationPlace: "Egypt",
    departDate: "2026-02-10",
    returnDate: "2026-02-16",
    budget: "standard",
    pace: "packed",
    paxAdults: 2,
    childrenAges: [8],
    wishes: "Kairo + Gizeh, egipčanski muzej, 1 dan Luxor če gre, družini prijazno.",
    flightContext: {
      outboundDepart: "09:30",
      outboundArrive: "14:50",
      outboundArriveDayOffset: 0,
      inboundDepart: "16:20",
      inboundArrive: "19:40",
    },
  },
  {
    id: "05-FRA-CPT",
    region: "Africa",
    originIata: "FRA",
    originPlace: "Frankfurt",
    destinationIata: "CPT",
    destinationPlace: "South Africa",
    departDate: "2026-09-02",
    returnDate: "2026-09-10",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Cape Town + Cape Peninsula, winelands 1 dan, Table Mountain.",
    flightContext: {
      outboundDepart: "21:50",
      outboundArrive: "09:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "19:00",
      inboundArrive: "06:30",
    },
  },
  {
    id: "06-CDG-NRT",
    region: "Asia",
    originIata: "CDG",
    originPlace: "Paris",
    destinationIata: "NRT",
    destinationPlace: "Japan",
    departDate: "2026-03-18",
    returnDate: "2026-03-26",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Tokyo + 2 dni Kyoto/Osaka vibe, hrana, templji, umirjeno.",
    flightContext: {
      outboundDepart: "13:00",
      outboundArrive: "08:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "11:15",
      inboundArrive: "16:50",
    },
  },
  {
    id: "07-AMS-BKK",
    region: "Asia",
    originIata: "AMS",
    originPlace: "Amsterdam",
    destinationIata: "BKK",
    destinationPlace: "Thailand",
    departDate: "2026-12-01",
    returnDate: "2026-12-09",
    budget: "budget",
    pace: "relaxed",
    paxAdults: 1,
    childrenAges: [],
    wishes: "Solo Bangkok + Chiang Mai, street food, templji, brez islands.",
    flightContext: {
      outboundDepart: "20:40",
      outboundArrive: "13:55",
      outboundArriveDayOffset: 1,
      inboundDepart: "00:40",
      inboundArrive: "07:10",
    },
  },
  {
    id: "08-MUC-SIN",
    region: "Asia",
    originIata: "MUC",
    originPlace: "Munich",
    destinationIata: "SIN",
    destinationPlace: "Singapore",
    departDate: "2026-06-05",
    returnDate: "2026-06-10",
    budget: "luxury",
    pace: "packed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Singapore city: Gardens, food, Marina Bay, 1 day trip Malaysia Johor optional skip.",
    flightContext: {
      outboundDepart: "22:10",
      outboundArrive: "16:20",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:30",
      inboundArrive: "06:15",
    },
  },
  {
    id: "09-LHR-JFK",
    region: "USA",
    originIata: "LHR",
    originPlace: "London",
    destinationIata: "JFK",
    destinationPlace: "New York",
    departDate: "2026-07-08",
    returnDate: "2026-07-13",
    budget: "standard",
    pace: "packed",
    paxAdults: 2,
    childrenAges: [10, 12],
    wishes: "NYC z otroki: muzeji, Central Park, Brooklyn, manj klubov.",
    flightContext: {
      outboundDepart: "10:30",
      outboundArrive: "13:15",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:50",
      inboundArrive: "07:05",
    },
  },
  {
    id: "10-FCO-MIA",
    region: "USA",
    originIata: "FCO",
    originPlace: "Rome",
    destinationIata: "MIA",
    destinationPlace: "Miami",
    departDate: "2026-01-14",
    returnDate: "2026-01-20",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Miami Beach + Art Deco, Everglades 1 dan, Key Biscayne.",
    flightContext: {
      outboundDepart: "11:40",
      outboundArrive: "16:55",
      outboundArriveDayOffset: 0,
      inboundDepart: "20:10",
      inboundArrive: "11:30",
    },
  },
  {
    id: "11-BCN-GRU",
    region: "South America",
    originIata: "BCN",
    originPlace: "Barcelona",
    destinationIata: "GRU",
    destinationPlace: "Brazil",
    departDate: "2026-08-12",
    returnDate: "2026-08-20",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "São Paulo + 3 dni Rio de Janeiro, hrana, plaže, kultura.",
    flightContext: {
      outboundDepart: "22:30",
      outboundArrive: "05:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:55",
      inboundArrive: "14:20",
    },
  },
  {
    id: "12-MAD-BOG",
    region: "South America",
    originIata: "MAD",
    originPlace: "Madrid",
    destinationIata: "BOG",
    destinationPlace: "Colombia",
    departDate: "2026-10-03",
    returnDate: "2026-10-10",
    budget: "budget",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Bogotá + Cartagena (ali Medellín), kava, stari deli mest.",
    flightContext: {
      outboundDepart: "12:15",
      outboundArrive: "16:40",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:20",
      inboundArrive: "11:05",
    },
  },
  {
    id: "13-ZRH-SYD",
    region: "Australia",
    originIata: "ZRH",
    originPlace: "Zurich",
    destinationIata: "SYD",
    destinationPlace: "Australia",
    departDate: "2026-03-01",
    returnDate: "2026-03-10",
    budget: "luxury",
    pace: "relaxed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Sydney harbour, Bondi, Blue Mountains, ena večerja s pogledom.",
    flightContext: {
      outboundDepart: "21:30",
      outboundArrive: "07:50",
      outboundArriveDayOffset: 2,
      inboundDepart: "15:40",
      inboundArrive: "06:20",
    },
  },
  {
    id: "14-WAW-ICN",
    region: "Asia",
    originIata: "WAW",
    originPlace: "Warsaw",
    destinationIata: "ICN",
    destinationPlace: "South Korea",
    departDate: "2026-04-22",
    returnDate: "2026-04-28",
    budget: "standard",
    pace: "packed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Seoul: palaces, street food, Hongdae, 1 dan DMZ ali Busan skip.",
    flightContext: {
      outboundDepart: "15:50",
      outboundArrive: "09:10",
      outboundArriveDayOffset: 1,
      inboundDepart: "12:00",
      inboundArrive: "17:40",
    },
  },
  {
    id: "15-BUD-REK",
    region: "Europe",
    originIata: "BUD",
    originPlace: "Budapest",
    destinationIata: "KEF",
    destinationPlace: "Iceland",
    departDate: "2026-02-05",
    returnDate: "2026-02-10",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Reykjavik + Golden Circle, Blue Lagoon, zimske luči če gre.",
    flightContext: {
      outboundDepart: "07:20",
      outboundArrive: "09:55",
      outboundArriveDayOffset: 0,
      inboundDepart: "14:30",
      inboundArrive: "20:05",
    },
  },
];

function tripDayCount(depart: string, ret: string): number {
  const a = Date.parse(`${depart}T00:00:00Z`);
  const b = Date.parse(`${ret}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function analyze(plan: AiTripPlan) {
  const issues: string[] = [];
  let totalPins = 0;
  let daysWithPins = 0;
  const pinCounts: number[] = [];
  const dayNums = plan.days.map((d) => d.day);
  if (new Set(dayNums).size !== dayNums.length) {
    issues.push(`duplicate days: ${dayNums.join(",")}`);
  }
  for (const day of plan.days) {
    const slots = [
      ...(day.activities?.morning ?? []),
      ...(day.activities?.afternoon ?? []),
      ...(day.activities?.evening ?? []),
    ];
    if (slots.length === 0 && !day.inFlightDay) issues.push(`D${day.day}: empty activities`);
    const md = buildMapDay(plan, day.day);
    const n = md?.pins.length ?? 0;
    pinCounts.push(n);
    totalPins += n;
    if (n > 0) daysWithPins += 1;
    if (!md) issues.push(`D${day.day}: no MapDay`);
  }
  return {
    destinationName: plan.destinationName,
    cities: [...new Set(plan.days.map((d) => d.city).filter(Boolean))],
    daysWithPins: `${daysWithPins}/${plan.days.length}`,
    totalPins,
    avgPinsPerDay: Number((totalPins / Math.max(1, plan.days.length)).toFixed(2)),
    pinCounts,
    issues,
    ok: issues.length === 0,
  };
}

const RUN_LIVE = process.env.RUN_LIVE_PLAN_QA === "1";
const OUT = resolve(process.cwd(), ".tmp-plan-qa-15");
const EXPORT = resolve(process.cwd(), "plan-exports/worldwide-15-2026-07-22");

describe.runIf(RUN_LIVE)("worldwide batch ×15", () => {
  it(
    "generates 15 varied plans, PDFs, and a full report",
    async () => {
      expect(geminiApiKey()).toBeTruthy();
      mkdirSync(OUT, { recursive: true });
      mkdirSync(EXPORT, { recursive: true });

      const resume = process.env.RESUME !== "0";
      const results: Array<Record<string, unknown>> = [];

      for (const s of SCENARIOS) {
        const jsonPath = resolve(OUT, `${s.id}.json`);
        const started = Date.now();
        let entry: Record<string, unknown> = {
          id: s.id,
          region: s.region,
          route: `${s.originIata}→${s.destinationIata}`,
          budget: s.budget,
          pace: s.pace,
          pax: s.paxAdults + s.childrenAges.length,
        };

        try {
          let plan: AiTripPlan | null = null;
          if (resume && existsSync(jsonPath)) {
            const cached = JSON.parse(readFileSync(jsonPath, "utf8")) as {
              days?: AiTripPlan["days"];
              destinationName?: string;
            };
            if (cached.days?.length) {
              plan = {
                destinationName: cached.destinationName || s.destinationPlace,
                destinationIata: s.destinationIata,
                days: cached.days,
              } as AiTripPlan;
              entry.cached = true;
            }
          }

          if (!plan) {
            const days = tripDayCount(s.departDate, s.returnDate);
            const input: GenerateGeminiProTripInput = {
              originIata: s.originIata,
              destinationIata: s.destinationIata,
              departDate: s.departDate,
              returnDate: s.returnDate,
              pax: { adults: s.paxAdults, childrenAges: s.childrenAges },
              budget: s.budget,
              wishTags: [],
              customWishes: s.wishes,
              pace: s.pace,
              originPlace: s.originPlace,
              destinationPlace: s.destinationPlace,
              language: "sl",
              flightContext: { ...s.flightContext },
            };
            const raw = await generateTripPlan(buildGeminiTripPlanParams(input, days));
            const built = buildCatalogPlanFromResponse(raw, input);
            if (built.error || !built.plan) {
              entry = {
                ...entry,
                status: "fail",
                error: built.error,
                ms: Date.now() - started,
              };
              results.push(entry);
              writeFileSync(resolve(OUT, "report-live.json"), JSON.stringify({ results }, null, 2));
              console.log(`[QA15] ${s.id} FAIL`, built.error);
              continue;
            }
            plan = built.plan;
            writeFileSync(
              jsonPath,
              JSON.stringify(
                { scenario: s, destinationName: plan.destinationName, days: plan.days },
                null,
                2,
              ),
            );
          }

          finalizeItineraryMapCoords(plan);
          const analysis = analyze(plan);
          const pdf = await generatePlanPdf({
            title: `${s.originIata} → ${s.destinationIata} (${s.region})`,
            destination: plan.destinationName || s.destinationPlace,
            start_date: s.departDate,
            end_date: s.returnDate,
            itinerary: plan as never,
            language: "sl",
            pax: s.paxAdults + s.childrenAges.length,
            wishes: s.wishes,
            travel_pace: s.pace,
          });
          const pdfName = `${s.id}.pdf`;
          writeFileSync(resolve(OUT, pdfName), Buffer.from(pdf.buffer));
          writeFileSync(resolve(EXPORT, pdfName), Buffer.from(pdf.buffer));

          entry = {
            ...entry,
            status: analysis.ok ? "ok" : "issues",
            ms: Date.now() - started,
            days: plan.days.length,
            ...analysis,
            pdf: `plan-exports/worldwide-15-2026-07-22/${pdfName}`,
          };
        } catch (err) {
          entry = {
            ...entry,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
            ms: Date.now() - started,
          };
        }

        results.push(entry);
        writeFileSync(resolve(OUT, "report-live.json"), JSON.stringify({ results }, null, 2));
        console.log(
          `[QA15] ${s.id} ${entry.status} pins=${entry.avgPinsPerDay ?? "-"} ${entry.ms}ms`,
          entry.error ?? entry.issues ?? "",
        );
      }

      const ok = results.filter((r) => r.status === "ok").length;
      const issues = results.filter((r) => r.status === "issues").length;
      const fail = results.filter((r) => r.status === "fail" || r.status === "error").length;
      const pinAvgs = results
        .filter((r) => typeof r.avgPinsPerDay === "number")
        .map((r) => r.avgPinsPerDay as number);
      const report = {
        generatedAt: new Date().toISOString(),
        totals: {
          ok,
          issues,
          fail,
          avgPinsPerDay: pinAvgs.length
            ? Number((pinAvgs.reduce((a, b) => a + b, 0) / pinAvgs.length).toFixed(2))
            : 0,
        },
        results,
      };

      writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
      writeFileSync(resolve(EXPORT, "report.json"), JSON.stringify(report, null, 2));

      const md = [
        "# Worldwide plan QA ×15 — 22 Jul 2026",
        "",
        `Generated: ${report.generatedAt}`,
        "",
        `**Totals:** ok ${ok} · issues ${issues} · fail ${fail} · avg pins/day ${report.totals.avgPinsPerDay}`,
        "",
        "| ID | Region | Route | Dest | Days | Pins | Status | PDF |",
        "|---|---|---|---|---|---|---|---|",
        ...results.map((r) => {
          const pins =
            typeof r.avgPinsPerDay === "number"
              ? `${r.daysWithPins} · ${r.avgPinsPerDay}/d`
              : "—";
          return `| ${r.id} | ${r.region} | ${r.route} | ${r.destinationName ?? "—"} | ${r.days ?? "—"} | ${pins} | ${r.status} | \`${r.id}.pdf\` |`;
        }),
        "",
        "## Issues / errors",
        "",
        ...results
          .filter((r) => r.status !== "ok")
          .map((r) => {
            const detail = r.error || (Array.isArray(r.issues) ? r.issues.join("; ") : "");
            return `- **${r.id}** (${r.status}): ${detail || "n/a"}`;
          }),
        "",
        "## Notes",
        "",
        "- Language: Slovenian; mixed budgets/paces/pax including families & solo.",
        "- Map pins use activity backfill + 120 km day-trip radius.",
        "- In-flight days may have 0 pins (expected).",
        "",
      ].join("\n");
      writeFileSync(resolve(EXPORT, "REPORT.md"), md);

      // Summary PDF (short text report as printable PDF)
      const summaryPdf = await generatePlanPdf({
        title: "Skybooplan — Worldwide QA ×15",
        destination: "Batch report",
        start_date: "2026-07-22",
        end_date: "2026-07-22",
        language: "sl",
        pax: 1,
        wishes: `ok=${ok} issues=${issues} fail=${fail} avgPins=${report.totals.avgPinsPerDay}`,
        itinerary: {
          destinationName: "QA Report",
          summary: md.slice(0, 3500),
          days: results.map((r, i) => ({
            day: i + 1,
            title: `${r.id} ${r.route}`,
            city: String(r.destinationName || r.region || ""),
            morning: `Status: ${r.status}`,
            afternoon: `Pins: ${r.daysWithPins ?? "—"} (avg ${r.avgPinsPerDay ?? "—"})`,
            evening: String(r.error || (Array.isArray(r.issues) ? r.issues.join(", ") : "OK")),
            dailyBudgetEur: 0,
            travelHack: "",
            transportationTips: "",
            localWarnings: "",
            lat: 0,
            lng: 0,
            focusName: String(r.destinationName || ""),
            category: "city",
          })),
        } as never,
      });
      writeFileSync(resolve(EXPORT, "00-SUMMARY-REPORT.pdf"), Buffer.from(summaryPdf.buffer));

      console.log(JSON.stringify(report.totals, null, 2));
      expect(ok + issues).toBeGreaterThanOrEqual(10);
    },
    3_600_000,
  );
});
