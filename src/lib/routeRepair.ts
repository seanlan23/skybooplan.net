import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { geminiApiKey } from "@/lib/llm";
import { pipelineLog, withTimeout } from "@/lib/asyncTimeout";
import type { AiTripPlan, DayCategory, DayTransportLeg } from "@/lib/aiPlan.functions";
import { lookupLeg } from "@/lib/curatedRoutes.legs";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { worldRouteRulesPromptBlock } from "@/lib/worldRouteRules";
import {
  blockingRouteViolations,
  type PlanViolation,
} from "@/lib/planValidation";
import { applyItineraryGuards } from "@/lib/itineraryGuards";

const REPAIR_TIMEOUT_MS = 60_000;
const REPAIR_MODEL = process.env.GEMINI_TRIP_PLAN_MODEL?.trim() || "gemini-2.5-flash";

const repairActivitySchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  transportType: z
    .enum(["flight", "ferry", "train", "van", "car", "bus", "taxi"])
    .optional(),
  description: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const repairLegSchema = z.object({
  type: z.enum(["flight", "ferry", "train", "van", "car"]),
  from: z.string().min(1),
  to: z.string().min(1),
  duration: z.string().min(1),
  estimatedPrice: z.number().min(0),
});

const DAY_CATEGORIES = [
  "stay",
  "eat",
  "activity",
  "sight",
  "transport",
  "beach",
  "nature",
] as const satisfies readonly DayCategory[];

export const repairDaysSchema = z.object({
  days: z.array(
    z.object({
      day: z.number().int().min(1),
      city: z.string().min(1),
      title: z.string().min(1),
      focusName: z.string().optional(),
      category: z.enum(DAY_CATEGORIES).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      activities: z
        .object({
          morning: z.array(repairActivitySchema).optional(),
          afternoon: z.array(repairActivitySchema).optional(),
          evening: z.array(repairActivitySchema).optional(),
        })
        .optional(),
      transportation: z.array(repairLegSchema).optional(),
      transportationTips: z.string().optional(),
    }),
  ),
});

export type RepairDay = z.infer<typeof repairDaysSchema>["days"][number];

