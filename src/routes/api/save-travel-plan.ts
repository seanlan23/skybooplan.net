import { createFileRoute } from "@tanstack/react-router";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuthRequest } from "@/lib/supabaseRequestAuth.server";
import {
  buildTravelPlanRow,
  type PersistTravelPlanContext,
} from "@/lib/persistTravelPlan";

type Body = {
  plan?: AiTripPlan;
  context?: PersistTravelPlanContext;
};

export const Route = createFileRoute("/api/save-travel-plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authResult = await requireSupabaseAuthRequest(request);
        if (!authResult.ok) return authResult.response;

        const { userId } = authResult.auth;

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Invalid JSON." }, { status: 400 });
        }

        const plan = body.plan;
        if (!plan?.days?.length) {
          return Response.json({ error: "Missing plan days." }, { status: 400 });
        }

        const ctx = body.context ?? {};
        const row = buildTravelPlanRow(plan, ctx, userId);

        try {
          let query = supabaseAdmin
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

          if (findErr) {
            console.error("[save-travel-plan] lookup failed:", findErr);
            return Response.json(
              { error: findErr.message || "lookup_failed" },
              { status: 500 },
            );
          }

          if (existing?.id) {
            const { error: updErr } = await supabaseAdmin
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

            if (updErr) {
              console.error("[save-travel-plan] update failed:", updErr);
              return Response.json(
                { error: updErr.message || "update_failed" },
                { status: 500 },
              );
            }
            return Response.json({ id: existing.id });
          }

          const id = crypto.randomUUID();
          const { error: insErr } = await supabaseAdmin.from("travel_plans").insert({
            id,
            ...row,
          });

          if (insErr) {
            console.error("[save-travel-plan] insert failed:", insErr);
            return Response.json(
              { error: insErr.message || "save_failed" },
              { status: 500 },
            );
          }

          return Response.json({ id });
        } catch (err) {
          console.error("[save-travel-plan] unexpected:", err);
          return Response.json({ error: "save_failed" }, { status: 500 });
        }
      },
    },
  },
});
