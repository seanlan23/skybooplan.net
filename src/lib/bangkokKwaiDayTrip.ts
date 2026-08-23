import type { Activity } from "@/lib/aiPlan.functions";
import { isSmallIsland } from "@/lib/islandStays";
import type { TripLocale } from "@/lib/tripLocale";

type DaySlots = { morning: Activity[]; afternoon: Activity[]; evening: Activity[] };

/**
 * Classic Bangkok full-day loop (Maeklong → Damnoen → Kwai → Death Railway → Sai Yok).
 * Maps start/end = Bangkok (user sets their hotel in Maps). Never a hotel brand.
 * This day is exclusive (~06:30–21:00): no city shopping / museum fillers.
 */
export const BANGKOK_KWAI_DAY_TRIP_STOPS = [
  "Bangkok, Thailand",
  "Maeklong Railway Market (Rom Hup Market), Mae Klong, Samut Songkhram, Thailand",
  "Damnoen Saduak Floating Market, Damnoen Saduak District, Ratchaburi, Thailand",
  "Kanchanaburi War Cemetery (Don Rak), Sangchuto Rd, Kanchanaburi, Thailand",
  "River Kwai Bridge, River Kwai Rd, Kanchanaburi, Thailand",
  "Tham Krasae Death Railway Bridge, Lum Sum, Sai Yok District, Kanchanaburi, Thailand",
  "Suan Sai Yok, Lum Sum, Sai Yok District, Kanchanaburi, Thailand",
  "Bangkok, Thailand",
] as const;

export function buildBangkokKwaiDayTripMapsUrl(): string {
  return `https://www.google.com/maps/dir/${BANGKOK_KWAI_DAY_TRIP_STOPS.map(encodeURIComponent).join("/")}`;
}

/** Short copy only — never dump the Maps URL into tip text (it clips into %20 garbage). */
export function bangkokKwaiDayTripMapsNote(slo: boolean): string {
  if (slo) {
    return "Celotna zanka: hotel → Mae Klong (Rom Hup) → Damnoen → Don Rak → most Kwai → Tham Krasae → Sai Yok → hotel. V Google Maps začetek in konec nastavi na svojo namestitev v Bangkoku.";
  }
  return "Full loop: hotel → Mae Klong (Rom Hup) → Damnoen → Don Rak → Kwai Bridge → Tham Krasae → Sai Yok → hotel. In Google Maps set start and end to your Bangkok lodging.";
}

export function bangkokKwaiDayTripBookingTip(slo: boolean): string {
  if (slo) {
    return "Kombi z voznikom rezerviraj zvečer prej (recepcija, Klook ali GetYourGuide). Odhod 6:30 izpred namestitve; šofer čaka pri Tham Krasae. Skupinski tour ~40–70 €/osebo, privatni van za 2 ~3.500–6.000 THB. Grab za 14 ur / 300+ km ni realen.";
  }
  return "Book a van with driver the evening before (hotel desk, Klook, or GetYourGuide). Leave 6:30 from your lodging; driver waits at Tham Krasae. Shared tour ~€40–70/person; private van for 2 ~3,500–6,000 THB. Grab is not realistic for 14 hours / 300+ km.";
}

