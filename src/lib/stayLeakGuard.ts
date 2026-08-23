import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { inferBudgetCountryFromPlace } from "@/lib/countryDailyBudget";
import { haversineKm } from "@/lib/geoMath";

const CROSS_STAY_KM = 250;
const FAR_POI_KM = 180;

export type StayRef = {
  city: string;
  lat: number;
  lng: number;
};

function blobOf(name: string, description?: string): string {
  return `${name} ${description ?? ""}`;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cityKey(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .join(" ");
}

/** True when copy names another stay (Vilanculos on a Kasane card). */
export function mentionsStayCity(blob: string, city: string): boolean {
  const key = (city.split(",")[0] ?? city).trim();
  if (key.length < 4) return false;
  try {
    return new RegExp(`\\b${escapeRe(key)}\\b`, "i").test(blob);
  } catch {
    return blob.toLowerCase().includes(key.toLowerCase());
  }
}

function isTransportActivity(a: Pick<Activity, "name" | "description" | "type" | "transportType">): boolean {
  if (a.type === "TRANSPORT" || a.transportType) return true;
  const t = blobOf(a.name ?? "", a.description);
  if (/→|->/.test(t) && /\b(let|flight|trajekt|ferry|vlak|train|prevoz|transfer)\b/i.test(t)) {
    return true;
  }
  return (
    /\b(let|flight|trajekt|ferry|prevoz|transfer)\b/i.test(t) &&
    /\b(iz|from)\b.+\b(v|do|to)\b/i.test(t)
  );
}

function stayDistanceKm(a: StayRef, b: { lat?: number; lng?: number }): number | null {
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return null;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;
  return haversineKm([a.lng, a.lat], [b.lng!, b.lat!]);
}

export function collectStayRefs(plan: AiTripPlan): StayRef[] {
  const out: StayRef[] = [];
  const seen = new Set<string>();
  for (const d of plan.days ?? []) {
    const city = (d.city || d.focusName || "").trim();
    const key = cityKey(city);
    if (!key || seen.has(key)) continue;
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue;
    seen.add(key);
    out.push({ city, lat: d.lat, lng: d.lng });
  }
  return out;
}

/**
 * Non-transport activity belongs to another stay/country than the sleep city.
 * Transport to the next country is allowed — premature hops are stripped separately.
 */
export function activityLeaksStay(
  name: string,
  description: string,
  sleep: { city?: string; lat?: number; lng?: number },
  stays: StayRef[],
  opts?: { isTransport?: boolean; coords?: { lat?: number; lng?: number } },
): string | null {
  if (opts?.isTransport) return null;
  const blob = blobOf(name, description);
  const sleepCity = (sleep.city ?? "").trim();
  const sleepCc = inferBudgetCountryFromPlace(sleepCity);
  const actCc = inferBudgetCountryFromPlace(blob);
  if (sleepCc && actCc && sleepCc !== actCc) {
    return `country ${actCc} on ${sleepCc} day`;
  }

  for (const stay of stays) {
    if (cityKey(stay.city) === cityKey(sleepCity)) continue;
    const km = stayDistanceKm(stay, sleep);
    if (km != null && km < CROSS_STAY_KM) continue;
    if (mentionsStayCity(blob, stay.city)) {
      return `mentions "${stay.city}"`;
    }
  }

  const pin = opts?.coords;
  if (
    pin &&
    Number.isFinite(pin.lat) &&
    Number.isFinite(pin.lng) &&
    Number.isFinite(sleep.lat) &&
    Number.isFinite(sleep.lng)
  ) {
    const km = haversineKm([sleep.lng!, sleep.lat!], [pin.lng!, pin.lat!]);
    if (km > FAR_POI_KM) return `${Math.round(km)}km from sleep city`;
  }
  return null;
}

function hopLeavesSleepCountry(
  a: Pick<Activity, "name" | "description">,
  sleepCity: string,
): boolean {
  const blob = blobOf(a.name ?? "", a.description);
  const sleepCc = inferBudgetCountryFromPlace(sleepCity);
  const dest =
    blob.match(/(?:→|->)\s*([^.(]+)/)?.[1] ??
    blob.match(/\b(?:v|do|to)\s+([^.(]+)/i)?.[1];
  const destCc = inferBudgetCountryFromPlace(dest ?? blob);
  return Boolean(sleepCc && destCc && sleepCc !== destCc);
}

function nextDayStillHere(days: DayPlan[], index: number): boolean {
  const here = (days[index]?.city || days[index]?.focusName || "").trim();
  const next = days[index + 1];
  if (!here || !next) return false;
  const there = (next.city || next.focusName || "").trim();
  if (cityKey(here) === cityKey(there)) return true;
  const a = inferBudgetCountryFromPlace(here);
  const b = inferBudgetCountryFromPlace(there);
  return Boolean(a && b && a === b);
}

function filterSlot(
  list: Activity[] | undefined,
  drop: (a: Activity) => boolean,
): { next: Activity[]; removed: number } {
  if (!list?.length) return { next: list ?? [], removed: 0 };
  const next = list.filter((a) => !drop(a));
  return { next, removed: list.length - next.length };
}

/**
 * Drop sights from another country/stay on today's sleep card, and flights
 * that leave this country while the next night is still here.
 */
export function stripCrossStayLeaks(plan: AiTripPlan): number {
  const days = plan.days ?? [];
  const stays = collectStayRefs(plan);
  let removed = 0;

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const sleep = {
      city: day.city || day.focusName || "",
      lat: day.lat,
      lng: day.lng,
    };
    if (!sleep.city) continue;
    const prematureHop = nextDayStillHere(days, i);
    const leavingToday = (day.activities
      ? [...(day.activities.morning ?? []), ...(day.activities.afternoon ?? []), ...(day.activities.evening ?? [])]
      : []
    ).some((a) => isTransportActivity(a) && hopLeavesSleepCountry(a, sleep.city));
    const transferOnly = leavingToday && !prematureHop;

    const dropAct = (a: Activity) => {
      const transport = isTransportActivity(a);
      if (transport) {
        if (prematureHop && hopLeavesSleepCountry(a, sleep.city)) return true;
        return false;
      }
      if (transferOnly) return true;
      return Boolean(
        activityLeaksStay(a.name ?? "", a.description ?? "", sleep, stays, {
          isTransport: false,
          coords:
            typeof a.lat === "number" && typeof a.lng === "number"
              ? { lat: a.lat, lng: a.lng }
              : undefined,
        }),
      );
    };

    if (day.activities) {
      for (const slot of ["morning", "afternoon", "evening"] as const) {
        const { next, removed: n } = filterSlot(day.activities[slot], dropAct);
        if (n) {
          day.activities[slot] = next;
          removed += n;
        }
      }
    }

    if (day.mapPins?.length) {
      const nextPins = day.mapPins.filter((p) => {
        const leak = activityLeaksStay(p.name ?? "", p.description ?? "", sleep, stays, {
          coords:
            typeof p.lat === "number" && typeof p.lng === "number"
              ? { lat: p.lat, lng: p.lng }
              : undefined,
        });
        if (leak) removed += 1;
        return !leak;
      });
      day.mapPins = nextPins;
    }

    for (const prose of ["morning", "afternoon", "evening", "title"] as const) {
      const text = day[prose];
      if (!text) continue;
      if (activityLeaksStay(text, "", sleep, stays)) {
        if (prose === "title") day.title = sleep.city;
        else day[prose] = "";
        removed += 1;
      }
    }
  }
  return removed;
}
