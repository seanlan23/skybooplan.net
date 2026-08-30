import { normalizeShareToken, unquoteShareValue } from "@/lib/sharedPackageSnapshot";

/** TanStack may pass `{ id }` or nested `{ data: { id } }` into the server-fn validator. */
export function unwrapServerFnInput(raw: unknown): unknown {
  let cur: unknown = raw;
  for (let i = 0; i < 4; i++) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return cur;
    const rec = cur as Record<string, unknown>;
    if (rec.data != null && typeof rec.data === "object" && !Array.isArray(rec.data)) {
      const data = rec.data as Record<string, unknown>;
      if ("id" in data || "plan" in data || "hotelId" in data || "data" in data) {
        cur = data;
        continue;
      }
    }
    return cur;
  }
  return cur;
}

export function sharePackageIdFromInput(raw: unknown): string {
  if (typeof raw === "string") return normalizeShareToken(raw);
  const d = unwrapServerFnInput(raw);
  if (typeof d === "string") return normalizeShareToken(d);
  if (d && typeof d === "object") {
    return normalizeShareToken(String((d as { id?: unknown }).id ?? ""));
  }
  return "";
}

export function shareLookupFromInput(raw: unknown): {
  id: string;
  hotelId?: string;
  to?: string;
  depart?: string;
} {
  const d = unwrapServerFnInput(raw);
  const rec = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
  const id = sharePackageIdFromInput(raw);
  const hotelId = unquoteShareValue(String(rec.hotelId ?? "")).trim() || undefined;
  const to = unquoteShareValue(String(rec.to ?? "")).trim().toUpperCase() || undefined;
  const depart = unquoteShareValue(String(rec.depart ?? "")).trim() || undefined;
  return { id, hotelId, to, depart };
}
