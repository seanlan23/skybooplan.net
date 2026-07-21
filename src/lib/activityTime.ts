/** Format activity visit/travel window for UI + PDF (start → end). */
export function formatActivityClockRange(
  arrivalTime?: string | null,
  departureTime?: string | null,
): string | undefined {
  const start = arrivalTime?.trim() || "";
  const end = departureTime?.trim() || "";
  if (!start && !end) return undefined;
  if (start && !end) return start;
  if (!start && end) return end;

  const toMin = (t: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };

  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null) return `${start} – ${end}`;
  // Overnight wall-clock (e.g. 21:10 → 17:55 next day).
  if (b < a) return `${start} – ${end} (+1)`;
  return `${start} – ${end}`;
}
