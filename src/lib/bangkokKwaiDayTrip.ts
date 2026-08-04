import type { Activity } from "@/lib/aiPlan.functions";
import type { TripLocale } from "@/lib/tripLocale";

type DaySlots = { morning: Activity[]; afternoon: Activity[]; evening: Activity[] };

/**
 * Classic Bangkok full-day loop (Maeklong → Damnoen → Kwai → Death Railway → Sai Yok).
 * Start is always generic “your hotel” — users don’t pick hotels in Skybooplan.
 * This day is exclusive (~06:30–21:00): no city shopping / museum fillers.
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
  /maeklong|mae klong|rom hup|damnoen|floating market|kanchanaburi war|river kwai|most.*(kwai|kway)|tham krasae|death railway|železnic[ae] smrti|suan sai yok/i;

const CITY_CONFLICT_RE =
  /siam paragon|centralworld|art and culture|bacc|grand palace|wat pho|wat arun|chatuchak|mbk|iconsiam|asenij|shopping|nakupoval/i;

export function tripAlreadyHasKwaiDayTrip(text: string): boolean {
  return KWAI_TRIP_RE.test(text);
}

export function slotsLookLikeKwaiDayTrip(slots: DaySlots, extraText = ""): boolean {
  const blob = [
    extraText,
    ...slots.morning,
    ...slots.afternoon,
    ...slots.evening,
  ]
    .map((a) => (typeof a === "string" ? a : `${a.name} ${a.description ?? ""}`))
    .join(" ");
  return KWAI_TRIP_RE.test(blob);
}

export function kwaiDayHasCityConflicts(slots: DaySlots): boolean {
  const blob = [...slots.morning, ...slots.afternoon, ...slots.evening]
    .map((a) => `${a.name} ${a.description ?? ""}`)
    .join(" ");
  return CITY_CONFLICT_RE.test(blob);
}

/** Prefer first full day after arrival when stay is short; day 3 when Bangkok ≥ 3 nights. */
export function shouldInjectBangkokKwaiDayTrip(opts: {
  dayInRegion: number;
  bangkokStayDays: number;
  priorScheduledText?: string;
  isArrivalDay?: boolean;
  isDepartureDay?: boolean;
  /** Day title / highlight names — force overwrite when Gemini labeled Kwai but left city fillers. */
  dayLabelText?: string;
  currentSlots?: DaySlots;
}): boolean {
  if (opts.isArrivalDay || opts.isDepartureDay) return false;

  const labeledKwai = tripAlreadyHasKwaiDayTrip(opts.dayLabelText ?? "");
  const slotsKwai = opts.currentSlots
    ? slotsLookLikeKwaiDayTrip(opts.currentSlots)
    : false;
  if ((labeledKwai || slotsKwai) && opts.currentSlots && kwaiDayHasCityConflicts(opts.currentSlots)) {
    return true;
  }
  if (labeledKwai || slotsKwai) {
    // Already a clean Kwai day — still refresh curated copy (times / exclusive evening).
    return true;
  }

  if (tripAlreadyHasKwaiDayTrip(opts.priorScheduledText ?? "")) return false;
  const stay = Math.max(1, opts.bangkokStayDays);
  const targetDay = stay >= 3 ? 3 : 2;
  return opts.dayInRegion === targetDay;
}

export function bangkokKwaiDayTripTitle(slo: boolean): string {
  return slo
    ? "Celodnevni izlet: Mae Klong → Damnoen → River Kwai → Death Railway (6:30–21:00)"
    : "Full-day trip: Mae Klong → Damnoen → River Kwai → Death Railway (6:30–21:00)";
}

