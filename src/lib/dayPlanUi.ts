import { DAY_TITLE_PREFIXES } from "@/lib/planLanguages";
import type { Activity } from "@/lib/aiPlan.functions";

/** Sort key — arrivalTime is the activity start (HH:MM). */
function activityStartTime(a: Activity): string {
  return (a.arrivalTime ?? a.departureTime ?? "").trim();
}

/** Chronological order: earliest start time first. */
export function sortActivitiesByTime(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) =>
    activityStartTime(a).localeCompare(activityStartTime(b)),
  );
}

/** Avoid "Dan 1: Dan 1: …" when `title` already includes the day prefix. */
export function formatDayCardTitle(
  day: { day: number; dayEnd?: number; title: string },
  dayWord: string,
): string {
  if (day.dayEnd != null && day.dayEnd > day.day) return day.title.trim();
  const title = day.title.trim();
  const escapedDayWord = dayWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixAlternatives = [
    escapedDayWord,
    ...DAY_TITLE_PREFIXES.filter((p) => p.toLowerCase() !== dayWord.toLowerCase()).map((p) =>
      p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
  ].join("|");
  const dupPrefix = new RegExp(`^(?:${prefixAlternatives})\\s*${day.day}\\s*:\\s*`, "i");
  if (dupPrefix.test(title)) return title;
  return `${dayWord} ${day.day}: ${title}`;
}
