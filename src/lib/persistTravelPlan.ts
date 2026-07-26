import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { Database, Json } from "@/integrations/supabase/types";
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

/**
 * RLS-backed client upsert — fallback when /api/save-travel-plan is misconfigured
 * (e.g. missing SUPABASE_SERVICE_ROLE_KEY on Vercel).
 */
export async function persistTravelPlanViaClient(
  supabase: SupabaseClient<Database>,
  plan: AiTripPlan,
  ctx: PersistTravelPlanContext,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  const row = buildTravelPlanRow(plan, ctx, userId);

  let query = supabase
    .from("travel_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("destination", row.destination);
  query = row.start_date
    ? query.eq("start_date", row.start_date)
    : query.is("start_date", null);
  query = row.end_date ? query.eq("end_date", row.end_date) : query.is("end_date", null);

  const { data: existing, error: findErr } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) return { error: findErr.message || "lookup_failed" };

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from("travel_plans")
      .update({
        title: row.title,
        destination: row.destination,
        start_date: row.start_date,
        end_date: row.end_date,
        itinerary: row.itinerary,
        ai_model: row.ai_model,
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (updErr) return { error: updErr.message || "update_failed" };
    return { id: existing.id };
  }

  const id = crypto.randomUUID();
  const { error: insErr } = await supabase.from("travel_plans").insert({
    id,
    ...row,
  });
  if (insErr) return { error: insErr.message || "save_failed" };
  return { id };
}
