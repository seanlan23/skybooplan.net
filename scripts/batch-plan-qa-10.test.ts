/**
 * Live QA ×10 — varied routes + strict nonsense checks + PDF export.
 * NODE_USE_ENV_PROXY=1 RUN_LIVE_PLAN_QA=1 npx vitest run scripts/batch-plan-qa-10.test.ts --testTimeout 2400000 --pool=forks
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogPlanFromResponse } from "@/lib/geminiProCatalog";
import { generateTripPlan } from "@/lib/geminiPro";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import {
  buildGeminiTripPlanParams,
  hasAcceptablePlanDayCoverage,
  tripDayCount,
} from "@/lib/geminiPro.functions";
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
  /** City substrings that should appear on at least one non-flight day. */
  expectCityHints: string[];
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
    id: "01-MUC-BKK",
    region: "Asia",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "BKK",
    destinationPlace: "Thailand",
    departDate: "2026-09-19",
    returnDate: "2026-09-26",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Bangkok + Krabi/Ao Nang, templji, hrana, plaže — sproščeno.",
    expectCityHints: ["bangkok", "krabi", "ao nang", "phuket", "chiang"],
    flightContext: {
      outboundDepart: "22:30",
      outboundArrive: "18:10",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:40",
      inboundArrive: "06:15",
    },
  },
  {
    id: "02-LJU-BCN",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "BCN",
    destinationPlace: "Barcelona",
    departDate: "2026-05-12",
    returnDate: "2026-05-17",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Gaudí, plaža Barceloneta, tapas — brez Madride.",
    expectCityHints: ["barcelona", "barceloneta", "sagrada", "gothic"],
    flightContext: {
      outboundDepart: "07:20",
      outboundArrive: "09:25",
      outboundArriveDayOffset: 0,
      inboundDepart: "19:10",
      inboundArrive: "21:20",
    },
  },
  {
    id: "03-FRA-NRT",
    region: "Asia",
    originIata: "FRA",
    originPlace: "Frankfurt",
    destinationIata: "NRT",
    destinationPlace: "Japan",
    departDate: "2026-04-08",
    returnDate: "2026-04-15",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Tokyo + en dan Kyoto/Nikko, templji in hrana, umirjen tempo.",
    expectCityHints: ["tokyo", "kyoto", "shinjuku", "asahusa", "asakusa", "shibuya"],
    flightContext: {
      outboundDepart: "13:40",
      outboundArrive: "08:55",
      outboundArriveDayOffset: 1,
      inboundDepart: "10:30",
      inboundArrive: "16:20",
    },
  },
  {
    id: "04-VIE-KEF",
    region: "Europe",
    originIata: "VIE",
    originPlace: "Vienna",
    destinationIata: "KEF",
    destinationPlace: "Iceland",
    departDate: "2026-02-10",
    returnDate: "2026-02-15",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Reykjavik + Golden Circle, zima, vroči vrelci.",
    expectCityHints: ["reykjavik", "golden", "thingvellir", "gullfoss", "blue lagoon"],
    flightContext: {
      outboundDepart: "11:15",
      outboundArrive: "14:40",
      outboundArriveDayOffset: 0,
      inboundDepart: "16:05",
      inboundArrive: "21:30",
    },
  },
  {
    id: "05-CDG-JFK",
    region: "USA",
    originIata: "CDG",
    originPlace: "Paris",
    destinationIata: "JFK",
    destinationPlace: "New York",
    departDate: "2026-10-03",
    returnDate: "2026-10-09",
    budget: "luxury",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Manhattan highlights, muzeji, Central Park — brez Washingtona.",
    expectCityHints: ["new york", "manhattan", "brooklyn", "central park", "nyc"],
    flightContext: {
      outboundDepart: "10:50",
      outboundArrive: "13:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:40",
      inboundArrive: "07:55",
    },
  },
  {
    id: "06-AMS-CPT",
    region: "Africa",
    originIata: "AMS",
    originPlace: "Amsterdam",
    destinationIata: "CPT",
    destinationPlace: "Cape Town",
    departDate: "2026-11-05",
    returnDate: "2026-11-12",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [10],
    wishes: "Cape Town, Table Mountain, Cape Point, winelands 1 dan, družini prijazno.",
    expectCityHints: ["cape town", "table mountain", "stellenbosch", "camps bay"],
    flightContext: {
      outboundDepart: "21:20",
      outboundArrive: "09:55",
      outboundArriveDayOffset: 1,
      inboundDepart: "21:40",
      inboundArrive: "06:50",
    },
  },
  {
    id: "07-ZRH-DXB",
    region: "Middle East",
    originIata: "ZRH",
    originPlace: "Zurich",
    destinationIata: "DXB",
    destinationPlace: "Dubai",
    departDate: "2026-12-02",
    returnDate: "2026-12-07",
    budget: "luxury",
    pace: "packed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Dubai: Old Dubai + marina, desert safari 1 dan, spa večer.",
    expectCityHints: ["dubai", "marina", "burj", "deira", "palm"],
    flightContext: {
      outboundDepart: "14:05",
      outboundArrive: "22:40",
      outboundArriveDayOffset: 0,
      inboundDepart: "01:55",
      inboundArrive: "06:10",
    },
  },
  {
    id: "08-FCO-ATH",
    region: "Europe",
    originIata: "FCO",
    originPlace: "Rome",
    destinationIata: "ATH",
    destinationPlace: "Greece",
    departDate: "2026-06-18",
    returnDate: "2026-06-24",
    budget: "budget",
    pace: "relaxed",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Atene + Santorini, zgodovina in plaže, sproščeno.",
    expectCityHints: ["athens", "atene", "santorini", "acropolis", "plaka"],
    flightContext: {
      outboundDepart: "08:35",
      outboundArrive: "11:20",
      outboundArriveDayOffset: 0,
      inboundDepart: "17:50",
      inboundArrive: "18:55",
    },
  },
  {
    id: "09-MAD-LIM",
    region: "South America",
    originIata: "MAD",
    originPlace: "Madrid",
    destinationIata: "LIM",
    destinationPlace: "Peru",
    departDate: "2026-08-14",
    returnDate: "2026-08-22",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    childrenAges: [],
    wishes: "Lima + Cusco/Machu Picchu, kultura in hrana, realističen tempo.",
    expectCityHints: ["lima", "cusco", "machu", "miraflores", "sacred"],
    flightContext: {
      outboundDepart: "12:40",
      outboundArrive: "18:15",
      outboundArriveDayOffset: 0,
      inboundDepart: "20:50",
      inboundArrive: "14:40",
    },
  },
  {
    id: "10-WAW-LIS",
    region: "Europe",
    originIata: "WAW",
    originPlace: "Warsaw",
    destinationIata: "LIS",
    destinationPlace: "Portugal",
    departDate: "2026-09-08",
    returnDate: "2026-09-14",
    budget: "budget",
    pace: "relaxed",
    paxAdults: 1,
    childrenAges: [],
    wishes: "Lisbon + Sintra, hrana, tramvaji, solo traveler.",
    expectCityHints: ["lisbon", "lisboa", "sintra", "belem", "alfama"],
    flightContext: {
      outboundDepart: "06:50",
      outboundArrive: "10:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:25",
      inboundArrive: "23:40",
    },
  },
];