export function buildBangkokKwaiDayTripSlots(locale: TripLocale): DaySlots {
  const mapsUrl = buildBangkokKwaiDayTripMapsUrl();
  const slo = locale.slo;

  const morning: Activity[] = [
    {
      name: slo
        ? "Celodnevni izlet 6:30–21:00 — odhod iz hotela → Mae Klong"
        : "Full-day trip 6:30–21:00 — leave hotel → Mae Klong",
      type: "ACTIVITY",
      priceLabel: slo ? "privatni van / skupinski izlet" : "private van / shared tour",
      description: slo
        ? `TA DAN JE SAMO TA IZLET (~14–15 ur) — brez nakupovanja, muzejev ali templjev v Bangkoku. Odhod izpred svojega hotela točno ob 6:30. Mae Klong Railway Market (Rom Hub): vlaki skozi tržnico tipično okoli 08:30, 11:10, 14:30, 17:40 (prihodi); odhodi proti Ban Laem okoli 06:20, 09:00, 11:30, 15:30 — ure preveri na dan. Ciljaj na 08:30; če zamudiš, še 11:10. Google Maps: ${mapsUrl}`
        : `THIS DAY IS ONLY THIS TRIP (~14–15 hours) — no Bangkok shopping, museums, or temples. Leave your hotel at exactly 6:30. Mae Klong Railway Market (Rom Hub): trains through the market typically ~08:30, 11:10, 14:30, 17:40 (arrivals); departures toward Ban Laem ~06:20, 09:00, 11:30, 15:30 — verify on the day. Aim for 08:30; if missed, 11:10 still works. Maps: ${mapsUrl}`,
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
        ? "Dopoldan/zgodnje popoldne na vodi. Čoln okoli 100–200 THB na osebo. Nato naprej proti Kanchanaburiju — ne vračaj se v Bangkok."
        : "Late morning / early afternoon on the water. Boat ~100–200 THB per person. Then continue to Kanchanaburi — do not return to Bangkok.",
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
        ? "Don Rak vojno pokopališče (~20–30 min), nato most na reki Kwai. Tu ni ločenega „turističnega vlaka na mostu“ po fiksnem urniku — za vožnjo po Death Railway glej Tham Krasae (spodaj). Kratka pauza / kava, potem naprej proti Sai Yok."
        : "Don Rak war cemetery (~20–30 min), then the Bridge on the River Kwai. No separate fixed „bridge tourist train“ schedule here — for Death Railway ride see Tham Krasae below. Short break, then continue to Sai Yok.",
      lat: 14.0316,
      lng: 99.5256,
    },
  ];

  const evening: Activity[] = [
    {
      name: slo
        ? "Železnica smrti — Tham Krasae (vlak) + Suan Sai Yok"
        : "Death Railway — Tham Krasae (train) + Suan Sai Yok",
      type: "ACTIVITY",
      priceLabel: slo ? "vlak poceni + pijača / zipline po želji" : "cheap train + drinks / optional zipline",
      description: slo
        ? "Death Railway (Kanchanaburi ↔ Nam Tok): vlak 257 skozi Tham Krasae (Saphan Tham Krasae) tipično okoli 11:38 proti Nam Tok; vlak 259 okoli 17:46. Vračanje Nam Tok → Kanchanaburi: npr. ~13:00 / ~15:30 (preveri urnik SRT na dan). Smer vožnje za razgled: zahod → vzhod. Šofer naj te počaka; strogo sledi navigaciji do Tham Krasae. Nato kratek postanek Suan Sai Yok. Vrnitev v Bangkok zvečer (~21:00) — do svojega hotela."
        : "Death Railway (Kanchanaburi ↔ Nam Tok): train 257 typically passes Tham Krasae (Saphan Tham Krasae) ~11:38 toward Nam Tok; train 259 ~17:46. Return Nam Tok → Kanchanaburi often ~13:00 / ~15:30 (verify SRT on the day). Scenic direction west → east. Driver waits; follow navigation to Tham Krasae. Short stop at Suan Sai Yok. Return to Bangkok evening (~21:00) — to your hotel.",
      lat: 14.1045,
      lng: 99.1671,
    },
    {
      name: slo
        ? "Lahka večerja blizu hotela (po ~21:00)"
        : "Light dinner near hotel (after ~21:00)",
      type: "EAT",
      priceLabel: slo ? "8–15 € / osebo" : "€8–15 / person",
      description: slo
        ? "Po 14–15 urah ste utrujeni — samo kratka večerja v bližini hotela (ulica / hotel restavracija). BREZ nočnega izhoda, templjev ali nakupov."
        : "After 14–15 hours you’ll be exhausted — only a short dinner near the hotel (street food / hotel restaurant). NO nightlife, temples, or shopping.",
      lat: 13.7563,
      lng: 100.5018,
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
    dayLabelText?: string;
  },
): DaySlots {
  if (
    !shouldInjectBangkokKwaiDayTrip({
      ...opts,
      currentSlots: slots,
    })
  ) {
    return slots;
  }
  return buildBangkokKwaiDayTripSlots(locale);
}

/** Prompt block for Gemini — BKK / Thailand hub stays. */
export function bangkokKwaiDayTripPromptBlock(slo: boolean): string {
  const mapsUrl = buildBangkokKwaiDayTripMapsUrl();
  if (slo) {
    return `
OBVEZEN CELODNEVNI IZLET IZ BANGKOKA (vsaj 1 dan, ko je baza Bangkok) — EKSKLUZIVEN DAN:
- Ta dan traja ~06:30–21:00 (~14–15 ur). PREPOVEDANO isti dan: Siam Paragon, CentralWorld, BACC, Grand Palace, Wat Pho, nakupovanje ali drug mestni program.
- Večer: samo lahka večerja blizu hotela po vrnitvi (~21:00). BREZ nočnega izhoda.
- Pot: tvoj hotel (NIKOLI konkretno ime) → Mae Klong Railway Market → Damnoen Saduak → Kanchanaburi War Cemetery → River Kwai Bridge → Tham Krasae (Death Railway) → Suan Sai Yok → hotel Bangkok.
- Odhod izpred hotela 6:30. Mae Klong vlaki skozi tržnico tipično 08:30, 11:10, 14:30, 17:40 (prihodi); odhodi 06:20, 09:00, 11:30, 15:30 — preveri na dan; ciljaj 08:30.
- Death Railway (Tham Krasae): vlak 257 ~11:38, vlak 259 ~17:46 proti Nam Tok; vračanje pogosto ~13:00 / ~15:30 — preveri SRT. Smer zahod → vzhod.
- Most na reki Kwai: ogled peš / kratek postanek (ni ločenega fiksnega „vlaka na mostu“ za turiste).
- Google Maps: ${mapsUrl}
- PREPOVEDANO: ime konkretnega hotela — vedno „tvoj hotel“.`;
  }
  return `
MANDATORY BANGKOK FULL-DAY TRIP (at least one Bangkok base day) — EXCLUSIVE DAY:
- Day runs ~06:30–21:00 (~14–15 hours). FORBIDDEN same day: Siam Paragon, CentralWorld, BACC, Grand Palace, Wat Pho, shopping, or other city program.
- Evening: only a light dinner near the hotel after return (~21:00). NO nightlife.
- Route: your hotel (NEVER a brand name) → Mae Klong Railway Market → Damnoen Saduak → Kanchanaburi War Cemetery → River Kwai Bridge → Tham Krasae (Death Railway) → Suan Sai Yok → Bangkok hotel.
- Leave hotel 6:30. Mae Klong trains through the market typically 08:30, 11:10, 14:30, 17:40 (arrivals); departures 06:20, 09:00, 11:30, 15:30 — verify on the day; aim for 08:30.
- Death Railway (Tham Krasae): train 257 ~11:38, train 259 ~17:46 toward Nam Tok; returns often ~13:00 / ~15:30 — verify SRT. Direction west → east.
- River Kwai Bridge: walk / short stop (no separate fixed tourist “bridge train”).
- Google Maps: ${mapsUrl}
- FORBIDDEN: concrete hotel brands — always “your hotel”.`;
}
