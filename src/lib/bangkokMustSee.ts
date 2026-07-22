import type { Activity, SkeletonHighlight, TripRegion } from "@/lib/aiPlan.functions";
import type { TripLocale } from "@/lib/tripLocale";

type DaySlots = { morning: Activity[]; afternoon: Activity[]; evening: Activity[] };

export type BangkokIcon = {
  id: string;
  test: RegExp;
  slot: "morning" | "evening";
  build: (locale: TripLocale) => Activity;
};

function price(locale: TripLocale, _thb: string): string {
  return locale.mealPrice;
}

/** Mandatory Bangkok icons — correct slot only (no midday temple marathon). */
export const BANGKOK_MUST_SEE: BangkokIcon[] = [
  {
    id: "grand-palace",
    test: /grand palace|velika palača|wat phra kaew|emerald buddha/i,
    slot: "morning",
    build: (locale) => ({
      name: locale.slo ? "Grand Palace / Wat Phra Kaew" : "Grand Palace / Wat Phra Kaew",
      type: "SIGHT",
      priceLabel: price(locale, "500 THB"),
      description: locale.slo
        ? "Zjutraj ob 8:30–11:00 — zapre okoli 15:30. Pokrito oblačilo; vstopnice na vhodu."
        : "Go early (8:30–11:00) — closes ~15:30. Modest dress; tickets at gate.",
    }),
  },
  {
    id: "wat-pho",
    test: /wat pho|ležeči buda|reclining buddha/i,
    slot: "morning",
    build: (locale) => ({
      name: locale.slo ? "Wat Pho (Ležeči Buda)" : "Wat Pho (Reclining Buddha)",
      type: "SIGHT",
      priceLabel: price(locale, "200 THB"),
      description: locale.slo
        ? "Takoj po Grand Palace (5 min s čolnom čez reko ali 15 min peš) — dopoldan, pred vročino."
        : "Right after Grand Palace — morning visit before midday heat.",
    }),
  },
  {
    id: "wat-arun",
    test: /wat arun|temple of dawn/i,
    slot: "evening",
    build: (locale) => ({
      name: locale.slo ? "Wat Arun (ob sončnem zahodu)" : "Wat Arun (sunset)",
      type: "SIGHT",
      priceLabel: price(locale, "100 THB"),
      description: locale.slo
        ? "Sončni zahod ob 18:00–19:00 — čez reko iz Wat Pho (5 THB trajekt). Ne obiskuj dopoldan."
        : "Sunset visit ~18:00–19:00 — ferry from Wat Pho pier. Not a midday stop.",
    }),
  },
  {
    id: "river-market",
    test: /asiatique|icon siam|plavajoč|floating market|damnoen|chao phraya.*večer|river.*market/i,
    slot: "evening",
    build: (locale) => ({
      name: locale.slo ? "Asiatique / večer ob Chao Phraya" : "Asiatique riverside evening",
      type: "EAT",
      priceLabel: price(locale, "200–600 THB"),
      description: locale.slo
        ? "Večernja tržnica ob reki — hrana, rokodelstvo, BTS Saphan Taksin + brezplačen shuttle. Odpre ~16:00."
        : "Riverside night market — food and crafts; opens ~4 pm.",
    }),
  },
];

function slotText(slots: DaySlots): string {
  return [...slots.morning, ...slots.afternoon, ...slots.evening]
    .map((a) => `${a.name} ${a.description}`)
    .join(" ");
}

