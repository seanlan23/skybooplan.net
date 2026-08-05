import type { Activity } from "@/lib/aiPlan.functions";
import type { TripLocale } from "@/lib/tripLocale";

type DaySlots = { morning: Activity[]; afternoon: Activity[]; evening: Activity[] };

/**
 * Classic Bangkok full-day loop (Maeklong → Damnoen → Kwai → Death Railway → Sai Yok).
 * Start/end are placeholders — users replace with their own lodging in Google Maps.
 * Place names match the curated Maps route (never a concrete hotel brand).
 * This day is exclusive (~06:30–21:00): no city shopping / museum fillers.
 */
export const BANGKOK_KWAI_DAY_TRIP_STOPS = [
  "Your hotel, Bangkok, Thailand",
  "Maeklong Railway Market (Rom Hup Market), Mae Klong, Samut Songkhram, Thailand",
  "Damnoen Saduak Floating Market, Damnoen Saduak District, Ratchaburi, Thailand",
  "Kanchanaburi War Cemetery (Don Rak), Sangchuto Rd, Kanchanaburi, Thailand",
  "River Kwai Bridge, River Kwai Rd, Kanchanaburi, Thailand",
  "Tham Krasae Death Railway Bridge, Lum Sum, Sai Yok District, Kanchanaburi, Thailand",
  "Suan Sai Yok, Lum Sum, Sai Yok District, Kanchanaburi, Thailand",
  "Your hotel, Bangkok, Thailand",
] as const;

export function buildBangkokKwaiDayTripMapsUrl(): string {
  return `https://www.google.com/maps/dir/${BANGKOK_KWAI_DAY_TRIP_STOPS.map(encodeURIComponent).join("/")}`;
}

/** Note: Maps start/end are placeholders — swap in your own lodging. */
export function bangkokKwaiDayTripMapsNote(slo: boolean): string {
  const mapsUrl = buildBangkokKwaiDayTripMapsUrl();
  if (slo) {
    return `Google Maps celotna pot (odpri in navigiraj): ${mapsUrl} — Začetek in konec sta označena kot „Your hotel“: v Maps ju zamenjaj s svojo namestitvijo (hotel / Airbnb) v Bangkoku. Srednji postanki ostanejo enaki.`;
  }
  return `Full Google Maps route (open to navigate): ${mapsUrl} — Start and end are labeled “Your hotel”: in Maps replace both with your own Bangkok lodging (hotel / Airbnb). Keep the middle stops as-is.`;
}

const KWAI_DAY_CUE_RE =
  /maeklong|mae klong|rom hup|damnoen|kanchanaburi|river kwai|most na reki kwai|most.*(kwai|kway)|tham krasae|death railway|železnic[ae] smrti|suan sai yok|sai yok noi|slapov.*(sai yok|kwai)/i;

const KWAI_FULL_TRIP_RE =
  /maeklong|mae klong|rom hup/i;

const KWAI_WEST_RE =
  /kanchanaburi war|river kwai|tham krasae|death railway|železnic[ae] smrti|suan sai yok/i;

const CITY_CONFLICT_RE =
  /siam paragon|centralworld|art and culture|bacc|grand palace|wat pho|wat arun|chatuchak|mbk|iconsiam|asenij|shopping|nakupovan/i;

