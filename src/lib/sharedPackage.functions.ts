import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { Json } from "@/integrations/supabase/types";
import {
  asShareGuests,
  asShareIata,
  asShareIsoDate,
  asShareStyle,
  buildShareOgMeta,
  buildSharePlanPath,
  slimPlanForShare,
  type SharePlanParams,
} from "@/lib/sharePlan";
import { shareLookupFromInput, unwrapServerFnInput } from "@/lib/sharedPackageParse";
import type { SharedPackageSnapshot } from "@/lib/sharedPackageSnapshot";

export type { SharedPackageSnapshot };

const CreateInput = z.object({
  plan: z.custom<AiTripPlan>(),
  hotelId: z.string().max(80).optional(),
  from: z.string().max(8).optional(),
  to: z.string().max(8).optional(),
  depart: z.string().max(20).optional(),
  return: z.string().max(20).optional(),
  style: z.string().max(32).optional(),
  guests: z.number().int().min(1).max(20).optional(),
  pricePerPerson: z.number().min(0).max(1_000_000).optional(),
  nights: z.number().int().min(0).max(60).optional(),
  imageUrl: z.string().max(800).optional(),
  lang: z.string().max(8).optional(),
});

function newShareId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

function paramsFromInput(data: z.infer<typeof CreateInput>, hotelId?: string): SharePlanParams {
  return {
    from: asShareIata(data.from),
    to: asShareIata(data.to) ?? asShareIata(data.plan.destinationIata),
    depart: asShareIsoDate(data.depart),
    return: asShareIsoDate(data.return),
    style: asShareStyle(data.style) ?? data.plan.tripStyle,
    hotelId: hotelId?.trim() || undefined,
    guests: asShareGuests(data.guests),
  };
}

export const createSharedPackage = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateInput.parse(unwrapServerFnInput(d)))
  .handler(async ({ data }): Promise<{ id: string; path: string } | { error: string }> => {
    const plan = slimPlanForShare(data.plan);
    if (!plan.destinationName && !plan.destinationIata) {
      return { error: "missing_plan" };
    }
    const hotelId = data.hotelId?.trim() || plan.resortOffers?.[0]?.id;
    const selected =
      plan.resortOffers?.find((offer) => offer.id === hotelId) ?? plan.resortOffers?.[0];
    const guests = data.guests ?? 2;
    const derivedTotal =
      (typeof plan.flightTotalEur === "number" ? plan.flightTotalEur : 0) +
      (typeof selected?.hotelEur === "number" ? selected.hotelEur : 0);
    const pricePerPerson =
      data.pricePerPerson && data.pricePerPerson > 0
        ? Math.round(data.pricePerPerson)
        : derivedTotal > 0
          ? Math.round(derivedTotal / Math.max(1, guests))
          : 0;
    const params = paramsFromInput(data, hotelId);
    const og = buildShareOgMeta({
      destinationIata: params.to ?? plan.destinationIata,
      destinationName: plan.destinationName,
      destinationPlace: plan.destinationPlace,
      depart: params.depart,
      return: params.return,
      nights: data.nights,
      pricePerPerson,
      imageUrl: data.imageUrl || selected?.imageUrl || selected?.images?.[0],
      lang: data.lang,
    });
    const id = newShareId();
    const payload = {
      plan,
      params: { ...params, s: id },
      og,
    };

    try {
      const { createSharedPackagesClient } = await import("@/lib/sharedPackageDb.server");
      const db = createSharedPackagesClient();
      const { error } = await db.from("shared_packages").insert({
        id,
        payload: payload as unknown as Json,
        og_title: og.title,
        og_description: og.description,
        og_image: og.image,
        from_iata: params.from ?? null,
        to_iata: params.to ?? null,
        depart_date: params.depart ?? null,
        return_date: params.return ?? null,
        trip_style: params.style ?? null,
        hotel_id: hotelId ?? null,
        guests: params.guests ?? null,
      });
      if (error) {
        console.error("[sharedPackage] insert failed:", error.message);
        return { error: "save_failed" };
      }
    } catch (err) {
      console.error("[sharedPackage] insert crashed:", err);
      return { error: "save_failed" };
    }

    return { id, path: buildSharePlanPath({ ...params, s: id }) };
  });

export const getSharedPackage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => shareLookupFromInput(d))
  .handler(async ({ data }): Promise<SharedPackageSnapshot | null> => {
    try {
      const { loadSharedPackageSnapshot } = await import("@/lib/sharedPackageLoad.server");
      return await loadSharedPackageSnapshot(data);
    } catch (err) {
      console.error("[sharedPackage] load failed:", err);
      return null;
    }
  });
