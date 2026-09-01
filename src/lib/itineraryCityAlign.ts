import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { overnightPlacesMatch } from "@/lib/overnightHotelStays";
import { allRegionCityCoords, lookupRegionCoords } from "@/lib/regionCoords";
import { isSingleBasePlan } from "@/lib/tripStyle";
import { hasExplicitStayPlan } from "@/lib/userStayPlan";

const MOVE_RE =
  /let\b|flight|trajekt|ferry|prevoz na letališč|airport transfer|check-?out|odjava|odhod iz hotela|mednarodn/i;

function norm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mentionCount(blob: string, city: string): number {
  const key = norm(city);
  if (key.length < 4) return 0;
  const token = key.split(" ")[0] ?? key;
  if (token.length < 4) return 0;
  const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w{0,4}\\b`, "gi");
  return blob.match(re)?.length ?? 0;
}

function programBlob(day: DayPlan): string {
  const parts = [day.title, day.focusName];
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    for (const a of day.activities?.[slot] ?? []) {
      if (MOVE_RE.test(`${a.name ?? ""} ${a.type ?? ""}`)) continue;
      parts.push(a.name, a.description);
    }
  }
  return parts.filter(Boolean).join(" ");
}

function candidateCities(plan: AiTripPlan): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw?: string) => {
    const city = (raw ?? "").trim();
    if (!city) return;
    const key = norm(city);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(city);
  };
  for (const day of plan.days ?? []) push(day.city);
  for (const h of plan.hotels ?? []) push(h.city);
  return out;
}

function catalogHits(blob: string): Array<{ city: string; score: number }> {
  const hits: Array<{ city: string; score: number }> = [];
  for (const row of allRegionCityCoords()) {
    if (row.city.length < 5 && row.city !== "amed" && row.city !== "kuta") continue;
    const score = mentionCount(blob, row.city);
    if (score > 0) hits.push({ city: row.city.replace(/\b\w/g, (c) => c.toUpperCase()), score });
  }
  return hits.sort((a, b) => b.score - a.score || b.city.length - a.city.length);
}

function displayCity(raw: string, planCities: string[]): string {
  const match = planCities.find((c) => overnightPlacesMatch(c, raw));
  if (match) return match;
  return raw
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * days[].city follows that day's programme, not the next hotel stamp.
 * Exploring Denpasar must not stay labeled Ubud.
 */
export function alignDayCityToActivities(plan: AiTripPlan): number {
  if (isSingleBasePlan(plan)) return 0;
  if (hasExplicitStayPlan(plan.wishes)) return 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  if (!days.length) return 0;
  const lastNum = Math.max(...days.map((d) => d.day));
  const planCities = candidateCities(plan);
  const origin = [plan.originPlace, plan.originIata].filter(Boolean) as string[];
  let changed = 0;

  for (const day of days) {
    if (days.length >= 4 && day.day >= lastNum - 1) continue;
    if (days.length < 4 && day.day === lastNum) continue;
    const header = (day.city || day.focusName || "").trim();
    if (!header) continue;
    const blob = programBlob(day);
    if (!blob.trim()) continue;

    const scored = new Map<string, { city: string; score: number }>();
    const add = (city: string, extra = 0) => {
      if (origin.some((o) => overnightPlacesMatch(city, o))) return;
      const score = mentionCount(blob, city) + extra;
      if (score <= 0) return;
      const key = norm(city);
      const prev = scored.get(key);
      if (!prev || score > prev.score) scored.set(key, { city, score });
    };
    for (const city of planCities) add(city);
    for (const hit of catalogHits(blob)) add(hit.city, hit.score > 1 ? 0 : 0);

    const headerScore = mentionCount(blob, header);
    const ranked = [...scored.values()].sort((a, b) => b.score - a.score);
    const winner = ranked[0];
    if (!winner || overnightPlacesMatch(winner.city, header)) continue;

    const inPlan = planCities.some((c) => overnightPlacesMatch(c, winner.city));
    const titleHit = mentionCount(`${day.title ?? ""}`, winner.city) > 0;
    const strong =
      winner.score >= 2 ||
      (inPlan && winner.score >= 1 && headerScore === 0 && (titleHit || winner.score > headerScore));
    if (!strong || winner.score < headerScore) continue;

    const next = displayCity(winner.city, planCities);
    day.city = next;
    if (!day.focusName?.trim() || overnightPlacesMatch(day.focusName, header)) {
      day.focusName = next;
    }
    const coords = lookupRegionCoords(next);
    if (coords) {
      day.lat = coords.lat;
      day.lng = coords.lng;
    }
    changed += 1;
  }

  return changed;
}
