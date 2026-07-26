/**
 * Live QA ×10 — 5 motorhome + 5 flight plans, PDFs + deep sense-check.
 *
 * NODE_USE_ENV_PROXY=1 RUN_LIVE_PLAN_QA=1 RESUME=0 npx vitest run scripts/batch-plan-qa-mixed-10.test.ts --testTimeout 3600000 --pool=forks
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { tripAlreadyHasKwaiDayTrip } from "@/lib/bangkokKwaiDayTrip";
import { buildCatalogPlanFromResponse } from "@/lib/geminiProCatalog";
import { generateTripPlan } from "@/lib/geminiPro";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import {
  buildGeminiTripPlanParams,
  hasAcceptablePlanDayCoverage,
  tripDayCount,
} from "@/lib/geminiPro.functions";
import { applyItineraryGuards } from "@/lib/itineraryGuards";
import {
  buildMapDay,
  finalizeItineraryMapCoords,
  type MapDay,
} from "@/lib/itineraryMapModel";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";
import { collectMotorhomeRoadTripStops } from "@/lib/motorhomeRoute";
import { buildPdfPlanTitle } from "@/lib/pdfPlanTitle";
import { generatePlanPdf } from "@/lib/pdf-export";
import { geminiApiKey } from "@/lib/llm";
import { haversineKm } from "@/lib/geoMath";

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

type Kind = "motorhome" | "flight";

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
  budget: "budget" | "standard" | "luxury";
  pace: "relaxed" | "balanced" | "packed";
  paxAdults: number;
  wishes: string;
  expectHints: string[];
  flightContext?: GenerateGeminiProTripInput["flightContext"];
};

const SCENARIOS: Scenario[] = [
  // —— 5 motorhome ——
  {
    id: "MH-01-Mezica-Italija",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Mežica",
    destinationIata: "FCO",
    destinationPlace: "Italija",
    departDate: "2026-08-14",
    returnDate: "2026-08-24",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom: Mežica → Italija (Benetke, Garda, Firence, Rim) → povratek v Mežico. Kampi zunaj ZTL, sproščeno. Vsak dan poimenuj kamp.",
    expectHints: ["venice", "benet", "rome", "rim", "florence", "firen", "garda", "lazise"],
  },
  {
    id: "MH-02-Ljubljana-Hrvaška",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "ZAD",
    destinationPlace: "Hrvaška",
    departDate: "2026-07-10",
    returnDate: "2026-07-18",
    budget: "budget",
    pace: "balanced",
    paxAdults: 2,
    wishes:
      "Avtodom po Istri in Dalmaciji: Pula, Zadar, obala — kampi, plaže, povratek v Ljubljano.",
    expectHints: ["pula", "zadar", "istra", "split", "rovinj"],
  },
  {
    id: "MH-03-SG-NorthHolland",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Slovenj Gradec",
    destinationIata: "AMS",
    destinationPlace: "North Holland, NL",
    departDate: "2026-08-16",
    returnDate: "2026-08-26",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom Slovenj Gradec → Salzburg → Ren → Amsterdam / Texel → povratek prek Heidelberga v Slovenj Gradec. Kampi, brez mestnega jedra.",
    expectHints: ["salzburg", "amsterdam", "texel", "heidelberg", "koblenz"],
  },
  {
    id: "MH-04-Ljubljana-Spanija",
    kind: "motorhome",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "BCN",
    destinationPlace: "Španija",
    departDate: "2026-06-01",
    returnDate: "2026-06-14",
    budget: "standard",
    pace: "balanced",
    paxAdults: 3,
    wishes:
      "Avtodom proti Barceloni / Costa Brava — kampi, plaže, povratek v Ljubljano. City label mora ujemati aktivnosti.",
    expectHints: ["barcelona", "girona", "costa", "valencia", "narbonne", "marseille"],
  },
  {
    id: "MH-05-Maribor-Albanija",
    kind: "motorhome",
    region: "Europe",
    originIata: "MBX",
    originPlace: "Maribor",
    destinationIata: "TIA",
    destinationPlace: "Albanija",
    departDate: "2026-08-01",
    returnDate: "2026-08-12",
    budget: "budget",
    pace: "relaxed",
    paxAdults: 2,
    wishes:
      "Avtodom Maribor → Črna gora / Albanija (Tirana, obala) — realistične etape (ne 500 km + ogled isti dan), kampi, povratek v Maribor.",
    expectHints: ["tirana", "durres", "budva", "kotor", "shkod"],
  },
  // —— 5 flight ——
  {
    id: "FL-01-MUC-BKK",
    kind: "flight",
    region: "Asia",
    originIata: "MUC",
    originPlace: "München",
    destinationIata: "BKK",
    destinationPlace: "Thailand",
    departDate: "2026-09-19",
    returnDate: "2026-09-28",
    budget: "standard",
    pace: "relaxed",
    paxAdults: 2,
    wishes: "Bangkok + templji + celodnevni izlet Mae Klong/Kwai, hrana — sproščeno.",
    expectHints: ["bangkok", "maeklong", "mae klong", "kwai", "kanchanaburi", "damnoen"],
    flightContext: {
      outboundDepart: "22:30",
      outboundArrive: "18:10",
      outboundArriveDayOffset: 1,
      inboundDepart: "23:40",
      inboundArrive: "06:15",
    },
  },
  {
    id: "FL-02-LJU-BCN",
    kind: "flight",
    region: "Europe",
    originIata: "LJU",
    originPlace: "Ljubljana",
    destinationIata: "BCN",
    destinationPlace: "Barcelona",
    departDate: "2026-05-12",
    returnDate: "2026-05-18",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    wishes: "Barcelona: Gaudí, plaža, tapas — brez Madride.",
    expectHints: ["barcelona", "sagrada", "barceloneta"],
    flightContext: {
      outboundDepart: "07:20",
      outboundArrive: "09:25",
      outboundArriveDayOffset: 0,
      inboundDepart: "19:10",
      inboundArrive: "21:20",
    },
  },
  {
    id: "FL-03-VIE-KEF",
    kind: "flight",
    region: "Europe",
    originIata: "VIE",
    originPlace: "Dunaj",
    destinationIata: "KEF",
    destinationPlace: "Iceland",
    departDate: "2026-07-03",
    returnDate: "2026-07-09",
    budget: "luxury",
    pace: "balanced",
    paxAdults: 2,
    wishes: "Reykjavik, Golden Circle, Blue Lagoon — narava.",
    expectHints: ["reykjavik", "golden", "blue lagoon", "gullfoss"],
    flightContext: {
      outboundDepart: "11:05",
      outboundArrive: "13:40",
      outboundArriveDayOffset: 0,
      inboundDepart: "15:20",
      inboundArrive: "21:05",
    },
  },
  {
    id: "FL-04-FRA-NRT",
    kind: "flight",
    region: "Asia",
    originIata: "FRA",
    originPlace: "Frankfurt",
    destinationIata: "NRT",
    destinationPlace: "Japan",
    departDate: "2026-10-10",
    returnDate: "2026-10-18",
    budget: "standard",
    pace: "balanced",
    paxAdults: 2,
    wishes: "Tokyo + Kyoto, templji, hrana — brez Osake, če gre.",
    expectHints: ["tokyo", "kyoto", "shibuya", "asakusa"],
    flightContext: {
      outboundDepart: "13:40",
      outboundArrive: "08:50",
      outboundArriveDayOffset: 1,
      inboundDepart: "10:30",
      inboundArrive: "16:55",
    },
  },
  {
    id: "FL-05-ZRH-DXB",
    kind: "flight",
    region: "Middle East",
    originIata: "ZRH",
    originPlace: "Zürich",
    destinationIata: "DXB",
    destinationPlace: "Dubai",
    departDate: "2026-11-08",
    returnDate: "2026-11-14",
    budget: "luxury",
    pace: "relaxed",
    paxAdults: 2,
    wishes: "Dubai: marina, stari Dubai, puščava — sproščeno.",
    expectHints: ["dubai", "marina", "souk", "desert", "burj"],
    flightContext: {
      outboundDepart: "09:15",
      outboundArrive: "18:40",
      outboundArriveDayOffset: 0,
      inboundDepart: "01:20",
      inboundArrive: "06:05",
    },
  },
];

const LIVE = process.env.RUN_LIVE_PLAN_QA === "1" && Boolean(geminiApiKey());
const DATE_TAG = "mixed-10-2026-07-26";
const OUT = resolve(process.cwd(), `.tmp-plan-${DATE_TAG}`);
const EXPORT = resolve(process.cwd(), `plan-exports/${DATE_TAG}`);
const DOWNLOADS = resolve(process.env.HOME ?? "", "Downloads/skybooplan-qa-mixed-10");

function planBlob(plan: AiTripPlan): string {
  return plan.days
    .flatMap((d) => [
      d.city,
      d.title,
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

/** Same-day activity clocks must not overlap / go backwards. */
function findTimeConflicts(day: DayPlan): string[] {
  const issues: string[] = [];
  const slots = ["morning", "afternoon", "evening"] as const;
  const events: Array<{ label: string; start: number; end: number }> = [];

  for (const slot of slots) {
    for (const a of day.activities?.[slot] ?? []) {
      const start = parseHm(a.arrivalTime) ?? parseHm(a.departureTime);
      const end = parseHm(a.departureTime) ?? parseHm(a.arrivalTime);
      if (start == null) continue;
      events.push({
        label: a.name,
        start,
        end: end != null && end >= start ? end : start + 60,
      });
    }
  }

  events.sort((a, b) => a.start - b.start);
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1]!;
    const cur = events[i]!;
    if (cur.start < prev.end) {
      issues.push(
        `D${day.day} time overlap: "${prev.label}" ends ${Math.floor(prev.end / 60)}:${String(prev.end % 60).padStart(2, "0")} vs "${cur.label}" starts ${Math.floor(cur.start / 60)}:${String(cur.start % 60).padStart(2, "0")}`,
      );
    }
  }
  return issues;
}

