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
  const full = (raw ?? "").trim();
  const iso = full.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    if (y && m && d && m <= 12 && d <= 31) return iso;
  }
  const eu = /^(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})/.exec(full);
  if (eu) {
    const d = Number(eu[1]);
    const m = Number(eu[2]);
    const y = Number(eu[3]);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
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
  return /too large|payload|request entity|413|jsonb|could not serialize|statement too long|bytes/i.test(
    message,
  );
}

export function isAuthPersistError(message: string): boolean {
  return /jwt|expired|not authenticated|invalid token|unauthorized|row-level security|401/i.test(
    message,
  );
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "function") return undefined;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "string") return value.replace(/\u0000/g, "");
  return value;
}

function safeJsonClone<T>(value: T): T | undefined {
  try {
    return JSON.parse(JSON.stringify(value, jsonReplacer)) as T;
  } catch {
    return undefined;
  }
}

function clip(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

/** Drop photo blobs / TA essays so jsonb stays under PostgREST body limits. */
export function slimPlanForDb(plan: AiTripPlan): AiTripPlan {
  // Whitelist only — never spread the live React plan (photos, circular bits).
  return corePlanForDb(plan);
}

function slimActivityCore(a: Activity): Activity {
  return {
    name: clip(a.name, 180) ?? "",
    type: a.type,
    description: clip(a.description, 500),
    priceLabel: clip(a.priceLabel, 40),
    estimatedCostEur: a.estimatedCostEur,
    arrivalTime: a.arrivalTime,
    departureTime: a.departureTime,
    lat: a.lat,
    lng: a.lng,
    transportType: a.transportType,
  };
}

/**
 * Whitelist-only snapshot — never spread the live React plan (photos, circular bits).
 * Last-resort payload when slim still 413s or JSON.stringify throws.
 */
export function corePlanForDb(plan: AiTripPlan): AiTripPlan {
  return {
    destinationName: clip(plan.destinationName, 200) ?? "Trip",
    summary: clip(plan.summary, 400) ?? "",
    contentLanguage: plan.contentLanguage,
    totalBudgetEur: plan.totalBudgetEur,
    flightTotalEur:
      typeof plan.flightTotalEur === "number" &&
      Number.isFinite(plan.flightTotalEur) &&
      plan.flightTotalEur > 0
        ? Math.round(plan.flightTotalEur)
        : undefined,
    centerLat: plan.centerLat,
    centerLng: plan.centerLng,
    originIata: plan.originIata,
    destinationIata: plan.destinationIata,
    originPlace: clip(plan.originPlace, 120),
    destinationPlace: clip(plan.destinationPlace, 120),
    accommodationMode: plan.accommodationMode,
    groundTransportMode: plan.groundTransportMode,
    travelPace: plan.travelPace,
    weatherWidget: safeJsonClone(plan.weatherWidget),
    safetyWarning: safeJsonClone(plan.safetyWarning) ?? undefined,
    travelRequirements: safeJsonClone(plan.travelRequirements),
    groundJourney: safeJsonClone(plan.groundJourney),
    days: (plan.days ?? []).map((d): DayPlan => ({
      day: d.day,
      date: d.date ?? "",
      dateEnd: d.dateEnd,
      city: clip(d.city, 80) ?? "",
      title: clip(d.title, 160) ?? "",
      focusName: clip(d.focusName, 80) ?? "",
      lat: Number.isFinite(d.lat) ? d.lat : 0,
      lng: Number.isFinite(d.lng) ? d.lng : 0,
      dailyBudgetEur: Number.isFinite(d.dailyBudgetEur) ? d.dailyBudgetEur : 0,
      category: d.category ?? "activity",
      inFlightDay: d.inFlightDay,
      transportationTips: clip(d.transportationTips, 280) ?? "",
      travelHack: clip(d.travelHack, 280) ?? "",
      localWarnings: clip(d.localWarnings, 200) ?? "",
      morning: "",
      afternoon: "",
      evening: "",
      activities: d.activities
        ? {
            morning: d.activities.morning?.map(slimActivityCore) ?? [],
            afternoon: d.activities.afternoon?.map(slimActivityCore) ?? [],
            evening: d.activities.evening?.map(slimActivityCore) ?? [],
          }
        : undefined,
    })),
  };
}

/** Strip null bytes / non-finite numbers so jsonb insert never 400s. */
export function serializePlanForDb(plan: AiTripPlan): Json {
  const cloned = safeJsonClone(plan);
  if (cloned) return cloned as Json;
  const core = safeJsonClone(corePlanForDb(plan));
  if (core) return core as Json;
  return {
    destinationName: String(plan.destinationName ?? "Trip").slice(0, 200),
    days: (plan.days ?? []).map((d) => ({
      day: d.day,
      date: typeof d.date === "string" ? d.date : "",
      city: typeof d.city === "string" ? d.city.slice(0, 80) : "",
      title: typeof d.title === "string" ? d.title.slice(0, 160) : "",
    })),
  };
}

/** Never persist the live React plan — photos / extra keys 413 or fail JSON. */
export function planForDatabase(plan: AiTripPlan): AiTripPlan {
  return corePlanForDb(plan);
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
    ai_model: "google:gemini-2.5-flash-lite",
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
  const compact = planForDatabase(plan);
  let row = buildTravelPlanRow(compact, ctx, userId);
  let result = await upsertTravelPlanRow(supabase, row, userId);
  if ("id" in result) return result;
  if (isAuthPersistError(result.error)) return result;

  row = buildTravelPlanRow(corePlanForDb(plan), ctx, userId);
  result = await upsertTravelPlanRow(supabase, row, userId);
  return result;
}
