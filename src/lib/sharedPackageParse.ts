/** TanStack may pass `{ id }` or `{ data: { id } }` into the server-fn validator. */
export function unwrapServerFnInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const rec = raw as Record<string, unknown>;
  if (rec.data != null && typeof rec.data === "object" && !Array.isArray(rec.data)) {
    const data = rec.data as Record<string, unknown>;
    if ("id" in data || "plan" in data) return data;
  }
  return raw;
}

export function sharePackageIdFromInput(raw: unknown): string {
  const d = unwrapServerFnInput(raw);
  if (typeof d === "string") return d.trim();
  if (d && typeof d === "object") {
    return String((d as { id?: unknown }).id ?? "").trim();
  }
  return "";
}