function mapSense(plan: AiTripPlan, kind: Kind): { issues: string[]; warnings: string[]; mapSummary: string } {
  const issues: string[] = [];
  const warnings: string[] = [];
  let daysWithCenter = 0;
  let daysWithDrive = 0;
  let pinCapBreaches = 0;

  for (const day of plan.days) {
    if (day.inFlightDay) continue;
    const md: MapDay | null = buildMapDay(plan, day.day);
    if (!md?.center) {
      warnings.push(`D${day.day} map missing city center`);
      continue;
    }
    daysWithCenter += 1;
    if ((md.pins?.length ?? 0) > 4) pinCapBreaches += 1;
    if (md.legIn?.mode === "drive") daysWithDrive += 1;

    // Sightseeing center should not sit on a typical runway (IATA hub seed).
    if (kind === "motorhome" && day.city && /letališč|airport/i.test(day.city)) {
      warnings.push(`D${day.day} city looks like airport label`);
    }
  }

  if (daysWithCenter < Math.max(1, plan.days.length - 2)) {
    issues.push(`map centers only ${daysWithCenter}/${plan.days.length}`);
  }
  if (kind === "motorhome" && daysWithDrive < 2) {
    issues.push(`motorhome map has almost no drive legs (${daysWithDrive})`);
  }
  if (pinCapBreaches > 0) {
    warnings.push(`${pinCapBreaches} day(s) with >4 map pins`);
  }

  // Consecutive day jumps > 900 km are unrealistic for motorhome.
  if (kind === "motorhome") {
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
        if (km > 900) {
          issues.push(`D${a.day}→D${b.day} hop ~${Math.round(km)} km (too long for one RV day)`);
        } else if (km > 650) {
          warnings.push(`D${a.day}→D${b.day} hop ~${Math.round(km)} km (very long)`);
        }
      }
    }
  }

  return {
    issues,
    warnings,
    mapSummary: `centers ${daysWithCenter}/${plan.days.length}, driveLegs~${daysWithDrive}, pinCapBreaches ${pinCapBreaches}`,
  };
}