function iconSatisfiedInContext(icon: BangkokIcon, text: string): boolean {
  if (!icon.test.test(text)) return false;
  if (icon.id === "wat-pho") {
    return (
      /grand palace|velika palača|wat phra kaew/i.test(text) ||
      /takoj po grand|dopoldan|zjutraj|morning|8:30/i.test(text) ||
      /wat pho \(ležeči|wat pho \(reclining/i.test(text)
    );
  }
  if (icon.id === "wat-arun") {
    return /sončni zahod|sunset|ob sončnem zahodu|at sunset|večer/i.test(text);
  }
  return true;
}

export function bangkokIconsPresent(text: string): Set<string> {
  const found = new Set<string>();
  for (const icon of BANGKOK_MUST_SEE) {
    if (iconSatisfiedInContext(icon, text)) found.add(icon.id);
  }
  return found;
}

/** Inject missing Bangkok must-sees at the right time — never temples in afternoon heat. */
export function ensureBangkokMustSee(
  slots: DaySlots,
  locale: TripLocale,
  opts?: {
    /** Highlights already scheduled on earlier trip days only — not future skeleton days. */
    priorScheduledText?: string;
    tripWideText?: string;
    dayInRegion?: number;
  },
): DaySlots {
  const result = {
    morning: [...slots.morning],
    afternoon: [...slots.afternoon],
    evening: [...slots.evening],
  };

  const scheduledBeforeToday = opts?.priorScheduledText ?? opts?.tripWideText ?? "";
  const allText = `${scheduledBeforeToday} ${slotText(result)}`;
  const present = bangkokIconsPresent(allText);

  const day = opts?.dayInRegion ?? 1;
  const iconsDone = bangkokIconsPresent(scheduledBeforeToday);
  /** Second Bangkok stay — only after a proper Grand Palace morning visit earlier in the trip. */
  const returnBlock = iconsDone.has("grand-palace");

  if (returnBlock) {
    return fillBangkokReturnBlock(result, locale, scheduledBeforeToday);
  }

  if (day > 4) return result;

  for (const icon of BANGKOK_MUST_SEE) {
    if (present.has(icon.id)) continue;
    const act = icon.build(locale);
    const bucket = result[icon.slot];
    const morningSights = bucket.filter((a) => a.type === "SIGHT");
    const morningSightCap = day <= 2 ? 3 : 2;

    if (icon.slot === "morning" && morningSights.length >= morningSightCap) {
      if (icon.id !== "grand-palace") continue;
      const bump = morningSights.find((a) => /jim thompson|lumphini|iconsiam/i.test(a.name));
      if (bump) {
        result.morning = result.morning.filter((a) => a !== bump);
        if (result.afternoon.length < 2) result.afternoon.push(bump);
      } else if (morningSights.length >= morningSightCap + 1) {
        continue;
      }
    }
    if (icon.slot === "evening" && bucket.length >= 2) {
      if (icon.id === "wat-arun" && !bucket.some((a) => /wat arun/i.test(a.name))) {
        const weakIdx = bucket.findIndex(
          (a) =>
            a.type === "EAT" &&
            !/asiatique|chinatown|yaowarat|chao phraya/i.test(`${a.name} ${a.description}`),
        );
        if (weakIdx >= 0) bucket.splice(weakIdx, 1);
      }
      if (bucket.length >= 2) continue;
    }

    if (icon.id === "grand-palace") {
      result.morning.unshift(act);
    } else {
      bucket.push(act);
    }
    present.add(icon.id);
  }

  return result;
}

const BANGKOK_CORE_TEMPLE =
  /grand palace|velika palača|wat phra kaew|wat pho|ležeči buda|wat arun|temple of dawn/i;

/** Strip Grand Palace / Wat Pho / Wat Arun when already done earlier in the trip. */
export function stripRepeatBangkokMustSee(
  highlights: SkeletonHighlight[],
): SkeletonHighlight[] {
  return highlights.filter((h) => !BANGKOK_CORE_TEMPLE.test(`${h.name} ${h.description}`));
}

/** Modern buffer-day sights for the second Bangkok stay (no repeat temples). */
function fillBangkokReturnBlock(
  slots: DaySlots,
  locale: TripLocale,
  priorText: string,
): DaySlots {
  const result = {
    morning: slots.morning.filter((a) => !BANGKOK_CORE_TEMPLE.test(`${a.name} ${a.description}`)),
    afternoon: slots.afternoon.filter(
      (a) => !BANGKOK_CORE_TEMPLE.test(`${a.name} ${a.description}`),
    ),
    evening: slots.evening.filter((a) => !BANGKOK_CORE_TEMPLE.test(`${a.name} ${a.description}`)),
  };

  const present = bangkokIconsPresent(`${priorText} ${slotText(result)}`);

  const addIfMissing = (id: string, test: RegExp, slot: "morning" | "afternoon" | "evening", act: Activity) => {
    if (
      present.has(id) ||
      test.test(priorText) ||
      result[slot].some((a) => test.test(`${a.name} ${a.description}`))
    ) {
      return;
    }
    if (result[slot].length >= 2) return;
    result[slot].push(act);
    present.add(id);
  };

  addIfMissing(
    "siam-paragon",
    /siam paragon|siam center|centralworld/i,
    "morning",
    {
      name: locale.slo ? "Siam Paragon / CentralWorld" : "Siam Paragon / CentralWorld",
      type: "SIGHT",
      priceLabel: locale.slo ? "brezplačno" : "free",
      description: locale.slo
        ? "Moderni nakupovalni in kulturni center — dopoldanski obisk, klimatizirano. BTS Siam."
        : "Modern mall district — air-conditioned morning browse. BTS Siam.",
    },
  );

  addIfMissing(
    "chatuchak",
    /chatuchak|jj market|vikend/i,
    "morning",
    {
      name: locale.slo ? "Chatuchak Weekend Market (če vikend)" : "Chatuchak Weekend Market (weekends)",
      type: "SIGHT",
      priceLabel: locale.slo ? "brezplačno" : "free",
      description: locale.slo
        ? "Sob–ned 9:00–18:00 — največja tržnica; če je delovni dan, zamenjaj z MBK ali Jim Thompson House."
        : "Sat–Sun 9am–6pm — huge market; on weekdays swap for MBK or Jim Thompson House.",
    },
  );

  addIfMissing(
    "bacc",
    /bangkok art|bacc|culture centre/i,
    "afternoon",
    {
      name: locale.slo ? "Bangkok Art and Culture Centre" : "Bangkok Art and Culture Centre",
      type: "SIGHT",
      priceLabel: locale.slo ? "brezplačno" : "free",
      description: locale.slo
        ? "Sodobna umetnost ob BTS National Stadium — popoldanski odmor v klimatiziranem prostoru."
        : "Contemporary art near BTS National Stadium — cool afternoon stop.",
    },
  );

  return result;
}

function tripHasBangkokMustSee(
  regions: TripRegion[],
  test: RegExp,
): boolean {
  return regions
    .flatMap((r) => r.highlights ?? [])
    .some((h) => test.test(`${h.name} ${h.description}`));
}

/** Inject Grand Palace + Wat Pho into skeleton when AI skipped them (first Bangkok block). */
export function ensureTripBangkokMustSeeHighlights(
  regions: TripRegion[],
  arrivalDay = 2,
): TripRegion[] {
  if (tripHasBangkokMustSee(regions, /grand palace|velika palača|wat phra kaew/i)) {
    return regions;
  }

  const firstBangkokIdx = regions.findIndex((r) => /bangkok/i.test(r.city));

  return regions.map((region, idx) => {
    if (!/bangkok/i.test(region.city) || idx !== firstBangkokIdx) return region;
    const highlights = [...(region.highlights ?? [])];
    if (highlights.some((h) => /grand palace|velika palača/i.test(h.name))) return region;

    let targetDay = region.startDay;
    if (targetDay <= arrivalDay && targetDay < region.endDay) targetDay = targetDay + 1;
    targetDay = Math.min(Math.max(targetDay, region.startDay), region.endDay);

    const inject: SkeletonHighlight[] = [
      {
        day: targetDay,
        name: "Grand Palace",
        description: "Zjutraj ob 8:30 — zapre okoli 15:30. Pokrito oblačilo.",
        visitDuration: "2.5h",
        priceLabel: "15 €",
        lat: 13.75,
        lng: 100.49,
      },
      {
        day: targetDay,
        name: "Wat Pho",
        description: "Ležeči Buda takoj po Grand Palace — dopoldan.",
        visitDuration: "1.5h",
        priceLabel: "5 €",
        lat: 13.75,
        lng: 100.49,
      },
    ];

    if (!highlights.some((h) => /wat arun/i.test(h.name))) {
      inject.push({
        day: targetDay,
        name: "Wat Arun",
        description: "Sončni zahod ob 18:00 — čez reko iz Wat Pho.",
        visitDuration: "1h",
        priceLabel: "3 €",
        lat: 13.74,
        lng: 100.49,
      });
    }

    return { ...region, highlights: [...highlights, ...inject] };
  });
}
