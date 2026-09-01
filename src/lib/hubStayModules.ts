import type { Activity, AiTripPlan, DayPlan, DayTransportLeg } from "@/lib/aiPlan.functions";
import {
  collectOvernightHotelStays,
  collectOvernightHotelStaysFromHints,
  hotelHintsHaveMultipleBases,
  overnightPlacesMatch,
  type OvernightHotelStay,
} from "@/lib/overnightHotelStays";
import { planLangCopy } from "@/lib/planLangCopy";
import { isSingleBasePlan } from "@/lib/tripStyle";

export type HubTransferIn = {
  summary: string;
  duration?: string;
  transport?: string;
  priceEstimate?: string;
};

export type HubHighlight = {
  title: string;
  description?: string;
  estimatedCostEur?: number;
  duration?: string;
  kind?: "activity" | "sight" | "daytrip";
  lat?: number;
  lng?: number;
};

export type HubStayModule = {
  cityName: string;
  nights: number;
  checkIn?: string;
  checkOut?: string;
  firstDay: number;
  lastDay: number;
  transferIn: HubTransferIn;
  highlights: HubHighlight[];
  localTips: string;
};

const MOVEMENT_RE =
  /\blet\b|flight|trajekt|ferry|vlak|train|check-?out|odjava|odhod iz hotela|prevoz na letališč|airport transfer/i;
const DAY_TRIP_RE =
  /day\s*trip|celodnevni izlet|izlet na|izlet z |same[- ]day|excursion|escursione|ausflug|boat tour|island hop/i;
const CLOCK_RE = /\b([01]?\d|2[0-3])[:.][0-5]\d\b/g;
const SLOT_RE = /\b(dopoldan|popoldan|večer|vecer|morning|afternoon|evening|vormittag|nachmittag)\b/gi;