const AIRPORT_SIGHTSEEING =
  /\b(letališč|airport|terminal|runway|gate\s?\d|airside|departure hall)\b/i;
const SIGHTSEEING_TYPE = /\b(sight|museum|palace|temple|wat |beach|market|park|tower|cathedral)\b/i;
const ORIGIN_CITY =
  /\b(munich|münchen|ljubljana|frankfurt|vienna|dunaj|paris|amsterdam|zurich|zürich|rome|rim|madrid|warsaw|varšava)\b/i;
const EN_LEAK = /\b(visit|enjoy|explore|recommended|don't miss|must[- ]see)\b/i;
const LOGISTICS =
  /\b(check-?in|prihod|odhod|prevoz|let |flight|transfer|osvežitev|zajtrk|kosilo|večerja|hotel)\b/i;

function dayText(day: AiTripPlan["days"][number]): string {
  const slots = [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
  return [
    day.title,
    day.city,
    day.summary,
    ...slots.map((a) => `${a.name} ${a.description ?? ""} ${a.type ?? ""}`),
  ]
    .filter(Boolean)
    .join(" ");
}

function analyze(plan: AiTripPlan, s: Scenario, expectedDays: number) {
  const issues: string[] = [];
  const warnings: string[] = [];
  let totalPins = 0;
  let daysWithPins = 0;
  const pinCounts: number[] = [];
  const names: string[] = [];

  if (!hasAcceptablePlanDayCoverage(plan.days.length, expectedDays)) {
    issues.push(`incomplete days: ${plan.days.length}/${expectedDays}`);
  }

  const dayNums = plan.days.map((d) => d.day);
  if (new Set(dayNums).size !== dayNums.length) {
    issues.push(`duplicate day_number: ${dayNums.join(",")}`);
  }

  const destBlob = `${plan.destinationName ?? ""} ${s.destinationPlace}`.toLowerCase();
  const cityBlob = plan.days
    .filter((d) => !d.inFlightDay)
    .map((d) => `${d.city ?? ""} ${dayText(d)}`.toLowerCase())
    .join(" | ");

  const hitHint = s.expectCityHints.some((h) => cityBlob.includes(h.toLowerCase()));
  if (!hitHint && plan.days.length > 2) {
    issues.push(
      `destination mismatch: no expected city hints (${s.expectCityHints.join("/")}) in non-flight days`,
    );
  }

  // Origin city should not dominate destination sightseeing days.
  let originSightDays = 0;
  for (const day of plan.days) {
    if (day.inFlightDay) continue;
    const blob = dayText(day);
    if (ORIGIN_CITY.test(blob) && SIGHTSEEING_TYPE.test(blob) && !destBlob.includes((day.city ?? "").toLowerCase())) {
      // Only flag if city looks like origin airport city and not destination.
      if (ORIGIN_CITY.test(day.city ?? "") || ORIGIN_CITY.test(day.title ?? "")) {
        originSightDays += 1;
      }
    }
  }
  if (originSightDays >= 2) {
    issues.push(`origin-city sightseeing on ${originSightDays} destination days`);
  }

  for (const day of plan.days) {
    const slots = [
      ...(day.activities?.morning ?? []),
      ...(day.activities?.afternoon ?? []),
      ...(day.activities?.evening ?? []),
    ];
    if (slots.length === 0 && !day.inFlightDay) {
      issues.push(`D${day.day}: empty activities`);
    }

    for (const a of slots) {
      const key = a.name.trim().toLowerCase();
      const blob = `${a.name} ${a.description ?? ""} ${a.type ?? ""}`;
      if (
        !day.inFlightDay &&
        AIRPORT_SIGHTSEEING.test(blob) &&
        SIGHTSEEING_TYPE.test(blob) &&
        !LOGISTICS.test(blob)
      ) {
        issues.push(`D${day.day}: airport sightseeing "${a.name}"`);
      }
      if (EN_LEAK.test(blob)) {
        warnings.push(`D${day.day}: English leak in "${a.name}"`);
      }
      if (
        names.includes(key) &&
        SIGHTSEEING_TYPE.test(blob) &&
        !LOGISTICS.test(key)
      ) {
        warnings.push(`D${day.day}: repeat POI "${a.name}"`);
      }
      names.push(key);
    }

    const md = buildMapDay(plan, day.day);
    const n = md?.pins.length ?? 0;
    pinCounts.push(n);
    totalPins += n;
    if (n > 0) daysWithPins += 1;
    if (!md) issues.push(`D${day.day}: no MapDay`);
    if (!day.inFlightDay && n === 0) {
      warnings.push(`D${day.day}: 0 map pins`);
    }
  }

  // Soft: English leak / repeats don't fail the batch unless many.
  if (warnings.filter((w) => w.includes("English leak")).length >= 3) {
    issues.push("English leak in multiple activities");
  }

  return {
    destinationName: plan.destinationName,
    cities: [...new Set(plan.days.map((d) => d.city).filter(Boolean))],
    expectedDays,
    daysWithPins: `${daysWithPins}/${plan.days.length}`,
    totalPins,
    avgPinsPerDay: Number((totalPins / Math.max(1, plan.days.length)).toFixed(2)),
    pinCounts,
    issues,
    warnings,
    ok: issues.length === 0,
  };
}

const RUN_LIVE = process.env.RUN_LIVE_PLAN_QA === "1";
const DATE_TAG = "2026-07-24";
const OUT = resolve(process.cwd(), ".tmp-plan-qa-10");
const EXPORT = resolve(process.cwd(), `plan-exports/qa-10-${DATE_TAG}`);

describe.runIf(RUN_LIVE)("batch plan QA ×10", () => {
  it(
    "generates 10 plans, scores nonsense, writes PDFs",
    async () => {
      expect(geminiApiKey()).toBeTruthy();
      mkdirSync(OUT, { recursive: true });
      mkdirSync(EXPORT, { recursive: true });

      const resume = process.env.RESUME !== "0";
      const results: Array<Record<string, unknown>> = [];

      for (const s of SCENARIOS) {
        const jsonPath = resolve(OUT, `${s.id}.json`);
        const started = Date.now();
        const expectedDays = tripDayCount(s.departDate, s.returnDate);
        let entry: Record<string, unknown> = {
          id: s.id,
          region: s.region,
          route: `${s.originIata}→${s.destinationIata}`,
          expectedDays,
          budget: s.budget,
          pace: s.pace,
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
            const raw = await generateTripPlan(buildGeminiTripPlanParams(input, expectedDays));
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
              console.log(`[QA10] ${s.id} FAIL`, built.error);
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
          const analysis = analyze(plan, s, expectedDays);
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
          writeFileSync(resolve(OUT, `${s.id}.pdf`), Buffer.from(pdf.buffer));
          writeFileSync(resolve(EXPORT, `${s.id}.pdf`), Buffer.from(pdf.buffer));

          entry = {
            ...entry,
            status: analysis.ok ? "ok" : "issues",
            ms: Date.now() - started,
            days: plan.days.length,
            ...analysis,
            pdf: `plan-exports/qa-10-${DATE_TAG}/${s.id}.pdf`,
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
          `[QA10] ${s.id} ${entry.status} days=${entry.days ?? "-"}/${expectedDays} pins=${entry.avgPinsPerDay ?? "-"} ${entry.ms}ms`,
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
        `# Plan QA ×10 — ${DATE_TAG}`,
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
          return `| ${r.id} | ${r.region} | ${r.route} | ${r.destinationName ?? "—"} | ${r.days ?? "—"}/${r.expectedDays ?? "—"} | ${pins} | ${r.status} | \`${r.id}.pdf\` |`;
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
        "## Warnings (non-failing)",
        "",
        ...results
          .filter((r) => Array.isArray(r.warnings) && (r.warnings as string[]).length)
          .map((r) => `- **${r.id}**: ${(r.warnings as string[]).join("; ")}`),
        "",
      ].join("\n");
      writeFileSync(resolve(EXPORT, "REPORT.md"), md);

      console.log(JSON.stringify(report.totals, null, 2));
      expect(ok + issues).toBeGreaterThanOrEqual(7);
      expect(fail).toBeLessThanOrEqual(3);
    },
    2_400_000,
  );
});