function sameCity(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function mapCatalogLegType(type: string): DayTransportLeg["type"] {
  const t = type.toLowerCase();
  if (t.includes("flight")) return "flight";
  if (t.includes("ferry") || t.includes("boat")) return "ferry";
  if (t.includes("train")) return "train";
  if (t.includes("car")) return "car";
  return "van";
}

function parseCostEur(label: string): number {
  const m = label.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Attach known hop legs when Gemini omitted transportation[] — how to move, not where to sleep. */
export function attachKnownTravelLegs(plan: AiTripPlan): number {
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  let added = 0;
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const curr = days[i]!;
    if (curr.inFlightDay) continue;
    const from = (prev.city || "").trim();
    const to = (curr.city || "").trim();
    if (!from || !to || sameCity(from, to)) continue;
    if ((curr.transportation?.length ?? 0) > 0 || (prev.transportation?.length ?? 0) > 0) {
      continue;
    }
    const catalog = lookupLeg(from, to);
    if (!catalog) continue;
    curr.transportation = [
      {
        type: mapCatalogLegType(catalog.type),
        from,
        to,
        duration: catalog.duration,
        estimatedPrice: parseCostEur(catalog.costLabel),
      },
    ];
    if (!curr.transportationTips?.trim() && catalog.howTo) {
      curr.transportationTips = catalog.howTo;
    }
    added += 1;
  }
  return added;
}

export function mergeRepairedDays(plan: AiTripPlan, repaired: RepairDay[]): number {
  const byDay = new Map(repaired.map((d) => [d.day, d]));
  let n = 0;
  for (const day of plan.days ?? []) {
    const next = byDay.get(day.day);
    if (!next) continue;
    if (next.city.trim() && !sameCity(day.city, next.city)) {
      day.city = next.city.trim();
      const coords = lookupRegionCoords(day.city);
      if (coords) {
        day.lat = coords.lat;
        day.lng = coords.lng;
      } else if (typeof next.lat === "number" && typeof next.lng === "number") {
        day.lat = next.lat;
        day.lng = next.lng;
      }
    }
    if (next.title) day.title = next.title;
    if (next.focusName) day.focusName = next.focusName;
    if (next.category) day.category = next.category;
    if (next.activities) {
      day.activities = {
        morning: next.activities.morning ?? day.activities?.morning ?? [],
        afternoon: next.activities.afternoon ?? day.activities?.afternoon ?? [],
        evening: next.activities.evening ?? day.activities?.evening ?? [],
      };
    }
    if (next.transportation) day.transportation = next.transportation;
    if (next.transportationTips) day.transportationTips = next.transportationTips;
    n += 1;
  }
  return n;
}

function stayDigest(plan: AiTripPlan): string {
  return (plan.days ?? [])
    .map((d) => `Day ${d.day}: ${d.city || d.focusName || "?"} (${d.category})`)
    .join("\n");
}

export function logisticsRepairPrompt(
  violations: PlanViolation[],
  language?: string,
): { system: string; user: string } {
  const slo = !language || language === "sl" || language.startsWith("sl");
  const system = [
    worldRouteRulesPromptBlock(slo),
    slo
      ? "Popravi SAMO navedene fizikalne kršitve. Ne zaklepaj koledarja mest. Ne izmišljuj hotelov in restavracij. Število koledarskih dni ostane isto. Lahko prerazporediš nočitve med bazami ali izpustiš kraj z dolgim dostopom. Če ostane presežek, dodaj novo bazo na isti smeri — ne kradi noči s kode."
      : "Fix ONLY the listed physics violations. Do not lock a city calendar. Do not invent hotels or restaurants. Keep the same number of calendar days. You may rebalance nights between bases or skip a long-access place. If surplus remains, add a new base on the same heading — do not steal nights in code.",
  ].join("\n\n");
  const user = [
    slo ? "Kršitve:" : "Violations:",
    ...violations.map((v) => `- ${v.message}`),
    slo
      ? "Vrni dneve, ki jih je treba spremeniti (ali vse). Iste številke dni. Na skokih ≥250 km mora biti transportation[]."
      : "Return the days that must change (or all days). Same day numbers. Hops ≥250 km need transportation[].",
  ].join("\n");
  return { system, user };
}

export async function repairPlanLogisticsOnce(
  plan: AiTripPlan,
  opts?: { language?: string },
): Promise<{ attempted: boolean; merged: number; violations: PlanViolation[] }> {
  attachKnownTravelLegs(plan);
  const blocking = blockingRouteViolations(plan);
  if (!blocking.length) {
    return { attempted: false, merged: 0, violations: [] };
  }

  const key = geminiApiKey();
  if (!key) {
    pipelineLog("routeRepair SKIP", "no Gemini key");
    return { attempted: false, merged: 0, violations: blocking };
  }

  const language = opts?.language ?? plan.contentLanguage ?? "sl";
  const prompts = logisticsRepairPrompt(blocking, language);
  const user = `${prompts.user}\n\n${stayDigest(plan)}`;

  try {
    pipelineLog("routeRepair START", blocking.map((v) => v.rule).join(","));
    const google = createGoogleGenerativeAI({ apiKey: key });
    const result = await withTimeout(
      generateObject({
        model: google(REPAIR_MODEL),
        system: prompts.system,
        prompt: user,
        schema: repairDaysSchema,
        maxTokens: 8192,
        providerOptions: {
          google: { maxOutputTokens: 8192 },
        },
      }),
      REPAIR_TIMEOUT_MS,
      "routeRepair",
    );
    const merged = mergeRepairedDays(plan, result.object.days);
    applyItineraryGuards(plan, { language });
    pipelineLog("routeRepair DONE", `${merged} days merged`);
    return { attempted: true, merged, violations: blockingRouteViolations(plan) };
  } catch (err) {
    pipelineLog(
      "routeRepair FAIL",
      err instanceof Error ? err.message : "repair failed",
    );
    return { attempted: true, merged: 0, violations: blocking };
  }
}
