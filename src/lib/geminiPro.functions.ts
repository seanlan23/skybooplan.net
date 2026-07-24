import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pipelineLog, pipelineStep } from "@/lib/asyncTimeout";
import { geminiApiKey } from "@/lib/llm";
import { parseHeroChatAttachment } from "@/lib/heroChatAttachment";
import { buildHeroAttachmentContext } from "@/lib/heroChatAttachment.server";
import {
  TRIP_WISH_TAGS,
  normalizeIata,
  normalizeTripPlanPax,
  tripPlanSchema,
  type GenerateTripPlanParams,
} from "@/lib/geminiPro.shared";
import {
  buildCatalogPlanFromResponse,
} from "@/lib/geminiProCatalog";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";

const SL_MONTHS = [
  "januar",
  "februar",
  "marec",
  "april",
  "maj",
  "junij",
  "julij",
  "avgust",
  "september",
  "oktober",
  "november",
  "december",
] as const;

const COUNTRY_NAMES_SL: Record<string, string> = {
  JP: "Japonska",
  TH: "Tajska",
  IT: "Italija",
  ES: "Španija",
  FR: "Francija",
  GR: "Grčija",
  PT: "Portugalska",
  HR: "Hrvaška",
  ID: "Indonezija",
  VN: "Vietnam",
  TR: "Türkiye",
  US: "Združene države Amerike",
  CA: "Kanada",
  AU: "Avstralija",
  NZ: "Nova Zelandija",
  EG: "Egipt",
  MA: "Maroko",
  ZA: "Južna Afrika",
  MX: "Mehika",
  IS: "Islandija",
  GB: "Velika Britanija",
  DE: "Nemčija",
  AT: "Avstrija",
  CH: "Švica",
  NL: "Nizozemska",
  SI: "Slovenija",
  KR: "Južna Koreja",
  IN: "Indija",
  AE: "Združeni arabski emirati",
};

const optionalIata = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  return normalizeIata(String(value)) ?? undefined;
}, z.string().length(3).optional());

const isoDate = z.preprocess((value) => {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? raw;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const generateGeminiProTripInputSchema = z
  .object({
    originIata: z.preprocess(
      (value) => normalizeIata(String(value ?? "")) ?? undefined,
      z.string().length(3).optional(),
    ),
    destinationIata: z.preprocess(
      (value) => normalizeIata(String(value ?? "")) ?? undefined,
      z.string().length(3).optional(),
    ),
    returnFromIata: optionalIata,
    departDate: isoDate,
    returnDate: isoDate.optional(),
    pax: z
      .object({
        adults: z.number().int().min(1).max(9).optional(),
        childrenAges: z.array(z.number().int().min(0).max(17)).max(8).optional(),
      })
      .optional()
      .transform((pax) => normalizeTripPlanPax(pax)),
    budget: z.enum(["budget", "standard", "premium"]).default("standard"),
    wishTags: z.array(z.enum(TRIP_WISH_TAGS)).max(TRIP_WISH_TAGS.length).default([]),
    customWishes: z.string().trim().max(2500).optional(),
    pace: z.enum(["intensive", "relaxed", "calm"]).optional(),
    priorities: z.array(z.string().max(200)).max(12).optional(),
    groundTransportMode: z.enum(["car", "motorhome", "train"]).optional(),
    originPlace: z.string().trim().min(2).max(120).optional(),
    destinationPlace: z.string().trim().min(2).max(120).optional(),
    language: z.string().min(2).max(5).optional(),
    flightContext: z
      .object({
        outboundDepart: z.string().regex(/^\d{1,2}:\d{2}$/),
        outboundArrive: z.string().regex(/^\d{1,2}:\d{2}$/),
        outboundArriveDayOffset: z.number().int().min(0).max(3),
        inboundDepart: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
        inboundArrive: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
        outboundStops: z.number().int().min(0).max(5).optional(),
        inboundStops: z.number().int().min(0).max(5).optional(),
        outboundVia: z.string().trim().max(40).optional(),
        inboundVia: z.string().trim().max(40).optional(),
      })
      .optional(),
    attachment: z
      .object({
        filename: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().min(3).max(100),
        kind: z.enum(["image", "pdf"]),
        base64: z.string().trim().min(1).max(7_000_000),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.groundTransportMode) {
      if (!data.originPlace?.trim()) {
        ctx.addIssue({ code: "custom", path: ["originPlace"], message: "Kraj odhoda je obvezen." });
      }
      if (!data.destinationPlace?.trim()) {
        ctx.addIssue({ code: "custom", path: ["destinationPlace"], message: "Destinacija je obvezna." });
      }
    } else {
      if (!data.originIata) {
        ctx.addIssue({ code: "custom", path: ["originIata"], message: "Origin IATA is required." });
      }
      if (!data.destinationIata) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationIata"],
          message: "Destination IATA is required.",
        });
      }
    }
  });

