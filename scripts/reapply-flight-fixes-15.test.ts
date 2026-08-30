/**
 * Re-apply flight-context guards to cached FL JSON and refresh PDFs.
 * RUN_LIVE_PLAN_QA=1 npx vitest run scripts/reapply-flight-fixes-15.test.ts --testTimeout 180000 --pool=forks
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { applyFlightContextToGeminiPlan } from "@/lib/geminiFlightContext";
import { applyItineraryGuards } from "@/lib/itineraryGuards";
import { finalizeItineraryMapCoords } from "@/lib/itineraryMapModel";
import { generatePlanPdf } from "@/lib/pdf-export";
import { buildPdfPlanTitle } from "@/lib/pdfPlanTitle";
import { tripDayCount } from "@/lib/geminiPro.functions";

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

const SRC = resolve(process.cwd(), ".tmp-plan-mixed-15-2026-08-18");
const DESKTOP = resolve(process.env.HOME ?? "", "Desktop/skybooplan-15-planov-2026-08-18");
const EXPORT = resolve(process.cwd(), "plan-exports/mixed-15-2026-08-18");

const FLIGHTS = [
  {
    id: "FL-01-Manila",
    originIata: "MUC",
    destinationIata: "MNL",
    originPlace: "München",
    destinationPlace: "Filipini / Manila",
    departDate: "2026-10-03",
    returnDate: "2026-10-16",
    flightContext: {
      outboundDepart: "21:10",
      outboundArrive: "18:35",
      outboundArriveDayOffset: 1,
      inboundDepart: "21:15",
      inboundArrive: "06:40",
    },
  },
  {
    id: "FL-03-Japonska",
    originIata: "FRA",
    destinationIata: "NRT",
    originPlace: "Frankfurt",
    destinationPlace: "Japonska",
    departDate: "2026-11-02",
    returnDate: "2026-11-14",
    flightContext: {
      outboundDepart: "13:25",
      outboundArrive: "08:40",
      outboundArriveDayOffset: 1,
      inboundDepart: "10:50",
      inboundArrive: "16:20",
    },
  },
  {
    id: "FL-05-Maroko",
    originIata: "ZRH",
    destinationIata: "RAK",
    originPlace: "Zürich",
    destinationPlace: "Maroko",
    departDate: "2026-11-08",
    returnDate: "2026-11-18",
    flightContext: {
      outboundDepart: "08:15",
      outboundArrive: "11:05",
      outboundArriveDayOffset: 0,
      inboundDepart: "18:40",
      inboundArrive: "21:35",
    },
  },
] as const;

describe.runIf(process.env.RUN_LIVE_PLAN_QA === "1")("reapply flight fixes", () => {
  it("rewrites last-day hub + PDFs", async () => {
    mkdirSync(DESKTOP, { recursive: true });
    mkdirSync(EXPORT, { recursive: true });
    for (const s of FLIGHTS) {
      const jsonPath = resolve(SRC, `${s.id}.json`);
      expect(existsSync(jsonPath)).toBe(true);
      const plan = JSON.parse(readFileSync(jsonPath, "utf8")) as AiTripPlan;
      applyFlightContextToGeminiPlan(plan, s.flightContext, {
        originIata: s.originIata,
        language: "sl",
        expectedDays: tripDayCount(s.departDate, s.returnDate),
      });
      applyItineraryGuards(plan, { arrivalDay: 1, language: "sl" });
      finalizeItineraryMapCoords(plan);
      writeFileSync(jsonPath, JSON.stringify(plan, null, 2));
      const last = plan.days[plan.days.length - 1]!;
      const title = buildPdfPlanTitle({
        originPlace: s.originPlace,
        destinationPlace: s.destinationPlace,
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
        pax: 2,
        travel_pace: "calm",
      });
      const buf = Buffer.from(pdf.buffer);
      writeFileSync(resolve(SRC, `${s.id}.pdf`), buf);
      writeFileSync(resolve(EXPORT, `${s.id}.pdf`), buf);
      writeFileSync(resolve(DESKTOP, `${s.id}.pdf`), buf);
      writeFileSync(resolve(DESKTOP, `${s.id}.json`), readFileSync(jsonPath));
      console.log(
        `[REAPPLY] ${s.id} last=${last.city} title=${last.title} inFlight=${last.inFlightDay}`,
      );
    }
  });
});
