/** Drop Booking promo tails so card titles stay short. */
export function cleanHotelDisplayName(name: string): string {
  const original = name.replace(/\s+/g, " ").trim();
  if (!original) return "";

  let cleaned = original
    .replace(
      /\s+(?:with\s+(?:\d|special|complimentary|free\b|sea[\s-]?plane|transfer|offer)|special\s+offers?|[-–—]\s*\d+\s*%|\d+\s*(?:percent(?:age)?|%)\s+off).+$/i,
      "",
    )
    .replace(/\s+including\s+complimentary.+$/i, "")
    .replace(/\s*\(\s*(?:special|promo|offer).+\)$/i, "")
    .replace(/[-–—,;:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || original;
}
