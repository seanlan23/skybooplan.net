/**
 * Export curated landing showcase PDFs (NYC + Sydney).
 * npx vitest run scripts/export-landing-showcase.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { applyItineraryGuards } from "@/lib/itineraryGuards";
import { finalizeItineraryMapCoords } from "@/lib/itineraryMapModel";
import { generatePlanPdf } from "@/lib/pdf-export";

const SHOWCASES = [
  {
    id: "nyc",
    file: "nyc-curated.json",
    title: "Ljubljana → New York — showcase",
    start: "2026-09-12",
    end: "2026-09-18",
    wishes: "Sproščen New York: ikone, Brooklyn, en prosti dan.",
    pace: "relaxed",
  },
  {
    id: "sydney",
    file: "sydney-curated.json",
    title: "Zürich → Sydney — showcase",
    start: "2026-10-03",
    end: "2026-10-16",
    wishes: "Long-haul Sydney: jet-lag buffer, harbour, Bondi, Blue Mountains, Manly, Watsons Bay.",
    pace: "balanced",
  },
  {
    id: "motorhome-nl",
    file: "motorhome-nl-curated.json",
    title: "Avtodom · Slovenj Gradec → North Holland",
    start: "2026-08-16",
    end: "2026-08-26",
    wishes: "Avtodomski roadtrip: Alpe, Ren, Amsterdam, Texel, povratek.",
    pace: "relaxed",
  },
] as const;

describe("landing showcase PDFs", () => {
  it(
    "writes curated NYC + Sydney PDFs to public/showcase and plan-exports",
    async () => {
      const srcDir = resolve(process.cwd(), "plan-exports/landing-showcase");
      const publicDir = resolve(process.cwd(), "public/showcase");
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(publicDir, { recursive: true });

      for (const s of SHOWCASES) {
        const plan = JSON.parse(
          readFileSync(resolve(srcDir, s.file), "utf8"),
        ) as AiTripPlan;
        expect(plan.days?.length).toBeGreaterThanOrEqual(6);

        applyItineraryGuards(plan, { arrivalDay: 1, language: "sl" });
        finalizeItineraryMapCoords(plan);

        if (plan.groundTransportMode === "motorhome") {
          const { enrichMotorhomePlanTips } = await import("@/lib/motorhomePlanTips");
          enrichMotorhomePlanTips(plan, "sl");
        }

        // Smoke: no enricher placeholder leakage, max one evening meal/day.
        for (const day of plan.days) {
          for (const slot of ["morning", "afternoon", "evening"] as const) {
            for (const act of day.activities?.[slot] ?? []) {
              expect(act.name ?? "").not.toMatch(/glavni dopoldanski ogled/i);
              expect(act.description ?? "").not.toMatch(/glavni dopoldanski ogled/i);
              expect(act.description ?? "").not.toMatch(/…|\.\.\.\s*$/);
            }
          }
          const meals = (day.activities?.evening ?? []).filter(
            (a) => a.type === "EAT" || /večerja|dinner/i.test(a.name ?? ""),
          );
          expect(meals.length).toBeLessThanOrEqual(1);
          if (day.transportationTips) {
            expect(day.transportationTips).not.toMatch(/A14\/A4/i);
          }
          for (const leg of day.transportation ?? []) {
            expect(`${leg.from} → ${leg.to}`).not.toMatch(
              /trajekt.*→\s*Amsterdam|Den Helder\s*→\s*Amsterdam/i,
            );
          }
        }

        const pdf = await generatePlanPdf({
          title: s.title,
          destination: plan.destinationName,
          start_date: s.start,
          end_date: s.end,
          itinerary: plan as never,
          language: "sl",
          pax: 2,
          wishes: s.wishes,
          travel_pace: s.pace,
        });

        const name = `${s.id}-showcase.pdf`;
        writeFileSync(resolve(srcDir, name), Buffer.from(pdf.buffer));
        writeFileSync(resolve(publicDir, name), Buffer.from(pdf.buffer));

        // Also overwrite the user's Downloads copy for the motorhome soft-launch PDF.
        if (s.id === "motorhome-nl") {
          const downloads = resolve(
            process.env.HOME ?? "",
            "Downloads/Slovenj_Gradec_SI_-_North_Holland_NL.pdf",
          );
          try {
            writeFileSync(downloads, Buffer.from(pdf.buffer));
          } catch {
            // CI / sandbox without Downloads — ignore.
          }
        }
      }

      writeFileSync(
        resolve(srcDir, "README.md"),
        [
          "# Landing showcase PDFs",
          "",
          "Ročno očiščeni demo načrti za beta landing (ne živi Gemini output).",
          "",
          "- `nyc-showcase.pdf` — New York, 7 dni",
          "- `sydney-showcase.pdf` — Sydney, 14 dni (long-haul)",
          "- `motorhome-nl-showcase.pdf` — Avtodom SG → North Holland, 11 dni",
          "",
          "Javne kopije: `/showcase/*.pdf`",
          "",
          "Regenerate: `npx vitest run scripts/export-landing-showcase.test.ts`",
          "",
        ].join("\n"),
      );
    },
    180_000,
  );
});