function analyze(plan: AiTripPlan, s: Scenario, expectedDays: number) {
  const issues: string[] = [];
  const warnings: string[] = [];
  const blob = planBlob(plan);
  const blobL = blob.toLowerCase();
  const cities = [...new Set(plan.days.map((d) => d.city).filter(Boolean))];

  const maxDay = Math.max(...plan.days.map((d) => d.day), 0);
  if (!hasAcceptablePlanDayCoverage(maxDay, expectedDays)) {
    issues.push(`coverage ${maxDay}/${expectedDays}`);
  }

  const hintHits = s.expectHints.filter((h) => blobL.includes(h.toLowerCase()));
  if (hintHits.length === 0) {
    warnings.push(`no expectHints matched (${s.expectHints.join(", ")})`);
  }

  // Truncation / tip spam (engine regressions)
  if (/A14\/A4/i.test(blob)) issues.push("A14/A4 corridor spam still present");
  if (/…|\.\.\.\s*$/m.test(blob) || / in…| in\.\.\./i.test(blob)) {
    issues.push("truncated activity copy with ellipsis");
  }
  if (/trajekt.*→\s*Amsterdam|Den Helder\s*→\s*Amsterdam/i.test(blob)) {
    issues.push("ferry transport header wrongly points at Amsterdam");
  }

  for (const day of plan.days) {
    issues.push(...findTimeConflicts(day));
  }

  const map = mapSense(plan, s.kind);
  issues.push(...map.issues);
  warnings.push(...map.warnings);

  if (s.kind === "motorhome") {
    if (plan.groundTransportMode !== "motorhome" && plan.accommodationMode !== "motorhome") {
      warnings.push("missing motorhome mode flags");
    }
    if (/mednarodn[ei].*let|international flight/i.test(blobL)) {
      warnings.push("flight-home wording on motorhome plan");
    }
    const stops = collectMotorhomeRoadTripStops(plan);
    if (stops.length < 2) issues.push("motorhome Maps stops < 2");
    if (stops.some((x) => /^(italy|italija|croatia|hrvaška|spain|španija|albania|albanija)$/i.test(x))) {
      issues.push("country-only Maps stop");
    }
    const origin = (plan.originPlace || s.originPlace).trim();
    if (stops[0] && origin && stops[0].toLowerCase() !== origin.toLowerCase()) {
      warnings.push(`Maps start "${stops[0]}" ≠ origin "${origin}"`);
    }
    // Return-home is a hard product requirement for MH loops.
    if (stops.length >= 2) {
      const start = stops[0]!.toLowerCase();
      const end = stops[stops.length - 1]!.toLowerCase();
      if (start !== end) {
        issues.push(`Maps route does not close at origin ("${stops[0]}" → … → "${stops[stops.length - 1]}")`);
      }
    }
    const lastCity = (plan.days[plan.days.length - 1]?.city ?? "").toLowerCase();
    const originKey = origin.toLowerCase().slice(0, 5);
    if (originKey && lastCity && !lastCity.includes(originKey) && !origin.toLowerCase().includes(lastCity.slice(0, 5))) {
      warnings.push(`last day city "${plan.days[plan.days.length - 1]?.city}" may not be home (${origin})`);
    }
    if (/Tinidee/i.test(blob)) issues.push("concrete Tinidee hotel brand");
  }

  if (s.kind === "flight" && s.destinationIata === "BKK") {
    if (!tripAlreadyHasKwaiDayTrip(blob)) {
      warnings.push("BKK plan missing Mae Klong / Kwai day trip");
    }
    if (/Tinidee/i.test(blob)) issues.push("concrete Tinidee hotel brand");
  }

  // Arrival clock vs flightContext (day 1)
  if (s.kind === "flight" && s.flightContext?.outboundArrive) {
    const d1 = plan.days.find((d) => d.day === 1);
    const acts = [
      ...(d1?.activities?.morning ?? []),
      ...(d1?.activities?.afternoon ?? []),
      ...(d1?.activities?.evening ?? []),
    ];
    const arrivalAct = acts.find((a) => /prihod|arrival|letališč|airport/i.test(a.name ?? ""));
    const clock = arrivalAct?.arrivalTime || arrivalAct?.departureTime;
    if (clock && s.flightContext.outboundArrive) {
      const want = parseHm(s.flightContext.outboundArrive);
      const got = parseHm(clock);
      if (want != null && got != null && Math.abs(want - got) > 90) {
        warnings.push(
          `D1 arrival clock ${clock} far from flight arrive ${s.flightContext.outboundArrive}`,
        );
      }
    }
  }

  let totalPins = 0;
  let daysWithPins = 0;
  for (const day of plan.days) {
    const md = buildMapDay(plan, day.day);
    const n = md?.pins.length ?? 0;
    totalPins += n;
    if (n > 0) daysWithPins += 1;
  }

  const sense =
    issues.length === 0
      ? warnings.length === 0
        ? "OK"
        : "OK_WITH_WARNINGS"
      : "FAIL";

  return {
    destinationName: plan.destinationName,
    cities,
    expectedDays,
    maxDay,
    daysWithPins: `${daysWithPins}/${plan.days.length}`,
    avgPinsPerDay: Number((totalPins / Math.max(1, plan.days.length)).toFixed(2)),
    hintHits,
    issues,
    warnings,
    ok: issues.length === 0,
    sense,
    mapSummary: map.mapSummary,
    mapsStops:
      s.kind === "motorhome" ? collectMotorhomeRoadTripStops(plan).slice(0, 14) : undefined,
  };
}

