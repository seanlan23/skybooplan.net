/** Avoid "Dan 1: Dan 1: …" when `title` already includes the day prefix. */
export function formatDayCardTitle(
  day: { day: number; dayEnd?: number; title: string },
  dayWord: string,
): string {
  if (day.dayEnd != null && day.dayEnd > day.day) return day.title.trim();
  const title = day.title.trim();
  const escaped = dayWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dupPrefix = new RegExp(`^(?:${escaped}|Day)\\s*${day.day}\\s*:\\s*`, "i");
  if (dupPrefix.test(title)) return title;
  return `${dayWord} ${day.day}: ${title}`;
}
