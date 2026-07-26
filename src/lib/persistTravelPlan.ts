import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { Json } from "@/integrations/supabase/types";
import { buildPdfPlanTitle } from "@/lib/pdfPlanTitle";

export type PersistTravelPlanContext = {
  departDate?: string | null;
  returnDate?: string | null;
  destinationPlace?: string | null;
  originPlace?: string | null;
  destinationName?: string | null;
  from?: string | null;
  to?: string | null;
  groundTransportMode?: string | null;
  accommodationMode?: string | null;
};

/** Postgres `date` accepts only YYYY-MM-DD — never send human labels. */
export function toSqlDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return s;
}

/** Strip null bytes / non-finite numbers so jsonb insert never 400s. */
export function serializePlanForDb(plan: AiTripPlan): Json {
  const json = JSON.stringify(plan, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    if (typeof value === "string") return value.replace(/\u0000/g, "");
    return value;
  });
  return JSON.parse(json) as Json;
}

export function buildTravelPlanRow(
  plan: AiTripPlan,
  ctx: PersistTravelPlanContext,
  userId: string,
): {
  user_id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  itinerary: Json;
  ai_model: string;
  is_paid: boolean;
} {
  const dest =
    (
      plan.destinationPlace ||
      plan.destinationName ||
      ctx.destinationPlace ||
      ctx.to ||
      "Trip"
    ).trim() || "Trip";

  const startDate = toSqlDate(ctx.departDate);
  const endDate = toSqlDate(ctx.returnDate);
  const routeTitle = buildPdfPlanTitle({
    groundTransportMode: plan.groundTransportMode ?? ctx.groundTransportMode,
    accommodationMode: plan.accommodationMode ?? ctx.accommodationMode,
    originPlace: plan.originPlace ?? ctx.originPlace,
    destinationPlace: plan.destinationPlace ?? ctx.destinationPlace,
    destinationName: plan.destinationName ?? ctx.destinationName,
    from: ctx.from,
    to: ctx.to,
  });
  const title = (startDate ? `${routeTitle} · ${startDate}` : routeTitle).slice(0, 500);

  return {
    user_id: userId,
    title: title || "Skybooplan",
    destination: dest.slice(0, 500),
    start_date: startDate,
    end_date: endDate,
    itinerary: serializePlanForDb(plan),
    ai_model: "google:gemini-2.5-flash",
    is_paid: false,
  };
}
