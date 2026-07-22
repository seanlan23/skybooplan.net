/**
 * Export PDFs + pin stats from already-generated .tmp-plan-continents/*.json
 * npx vitest run scripts/export-continent-pdfs.test.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMapDay, finalizeItineraryMapCoords } from "@/lib/itineraryMapModel";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { generatePlanPdf } from "@/lib/pdf-export";

describe("export continent PDFs", () => {
  it(
    "writes PDFs and pin report from cached JSON plans",
    async () => {
      const outDir = resolve(process.cwd(), ".tmp-plan-continents");
      mkdirSync(outDir, { recursive: true });
      const files = readdirSync(outDir).filter(
        (f) => f.endsWith(".json") && !f.startsWith("report"),
      );
      expect(files.length).toBeGreaterThanOrEqual(3);

      const report: Array<Record<string, unknown>> = [];
      for (const file of files) {
        const raw = JSON.parse(readFileSync(resolve(outDir, file), "utf8")) as {
          scenario?: {
            id?: string;
            continent?: string;
            originIata?: string;
            destinationIata?: string;
            departDate?: string;
            returnDate?: string;
            wishes?: string;
            destinationPlace?: string;
          };
          destinationName?: string;
          days?: AiTripPlan["days"];
        };
        if (!raw.days?.length) continue;

        const plan = {
          destinationName:
            raw.destinationName || raw.scenario?.destinationPlace || file,
          destinationIata: raw.scenario?.destinationIata,
          days: raw.days,
        } as AiTripPlan;
        finalizeItineraryMapCoords(plan);

        let totalPins = 0;
        let daysWithPins = 0;
        const pinCounts: number[] = [];
        for (const day of plan.days) {
          const md = buildMapDay(plan, day.day);
          const n = md?.pins.length ?? 0;
          pinCounts.push(n);
          totalPins += n;
          if (n > 0) daysWithPins += 1;
        }

        const id = raw.scenario?.id || basename(file, ".json");
        const pdf = await generatePlanPdf({
          title: `${raw.scenario?.originIata ?? "?"} → ${raw.scenario?.destinationIata ?? "?"} (${raw.scenario?.continent ?? ""})`,
          destination: plan.destinationName,
          start_date: raw.scenario?.departDate ?? null,
          end_date: raw.scenario?.returnDate ?? null,
          itinerary: plan as never,
          language: "sl",
          pax: 2,
          wishes: raw.scenario?.wishes ?? null,
        });
        const pdfPath = resolve(outDir, `${id}.pdf`);
        writeFileSync(pdfPath, Buffer.from(pdf.buffer));

        report.push({
          id,
          continent: raw.scenario?.continent,
          destinationName: plan.destinationName,
          days: plan.days.length,
          daysWithPins: `${daysWithPins}/${plan.days.length}`,
          totalPins,
          avgPinsPerDay: Number(
            (totalPins / Math.max(1, plan.days.length)).toFixed(2),
          ),
          pinCounts,
          pdf: pdfPath,
        });
      }

      writeFileSync(
        resolve(outDir, "report-pins-pdf.json"),
        JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2),
      );
      console.log(JSON.stringify(report, null, 2));
      expect(report.every((r) => (r.avgPinsPerDay as number) >= 2)).toBe(true);
      expect(report.length).toBeGreaterThanOrEqual(3);
    },
    120_000,
  );
});
