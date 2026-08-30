import { z } from "zod";
import {
  safetyWarningSchema,
  weatherWidgetSchema,
} from "@/lib/geminiPro.shared";

/** Landing instructions — visa/entry, immigration, bags, transfer desk, cash + eSIM. */
export type ArrivalProtocol = {
  visa_and_entry: string;
  immigration: string;
  baggage: string;
  transfer_pickup: string;
  cash_and_esim: string;
};

/** Stay instructions — check-in/out, all-inclusive etiquette, tipping, relaxing. */
export type ResortGuide = {
  check_in_out: string;
  all_inclusive_etiquette: string;
  tipping: string;
  relaxing_at_resort: string;
};

export type OptionalExcursion = {
  title: string;
  description: string;
  estimated_cost_eur: number;
  book_safely_where: string;
};

/** Return transfer aligned to the international flight (airport 3h before departure). */
export type DepartureProtocol = {
  return_transfer: string;
  airport_lead_time: string;
  flight_alignment: string;
};

export type SingleBasePlan = {
  tripStyle: "single_base";
  trip_title: string;
  overview?: string;
  arrival_protocol: ArrivalProtocol;
  resort_guide: ResortGuide;
  optional_excursions: OptionalExcursion[];
  departure_protocol: DepartureProtocol;
  total_budget_eur?: number;
  weatherWidget?: z.infer<typeof weatherWidgetSchema>;
  safetyWarning?: z.infer<typeof safetyWarningSchema> | null;
  hotels?: Array<{
    name?: string;
    city: string;
    nights?: number;
    from_date?: string;
    to_date?: string;
    note?: string;
  }>;
  trip_metadata?: {
    destination: string;
    season_warning?: string;
    currency?: string;
    visa_required?: boolean;
    return_flight_eu?: {
      departure_time: string;
      arrival_time_eu: string;
      from_airport: string;
      to_airport: string;
      summary: string;
    };
  };
};

const arrivalProtocolSchema = z.object({
  visa_and_entry: z.string().min(1),
  immigration: z.string().min(1),
  baggage: z.string().min(1),
  transfer_pickup: z.string().min(1),
  cash_and_esim: z.string().min(1),
});

const resortGuideSchema = z.object({
  check_in_out: z.string().min(1),
  all_inclusive_etiquette: z.string().min(1),
  tipping: z.string().min(1),
  relaxing_at_resort: z.string().min(1),
});

const optionalExcursionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  estimated_cost_eur: z.number().min(0),
  book_safely_where: z.string().min(1),
});

const departureProtocolSchema = z.object({
  return_transfer: z.string().min(1),
  airport_lead_time: z.string().min(1),
  flight_alignment: z.string().min(1),
});

const hotelRowSchema = z.object({
  name: z.string().optional(),
  city: z.string().min(1),
  nights: z.number().min(0).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  note: z.string().optional(),
});

/** Live Gemini structured-output schema — no day-by-day clocks. */
export const singleBaseGeminiSchema = z.object({
  tripStyle: z.literal("single_base").optional(),
  trip_title: z.string().min(1),
  overview: z.string().min(1).optional(),
  arrival_protocol: arrivalProtocolSchema,
  resort_guide: resortGuideSchema,
  optional_excursions: z.array(optionalExcursionSchema).min(4).max(6),
  departure_protocol: departureProtocolSchema,
  total_budget_eur: z.number().min(0).optional(),
  weatherWidget: weatherWidgetSchema.optional(),
  safetyWarning: safetyWarningSchema.nullable().optional(),
  hotels: z.array(hotelRowSchema).max(1).optional(),
  trip_metadata: z
    .object({
      destination: z.string(),
      season_warning: z.string().optional(),
      currency: z.string().optional(),
      visa_required: z.boolean().optional(),
      return_flight_eu: z
        .object({
          departure_time: z.string().min(1),
          arrival_time_eu: z.string().min(1),
          from_airport: z.string().min(1),
          to_airport: z.string().min(1),
          summary: z.string().min(1),
        })
        .optional(),
    })
    .optional(),
});

const looseArrival = z.object({
  visa_and_entry: z.string().optional(),
  immigration: z.string().optional(),
  baggage: z.string().optional(),
  transfer_pickup: z.string().optional(),
  cash_and_esim: z.string().optional(),
});

const looseResort = z.object({
  check_in_out: z.string().optional(),
  all_inclusive_etiquette: z.string().optional(),
  tipping: z.string().optional(),
  relaxing_at_resort: z.string().optional(),
});

const looseDeparture = z.object({
  return_transfer: z.string().optional(),
  airport_lead_time: z.string().optional(),
  flight_alignment: z.string().optional(),
});

/** Streaming / recovery — accepts incomplete protocol blocks. */
export const singleBaseLooseSchema = z.object({
  tripStyle: z.string().optional(),
  trip_title: z.string().optional(),
  overview: z.string().optional(),
  arrival_protocol: looseArrival.optional(),
  resort_guide: looseResort.optional(),
  optional_excursions: z.array(optionalExcursionSchema.partial()).max(8).optional(),
  departure_protocol: looseDeparture.optional(),
  total_budget_eur: z.number().optional(),
  weatherWidget: weatherWidgetSchema.optional(),
  safetyWarning: safetyWarningSchema.nullable().optional(),
  hotels: z.array(hotelRowSchema.partial()).optional(),
  trip_metadata: z
    .object({
      destination: z.string().optional(),
      season_warning: z.string().optional(),
      currency: z.string().optional(),
      visa_required: z.boolean().optional(),
      return_flight_eu: z
        .object({
          departure_time: z.string().optional(),
          arrival_time_eu: z.string().optional(),
          from_airport: z.string().optional(),
          to_airport: z.string().optional(),
          summary: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type LooseSingleBasePlan = z.infer<typeof singleBaseLooseSchema>;

function objectHasText(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((v) => typeof v === "string" && v.trim().length > 0);
}

export function isSingleBasePayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if (o.tripStyle === "single_base") return true;
  if (o.arrival_protocol || o.resort_guide || o.departure_protocol) return true;
  if (Array.isArray(o.optional_excursions) && o.optional_excursions.length > 0) return true;
  return false;
}

export function parseSingleBasePlan(
  raw: unknown,
  opts?: { loose?: boolean },
): { success: true; data: LooseSingleBasePlan } | { success: false } {
  const schema = opts?.loose ? singleBaseLooseSchema : singleBaseGeminiSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { success: false };
  return { success: true, data: parsed.data };
}

export function singleBaseHasRenderableContent(data: LooseSingleBasePlan): boolean {
  if (data.trip_title?.trim()) return true;
  if (data.overview?.trim()) return true;
  if (objectHasText(data.arrival_protocol)) return true;
  if (objectHasText(data.resort_guide)) return true;
  if (objectHasText(data.departure_protocol)) return true;
  if ((data.optional_excursions ?? []).some((e) => e.title?.trim() || e.description?.trim())) {
    return true;
  }
  return false;
}

export function singleBaseSectionProgress(data: LooseSingleBasePlan): number {
  let n = 0;
  if (objectHasText(data.arrival_protocol)) n += 1;
  if (objectHasText(data.resort_guide)) n += 1;
  if ((data.optional_excursions ?? []).some((e) => e.title?.trim())) n += 1;
  if (objectHasText(data.departure_protocol)) n += 1;
  return n;
}
