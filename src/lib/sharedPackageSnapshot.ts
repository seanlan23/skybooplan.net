import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  asShareIata,
  asShareStyle,
  type ShareOgMeta,
  type SharePlanParams,
} from "@/lib/sharePlan";

export type SharedPackageSnapshot = {
  id: string;
  plan: AiTripPlan;
  params: SharePlanParams;
  og: ShareOgMeta;
};

/** TanStack search / JSON often wraps scalars in extra quotes. */
export function unquoteShareValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizeShareToken(value: string): string {
  return unquoteShareValue(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

export function destinationNameFromOgTitle(title: string | undefined | null): string | undefined {
  const raw = (title ?? "").trim();
  if (!raw) return undefined;
  const head = raw.split(/\s+[–—-]\s+/)[0]?.trim();
  return head || undefined;
}

export function planFromSharePayload(
  raw: Partial<AiTripPlan> | undefined,
  fallback: {
    destinationName?: string;
    destinationIata?: string;
    originIata?: string;
    tripStyle?: string | null;
  },
): AiTripPlan {
  const tripStyle = raw?.tripStyle ?? asShareStyle(fallback.tripStyle) ?? "single_base";
  return {
    ...raw,
    destinationName:
      raw?.destinationName?.trim() || fallback.destinationName?.trim() || "Trip",
    summary: raw?.summary ?? "",
    totalBudgetEur: raw?.totalBudgetEur ?? 0,
    centerLat: raw?.centerLat ?? 0,
    centerLng: raw?.centerLng ?? 0,
    days: Array.isArray(raw?.days) ? raw.days : [],
    destinationIata: raw?.destinationIata ?? asShareIata(fallback.destinationIata),
    originIata: raw?.originIata ?? asShareIata(fallback.originIata),
    tripStyle,
  };
}
