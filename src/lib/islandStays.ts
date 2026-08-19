import type { Activity, DayPlan, TripRegion, TripSkeleton } from "@/lib/aiPlan.functions";
import { findIslandDef, getIslandStayKind, type IslandStayKind } from "@/lib/islandStayCatalogs";
import { parseLocalDate } from "@/lib/dateUtils";
import {
  buildIslandStayMoonNote,
  moonPhaseForDate,
  stripMoonHintSpam,
} from "@/lib/lunarTides";
import { rewriteActivityCityLeak } from "@/lib/textSanitize";

export type IslandStayBlock = {
  dayEnd: number;
  dateEnd: string;
  nights: number;
  flexibleActivities: Activity[];
  stayKind: IslandStayKind;
};

// Island catalogs: src/lib/islandStayCatalogs.ts (SEA, Caribbean, Med, Pacific + fallbacks).
export function isSmallIsland(city: string): boolean {
  const def = findIslandDef(city);
  return def != null && def.stayKind !== "mainland_base";
}

export function getIslandStayCatalog(city: string, lang: string): Activity[] {
  const slo = lang === "sl" || lang.startsWith("sl");
  const def = findIslandDef(city);
  return def ? def.activities(slo) : [];
}

function collectDayActivities(day: DayPlan): Activity[] {
  const out: Activity[] = [];
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    const list = day.activities?.[slot];
    if (list?.length) out.push(...list);
  }
  return out;
}

function isTransportLikeActivity(a: Activity): boolean {
  const t = `${a.name} ${a.description ?? ""}`.toLowerCase();
  return (
    a.type === "TRANSPORT" ||
    /^prevoz:/i.test(a.name.trim()) ||
    (/→|->/.test(t) && /\b(vlak|train|let|flight|avtobus|bus|ferry|feribot|čoln|boat|speedboat)\b/.test(t))
  );
}

function isIslandTravelInDay(day: DayPlan, region?: TripRegion): boolean {
  if (!region || day.day !== region.startDay) return false;
  const transportText = `${day.transport?.type ?? ""} ${day.transport?.description ?? ""}`.toLowerCase();
  if (/ferry|feribot|speedboat|čoln|boat|longtail|prevoz.*otok|transfer/i.test(transportText)) {
    return true;
  }
  const acts = collectDayActivities(day);
  if (acts.length > 0 && acts.every(isTransportLikeActivity)) return true;
  return false;
}

function isIslandTravelOutDay(day: DayPlan, region?: TripRegion): boolean {
  if (!region || day.day !== region.endDay) return false;
  if (!region.transportToNext) return false;
  const transportText = `${day.transport?.type ?? ""} ${day.transport?.description ?? ""}`.toLowerCase();
  if (/ferry|feribot|speedboat|čoln|boat|let|flight|prevoz/i.test(transportText)) return true;
  const acts = collectDayActivities(day);
  const sights = acts.filter((a) => !isTransportLikeActivity(a));
  return sights.length <= 1;
}