/** Strong signal: this trip already scheduled the full Mae Klong + Kwai loop. */
export function tripAlreadyHasKwaiDayTrip(text: string): boolean {
  return KWAI_FULL_TRIP_RE.test(text) && KWAI_WEST_RE.test(text);
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
  return KWAI_DAY_CUE_RE.test(blob);
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

  const labeledKwai = KWAI_DAY_CUE_RE.test(opts.dayLabelText ?? "");
  const slotsKwai = opts.currentSlots
    ? slotsLookLikeKwaiDayTrip(opts.currentSlots)
    : false;
  if ((labeledKwai || slotsKwai) && opts.currentSlots && kwaiDayHasCityConflicts(opts.currentSlots)) {
    return true;
  }
  if (labeledKwai || slotsKwai) {
    // Already a Kwai-labeled day — refresh curated exclusive copy (times / dinner only).
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
  const slo = locale.slo;
  const mapsNote = bangkokKwaiDayTripMapsNote(slo);

  const morning: Activity[] = [
    {
      name: slo
        ? "Celodnevni izlet 6:30–21:00 — odhod iz hotela → Mae Klong"
        : "Full-day trip 6:30–21:00 — leave hotel → Mae Klong",
      type: "ACTIVITY",
      priceLabel: slo ? "privatni van / skupinski izlet" : "private van / shared tour",
      description: slo
        ? `TA DAN JE SAMO TA IZLET (~14–15 ur) — brez nakupovanja, muzejev ali templjev v Bangkoku. Odhod izpred svoje namestitve točno ob 6:30. Mae Klong Railway Market (Rom Hub): vlaki skozi tržnico tipično okoli 08:30, 11:10, 14:30, 17:40 (prihodi); odhodi proti Ban Laem okoli 06:20, 09:00, 11:30, 15:30 — ure preveri na dan. Ciljaj na 08:30; če zamudiš, še 11:10. ${mapsNote}`
        : `THIS DAY IS ONLY THIS TRIP (~14–15 hours) — no Bangkok shopping, museums, or temples. Leave your lodging at exactly 6:30. Mae Klong Railway Market (Rom Hub): trains through the market typically ~08:30, 11:10, 14:30, 17:40 (arrivals); departures toward Ban Laem ~06:20, 09:00, 11:30, 15:30 — verify on the day. Aim for 08:30; if missed, 11:10 still works. ${mapsNote}`,
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
        ? `Death Railway (Kanchanaburi ↔ Nam Tok): vlak 257 skozi Tham Krasae (Saphan Tham Krasae) tipično okoli 11:38 proti Nam Tok; vlak 259 okoli 17:46. Vračanje Nam Tok → Kanchanaburi: npr. ~13:00 / ~15:30 (preveri urnik SRT na dan). Smer vožnje za razgled: zahod → vzhod. Šofer naj te počaka; sledi Google Maps poti do Tham Krasae, nato Suan Sai Yok. Vrnitev v Bangkok zvečer (~21:00) — končni Maps postanek zamenjaj s svojo namestitvijo.`
        : `Death Railway (Kanchanaburi ↔ Nam Tok): train 257 typically passes Tham Krasae (Saphan Tham Krasae) ~11:38 toward Nam Tok; train 259 ~17:46. Return Nam Tok → Kanchanaburi often ~13:00 / ~15:30 (verify SRT on the day). Scenic direction west → east. Driver waits; follow the Google Maps route to Tham Krasae, then Suan Sai Yok. Return to Bangkok evening (~21:00) — replace the final Maps stop with your own lodging.`,
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
  const mapsNote = bangkokKwaiDayTripMapsNote(slo);
  if (slo) {
    return `
OBVEZEN CELODNEVNI IZLET IZ BANGKOKA (vsaj 1 dan, ko je baza Bangkok) — EKSKLUZIVEN DAN:
- Ta dan traja ~06:30–21:00 (~14–15 ur). PREPOVEDANO isti dan: Siam Paragon, CentralWorld, BACC, Grand Palace, Wat Pho, nakupovanje ali drug mestni program.
- Večer: samo lahka večerja blizu hotela po vrnitvi (~21:00). BREZ nočnega izhoda.
- Pot: tvoja namestitev (NIKOLI konkretno ime hotela) → Mae Klong (Rom Hup) → Damnoen Saduak → Kanchanaburi War Cemetery (Don Rak) → River Kwai Bridge → Tham Krasae Death Railway → Suan Sai Yok → nazaj k namestitvi.
- Odhod 6:30. Mae Klong vlaki skozi tržnico tipično 08:30, 11:10, 14:30, 17:40 (prihodi); odhodi 06:20, 09:00, 11:30, 15:30 — preveri na dan; ciljaj 08:30.
- Death Railway (Tham Krasae): vlak 257 ~11:38, vlak 259 ~17:46 proti Nam Tok; vračanje pogosto ~13:00 / ~15:30 — preveri SRT. Smer zahod → vzhod.
- Most na reki Kwai: ogled peš / kratek postanek (ni ločenega fiksnega „vlaka na mostu“ za turiste).
- V opis dneva VKLJUČI to opombo + povezavo: ${mapsNote}
- PREPOVEDANO: ime konkretnega hotela (npr. Tinidee) — vedno „tvoja namestitev“ / „Your hotel“.`;
  }
  return `
MANDATORY BANGKOK FULL-DAY TRIP (at least one Bangkok base day) — EXCLUSIVE DAY:
- Day runs ~06:30–21:00 (~14–15 hours). FORBIDDEN same day: Siam Paragon, CentralWorld, BACC, Grand Palace, Wat Pho, shopping, or other city program.
- Evening: only a light dinner near the hotel after return (~21:00). NO nightlife.
- Route: your lodging (NEVER a hotel brand) → Mae Klong (Rom Hup) → Damnoen Saduak → Kanchanaburi War Cemetery (Don Rak) → River Kwai Bridge → Tham Krasae Death Railway → Suan Sai Yok → back to lodging.
- Leave 6:30. Mae Klong trains through the market typically 08:30, 11:10, 14:30, 17:40 (arrivals); departures 06:20, 09:00, 11:30, 15:30 — verify on the day; aim for 08:30.
- Death Railway (Tham Krasae): train 257 ~11:38, train 259 ~17:46 toward Nam Tok; returns often ~13:00 / ~15:30 — verify SRT. Direction west → east.
- River Kwai Bridge: walk / short stop (no separate fixed tourist “bridge train”).
- INCLUDE this note + link in the day copy: ${mapsNote}
- FORBIDDEN: concrete hotel brands (e.g. Tinidee) — always “your lodging” / “Your hotel”.`;
}

type PlanDayLike = {
  day: number;
  city?: string;
  title: string;
  focusName?: string;
  category?: string;
  inFlightDay?: boolean;
  activities?: DaySlots | null;
  transportation?: unknown;
  transport?: unknown;
  transportationTips?: string;
  travelHack?: string;
  localWarnings?: string;
  drivingDistanceKm?: number;
  drivingDurationHours?: string | number;
  mapPins?: Array<{ name: string; lat: number; lng: number; description?: string }>;
};

/** Final pass: any Bangkok day that looks like Kwai (or mixes Kwai + shopping) becomes the curated exclusive day. */
export function applyBangkokKwaiDayTripToPlan<T extends PlanDayLike>(
  days: T[],
  locale: TripLocale,
): T[] {
  let prior = "";
  const bangkokStayDays = days.filter(
    (d) => /bangkok/i.test(d.city ?? "") && !d.inFlightDay,
  ).length;

  let bangkokIndex = 0;
  return days.map((day) => {
    if (!/bangkok/i.test(day.city ?? "") || day.inFlightDay || !day.activities) {
      return day;
    }
    bangkokIndex += 1;
    const slots = {
      morning: day.activities.morning ?? [],
      afternoon: day.activities.afternoon ?? [],
      evening: day.activities.evening ?? [],
    };
    const dayLabelText = [day.title, day.focusName, day.category]
      .filter(Boolean)
      .join(" ");
    const fixed = ensureBangkokKwaiDayTrip(slots, locale, {
      dayInRegion: bangkokIndex,
      bangkokStayDays: bangkokStayDays || 3,
      priorScheduledText: prior,
      dayLabelText,
      isArrivalDay: day.day === 1,
      isDepartureDay: Boolean(day.inFlightDay),
    });
    const blob = [...fixed.morning, ...fixed.afternoon, ...fixed.evening]
      .map((a) => `${a.name} ${a.description ?? ""}`)
      .join(" ");
    prior += ` ${dayLabelText} ${blob}`;

    if (fixed === slots) return day;

    const mapsNote = bangkokKwaiDayTripMapsNote(locale.slo);
    return {
      ...day,
      title: bangkokKwaiDayTripTitle(locale.slo),
      focusName: "Mae Klong → River Kwai → Death Railway",
      // Full-day van loop — don't show a bogus "14h / 300km" transfer / drive card.
      transportation: undefined,
      transport: undefined,
      transportationTips: undefined,
      drivingDistanceKm: undefined,
      drivingDurationHours: undefined,
      travelHack: mapsNote,
      localWarnings: locale.slo
        ? `Celodnevni izlet ~06:30–21:00 — brez dodatnega mestnega programa; po vrnitvi samo lahka večerja pri hotelu. ${mapsNote}`
        : `Full-day trip ~06:30–21:00 — no extra city program; after return only a light dinner near the hotel. ${mapsNote}`,
      activities: fixed,
      mapPins: [
        ...fixed.morning,
        ...fixed.afternoon,
        ...fixed.evening.filter((a) => a.type !== "EAT"),
      ]
        .filter((a) => typeof a.lat === "number" && typeof a.lng === "number")
        .map((a) => ({
          name: a.name,
          lat: a.lat!,
          lng: a.lng!,
          description: a.description,
        })),
    };
  });
}