export function isBangkokKwaiDayTripDay(day: {
  title?: string;
  focusName?: string;
  travelHack?: string;
  localWarnings?: string;
}): boolean {
  const blob = `${day.title ?? ""} ${day.focusName ?? ""} ${day.travelHack ?? ""} ${day.localWarnings ?? ""}`;
  if (/maps\/dir/i.test(blob) && /kwai|mae klong|maeklong|kanchanaburi/i.test(blob)) return true;
  return /mae klong|maeklong/i.test(blob) && /kwai|death railway|tham krasae|železnic/i.test(blob);
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
  /** Island → hub travel day (boat + van + flight). Never a 6:30 Kwai start. */
  isTransferDay?: boolean;
  /** Last calendar day, or the day before an international departure. */
  isLateTripDay?: boolean;
  /** Day title / highlight names — force overwrite when Gemini labeled Kwai but left city fillers. */
  dayLabelText?: string;
  currentSlots?: DaySlots;
}): boolean {
  if (
    opts.isArrivalDay ||
    opts.isDepartureDay ||
    opts.isTransferDay ||
    opts.isLateTripDay
  ) {
    return false;
  }

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

  const morning: Activity[] = [
    {
      name: slo
        ? "Celodnevni izlet 6:30–21:00 — odhod iz hotela → Mae Klong"
        : "Full-day trip 6:30–21:00 — leave hotel → Mae Klong",
      type: "ACTIVITY",
      priceLabel: slo ? "privatni van / skupinski izlet" : "private van / shared tour",
      description: slo
        ? "TA DAN JE SAMO TA IZLET (~14–15 ur) — brez nakupovanja, muzejev ali templjev v Bangkoku. Odhod izpred svoje namestitve točno ob 6:30. Mae Klong Railway Market (Rom Hub): vlaki skozi tržnico tipično okoli 08:30, 11:10, 14:30, 17:40 (prihodi); odhodi proti Ban Laem okoli 06:20, 09:00, 11:30, 15:30 — ure preveri na dan. Ciljaj na 08:30; če zamudiš, še 11:10."
        : "THIS DAY IS ONLY THIS TRIP (~14–15 hours) — no Bangkok shopping, museums, or temples. Leave your lodging at exactly 6:30. Mae Klong Railway Market (Rom Hub): trains through the market typically ~08:30, 11:10, 14:30, 17:40 (arrivals); departures toward Ban Laem ~06:20, 09:00, 11:30, 15:30 — verify on the day. Aim for 08:30; if missed, 11:10 still works.",
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
        ? `Death Railway (Kanchanaburi ↔ Nam Tok): vlak 257 skozi Tham Krasae (Saphan Tham Krasae) tipično okoli 11:38 proti Nam Tok; vlak 259 okoli 17:46. Vračanje Nam Tok → Kanchanaburi: npr. ~13:00 / ~15:30 (preveri urnik SRT na dan). Smer vožnje za razgled: zahod → vzhod. Šofer naj te počaka. Vrnitev v Bangkok zvečer (~21:00).`
        : `Death Railway (Kanchanaburi ↔ Nam Tok): train 257 typically passes Tham Krasae (Saphan Tham Krasae) ~11:38 toward Nam Tok; train 259 ~17:46. Return Nam Tok → Kanchanaburi often ~13:00 / ~15:30 (verify SRT on the day). Scenic direction west → east. Driver waits. Return to Bangkok evening (~21:00).`,
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
    isTransferDay?: boolean;
    isLateTripDay?: boolean;
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
  if (slo) {
    return `
OBVEZEN CELODNEVNI IZLET IZ BANGKOKA (vsaj 1 dan, ko je baza Bangkok) — EKSKLUZIVEN DAN:
- Ta dan traja ~06:30–21:00 (~14–15 ur). PREPOVEDANO isti dan: Siam Paragon, CentralWorld, BACC, Grand Palace, Wat Pho, nakupovanje ali drug mestni program.
- Večer: samo lahka večerja blizu hotela po vrnitvi (~21:00). BREZ nočnega izhoda.
- Pot: tvoja namestitev (NIKOLI konkretno ime hotela) → Mae Klong (Rom Hup) → Damnoen Saduak → Kanchanaburi War Cemetery (Don Rak) → River Kwai Bridge → Tham Krasae Death Railway → Suan Sai Yok → nazaj k namestitvi.
- Odhod 6:30. Mae Klong vlaki skozi tržnico tipično 08:30, 11:10, 14:30, 17:40 (prihodi); odhodi 06:20, 09:00, 11:30, 15:30 — preveri na dan; ciljaj 08:30.
- Death Railway (Tham Krasae): vlak 257 ~11:38, vlak 259 ~17:46 proti Nam Tok; vračanje pogosto ~13:00 / ~15:30 — preveri SRT. Smer zahod → vzhod.
- Most na reki Kwai: ogled peš / kratek postanek (ni ločenega fiksnega „vlaka na mostu“ za turiste).
- PREVOZ: kombi z voznikom rezerviraj zvečer prej (recepcija / Klook / GetYourGuide). PREPOVEDANO v besedilo dneva lepiti surov Google Maps URL.
- PREPOVEDANO: ime konkretnega hotela (npr. Tinidee) — vedno „tvoja namestitev“.`;
  }
  return `
MANDATORY BANGKOK FULL-DAY TRIP (at least one Bangkok base day) — EXCLUSIVE DAY:
- Day runs ~06:30–21:00 (~14–15 hours). FORBIDDEN same day: Siam Paragon, CentralWorld, BACC, Grand Palace, Wat Pho, shopping, or other city program.
- Evening: only a light dinner near the hotel after return (~21:00). NO nightlife.
- Route: your lodging (NEVER a hotel brand) → Mae Klong (Rom Hup) → Damnoen Saduak → Kanchanaburi War Cemetery (Don Rak) → River Kwai Bridge → Tham Krasae Death Railway → Suan Sai Yok → back to lodging.
- Leave 6:30. Mae Klong trains through the market typically 08:30, 11:10, 14:30, 17:40 (arrivals); departures 06:20, 09:00, 11:30, 15:30 — verify on the day; aim for 08:30.
- Death Railway (Tham Krasae): train 257 ~11:38, train 259 ~17:46 toward Nam Tok; returns often ~13:00 / ~15:30 — verify SRT. Direction west → east.
- River Kwai Bridge: walk / short stop (no separate fixed tourist “bridge train”).
- TRANSPORT: book a van with driver the evening before (hotel desk / Klook / GetYourGuide). FORBIDDEN: paste a raw Google Maps URL into day copy.
- FORBIDDEN: concrete hotel brands (e.g. Tinidee) — always “your lodging”.`;
}

type PlanDayLike = {
  day: number;
  city?: string;
  title: string;
  focusName?: string;
  category?: string;
  inFlightDay?: boolean;
  activities?: DaySlots | null;
  transportation?: Array<{ type?: string; from?: string; to?: string }>;
  transport?: unknown;
  transportationTips?: string;
  travelHack?: string;
  localWarnings?: string;
  drivingDistanceKm?: number;
  drivingDurationHours?: string | number;
  mapPins?: Array<{ name: string; lat: number; lng: number; description?: string }>;
};

function isIslandHubReturnDay<T extends PlanDayLike>(
  day: T,
  prevCity: string,
): boolean {
  if (prevCity.trim() && isSmallIsland(prevCity)) return true;
  const legs = day.transportation ?? [];
  if (
    legs.some((l) =>
      /lipe|pak bara|hat yai|\bhdy\b/i.test(`${l.from ?? ""} ${l.to ?? ""}`),
    )
  ) {
    return true;
  }
  const blob = [day.title, day.focusName, JSON.stringify(day.activities ?? {})].join(" ");
  return (
    /pak bara|hat yai|\bhdy\b/i.test(blob) &&
    /trajekt|ferry|speedboat|kombi|van|let /i.test(blob)
  );
}

function previousDayAlreadyAtHub<T extends PlanDayLike>(prev: T | undefined, hubCity: string): boolean {
  if (!prev || !hubCity.trim()) return false;
  if (new RegExp(hubCity.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(prev.city ?? "")) {
    return true;
  }
  const blob = `${prev.title ?? ""} ${JSON.stringify(prev.activities ?? {})}`;
  if (!new RegExp(hubCity.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(blob)) {
    return false;
  }
  return /prihod|check-?in|namestit|večerja|dinner|hotel/i.test(blob);
}

function keepNonKwaiSlots(slots: DaySlots): DaySlots {
  const keep = (list: Activity[]) =>
    list.filter((a) => {
      if (a.type === "TRANSPORT") return true;
      return !KWAI_DAY_CUE_RE.test(`${a.name} ${a.description ?? ""}`);
    });
  return {
    morning: keep(slots.morning),
    afternoon: keep(slots.afternoon),
    evening: keep(slots.evening),
  };
}

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
  return days.map((day, i) => {
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
    const prevCity = String(days[i - 1]?.city ?? "");
    const arrivedYesterday = previousDayAlreadyAtHub(days[i - 1], day.city ?? "Bangkok");
    const isTransferDay = isIslandHubReturnDay(day, prevCity) && !arrivedYesterday;
    const next = days[i + 1];
    const isLateTripDay =
      i === days.length - 1 ||
      Boolean(next?.inFlightDay) ||
      /odhod|mednarodni (povratni )?let|international (return )?flight|abflug|partenza|salida desde/i.test(
        `${next?.title ?? ""} ${next?.focusName ?? ""}`,
      );
    if (isTransferDay || isLateTripDay) {
      const cleaned = keepNonKwaiSlots(slots);
      prior += ` ${dayLabelText}`;
      const title = KWAI_DAY_CUE_RE.test(day.title ?? "")
        ? locale.slo
          ? isTransferDay
            ? "Prevoz v Bangkok"
            : "Bangkok"
          : isTransferDay
            ? "Transfer to Bangkok"
            : "Bangkok"
        : day.title;
      return { ...day, activities: cleaned, title };
    }
    const fixed = ensureBangkokKwaiDayTrip(slots, locale, {
      dayInRegion: bangkokIndex,
      bangkokStayDays: bangkokStayDays || 3,
      priorScheduledText: prior,
      dayLabelText,
      isArrivalDay: day.day === 1,
      isDepartureDay: Boolean(day.inFlightDay) || i === days.length - 1,
      isTransferDay,
      isLateTripDay,
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
      localWarnings: bangkokKwaiDayTripBookingTip(locale.slo),
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
