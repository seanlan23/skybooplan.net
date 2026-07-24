import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { planLangCopy } from "@/lib/planLangCopy";

const CAMP_NAME_RE =
  /\b(kamp|avtokamp|campground|campsite|camping|rv\s*park|wohnmobilstellplatz|aire\b|sosta|area di sosta)\b/i;

/** One pin for Maps / KML — placeQuery is geocodable; title/note are for humans. */
export type MotorhomeMapStop = {
  kind: "start" | "overnight" | "via" | "return";
  /** Clean place string for Google/Apple Maps directions. */
  placeQuery: string;
  /** Human label (day + overnight + camp). */
  title: string;
  day?: number;
  note?: string;
  lat?: number;
  lng?: number;
};

/** Activity titles that must never become Google Maps waypoints. */
const ACTIVITY_STOP_RE =
  /\b(vožnja|jutranja|popoldne|večer|ladj|čoln|boat|ferry|trajekt|stroll|sprehod|ogled|tour|dinner|kosilo|zajtrk|breakfast|lunch|snorkel|plavanje|swim|hike|pohod|cooking|razred|class|sunset|sončni)\b/i;

/** Country-only labels — not a Maps pin (would swallow the return-home stop). */
const COUNTRY_ONLY_RE =
  /^(italy|italija|italia|croatia|hrvaška|hrvatska|spain|španija|spanija|france|francija|germany|nemčija|austria|avstrija|slovenia|slovenija|greece|grčija|portugal|portugalska|netherlands|nizozemska|switzerland|švica)$/i;

export function isCampActivityName(name: string, description = ""): boolean {
  // Name must look like a camp — description alone is not enough
  // ("return to camp after boat ride" must not promote the boat ride).
  if (!CAMP_NAME_RE.test(name)) return false;
  if (ACTIVITY_STOP_RE.test(name)) return false;
  void description;
  return true;
}

export function isCountryOnlyPlaceLabel(label: string): boolean {
  return COUNTRY_ONLY_RE.test(label.replace(/\s+/g, " ").trim());
}

/** True when a string is safe to pass as a Google/Apple Maps place query. */
export function isPlausibleMapPlaceLabel(label: string): boolean {
  const s = label.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 90) return false;
  if (isCountryOnlyPlaceLabel(s)) return false;
  if (ACTIVITY_STOP_RE.test(s)) return false;
  // Reject long sentence-like activity blurbs.
  if ((s.match(/,/g) ?? []).length >= 2) return false;
  if (/\s(z|in|to|for|with|pri|na)\s/i.test(s) && s.split(/\s+/).length >= 6) {
    // Allow "Camping X, City" (short) but not "Morning boat ride to Venice, Venice"
    if (!CAMP_NAME_RE.test(s)) return false;
  }
  return true;
}

