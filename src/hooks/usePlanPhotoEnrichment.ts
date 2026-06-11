import { useEffect, useMemo, useRef } from "react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
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
    const currentPlan = planRef.current;
    if (!currentPlan?.days?.length) return;
    if (!planNeedsPhotoEnrichment(currentPlan)) return;
    if (lastRequestedKeyRef.current === photoRequestKey) return;
    lastRequestedKeyRef.current = photoRequestKey;

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/enrich-plan-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: currentPlan }),
          signal: controller.signal,
        });

        if (!res.ok) return;

        const data = (await res.json()) as { plan?: AiTripPlan };
        if (!data.plan?.days?.length) return;

        const latest = planRef.current;
        if (!latest) return;
        onEnrichedRef.current(mergePlanPhotos(latest, data.plan));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn("[usePlanPhotoEnrichment] background fetch failed:", err);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [photoRequestKey]);
}