export function stripScheduleNoise(text: string): string {
  return text
    .replace(CLOCK_RE, " ")
    .replace(SLOT_RE, " ")
    .replace(/\s*[·|,;:–-]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function usesHubStayGuide(plan: {
  tripStyle?: unknown;
  travelStyle?: unknown;
  resortStay?: unknown;
  days?: unknown;
  groundTransportMode?: string | null;
  accommodationMode?: string | null;
} | null | undefined): boolean {
  if (!plan || isSingleBasePlan(plan)) return false;
  const ground = String(plan.groundTransportMode ?? "").trim().toLowerCase();
  if (ground === "car" || ground === "motorhome" || ground === "train") return false;
  if (String(plan.accommodationMode ?? "").trim().toLowerCase() === "motorhome") return false;
  if (String(plan.tripStyle ?? "").trim().toLowerCase() === "roadtrip") return false;
  return Array.isArray(plan.days) && plan.days.length > 0;
}

function dayNum(day: DayPlan): number {
  return typeof day.day === "number" && day.day >= 1 ? day.day : 0;
}

function chronoActs(day: DayPlan): Activity[] {
  return [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
}

function isMovement(act: Activity): boolean {
  const t = (act.type ?? "").toUpperCase();
  if (t === "TRANSPORT" || t === "TRAIN" || t === "FLIGHT" || t === "FERRY") return true;
  return MOVEMENT_RE.test(`${act.name} ${act.description ?? ""}`);
}

function titleKey(title: string): string {
  return stripScheduleNoise(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function highlightKind(act: Activity): HubHighlight["kind"] {
  const blob = `${act.name} ${act.description ?? ""}`;
  if (DAY_TRIP_RE.test(blob)) return "daytrip";
  const t = (act.type ?? "").toUpperCase();
  if (t === "SIGHT" || t === "NATURE" || t === "BEACH") return "sight";
  return "activity";
}

function highlightFromActivity(act: Activity): HubHighlight | null {
  const title = stripScheduleNoise(act.name ?? "");
  if (!title || isMovement(act)) return null;
  const description = stripScheduleNoise(act.description ?? "");
  const cost =
    typeof act.estimatedCostEur === "number" && act.estimatedCostEur > 0
      ? act.estimatedCostEur
      : undefined;
  const duration = act.transportDuration?.trim() || undefined;
  return {
    title,
    description: description && description !== title ? description : undefined,
    estimatedCostEur: cost,
    duration,
    kind: highlightKind(act),
    lat: Number.isFinite(act.lat) && act.lat !== 0 ? act.lat : undefined,
    lng: Number.isFinite(act.lng) && act.lng !== 0 ? act.lng : undefined,
  };
}

function collectStays(plan: AiTripPlan): OvernightHotelStay[] {
  const fromDays = collectOvernightHotelStays({
    days: plan.days,
    originPlace: plan.originPlace,
    groundTransportMode: plan.groundTransportMode,
    accommodationMode: plan.accommodationMode,
  });
  if (fromDays.length >= 2) return fromDays;
  if (hotelHintsHaveMultipleBases(plan.hotels)) {
    const fromHints = collectOvernightHotelStaysFromHints(
      plan.hotels,
      plan.days?.[0]?.date,
    );
    if (fromHints.length >= 2) return fromHints;
  }
  return fromDays;
}

function daysForStay(
  days: DayPlan[],
  stay: OvernightHotelStay,
  nextFirst: number,
): DayPlan[] {
  return days
    .filter((d) => {
      const n = dayNum(d);
      return n >= stay.firstDay && n < nextFirst;
    })
    .sort((a, b) => dayNum(a) - dayNum(b));
}

function formatLeg(leg: DayTransportLeg, lang: string): HubTransferIn {
  const transport = (leg.type || "").trim();
  const duration = (leg.duration || "").trim() || undefined;
  const price =
    typeof leg.estimatedPrice === "number" && leg.estimatedPrice > 0
      ? `€${Math.round(leg.estimatedPrice)}`
      : undefined;
  const route = [leg.from, leg.to].filter(Boolean).join(" → ");
  const parts = [transport && transport.toUpperCase(), route, duration, price].filter(Boolean);
  return {
    summary:
      parts.join(" · ") ||
      planLangCopy(lang, {
        sl: "Lokalni prevoz do baze",
        en: "Local transfer to the base",
        de: "Lokaler Transfer zur Basis",
      }),
    duration,
    transport: transport || undefined,
    priceEstimate: price,
  };
}

function transferFromDays(
  days: DayPlan[],
  stay: OvernightHotelStay,
  index: number,
  lang: string,
): HubTransferIn {
  for (const day of days) {
    for (const leg of day.transportation ?? []) {
      if (leg.to && overnightPlacesMatch(leg.to, stay.city)) return formatLeg(leg, lang);
      if (index === 0) return formatLeg(leg, lang);
    }
  }
  for (const day of days) {
    for (const act of chronoActs(day)) {
      if (!isMovement(act)) continue;
      const summary = stripScheduleNoise(`${act.name}${act.description ? ` — ${act.description}` : ""}`);
      if (!summary) continue;
      return {
        summary: summary.slice(0, 220),
        duration: act.transportDuration?.trim() || undefined,
        transport: act.transportType,
        priceEstimate:
          typeof act.estimatedCostEur === "number" && act.estimatedCostEur > 0
            ? `€${Math.round(act.estimatedCostEur)}`
            : undefined,
      };
    }
  }
  if (index === 0) {
    return {
      summary: planLangCopy(lang, {
        sl: "Prevoz z letališča do prve baze (taxi / hotel transfer).",
        en: "Airport transfer to the first base (taxi / hotel transfer).",
        de: "Flughafentransfer zur ersten Basis (Taxi / Hoteltransfer).",
      }),
    };
  }
  return {
    summary: planLangCopy(lang, {
      sl: `Premik na bazo ${stay.city}.`,
      en: `Transfer to the ${stay.city} base.`,
      de: `Transfer zur Basis ${stay.city}.`,
    }),
  };
}

function pickHighlights(days: DayPlan[]): HubHighlight[] {
  const out: HubHighlight[] = [];
  const seen = new Set<string>();
  const push = (h: HubHighlight | null) => {
    if (!h) return;
    const key = titleKey(h.title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(h);
  };
  for (const day of days) {
    for (const act of chronoActs(day)) push(highlightFromActivity(act));
    if (out.length >= 6) break;
  }
  const daytrips = out.filter((h) => h.kind === "daytrip");
  const rest = out.filter((h) => h.kind !== "daytrip");
  return [...rest, ...daytrips].slice(0, 6);
}

function mergeLocalTips(days: DayPlan[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const day of days) {
    for (const raw of [day.localTips, day.travelHack, day.localWarnings, day.transportationTips]) {
      const tip = stripScheduleNoise(raw ?? "");
      if (tip.length < 12) continue;
      const key = titleKey(tip).slice(0, 80);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      parts.push(tip);
    }
  }
  return parts.join(" ").replace(/\s{2,}/g, " ").trim().slice(0, 720);
}

/** 3–4 city bases from overnight stays — no new Gemini prompt. */
export function buildHubStayModules(plan: AiTripPlan, lang?: string): HubStayModule[] {
  if (!usesHubStayGuide(plan)) return [];
  const stays = collectStays(plan);
  if (!stays.length) return [];
  const langCode = lang ?? plan.contentLanguage ?? "sl";
  const days = [...(plan.days ?? [])];
  return stays.map((stay, index) => {
    const nextFirst = stays[index + 1]?.firstDay ?? Number.POSITIVE_INFINITY;
    const slice = daysForStay(days, stay, nextFirst);
    const lastDay = slice.length
      ? dayNum(slice[slice.length - 1]!)
      : stay.firstDay + Math.max(0, stay.nights - 1);
    return {
      cityName: stay.city,
      nights: stay.nights,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      firstDay: stay.firstDay,
      lastDay,
      transferIn: transferFromDays(slice, stay, index, langCode),
      highlights: pickHighlights(slice),
      localTips: mergeLocalTips(slice),
    };
  });
}

export function hubGuideCopy(lang?: string) {
  return {
    kicker: planLangCopy(lang, {
      sl: "Vodič po bazah",
      en: "City-base guide",
      de: "Städte-Guide",
    }),
    nights: (n: number) =>
      planLangCopy(lang, {
        sl: n === 1 ? "1 noč" : `${n} noči`,
        en: n === 1 ? "1 night" : `${n} nights`,
        de: n === 1 ? "1 Nacht" : `${n} Nächte`,
      }),
    transfer: planLangCopy(lang, {
      sl: "Protokol premika",
      en: "Transfer in",
      de: "Anreise",
    }),
    highlights: planLangCopy(lang, {
      sl: "Vrhunska doživetja & izleti",
      en: "Highlights & day trips",
      de: "Highlights & Ausflüge",
    }),
    tips: planLangCopy(lang, {
      sl: "Lokalni nasveti",
      en: "Local tips",
      de: "Lokale Tipps",
    }),
    hotels: planLangCopy(lang, {
      sl: "Namestitev v tej bazi",
      en: "Stay in this base",
      de: "Unterkunft in dieser Basis",
    }),
    bases: planLangCopy(lang, {
      sl: "Pregled baz",
      en: "Bases at a glance",
      de: "Basen im Überblick",
    }),
    returnProtocol: planLangCopy(lang, {
      sl: "Protokol za povratni odhod",
      en: "Return departure protocol",
      de: "Rückflug-Protokoll",
    }),
    daytrip: planLangCopy(lang, {
      sl: "Enodnevni izlet",
      en: "Day trip",
      de: "Tagesausflug",
    }),
  };
}
