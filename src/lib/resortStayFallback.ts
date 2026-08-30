import type { ResortStay } from "@/lib/aiPlan.functions";
import { ensureTransferPickupCopy, type ResortTransferHint } from "@/lib/resortTransferModel";
import { unquoteShareValue } from "@/lib/sharedPackageSnapshot";

/** Protocol blocks when a shared snapshot kept the cards but dropped Gemini stay copy. */
export function fallbackResortStay(hint: ResortTransferHint, lang?: string | null): ResortStay {
  return {
    arrivalProtocol: {
      visa_and_entry: "",
      immigration: "",
      baggage: "",
      transfer_pickup: ensureTransferPickupCopy("", hint, lang),
      cash_and_esim: "",
    },
    resortGuide: {
      check_in_out: "",
      all_inclusive_etiquette: "",
      tipping: "",
      relaxing_at_resort: "",
    },
    optionalExcursions: [],
    departureProtocol: {
      return_transfer: "",
      airport_lead_time: "",
      flight_alignment: "",
    },
  };
}

export function resolveStayForPackageDetails(
  stay: ResortStay | undefined,
  hint: ResortTransferHint,
  lang?: string | null,
): ResortStay {
  if (stay?.arrivalProtocol || stay?.resortGuide || stay?.departureProtocol) return stay;
  return fallbackResortStay(hint, lang);
}

export function matchResortPackageId<T extends { id: string }>(
  packages: T[],
  wanted: string | null | undefined,
): T | undefined {
  const id = unquoteShareValue(wanted ?? "");
  if (!id) return undefined;
  return packages.find((pkg) => pkg.id === id || unquoteShareValue(pkg.id) === id);
}
