import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiTripPlan, Activity, DayPlan } from "@/lib/aiPlan.functions";
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

export type TravelPlanRow = {
  user_id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  itinerary: Json;
  ai_model: string;
};

/** Postgres `date` accepts only YYYY-MM-DD — never send human labels. */
export function toSqlDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return s;
}

/** `.maybeSingle()` / `.single()` treat 0 rows as an error — that must not block a first save. */
export function isNoRowLookupError(
  err: { code?: string; message?: string; status?: number } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "");
  return (
    code === "PGRST116" ||
    err.status === 406 ||
    /0 rows|no rows|multiple \(or no\) rows|Cannot coerce the result to a single JSON object/i.test(
      msg,
    )
  );
}

export function isPayloadTooLargeError(message: string): boolean {
  return /too large|payload|request entity|413|jsonb|could not serialize/i.test(message);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "function") return undefined;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "string") return value.replace(/\u0000/g, "");
  return value;
}

function stripActivity(a: Activity): Activity {
  const { imageUrl: _img, tripAdvisorStyleDetails: _ta, ...rest } = a;
  return rest;
}

/** Drop photo blobs / TA essays so jsonb stays under PostgREST body limits. */
export function slimPlanForDb(plan: AiTripPlan): AiTripPlan {
  return {
    ...plan,
    days: (plan.days ?? []).map((d): DayPlan => {
      const { imageUrl: _img, mapPins, activities, ...rest } = d;
      return {
        ...rest,
        activities: activities
          ? {
              morning: activities.morning?.map(stripActivity),
              afternoon: activities.afternoon?.map(stripActivity),
              evening: activities.evening?.map(stripActivity),
            }
          : undefined,
        mapPins: mapPins?.map((p) => {
          const { imageUrl: _pimg, tripAdvisorStyleDetails: _pta, ...pin } = p;
          return pin;
        }),
      };
    }),
  };
}

/** Strip null bytes / non-finite numbers so jsonb insert never 400s. */
export function serializePlanForDb(plan: AiTripPlan): Json {
  try {
    return JSON.parse(JSON.stringify(plan, jsonReplacer)) as Json;
  } catch {
    return JSON.parse(JSON.stringify(slimPlanForDb(plan), jsonReplacer)) as Json;
  }
}

export function buildTravelPlanRow(
  plan: AiTripPlan,
  ctx: PersistTravelPlanContext,
  userId: string,
): TravelPlanRow {
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
  };
}

async function findExistingPlanId(
  supabase: SupabaseClient<Database>,
  row: TravelPlanRow,
  userId: string,
): Promise<string | null> {
  let query = supabase
    .from("travel_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("destination", row.destination);
  query = row.start_date
    ? query.eq("start_date", row.start_date)
    : query.is("start_date", null);
  query = row.end_date ? query.eq("end_date", row.end_date) : query.is("end_date", null);

  // Array + limit — never maybeSingle() (PGRST116 on 0 rows aborted first saves).
  const { data: rows, error } = await query
    .order("created_at", { ascending: false })
    .limit(1);

  if (error && !isNoRowLookupError(error)) {
    console.warn("[persistTravelPlan] lookup failed, will insert:", error.message);
    return null;
  }
  return rows?.[0]?.id ?? null;
}

async function insertPlan(
  supabase: SupabaseClient<Database>,
  row: TravelPlanRow,
): Promise<{ id: string } | { error: string }> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from("travel_plans").insert({
    id,
    ...row,
  });
  if (error) return { error: error.message || "save_failed" };
  return { id };
}

/**
 * Insert or update a travel plan. Lookup errors must not block a first insert.
 */
export async function upsertTravelPlanRow(
  supabase: SupabaseClient<Database>,
  row: TravelPlanRow,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  const existingId = await findExistingPlanId(supabase, row, userId);

  if (existingId) {
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
      .eq("id", existingId)
      .eq("user_id", userId);
    if (updErr) return { error: updErr.message || "update_failed" };
    return { id: existingId };
  }

  return insertPlan(supabase, row);
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
  let row = buildTravelPlanRow(plan, ctx, userId);
  let result = await upsertTravelPlanRow(supabase, row, userId);
  if ("error" in result && isPayloadTooLargeError(result.error)) {
    row = buildTravelPlanRow(slimPlanForDb(plan), ctx, userId);
    result = await upsertTravelPlanRow(supabase, row, userId);
  }
  return result;
}
