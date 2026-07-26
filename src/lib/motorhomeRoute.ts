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

/**
 * Narrative prefixes AI puts on camp titles ("Prihod v Kamp X").
 * Google Maps cannot geocode these — strip before placeQuery.
 */
const MAP_PLACE_PREFIX_RE =
  /^(prihod\s+(v|na|k|do)\s+|odhod\s+(iz|od|s|z)\s+|arrival\s+(at|in|to)\s+|departure\s+from\s+|check[- ]?in\s+(at|to|into)\s+|ankunft\s+(in|nach|am)\s+|abfahrt\s+(von|ab)\s+|arrivée\s+(à|a|au|aux)\s+|arrivo\s+(a|in)\s+|llegada\s+a\s+|nočitev\s+(v|na)\s+|overnight\s+(at|in)\s+|drive\s+to\s+|vožnja\s+(do|v|na)\s+)/i;

/** Still narrative after prefix strip — never send to Maps. */
const NARRATIVE_HEAD_RE =
  /^(prihod|odhod|arrival|departure|check[- ]?in|ankunft|abfahrt|arrivée|arrivo|llegada)\b/i;

/** Country-only labels — not a Maps pin (would swallow the return-home stop). */
const COUNTRY_ONLY_RE =
  /^(italy|italija|italia|croatia|hrvaška|hrvatska|spain|španija|spanija|france|francija|germany|nemčija|austria|avstrija|slovenia|slovenija|greece|grčija|portugal|portugalska|netherlands|nizozemska|switzerland|švica|albania|albanija|montenegro|črna\s*gora|crna\s*gora)$/i;

/** Strip "Prihod v …" / "Arrival at …" so Maps gets a real place name. */
export function sanitizeMapPlaceLabel(label: string): string {
  let s = label.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(MAP_PLACE_PREFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

export function isCampActivityName(name: string, description = ""): boolean {
  // Name must look like a camp — description alone is not enough
  // ("return to camp after boat ride" must not promote the boat ride).
  const cleaned = sanitizeMapPlaceLabel(name);
  if (!CAMP_NAME_RE.test(cleaned)) return false;
  if (ACTIVITY_STOP_RE.test(cleaned)) return false;
  void description;
  return true;
}

export function isCountryOnlyPlaceLabel(label: string): boolean {
  return COUNTRY_ONLY_RE.test(label.replace(/\s+/g, " ").trim());
}

/** True when a string is safe to pass as a Google/Apple Maps place query. */
export function isPlausibleMapPlaceLabel(label: string): boolean {
  const s = sanitizeMapPlaceLabel(label);
  if (s.length < 2 || s.length > 90) return false;
  if (isCountryOnlyPlaceLabel(s)) return false;
  if (NARRATIVE_HEAD_RE.test(s)) return false;
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
    const label = sanitizeMapPlaceLabel(a.name);
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
    const s = sanitizeMapPlaceLabel(stop.placeQuery);
    if (!s || !isPlausibleMapPlaceLabel(s)) return;
    if (out[out.length - 1] && samePlace(out[out.length - 1]!.placeQuery, s)) return;
    out.push({ ...stop, placeQuery: s });
  };

  const origin = sanitizeMapPlaceLabel(
    plan.originPlace?.trim() || plan.originIata?.trim() || "",
  );
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
