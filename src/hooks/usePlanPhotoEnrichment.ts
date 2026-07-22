import { useEffect, useMemo, useRef } from "react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { supabaseAuthHeaders } from "@/lib/supabaseAuthHeaders";
import {
  buildPlanPhotoRequestKey,
  mergePlanPhotos,
  planNeedsPhotoEnrichment,
} from "@/lib/unsplashPhotos";

/**
 * Fetch Unsplash photos in the background after the text plan is already visible.
 * Does not block initial render — merges imageUrl fields when the API responds.
 */
export function usePlanPhotoEnrichment(
  plan: AiTripPlan | null,
  onEnriched: (plan: AiTripPlan) => void,
) {
  const onEnrichedRef = useRef(onEnriched);
  onEnrichedRef.current = onEnriched;
  const planRef = useRef(plan);
  planRef.current = plan;
  const lastRequestedKeyRef = useRef("");

  const photoRequestKey = useMemo(
    () => (plan ? buildPlanPhotoRequestKey(plan) : ""),
    [plan],
  );

  useEffect(() => {
    if (!photoRequestKey) {
      lastRequestedKeyRef.current = "";
      return;
    }
    const currentPlan = planRef.current;
    if (!currentPlan?.days?.length) return;
    if (!planNeedsPhotoEnrichment(currentPlan)) return;
    if (lastRequestedKeyRef.current === photoRequestKey) return;

    const controller = new AbortController();
    let settled = false;

    (async () => {
      // Mark in-flight only after we start — clear on abort/failure so stream retries work.
      lastRequestedKeyRef.current = photoRequestKey;
      try {
        const res = await fetch("/api/enrich-plan-photos", {
          method: "POST",
          headers: await supabaseAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ plan: currentPlan }),
          signal: controller.signal,
        });

        if (!res.ok) {
          if (lastRequestedKeyRef.current === photoRequestKey) {
            lastRequestedKeyRef.current = "";
          }
          return;
        }

        const data = (await res.json()) as { plan?: AiTripPlan };
        if (!data.plan?.days?.length) {
          if (lastRequestedKeyRef.current === photoRequestKey) {
            lastRequestedKeyRef.current = "";
          }
          return;
        }

        settled = true;
        const latest = planRef.current;
        if (!latest) return;
        onEnrichedRef.current(mergePlanPhotos(latest, data.plan));
      } catch (err) {
        if (controller.signal.aborted) {
          // Stream key churn aborted this request — allow the next effect to retry.
          if (lastRequestedKeyRef.current === photoRequestKey) {
            lastRequestedKeyRef.current = "";
          }
          return;
        }
        if (lastRequestedKeyRef.current === photoRequestKey) {
          lastRequestedKeyRef.current = "";
        }
        console.warn("[usePlanPhotoEnrichment] background fetch failed:", err);
      }
    })();

    return () => {
      if (!settled) {
        controller.abort();
      }
    };
  }, [photoRequestKey]);
}