function samePlace(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Collect overnight camp / RV park labels from a day (prefer overnight stay). */
export function collectDayCampLabels(day: DayPlan): string[] {
  const slots = [
    ...(day.activities?.evening ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.morning ?? []),
  ];
  const out: string[] = [];
  for (const a of slots) {
    if (!isCampActivityName(a.name, a.description ?? "")) continue;
    const label = a.name.replace(/\s+/g, " ").trim();
    if (!label || !isPlausibleMapPlaceLabel(label)) continue;
    if (out.some((x) => x.toLowerCase() === label.toLowerCase())) continue;
    out.push(label);
  }
  return out;
}

function dayCoords(day: DayPlan): { lat?: number; lng?: number } {
  if (typeof day.lat === "number" && typeof day.lng === "number") {
    return { lat: day.lat, lng: day.lng };
  }
  return {};
}

function overnightTitle(lang: string, dayNum: number, place: string): string {
  return planLangCopy(lang, {
    sl: `Dan ${dayNum} · Nočitev · ${place}`,
    en: `Day ${dayNum} · Overnight · ${place}`,
    de: `Tag ${dayNum} · Übernachtung · ${place}`,
    es: `Día ${dayNum} · Noche · ${place}`,
    fr: `Jour ${dayNum} · Nuit · ${place}`,
    it: `Giorno ${dayNum} · Pernottamento · ${place}`,
  });
}

function startTitle(lang: string, place: string): string {
  return planLangCopy(lang, {
    sl: `Start · ${place}`,
    en: `Start · ${place}`,
    de: `Start · ${place}`,
    es: `Inicio · ${place}`,
    fr: `Départ · ${place}`,
    it: `Partenza · ${place}`,
  });
}

function returnTitle(lang: string, place: string): string {
  return planLangCopy(lang, {
    sl: `Povratek · ${place}`,
    en: `Return · ${place}`,
    de: `Rückkehr · ${place}`,
    es: `Regreso · ${place}`,
    fr: `Retour · ${place}`,
    it: `Ritorno · ${place}`,
  });
}

function viaTitle(lang: string, dayNum: number, place: string): string {
  return planLangCopy(lang, {
    sl: `Dan ${dayNum} · ${place}`,
    en: `Day ${dayNum} · ${place}`,
    de: `Tag ${dayNum} · ${place}`,
    es: `Día ${dayNum} · ${place}`,
    fr: `Jour ${dayNum} · ${place}`,
    it: `Giorno ${dayNum} · ${place}`,
  });
}

/**
 * Rich overnight / waypoint list for UI + KML.
 * Google Maps directions still use `placeQuery` (geocodable names only).
 */
export function collectMotorhomeMapStops(plan: AiTripPlan, lang = "sl"): MotorhomeMapStop[] {
  const out: MotorhomeMapStop[] = [];
  const push = (stop: MotorhomeMapStop) => {
    const s = stop.placeQuery.replace(/\s+/g, " ").trim();
    if (!s || !isPlausibleMapPlaceLabel(s)) return;
    if (out[out.length - 1] && samePlace(out[out.length - 1]!.placeQuery, s)) return;
    out.push({ ...stop, placeQuery: s });
  };

  const origin = (plan.originPlace?.trim() || plan.originIata?.trim() || "").replace(/\s+/g, " ");
  if (origin && isPlausibleMapPlaceLabel(origin)) {
    push({
      kind: "start",
      placeQuery: origin,
      title: startTitle(lang, origin),
    });
  }

  for (const day of plan.days ?? []) {
    if (day.inFlightDay) continue;
    const city = day.city?.trim() || day.focusName?.trim() || "";
    if (origin && city && samePlace(city, origin)) continue;

    const camps = collectDayCampLabels(day);
    const coords = dayCoords(day);
    const note = [day.title, day.travelHack].filter(Boolean).join(" — ").slice(0, 280) || undefined;

    if (camps[0]) {
      const campStop =
        city && !camps[0].toLowerCase().includes(city.toLowerCase())
          ? `${camps[0]}, ${city}`
          : camps[0];
      if (isPlausibleMapPlaceLabel(campStop)) {
        push({
          kind: "overnight",
          placeQuery: campStop,
          title: overnightTitle(lang, day.day, campStop),
          day: day.day,
          note,
          ...coords,
        });
        continue;
      }
    }

    if (city && isPlausibleMapPlaceLabel(city)) {
      push({
        kind: "via",
        placeQuery: city,
        title: viaTitle(lang, day.day, city),
        day: day.day,
        note,
        ...coords,
      });
    }
  }

  const dest = plan.destinationPlace?.trim();
  if (dest && !isCountryOnlyPlaceLabel(dest) && !(origin && samePlace(dest, origin))) {
    push({
      kind: "via",
      placeQuery: dest,
      title: planLangCopy(lang, {
        sl: `Cilj · ${dest}`,
        en: `Destination · ${dest}`,
        de: `Ziel · ${dest}`,
        es: `Destino · ${dest}`,
        fr: `Destination · ${dest}`,
        it: `Destinazione · ${dest}`,
      }),
      note: undefined,
    });
  }

  if (origin && isPlausibleMapPlaceLabel(origin)) {
    push({
      kind: "return",
      placeQuery: origin,
      title: returnTitle(lang, origin),
    });
  }

  return out;
}

/**
 * Google Maps / overview stops for a motorhome plan:
 * origin → overnight bases → origin (return home).
 * Never emits activity sentences or bare country names (e.g. "Italija").
 */
export function collectMotorhomeRoadTripStops(plan: AiTripPlan): string[] {
  return collectMotorhomeMapStops(plan).map((s) => s.placeQuery);
}
