import type { Activity } from "@/lib/aiPlan.functions";
import type { TripLocale } from "@/lib/tripLocale";

type DaySlots = { morning: Activity[]; afternoon: Activity[]; evening: Activity[] };

/**
 * Classic Bangkok full-day loop (Maeklong → Damnoen → Kwai → Death Railway → Sai Yok).
 * Start is always generic “your hotel” — users don’t pick hotels in Skybooplan.
 */
export const BANGKOK_KWAI_DAY_TRIP_STOPS = [
  "Your hotel, Bangkok",
  "Maeklong Railway Market, Samut Songkhram, Thailand",
  "Damnoen Saduak Floating Market, Ratchaburi, Thailand",
  "Kanchanaburi War Cemetery, Kanchanaburi, Thailand",
  "River Kwai Bridge, Kanchanaburi, Thailand",
  "Tham Krasae Bridge, Sai Yok, Kanchanaburi, Thailand",
  "Suan Sai Yok, Sai Yok District, Kanchanaburi, Thailand",
  "Your hotel, Bangkok",
] as const;

export function buildBangkokKwaiDayTripMapsUrl(): string {
  return `https://www.google.com/maps/dir/${BANGKOK_KWAI_DAY_TRIP_STOPS.map(encodeURIComponent).join("/")}`;
}

const KWAI_TRIP_RE =
  /maeklong|mae klong|rom hup|damnoen|floating market|kanchanaburi war|river kwai|tham krasae|death railway|železnic[ae] smrti|suan sai yok/i;

export function tripAlreadyHasKwaiDayTrip(text: string): boolean {
  return KWAI_TRIP_RE.test(text);
}

/** Prefer first full day after arrival when stay is short; day 3 when Bangkok ≥ 3 nights. */
export function shouldInjectBangkokKwaiDayTrip(opts: {
  dayInRegion: number;
  bangkokStayDays: number;
  priorScheduledText?: string;
  isArrivalDay?: boolean;
  isDepartureDay?: boolean;
}): boolean {
  if (opts.isArrivalDay || opts.isDepartureDay) return false;
  if (tripAlreadyHasKwaiDayTrip(opts.priorScheduledText ?? "")) return false;
  const stay = Math.max(1, opts.bangkokStayDays);
  const targetDay = stay >= 3 ? 3 : 2;
  return opts.dayInRegion === targetDay;
}

export function buildBangkokKwaiDayTripSlots(locale: TripLocale): DaySlots {
  const mapsUrl = buildBangkokKwaiDayTripMapsUrl();
  const slo = locale.slo;

  const morning: Activity[] = [
    {
      name: slo
        ? "Odhod iz hotela → Mae Klong Railway Market"
        : "Leave hotel → Mae Klong Railway Market",
      type: "ACTIVITY",
      priceLabel: slo ? "privatni van / skupinski izlet" : "private van / shared tour",
      description: slo
        ? `Štartaj izpred svojega hotela točno ob 6:30, da na tržnici ujameš vlak ob 8:30. Naslednji gre okoli 9:00, potem šele okoli 11:00 — ne zamudi. Mae Klong (Rom Hub): prodajalci umaknejo stojnice, ko pride vlak. Google Maps pot: ${mapsUrl}`
        : `Leave your hotel at exactly 6:30 so you catch the 8:30 train at the market. Next is ~9:00, then ~11:00 — don’t be late. Mae Klong (Rom Hub): vendors pull stalls aside for the train. Maps route: ${mapsUrl}`,
      lat: 13.4074,
      lng: 99.9985,
    },
  ];

  const afternoon: Activity[] = [
    {
      name: slo ? "Damnoen Saduak — plavajoča tržnica" : "Damnoen Saduak Floating Market",
      type: "ACTIVITY",
      priceLabel: slo ? "100–200 THB / osebo (čoln)" : "100–200 THB / person (boat)",
      description: slo
        ? "Čoln okoli 100–200 THB na osebo (morda manj). Sama tržnica ni spektakularna, je pa fajn filmska izkušnja na vodi."
        : "Boat ~100–200 THB per person (sometimes less). Touristy but a classic on-the-water experience.",
      lat: 13.5202,
      lng: 99.9586,
    },
    {
      name: slo
        ? "Kanchanaburi War Cemetery + most na reki Kwai"
        : "Kanchanaburi War Cemetery + River Kwai Bridge",
      type: "SIGHT",
      priceLabel: slo ? "brezplačno / nizko" : "free / low",
      description: slo
        ? "Na poti do mostu se ustavi na vojnem pokopališču Don Rak — vredno 20–30 min. Nato most na reki Kwai."
        : "Stop at Don Rak war cemetery on the way (~20–30 min), then the Bridge on the River Kwai.",
      lat: 14.0316,
      lng: 99.5256,
    },
  ];

  const evening: Activity[] = [
    {
      name: slo
        ? "Železnica smrti — Tham Krasae + Suan Sai Yok"
        : "Death Railway — Tham Krasae + Suan Sai Yok",
      type: "ACTIVITY",
      priceLabel: slo ? "vlak poceni + pijača / zipline po želji" : "cheap train + drinks / optional zipline",
      description: slo
        ? "Šoferju reci, naj strogo sledi tvoji navigaciji — sicer te odloži prezgodaj in pešačiš po tirih brez ograje. Z vlakom se pelji ZAHOD → VZHOD (karta stane malo). Šofer naj te počaka v Suan Sai Yok (pustolovski park): pijača, zipline, divja narava. Vrnitev v Bangkok zvečer — do svojega hotela."
        : "Tell the driver to follow your navigation strictly — otherwise you’ll be dropped early and walk the unguarded tracks. Ride the train west → east (ticket is cheap). Have the driver wait at Suan Sai Yok: drinks, optional zipline, wild nature. Return to Bangkok in the evening — to your hotel.",
      lat: 14.1045,
      lng: 99.1671,
    },
  ];

  return { morning, afternoon, evening };
}