describe.runIf(LIVE)("batch mixed QA ×10 (5 MH + 5 flight)", () => {
  it(
    "generates 10 plans, writes PDFs, Downloads copy, QUALITY-REVIEW",
    async () => {
      expect(geminiApiKey()).toBeTruthy();
      mkdirSync(OUT, { recursive: true });
      mkdirSync(EXPORT, { recursive: true });
      try {
        mkdirSync(DOWNLOADS, { recursive: true });
      } catch {
        /* no Downloads */
      }

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
          route:
            s.kind === "motorhome"
              ? `${s.originPlace} → ${s.destinationPlace}`
              : `${s.originIata}→${s.destinationIata}`,
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
            const input: GenerateGeminiProTripInput = {
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
              ...(s.kind === "motorhome"
                ? { groundTransportMode: "motorhome" as const }
                : { flightContext: s.flightContext }),
            };

            let lastError: string | null = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                const raw = await generateTripPlan(
                  buildGeminiTripPlanParams(input, expectedDays),
                );
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

            if (!plan) {
              entry = {
                ...entry,
                status: "fail",
                sense: "FAIL",
                error: lastError,
                ms: Date.now() - started,
              };
              results.push(entry);
              writeFileSync(resolve(OUT, "report-live.json"), JSON.stringify({ results }, null, 2));
              console.log(`[MIX10] ${s.id} FAIL`, lastError);
              continue;
            }

            writeFileSync(jsonPath, JSON.stringify(plan, null, 2));
          }

          applyItineraryGuards(plan, { arrivalDay: 1, language: "sl" });
          if (s.kind === "motorhome") {
            enrichMotorhomePlanTips(plan, "sl");
          }
          finalizeItineraryMapCoords(plan);
          // Persist post-guard plan
          writeFileSync(jsonPath, JSON.stringify(plan, null, 2));

          const analysis = analyze(plan, s, expectedDays);
          const title = buildPdfPlanTitle({
            groundTransportMode:
              plan.groundTransportMode ?? (s.kind === "motorhome" ? "motorhome" : undefined),
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
          try {
            copyFileSync(resolve(EXPORT, `${s.id}.pdf`), resolve(DOWNLOADS, `${s.id}.pdf`));
          } catch {
            /* Downloads optional */
          }

          entry = {
            ...entry,
            status: analysis.ok ? "ok" : "issues",
            ms: Date.now() - started,
            days: plan.days.length,
            title,
            ...analysis,
            pdf: `plan-exports/${DATE_TAG}/${s.id}.pdf`,
          };
        } catch (err) {
          entry = {
            ...entry,
            status: "error",
            sense: "FAIL",
            error: err instanceof Error ? err.message : String(err),
            ms: Date.now() - started,
          };
        }

        results.push(entry);
        writeFileSync(resolve(OUT, "report-live.json"), JSON.stringify({ results }, null, 2));
        console.log(
          `[MIX10] ${s.id} ${entry.status}/${entry.sense} days=${entry.days ?? "-"}/${expectedDays} ${entry.ms}ms`,
          entry.error ?? (Array.isArray(entry.issues) ? entry.issues : "") ?? "",
        );
      }

      const mh = results.filter((r) => r.kind === "motorhome");
      const fl = results.filter((r) => r.kind === "flight");
      const ok = results.filter((r) => r.status === "ok").length;
      const issuesN = results.filter((r) => r.status === "issues").length;
      const fail = results.filter((r) => r.status === "fail" || r.status === "error").length;
      const senseOk = results.filter((r) => r.sense === "OK" || r.sense === "OK_WITH_WARNINGS").length;

      const report = {
        generatedAt: new Date().toISOString(),
        downloadsFolder: DOWNLOADS,
        totals: {
          ok,
          issues: issuesN,
          fail,
          senseOk,
          motorhomeGenerated: mh.filter((r) => r.status !== "fail" && r.status !== "error").length,
          flightGenerated: fl.filter((r) => r.status !== "fail" && r.status !== "error").length,
        },
        results,
      };

      writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
      writeFileSync(resolve(EXPORT, "report.json"), JSON.stringify(report, null, 2));

      const md = [
        `# Mixed plan QA ×10 — ${DATE_TAG}`,
        "",
        `Generated: ${report.generatedAt}`,
        "",
        `**Totals:** ok ${ok} · issues ${issuesN} · fail ${fail} · sense-pass ${senseOk}/10`,
        "",
        `PDFs also copied to: \`${DOWNLOADS}\``,
        "",
        "## Motorhome (5)",
        "",
        "| ID | Route | Days | Maps | Sense | Map | PDF |",
        "|---|---|---|---|---|---|---|",
        ...mh.map((r) => {
          const stops = Array.isArray(r.mapsStops) ? (r.mapsStops as string[]).join(" → ") : "—";
          return `| ${r.id} | ${r.route} | ${r.days ?? "—"}/${r.expectedDays ?? "—"} | ${stops} | ${r.sense ?? r.status} | ${r.mapSummary ?? "—"} | \`${r.id}.pdf\` |`;
        }),
        "",
        "## Flight (5)",
        "",
        "| ID | Route | Dest | Days | Pins | Sense | Map | PDF |",
        "|---|---|---|---|---|---|---|---|",
        ...fl.map((r) => {
          const pins =
            typeof r.avgPinsPerDay === "number"
              ? `${r.daysWithPins} · ${r.avgPinsPerDay}/d`
              : "—";
          return `| ${r.id} | ${r.route} | ${r.destinationName ?? "—"} | ${r.days ?? "—"}/${r.expectedDays ?? "—"} | ${pins} | ${r.sense ?? r.status} | ${r.mapSummary ?? "—"} | \`${r.id}.pdf\` |`;
        }),
        "",
        "## Issues / warnings",
        "",
        ...results.map((r) => {
          const detail = r.error || (Array.isArray(r.issues) ? (r.issues as string[]).join("; ") : "");
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

      const quality = [
        `# Sense review — ${DATE_TAG}`,
        "",
        "Avtomatika zdaj meri: ure (overlap), MH return-home, A14 spam, ellipsis, ferry→Amsterdam, map centers + drive legs, hop km.",
        "",
        "| ID | Sense | Glavne ugotovitve |",
        "|---|---|---|",
        ...results.map((r) => {
          const bits = [
            ...(Array.isArray(r.issues) ? (r.issues as string[]) : []),
            ...(Array.isArray(r.warnings) ? (r.warnings as string[]).map((w) => `warn:${w}`) : []),
            r.error ? String(r.error) : "",
          ]
            .filter(Boolean)
            .slice(0, 4)
            .join("; ");
          return `| ${r.id} | ${r.sense ?? r.status} | ${bits || "čisto"} |`;
        }),
        "",
        `**Sense-pass:** ${senseOk}/10`,
        "",
      ].join("\n");
      writeFileSync(resolve(EXPORT, "QUALITY-REVIEW.md"), quality);
      try {
        copyFileSync(resolve(EXPORT, "QUALITY-REVIEW.md"), resolve(DOWNLOADS, "QUALITY-REVIEW.md"));
        copyFileSync(resolve(EXPORT, "REPORT.md"), resolve(DOWNLOADS, "REPORT.md"));
      } catch {
        /* optional */
      }

      console.log(JSON.stringify(report.totals, null, 2));
      expect(ok + issuesN).toBeGreaterThanOrEqual(6);
      expect(fail).toBeLessThanOrEqual(4);
    },
    3_600_000,
  );
});

describe.runIf(!LIVE)("mixed QA skipped without RUN_LIVE_PLAN_QA=1", () => {
  it("documents how to run", () => {
    expect(true).toBe(true);
  });
});
