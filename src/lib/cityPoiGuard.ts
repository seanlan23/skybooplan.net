import type { Activity, DayPlan } from "@/lib/aiPlan.functions";

/** Attractions that only make sense in Bangkok — never on Phuket / Khao Sok / Krabi days. */
export const BANGKOK_ONLY_ATTRACTION =
  /grand palace|velika palača|wat phra kaew|wat pho|wat arun|ležeči buda|reclining buddha|emerald buddha|khao san|asiatique|chatuchak|jim thompson|icon\s*siam|yaowarat|chao phraya|bangkok art|bacc\b|culture centre|culture center|bts national|national stadium|mbk\b|lumphini|terminal 21|siam paragon|wat saket|golden mount|democracy monument|victory monument/i;

export function isBangkokCityName(city?: string): boolean {
  return /bangkok|\bbkk\b/i.test((city ?? "").trim());
}

export function isBangkokOnlyAttraction(name: string, description?: string): boolean {
  return BANGKOK_ONLY_ATTRACTION.test(`${name} ${description ?? ""}`);
}

function filterActs(list: Activity[] | undefined): Activity[] | undefined {
  if (!list) return list;
  return list.filter((a) => !isBangkokOnlyAttraction(a.name, a.description));
}

/**
 * Remove Bangkok temple/market hallucinations from non-Bangkok days
 * (Gemini often drops Grand Palace / Wat Pho onto Khao Sok / Phuket).
 */
export function stripMisplacedCityPois(day: DayPlan): DayPlan {
  if (isBangkokCityName(day.city) || isBangkokCityName(day.focusName)) {
    return day;
  }

  const slots = day.activities;
  const nextSlots = slots
    ? {
        morning: filterActs(slots.morning) ?? [],
        afternoon: filterActs(slots.afternoon) ?? [],
        evening: filterActs(slots.evening) ?? [],
      }
    : undefined;

  const mapPins = day.mapPins?.filter(
    (p) => !isBangkokOnlyAttraction(p.name, p.description),
  );

  const morning = day.morning && isBangkokOnlyAttraction(day.morning) ? "" : day.morning;
  const afternoon =
    day.afternoon && isBangkokOnlyAttraction(day.afternoon) ? "" : day.afternoon;
  const evening = day.evening && isBangkokOnlyAttraction(day.evening) ? "" : day.evening;

  return {
    ...day,
    ...(nextSlots ? { activities: nextSlots } : {}),
    ...(mapPins ? { mapPins } : {}),
    ...(morning !== day.morning ? { morning } : {}),
    ...(afternoon !== day.afternoon ? { afternoon } : {}),
    ...(evening !== day.evening ? { evening } : {}),
  };
}
