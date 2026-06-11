import { createFileRoute } from "@tanstack/react-router";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { enrichPlanPoiPhotos } from "@/lib/unsplashPhotos";
import { requireSupabaseAuthRequest } from "@/lib/supabaseRequestAuth.server";

export const Route = createFileRoute("/api/enrich-plan-photos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authResult = await requireSupabaseAuthRequest(request);
        if (!authResult.ok) return authResult.response;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Neveljaven JSON." }, { status: 400 });
        }

        const plan = (body as { plan?: AiTripPlan }).plan;
        if (!plan?.days?.length) {
          return Response.json({ error: "Manjka veljaven načrt." }, { status: 400 });
        }

        try {
          const clone = structuredClone(plan) as AiTripPlan;
          await enrichPlanPoiPhotos(clone);
          return Response.json({ plan: clone });
        } catch (err) {
          console.error("[enrich-plan-photos] failed:", err);
          return Response.json(
            { error: "Napaka pri nalaganju fotografij." },
            { status: 500 },
          );
        }
      },
    },
  },
});