function dedupeActivities(list: Activity[]): Activity[] {
  const seen = new Set<string>();
  const out: Activity[] = [];
  for (const a of list) {
    const key = a.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function sanitizeIslandActivity(a: Activity, city: string): Activity {
  return {
    ...a,
    name: rewriteActivityCityLeak(a.name, city),
    description: rewriteActivityCityLeak(a.description ?? "", city),
    priceLabel: a.priceLabel
      ? rewriteActivityCityLeak(a.priceLabel, city)
      : a.priceLabel,
  };
}

/** Strip per-activity moon spam — one krovna opomba gre v travelHack bloka. */
function cleanIslandStayActivities(activities: Activity[]): Activity[] {
  return activities.map((a) => ({
    ...a,
    description: stripMoonHintSpam(a.description ?? ""),
  }));
}

function bioluminescenceActivity(city: string, lang: string): Activity | null {
  if (!/el nido|palawan|koh rong|vieques|mosquito bay/i.test(city)) return null;
  const slo = lang === "sl" || lang.startsWith("sl");
  return {
    name: slo ? "Bioluminiscenca (nočni izlet)" : "Bioluminescence night tour",
    type: "ACTIVITY",
    priceLabel: slo ? "25–45 €" : "€25–45",
    description: slo
      ? "Nočni čoln ali kayak — svetleči plankton v temnejših lagunah. Rezerviraj ob mlaju; ob polni luni manj vidno."
      : "Night boat or kayak — glowing plankton in darker lagoons. Book on dark-moon nights.",
  };
}

function injectDarkMoonBioluminescence(
  activities: Activity[],
  days: DayPlan[],
  city: string,
  lang: string,
): Activity[] {
  const hasBio = activities.some((a) => /bioluminiscen|bioluminescen/i.test(`${a.name} ${a.description}`));
  if (hasBio) return activities;

  const darkEvening = days.some((d) => {
    const moon = moonPhaseForDate(d.date, lang);
    return moon.bioluminescenceFriendly;
  });
  if (!darkEvening) return activities;

  const bio = bioluminescenceActivity(city, lang);
  return bio ? dedupeActivities([...activities, bio]) : activities;
}

function mergeActivitiesFromDays(days: DayPlan[], city: string, lang: string): Activity[] {
  const fromDays = days.flatMap((d) =>
    collectDayActivities(d)
      .filter((a) => !isTransportLikeActivity(a))
      .map((a) => sanitizeIslandActivity(a, city)),
  );
  const catalog = getIslandStayCatalog(city, lang).map((a) => sanitizeIslandActivity(a, city));
  return injectDarkMoonBioluminescence(
    dedupeActivities([...fromDays, ...catalog]),
    days,
    city,
    lang,
  );
}

export function islandStayTitle(city: string, spanDays: number, lang: string): string {
  const slo = lang === "sl" || lang.startsWith("sl");
  const kind = getIslandStayKind(city);
  if (kind === "bay_cruise") {
    return slo ? `${city} — križarka in lagune` : `${city} — cruise & lagoons`;
  }
  if (slo) {
    return spanDays >= 3
      ? `${city} — prosti dnevi na otoku`
      : `${city} — kaj videti in početi`;
  }
  return spanDays >= 3
    ? `${city} — flexible island days`
    : `${city} — what to see & do`;
}

export function formatStayDateRange(start: string, end: string, lang: string): string {
  const ds = parseLocalDate(start);
  const de = parseLocalDate(end);
  if (!ds || !de) return `${start} – ${end}`;
  try {
    const sameMonth = ds.getMonth() === de.getMonth() && ds.getFullYear() === de.getFullYear();
    const d1 = ds.toLocaleDateString(lang || "sl", { day: "numeric", month: "short" });
    const d2 = de.toLocaleDateString(lang || "sl", {
      day: "numeric",
      ...(sameMonth ? {} : { month: "short" }),
      ...(ds.getFullYear() === de.getFullYear() ? {} : { year: "numeric" }),
    });
    return `${d1} – ${d2}`;
  } catch {
    return `${start} – ${end}`;
  }
}

function buildIslandStayBlock(
  days: DayPlan[],
  city: string,
  lang: string,
): DayPlan {
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const flexibleActivities = cleanIslandStayActivities(
    mergeActivitiesFromDays(days, city, lang),
  );
  const moonNote = buildIslandStayMoonNote(
    days.map((d) => d.date),
    lang,
  );
  const mapPins = days.flatMap((d) => d.mapPins ?? []);
  const pinSeen = new Set<string>();
  const mergedPins = mapPins.filter((p) => {
    const k = `${p.name}-${p.lat}-${p.lng}`;
    if (pinSeen.has(k)) return false;
    pinSeen.add(k);
    return true;
  });

  const nights = days.length;
  const islandStay: IslandStayBlock = {
    dayEnd: last.day,
    dateEnd: last.date,
    nights,
    flexibleActivities,
    stayKind: getIslandStayKind(city),
  };

  return {
    ...first,
    dayEnd: last.day,
    dateEnd: last.date,
    title: islandStayTitle(city, days.length, lang),
    morning: "",
    afternoon: "",
    evening: "",
    activities: undefined,
    islandStay,
    category: "beach",
    dailyBudgetEur: days.reduce((s, d) => s + (d.dailyBudgetEur ?? 0), 0),
    travelHack:
      [moonNote, ...days.map((d) => stripMoonHintSpam(d.travelHack ?? "")).filter(Boolean)]
        .filter(Boolean)
        .join("\n\n") ||
      first.travelHack,
    transportationTips:
      first.transportationTips ||
      days.find((d) => d.transportationTips)?.transportationTips ||
      "",
    mapPins: mergedPins.length ? mergedPins : first.mapPins,
    transport: undefined,
  };
}

/** Collapse consecutive small-island days into one flexible stay card. */
export function collapseSmallIslandStays(
  days: DayPlan[],
  skeleton: TripSkeleton,
  lang = "sl",
): DayPlan[] {
  if (days.length === 0) return days;

  const result: DayPlan[] = [];
  let i = 0;

  while (i < days.length) {
    const day = days[i]!;
    if (!isSmallIsland(day.city)) {
      result.push(day);
      i++;
      continue;
    }

    let j = i + 1;
    while (j < days.length && days[j]!.city === day.city && isSmallIsland(days[j]!.city)) {
      j++;
    }
    const chunk = days.slice(i, j);

    if (chunk.length < 2) {
      result.push(day);
      i = j;
      continue;
    }

    const region = skeleton.regions.find(
      (r) => day.day >= r.startDay && day.day <= r.endDay,
    );

    const travelIn = chunk.find((d) => isIslandTravelInDay(d, region));
    const travelOut = chunk.find(
      (d) => isIslandTravelOutDay(d, region) && d !== travelIn,
    );

    const flexibleDays = chunk.filter((d) => d !== travelIn && d !== travelOut);

    if (travelIn) result.push(travelIn);

    if (flexibleDays.length >= 2) {
      result.push(buildIslandStayBlock(flexibleDays, day.city, lang));
    } else if (flexibleDays.length === 1 && !travelIn && !travelOut) {
      result.push(flexibleDays[0]!);
    } else if (flexibleDays.length === 1 && (travelIn || travelOut)) {
      result.push(flexibleDays[0]!);
    } else if (!travelIn && !travelOut) {
      result.push(buildIslandStayBlock(chunk, day.city, lang));
    }

    if (travelOut) result.push(travelOut);

    i = j;
  }

  return result;
}
