import { SKYBOOPLAN_SITE } from "@/lib/bookingUrl";
import type { SharePlanParams } from "@/lib/sharePlan";
import { unquoteShareValue, type SharedPackageSnapshot } from "@/lib/sharedPackageSnapshot";

export function shareApiOrigin(href?: string | null): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const raw = (href ?? "").trim();
  if (raw.includes("://")) {
    try {
      return new URL(raw).origin;
    } catch {
      /* fall through */
    }
  }
  return SKYBOOPLAN_SITE;
}

export function sharedPackageApiPath(params: SharePlanParams): string {
  const q = new URLSearchParams();
  const id = unquoteShareValue(params.s ?? "");
  const hotelId = unquoteShareValue(params.hotelId ?? "");
  if (id) q.set("id", id);
  if (hotelId) q.set("hotelId", hotelId);
  if (params.to) q.set("to", params.to);
  if (params.depart) q.set("depart", params.depart);
  const qs = q.toString();
  return qs ? `/api/shared-package?${qs}` : "/api/shared-package";
}

export async function fetchSharedPackageSnapshot(
  params: SharePlanParams,
  href?: string | null,
): Promise<SharedPackageSnapshot | null> {
  if (!params.s && !params.hotelId) return null;
  const url = `${shareApiOrigin(href)}${sharedPackageApiPath(params)}`;
  try {
    const res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { snapshot?: SharedPackageSnapshot | null };
    return body.snapshot?.plan ? body.snapshot : null;
  } catch (err) {
    console.error("[plan] shared package GET failed", err);
    return null;
  }
}