const generateInput = generateGeminiProTripInputSchema.transform((data) => ({
  ...data,
  originIata: data.originIata ?? "LJU",
  destinationIata: data.destinationIata ?? "FCO",
}));

export type GenerateGeminiProTripInput = z.infer<typeof generateInput>;

/** Human-readable validation message for /api/generate-itinerary 400 responses. */
export function formatGenerateTripInputError(error: z.ZodError): string {
  const custom = error.issues.find((i) => i.code === "custom");
  if (custom?.message) return custom.message;

  const missingIata = error.issues.some((i) =>
    ["originIata", "destinationIata"].includes(String(i.path[0] ?? "")),
  );
  if (missingIata) {
    return "Izberi veljavna letališča (3-črkovne IATA kode, npr. LJU → FCO) v iskalniku zgoraj.";
  }

  const dateIssue = error.issues.find((i) =>
    ["departDate", "returnDate"].includes(String(i.path[0] ?? "")),
  );
  if (dateIssue) return "Preveri datume odhoda in vrnitve v iskalniku.";

  const wishesTooLong = error.issues.find(
    (i) => String(i.path[0] ?? "") === "customWishes" && i.code === "too_big",
  );
  if (wishesTooLong) {
    return "Opis želja je predolg. Izberi manj prioritet ali krajši opis, nato poskusi znova.";
  }

  return "Neveljavni parametri načrta. Preveri letališča, datume in izbrane možnosti.";
}

/** Catalog-ready plan (same shape as full AI / skeleton expansion). */
export type GenerateGeminiProTripResult = {
  plan: AiTripPlan | null;
  error: string | null;
};

