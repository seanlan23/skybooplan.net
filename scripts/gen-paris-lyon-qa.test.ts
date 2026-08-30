/**
 * One-off live QA: MUC → CDG, Paris + Lyon, 8 days.
 * RUN_LIVE_PLAN_QA=1 npx vitest run scripts/gen-paris-lyon-qa.test.ts --testTimeout 600000 --pool=forks
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFlightContextToGeminiPlan } from "@/lib/geminiFlightContext";
import { generateTripPlan } from "@/lib/geminiPro";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import { buildGeminiTripPlanParams } from "@/lib/geminiPro.functions";
import { buildCatalogPlanFromResponse } from "@/lib/geminiProCatalog";
import { geminiApiKey } from "@/lib/llm";

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

const FORBIDDEN =
  /check-in,?\s*osvežitev|osvežitev in kratek odmor|če imaš še energijo|jutranji sprehod do prve znamenitosti|jutranji sprehod\s*\/\s*kava pred ogledom/i;

const OUT = resolve(process.cwd(), ".tmp-plan-paris-lyon");

describe.runIf(process.env.RUN_LIVE_PLAN_QA === "1")("Paris + Lyon live QA", () => {
  it("generates MUC→CDG 8-day plan without generic fillers or Louvre-in-Lyon", async () => {
    expect(geminiApiKey()).toBeTruthy();
    mkdirSync(OUT, { recursive: true });

    const input: GenerateGeminiProTripInput = {
      originIata: "MUC",
      destinationIata: "CDG",
      departDate: "2026-09-19",
      returnDate: "2026-09-26",
      pax: { adults: 2, childrenAges: [] },
      budget: "standard",
      wishTags: [],
      customWishes: "Pariz + Lyon: 4 dni Pariz, TGV v Lyon, 3 dni Lyon, zadnji dan povratek v Pariz za let. Sproščen tempo.",
      pace: "relaxed",
      originPlace: "Munich",
      destinationPlace: "France",
      language: "sl",
      flightContext: {
        outboundDepart: "06:45",
        outboundArrive: "08:20",
        outboundArriveDayOffset: 0,
        inboundDepart: "06:25",
        inboundArrive: "07:55",
      },
    };

    const raw = await generateTripPlan(buildGeminiTripPlanParams(input, 8));
    const built = buildCatalogPlanFromResponse(raw, input);
    expect(built.error).toBeFalsy();
    expect(built.plan).toBeTruthy();
    const plan = built.plan!;
    applyFlightContextToGeminiPlan(
      plan,
      input.flightContext!,
      { originIata: "MUC", language: "sl" },
    );

    writeFileSync(resolve(OUT, "MUC-CDG-paris-lyon.json"), JSON.stringify(plan, null, 2));

    const lines: string[] = [];
    for (const day of plan.days) {
      const acts = [
        ...(day.activities?.morning ?? []),
        ...(day.activities?.afternoon ?? []),
        ...(day.activities?.evening ?? []),
      ];
      lines.push(`\n=== Dan ${day.day} · ${day.city} · ${day.title} ===`);
      for (const a of acts) {
        lines.push(`- [${a.type ?? "?"}] ${a.name}`);
        if (a.description) lines.push(`  ${a.description.slice(0, 180)}`);
      }
      const blob = JSON.stringify(day);
      expect(blob, `Dan ${day.day} still has generic filler`).not.toMatch(FORBIDDEN);
      if (/lyon/i.test(day.city ?? "")) {
        expect(blob, `Dan ${day.day} Lyon has Louvre`).not.toMatch(/louvre/i);
      }
      if (day.day === 1) {
        expect(acts.filter((a) => /Prevoz do hotela/i.test(a.name)).length).toBe(1);
        expect(acts.filter((a) => /Prihod v hotel/i.test(a.name)).length).toBe(1);
      }
    }
    const report = lines.join("\n");
    writeFileSync(resolve(OUT, "SUMMARY.txt"), report);
    console.log(report);
    expect(plan.days.length).toBeGreaterThanOrEqual(8);
  });
});
