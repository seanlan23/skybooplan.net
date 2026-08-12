import { createFileRoute } from "@tanstack/react-router";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuthRequest } from "@/lib/supabaseRequestAuth.server";
import {
  buildTravelPlanRow,
  isPayloadTooLargeError,
  slimPlanForDb,
  upsertTravelPlanRow,
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

        try {
          let row = buildTravelPlanRow(plan, ctx, userId);
          let result = await upsertTravelPlanRow(supabaseAdmin, row, userId);
          if ("error" in result && isPayloadTooLargeError(result.error)) {
            row = buildTravelPlanRow(slimPlanForDb(plan), ctx, userId);
            result = await upsertTravelPlanRow(supabaseAdmin, row, userId);
          }
          if ("id" in result) return Response.json({ id: result.id });
          console.error("[save-travel-plan] upsert failed:", result.error);
          return Response.json({ error: result.error }, { status: 500 });
        } catch (err) {
          console.error("[save-travel-plan] unexpected:", err);
          return Response.json({ error: "save_failed" }, { status: 500 });
        }
      },
    },
  },
});
