import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { inferBudgetCountryFromPlace } from "@/lib/countryDailyBudget";
import { haversineKm } from "@/lib/geoMath";
import { isSmallIsland } from "@/lib/islandStays";

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
  const tokens = [key];
  const first = key.split(/\s+/)[0] ?? "";
  if (first.length >= 5 && first.toLowerCase() !== key.toLowerCase()) tokens.push(first);
  for (const token of tokens) {
    try {
      if (new RegExp(`\\b${escapeRe(token)}\\b`, "i").test(blob)) return true;
    } catch {
      if (blob.toLowerCase().includes(token.toLowerCase())) return true;
    }
  }
  return false;
}

const ISLAND_SLEEP_NAME =
  /\b(island|otok|isla|isle|atoll|atol|archipelago|souostrov)\b/i;
const INLAND_WILD =
  /\b(game drive|game-drive|savann[ae]?|savana|bush camp|game reserve|wildlife reserve)\b/i;

/** Sleep city is an island / named isle — not a mainland park. */
export function isIslandSleepCity(city: string): boolean {
  const name = city.trim();
  if (!name) return false;
  return isSmallIsland(name) || ISLAND_SLEEP_NAME.test(name);
}

/** Savannah / game-drive copy on an island sleep card (no destination names). */
export function activityMismatchesSleepCity(
  name: string,
  description: string,
  sleepCity: string,
): boolean {
  if (!isIslandSleepCity(sleepCity)) return false;
  const blob = blobOf(name, description);
  if (mentionsStayCity(blob, sleepCity)) return false;
  if (INLAND_WILD.test(blob)) return true;
  return /\bsafari\b/i.test(blob) && /\b(park|savan|bush|reserve|krater|crater|stepp|divjin)/i.test(blob);
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
    if (mentionsStayCity(blob, stay.city)) {
      return `mentions "${stay.city}"`;
    }
  }

  if (activityMismatchesSleepCity(name, description, sleepCity)) {
    return `inland wild on island stay "${sleepCity}"`;
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
