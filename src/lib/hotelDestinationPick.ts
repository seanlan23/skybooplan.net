/** Booking.com RapidAPI destination row (subset we care about). */
export type BookingDestRow = {
  dest_id?: string | number;
  search_type?: string;
  label?: string;
  name?: string;
  city_name?: string;
};

/**
 * Prefer a precise city/district dest over a broad region.
 * Blind `destRows[0]` for "Krabi" can resolve to a province that includes Koh Lanta.
 */
export function hotelSearchQueryAlias(city: string): string {
  const trimmed = city.trim();
  if (/^krabi$/i.test(trimmed)) return "Ao Nang";
  return trimmed;
}

function rowLabel(row: BookingDestRow): string {
  return String(row.label ?? row.name ?? row.city_name ?? "").trim();
}

export function pickBestBookingDestination(
  query: string,
  rows: BookingDestRow[],
): BookingDestRow | null {
  if (!rows.length) return null;
  const q = query.trim().toLowerCase();
  if (!q) return rows[0] ?? null;

  const isKrabiSearch = /^krabi$|^ao nang$/i.test(query.trim());

  let best: BookingDestRow | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.dest_id == null) continue;
    const label = rowLabel(row).toLowerCase();
    const type = String(row.search_type ?? "").toLowerCase();
    let score = 0;

    if (label === q) score += 100;
    else if (label.startsWith(q + ",") || label.startsWith(q + " ")) score += 85;
    else if (label.includes(q)) score += 45;

    if (type === "city" || type === "district" || type === "hotel") score += 35;
    else if (type === "region" || type === "province") score -= 25;

    if (isKrabiSearch) {
      if (/ao nang|krabi town|krabi city/.test(label)) score += 55;
      if (/lanta/.test(label)) score -= 70;
    }

    // Stable tie-break: earlier API order.
    score -= i * 0.01;

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best ?? rows[0] ?? null;
}