export function tripDayCount(departDate: string, returnDate?: string): number {
  if (!returnDate) return 7;
  try {
    const start = new Date(`${departDate}T12:00:00`);
    const end = new Date(`${returnDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 7;
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  } catch {
    return 7;
  }
}

/**
 * Whether a generated itinerary covers enough calendar days.
 * For trips ≥5 days require full coverage (gaps are repaired earlier; −1 is no longer OK).
 */
export function hasAcceptablePlanDayCoverage(
  gotDays: number,
  expectedDays: number,
): boolean {
  if (expectedDays <= 0) return gotDays > 0;
  if (expectedDays === 1) return gotDays >= 1;
  if (expectedDays >= 5) return gotDays >= expectedDays;
  return gotDays >= Math.max(2, expectedDays - 1);
}

export function incompletePlanDayCoverageMessage(
  gotDays: number,
  expectedDays: number,
): string {
  return `Načrt je nepopoln (${gotDays}/${expectedDays} dni). Poskusi znova.`;
}

export function monthNameSl(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "avgust";
    return SL_MONTHS[d.getMonth()] ?? "avgust";
  } catch {
    return "avgust";
  }
}

export function resolveDestinationLabel(
  destinationIata: string,
  destinationPlace?: string,
): string {
  if (destinationPlace?.trim()) return destinationPlace.trim();
  try {
    const code = normalizeIata(destinationIata);
    if (!code) return destinationIata;
    const meta = DESTINATION_BY_IATA[code];
    if (!meta) return code;
    const country = COUNTRY_NAMES_SL[meta.country];
    if (country) return country;
    return `${meta.name}, ${meta.country}`;
  } catch {
    return destinationIata;
  }
}

export function buildGeminiTripPlanParams(data: GenerateGeminiProTripInput, days: number) {
  return {
    originIata: data.originIata,
    destinationIata: data.destinationIata,
    returnFromIata: data.returnFromIata,
    departDate: data.departDate,
    returnDate: data.returnDate,
    destination: resolveDestinationLabel(data.destinationIata, data.destinationPlace),
    days,
    month: monthNameSl(data.departDate),
    pax: data.pax,
    budget: data.budget,
    wishTags: data.wishTags,
    customWishes: data.customWishes,
    pace: data.pace,
    priorities: data.priorities,
    groundTransportMode: data.groundTransportMode,
    originPlace: data.originPlace,
    destinationPlace: data.destinationPlace,
    language: data.language ?? "sl",
    flightContext: data.flightContext,
  };
}

/** Merge optional hero chat attachment (image/PDF) into Gemini trip plan params. */
export async function buildGeminiTripPlanParamsWithAttachment(
  data: GenerateGeminiProTripInput,
  days: number,
): Promise<GenerateTripPlanParams> {
  const base = buildGeminiTripPlanParams(data, days);
  if (!data.attachment) return base;

  const attachment = parseHeroChatAttachment(data.attachment);
  if (!attachment) return base;

  const ctx = await buildHeroAttachmentContext(attachment);
  const customWishes = [base.customWishes, ctx.plannerWishesAppend].filter(Boolean).join("\n\n");

  return {
    ...base,
    customWishes,
    sharedImage: ctx.geminiImage,
  };
}

export const generateGeminiProTrip = createServerFn({ method: "POST" })
  .inputValidator(generateInput)
  .handler(async ({ data }): Promise<GenerateGeminiProTripResult> => {
    const pipelineStart = performance.now();
    pipelineLog("handler START", `${data.originIata}→${data.destinationIata}`);

    if (!geminiApiKey()) {
      return { plan: null, error: "GEMINI_API_KEY ni nastavljen na strežniku." };
    }

    try {
      const { generateTripPlan } = await pipelineStep("import geminiPro", () =>
        import("@/lib/geminiPro"),
      );

      const days = tripDayCount(data.departDate, data.returnDate);
      const raw = await pipelineStep("generateTripPlan (Gemini)", () =>
        generateTripPlan(buildGeminiTripPlanParams(data, days)),
      );

      pipelineLog("schema safeParse START");
      let parsed: ReturnType<typeof tripPlanSchema.safeParse>;
      try {
        parsed = tripPlanSchema.safeParse(raw);
      } catch (parseErr) {
        console.error("generateGeminiProTrip: schema parse threw:", parseErr);
        return {
          plan: null,
          error: "Načrt ni bil pretvorjen v veljavno strukturo (parse napaka).",
        };
      }
      pipelineLog(
        "schema safeParse DONE",
        parsed.success ? "ok" : `fail: ${parsed.error.issues.length} issues`,
      );

      if (!parsed.success) {
        console.error("generateGeminiProTrip: schema validation failed", parsed.error.flatten());
        return {
          plan: null,
          error: "Načrt ni bil generiran v veljavni obliki (manjkajo mesto ali koordinate).",
        };
      }

      const built = buildCatalogPlanFromResponse(parsed.data, data);
      if (built.error || !built.plan) {
        return { plan: null, error: built.error ?? "Načrt ni bil generiran." };
      }

      pipelineLog("handler DONE", `${Math.round(performance.now() - pipelineStart)}ms total`);
      return { plan: built.plan, error: null };
    } catch (err) {
      pipelineLog("handler FAIL", `${Math.round(performance.now() - pipelineStart)}ms total`);
      console.error("generateGeminiProTrip:", err);
      const message =
        err instanceof Error ? err.message : "Napaka pri generiranju načrta.";
      return { plan: null, error: message };
    }
  });
