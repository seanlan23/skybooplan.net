/**
 * Export curated landing showcase PDFs (NYC + Sydney + France + motorhome).
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
    wishes: "Relaxed New York: icons, Brooklyn, one free day.",
    pace: "relaxed",
  },
  {
    id: "sydney",
    file: "sydney-curated.json",
    title: "Zurich → Sydney — showcase",
    start: "2026-10-03",
    end: "2026-10-16",
    wishes: "Long-haul Sydney: jet-lag buffer, harbour, Bondi, Blue Mountains, Manly, Watsons Bay.",
    pace: "balanced",
  },
  {
    id: "france",
    file: "france-curated.json",
    title: "Munich → France — showcase",
    start: "2026-10-26",
    end: "2026-11-02",
    wishes: "Paris + Lyon: TGV, food, early return flight with taxi only.",
    pace: "balanced",
  },
  {
    id: "motorhome-nl",
    file: "motorhome-nl-curated.json",
    title: "Motorhome · Slovenj Gradec → North Holland",
    start: "2026-08-16",
    end: "2026-08-26",
    wishes: "Motorhome road trip: Alps, Rhine, Amsterdam, Texel, return.",
    pace: "relaxed",
  },
] as const;

describe("landing showcase PDFs", () => {
  it(
    "writes curated showcase PDFs to public/showcase and plan-exports",
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

        applyItineraryGuards(plan, { arrivalDay: 1, language: "en" });
        finalizeItineraryMapCoords(plan);

        if (plan.groundTransportMode === "motorhome") {
          const { enrichMotorhomePlanTips } = await import("@/lib/motorhomePlanTips");
          enrichMotorhomePlanTips(plan, "en");
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
            // Early-flight days must not suggest first RER/metro as viable.
            expect(day.transportationTips).not.toMatch(
              /RER B.*04[:.]50|starts running around 0?4/i,
            );
          }
          for (const leg of day.transportation ?? []) {
            expect(`${leg.from} → ${leg.to}`).not.toMatch(
              /trajekt.*→\s*Amsterdam|Den Helder\s*→\s*Amsterdam/i,
            );
            expect(`${leg.from} → ${leg.to}`).not.toMatch(/^High\s*→\s*Speed/i);
            if (/lyon|paris|gare de lyon|part-dieu/i.test(`${leg.from} ${leg.to}`)) {
              expect(leg.duration).toMatch(/^2h/);
            }
          }
        }

        const pdf = await generatePlanPdf({
          title: s.title,
          destination: plan.destinationName,
          start_date: s.start,
          end_date: s.end,
          itinerary: plan as never,
          language: "en",
          pax: 2,
          wishes: s.wishes,
          travel_pace: s.pace,
        });

        const name = `${s.id}-showcase.pdf`;
        writeFileSync(resolve(srcDir, name), Buffer.from(pdf.buffer));
        writeFileSync(resolve(publicDir, name), Buffer.from(pdf.buffer));
      }

      writeFileSync(
        resolve(srcDir, "README.md"),
        [
          "# Landing showcase PDFs",
          "",
          "Curated English demo plans for the beta landing (not live Gemini output).",
          "",
          "- `nyc-showcase.pdf` — New York, 7 days",
          "- `sydney-showcase.pdf` — Sydney, 14 days (long-haul)",
          "- `france-showcase.pdf` — Paris + Lyon (MUC→CDG), 8 days",
          "- `motorhome-nl-showcase.pdf` — Motorhome SG → North Holland, 11 days",
          "",
          "Public copies: `/showcase/*.pdf`",
          "",
          "Regenerate: `npx vitest run scripts/export-landing-showcase.test.ts`",
          "",
        ].join("\n"),
      );
    },
    180_000,
  );
});
