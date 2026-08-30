import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { ResortPackage } from "@/lib/resortPackage";
import { createSharedPackage } from "@/lib/sharedPackage.functions";

export async function copySharedPlanLink(opts: {
  plan: AiTripPlan;
  pkg?: Pick<ResortPackage, "id" | "pricePerPersonEur" | "nights" | "coverImageUrl" | "images">;
  from?: string;
  to?: string;
  depart?: string;
  returnDate?: string;
  guests?: number;
  style?: string;
  lang?: string;
}): Promise<string | null> {
  const created = await createSharedPackage({
    data: {
      plan: opts.plan,
      hotelId: opts.pkg?.id,
      from: opts.from || opts.plan.originIata,
      to: opts.to || opts.plan.destinationIata,
      depart: opts.depart,
      return: opts.returnDate,
      style: opts.style || opts.plan.tripStyle,
      guests: opts.guests,
      pricePerPerson: opts.pkg?.pricePerPersonEur,
      nights: opts.pkg?.nights,
      imageUrl: opts.pkg?.coverImageUrl || opts.pkg?.images?.[0],
      lang: opts.lang,
    },
  });
  if (!created || "error" in created) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${created.path}`;
}