/** Overwrite a Bangkok day with the curated Kwai loop when due. */
export function ensureBangkokKwaiDayTrip(
  slots: DaySlots,
  locale: TripLocale,
  opts: {
    dayInRegion: number;
    bangkokStayDays: number;
    priorScheduledText?: string;
    isArrivalDay?: boolean;
    isDepartureDay?: boolean;
  },
): DaySlots {
  if (!shouldInjectBangkokKwaiDayTrip(opts)) return slots;
  return buildBangkokKwaiDayTripSlots(locale);
}

/** Prompt block for Gemini — BKK / Thailand hub stays. */
export function bangkokKwaiDayTripPromptBlock(slo: boolean): string {
  const mapsUrl = buildBangkokKwaiDayTripMapsUrl();
  if (slo) {
    return `
OBVEZEN CELODNEVNI IZLET IZ BANGKOKA (vsaj 1 dan v itinerarju, ko je baza Bangkok):
- Pot: tvoj hotel (NIKOLI konkretno ime hotela) → Mae Klong Railway Market → Damnoen Saduak Floating Market → Kanchanaburi War Cemetery → River Kwai Bridge → Tham Krasae (Death Railway) → Suan Sai Yok → nazaj hotel v Bangkok.
- Odhod izpred hotela točno 6:30, da ujameš vlak na Mae Klong ob 8:30 (naslednji ~9:00, potem ~11:00).
- Čoln na plavajoči tržnici ~100–200 THB/osebo.
- Šofer naj sledi navigaciji do Tham Krasae (ne predčasni izstop / hoja po tirih).
- Vlak Death Railway: smer zahod → vzhod; počakaj v Suan Sai Yok.
- Google Maps: ${mapsUrl}
- PREPOVEDANO: ime konkretnega hotela (npr. Tinidee) — vedno „tvoj hotel“ / „your hotel“.`;
  }
  return `
MANDATORY BANGKOK FULL-DAY TRIP (at least one Bangkok base day):
- Route: your hotel (NEVER a specific hotel name) → Mae Klong Railway Market → Damnoen Saduak Floating Market → Kanchanaburi War Cemetery → River Kwai Bridge → Tham Krasae (Death Railway) → Suan Sai Yok → back to your Bangkok hotel.
- Leave hotel at 6:30 sharp for the 8:30 Mae Klong train (next ~9:00, then ~11:00).
- Floating-market boat ~100–200 THB/person.
- Driver must follow navigation to Tham Krasae (no early drop / track walk).
- Death Railway train west → east; wait at Suan Sai Yok.
- Google Maps: ${mapsUrl}
- FORBIDDEN: concrete hotel brand names — always “your hotel”.`;
}
