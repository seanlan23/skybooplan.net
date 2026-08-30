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
  type ShareOgMeta,
  type SharePlanParams,
} from "@/lib/sharePlan";

export type SharedPackageSnapshot = {
  id: string;
  plan: AiTripPlan;
  params: SharePlanParams;
  og: ShareOgMeta;
};

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
  .inputValidator((d) => CreateInput.parse(d))
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("shared_packages").insert({
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
  .inputValidator((d: { id?: string } | null) => ({
    id: String(d?.id ?? "").trim(),
  }))
  .handler(async ({ data }): Promise<SharedPackageSnapshot | null> => {
    try {
      if (!/^[a-zA-Z0-9_-]{6,32}$/.test(data.id)) return null;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("shared_packages")
        .select("id, payload, og_title, og_description, og_image, from_iata, to_iata, depart_date, return_date, trip_style, hotel_id, guests")
        .eq("id", data.id)
        .maybeSingle();
      if (error || !row) return null;
      const payload = (row.payload ?? {}) as {
        plan?: AiTripPlan;
        params?: SharePlanParams;
        og?: ShareOgMeta;
      };
      const raw = payload.plan;
      if (!raw?.destinationName && !raw?.days?.length && !raw?.resortStay) return null;
      const plan: AiTripPlan = {
        ...raw,
        destinationName: raw.destinationName || "Trip",
        summary: raw.summary ?? "",
        totalBudgetEur: raw.totalBudgetEur ?? 0,
        centerLat: raw.centerLat ?? 0,
        centerLng: raw.centerLng ?? 0,
        days: Array.isArray(raw.days) ? raw.days : [],
      };
      return {
        id: row.id,
        plan,
        params: {
          from: asShareIata(row.from_iata) ?? payload.params?.from,
          to: asShareIata(row.to_iata) ?? payload.params?.to,
          depart: asShareIsoDate(row.depart_date) ?? payload.params?.depart,
          return: asShareIsoDate(row.return_date) ?? payload.params?.return,
          style: asShareStyle(row.trip_style) ?? payload.params?.style,
          hotelId: row.hotel_id ?? payload.params?.hotelId,
          guests: asShareGuests(row.guests) ?? payload.params?.guests,
          s: row.id,
        },
        og: {
          title: row.og_title || payload.og?.title || plan.destinationName,
          description: row.og_description || payload.og?.description || "",
          image: row.og_image || payload.og?.image || "",
        },
      };
    } catch (err) {
      console.error("[sharedPackage] load failed:", err);
      return null;
    }
  });
