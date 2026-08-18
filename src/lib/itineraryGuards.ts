import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { isAiPlaceholderText, isWrongCityPoi } from "@/lib/tripContent";
import {
  dedupeSameDayActivities,
  sameDayActivityCoreKey,
  sanitizeLegacyTemplateLeak,
  stripTruncatedCopyFromPlan,
} from "@/lib/textSanitize";
import { annotateHitAndRunStays, annotateOverlongDriveStages } from "@/lib/plannerQuality";
import { annotateBalkanRoadTips, repairImplausibleDriveTimes, stripHomeboundPaidStays, stripSightseeingOnBrutalDriveDays } from "@/lib/roadTripLogistics";
import { alignSummaryTripLength } from "@/lib/planTeaser";

type DaySlots = NonNullable<DayPlan["activities"]>;
type Slot = keyof DaySlots;

const SLOTS: Slot[] = ["morning", "afternoon", "evening"];

/** Enricher-pool generics that must never ship in final plans / PDFs (all plan languages). */
export function isEnricherPlaceholderActivity(a: {
  name?: string;
  description?: string;
}): boolean {
  const name = (a.name ?? "").trim();
  const desc = (a.description ?? "").trim();
  if (!name) return true;
  // Name-only: do not treat a short real description ("Po Emberá…") as scaffolding.
  if (isAiPlaceholderText(name)) return true;
  const blob = `${name} ${desc}`;
  return (
    /glavni dopoldanski ogled/i.test(blob) ||
    /mesto ali znamenitost,?\s*ki jo je najbolje obiskati zjutraj/i.test(blob) ||
    /main morning sight\s*[—-]\s*visit while/i.test(blob) ||
    /hauptbesichtigung am vormittag/i.test(blob) ||
    /ort oder sehenswürdigkeit am besten früh/i.test(blob) ||
    /visite principale du matin/i.test(blob) ||
    /visita principal de la mañana/i.test(blob) ||
    /principale visita del mattino/i.test(blob) ||
    /^jutranji ogled\s*\/\s*sprehod$/i.test(name) ||
    /^morning sight or stroll$/i.test(name) ||
    /^morgendliche besichtigung oder spaziergang$/i.test(name) ||
    /^visite ou promenade matinale$/i.test(name) ||
    /^visita o paseo matutino$/i.test(name) ||
    /^visita o passeggiata mattutina$/i.test(name) ||
    /^pavza v kavarni$/i.test(name) ||
    /jutranji sprehod\s*\/\s*kava pred ogledom/i.test(name) ||
    /jutranji sprehod do prve znamenitosti/i.test(name) ||
    /jutranji sprehod\s*\/\s*lokalni ritm/i.test(name) ||
    /^jutranji sprehod\b/i.test(name) ||
    /lahkoten sprehod v okolici (vaše )?namestitve/i.test(blob) ||
    /spoznavanje s prvim okoljem/i.test(blob) ||
    /light stroll around (your |the )?accommodation/i.test(blob) ||
    /check-in,?\s*osvežitev(\s+in\s+kratek\s+odmor)?/i.test(name) ||
    /osvežitev in kratek odmor/i.test(name) ||
    /če imaš še energijo/i.test(name) ||
    /if you (?:still )?have (?:the )?energy/i.test(name) ||
    /^morning walk & coffee$/i.test(name) ||
    /^morning stroll \/ local pace$/i.test(name) ||
    /^morning stroll in /i.test(name) ||
    /^večernji sprehod in lokalna večerja$/i.test(name) ||
    /^evening stroll & local dinner$/i.test(name) ||
    /^café break$/i.test(name) ||
    /^kaffeepause$/i.test(name) ||
    /^pause café$/i.test(name) ||
    /2[–-]3\s*stavki|what to see|why it matters|practical tip/i.test(blob) ||
    /kaj vidiš.*zakaj je vredno/i.test(blob)
  );
}

/**
 * Generic meal cards without a venue name — drop worldwide.
 * Keep "Večerja: Ichiran Ramen" / "Dinner at Sukiyabashi Jiro"; strip "Abendessen in Kyoto".
 */
export function isGenericMealActivity(a: {
  name?: string;
  description?: string;
  type?: string;
}): boolean {
  const name = (a.name ?? "").trim();
  if (!name) return false;
  const mealWord =
    /^(zajtrk|kosilo|večerja|breakfast|lunch|dinner|mittagessen|abendessen|frühstück|déjeuner|dîner|cena|colazione|pranzo)\b/i;
  const isMeal = a.type === "EAT" || mealWord.test(name);
  if (!isMeal) return false;
  if (isEnricherPlaceholderActivity(a)) return true;

  // Named venue: "Večerja: Ichiran", "Dinner: X", "Abendessen: X"
  if (
    /^(zajtrk|kosilo|večerja|breakfast|lunch|dinner|mittagessen|abendessen|frühstück|déjeuner|dîner|cena|colazione|pranzo)\s*:\s*\S+/i.test(
      name,
    )
  ) {
    return false;
  }
  // Named venue: "Dinner at Ichiran", "Abendessen bei Kyubey", "Dîner chez X"
  if (/\b(at|bei|chez|da)\s+[A-ZÀ-Ü"«]/u.test(name)) return false;

  return (
    /^(lokalna večerja|local dinner|sproščena večerja|relaxed dinner|lahka večerja|abendessen im viertel|dinner in the (neighbourhood|neighborhood)|večerja v četrti)\b/i.test(
      name,
    ) ||
    /^(abendessen|mittagessen|frühstück|večerja|kosilo|dinner|lunch|dîner|déjeuner|cena|pranzo)\s+(in|im|v|at|près de|nahe|in der nähe|einem|einer|eines)/i.test(
      name,
    ) ||
    /^(abendessen|mittagessen|dinner|lunch|večerja|kosilo)\s+in\s+einem\b/i.test(name) ||
    /^(abendessen und nachtleben|dinner and nightlife|večerja in nočno|večerja in koktajl)/i.test(
      name,
    ) ||
    /^(dinner and cocktails|cocktails in an elegant|elegantem bar|elegantnem baru)\b/i.test(
      name,
    ) ||
    /^(check-in und mittagessen|shopping und mittagessen)\b/i.test(name) ||
    // Name is only a meal label + neighborhood, optionally trailing colon (PDF: "Mittagessen in San Telmo:")
    /^(abendessen|mittagessen|dinner|lunch|večerja|kosilo)\b[^:]{0,60}:\s*$/i.test(name) ||
    /elegantn[ea]m baru|elegant bar|v bližini hotela|near the hotel|trendovsk[ei]|trendy (neighbourhood|neighborhood|area)|številnih stilskih|one of the many/i.test(
      `${name} ${a.description ?? ""}`,
    )
  );
}

/** Airport / first-arrival logistics (not sightseeing near an airport). */
export function isAirportArrivalLogistics(a: {
  name?: string;
  description?: string;
  type?: string;
}): boolean {
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  if (
    /pool|emerald|hot spring|waterfall|slap|beach|plaž|temple|tempelj|museum|muzej|casco|viejo|canal|prekop/i.test(
      t,
    )
  ) {
    return false;
  }
  // Departure / return logistics are never "phantom arrivals".
  if (
    /check-?out|rückflug|return flight|flight home|povratek|odhod iz hotela|hotel check-out|airport transfer|flughafentransfer|prevoz na letališč|transfer to (the )?airport|abflug|mednarodni\s*(povratni\s*)?let|international\s*(return\s*)?flight|internationaler\s*(rück)?flug|airport check-in|check-in am flughafen/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /prihod na (mednarodno )?letališč|airport arrival|ankunft am flughafen|tocumen|\(pty\)|\(jfk\)|\(syd\)|arrival hall|prevzem prtljage|baggage claim/i.test(
      t,
    ) ||
    (/prevoz do (hotela|centra)|transfer to (the )?hotel|check-in,?\s*(osvežitev|refresh)|namestitev po prihodu/i.test(
      t,
    ) &&
      /letališč|airport|taxi|grab|uber|transfer/i.test(t)) ||
    ((a.type === "TRANSPORT" || a.type === "STAY") &&
      /prihod|arrival|letališč|airport/i.test(t) &&
      !/check-?in/i.test(t))
  );
}

function isEveningMeal(a: Activity): boolean {
  if (a.type === "EAT") return true;
  const t = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
  return /večerja|dinner|cena\b|dîner|abendessen|kosilo zvečer|evening meal/i.test(t);
}

function activityFingerprint(day: DayPlan): string {
  const acts = day.activities;
  if (!acts) return `${(day.city ?? "").toLowerCase()}|`;
  const names = SLOTS.flatMap((slot) =>
    (acts[slot] ?? [])
      .map((a) => sameDayActivityCoreKey(a.name ?? "") || (a.name ?? "").toLowerCase().trim())
      .filter(Boolean),
  ).sort();
  return `${(day.city ?? "").toLowerCase()}|${names.join("|")}`;
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

function dayNameTokens(day: DayPlan): string[] {
  const acts = day.activities;
  if (!acts) return [];
  return SLOTS.flatMap((slot) =>
    (acts[slot] ?? [])
      .map((a) => sameDayActivityCoreKey(a.name ?? "") || (a.name ?? "").toLowerCase().trim())
      .filter((k) => k.length >= 4),
  );
}

function thinLocalDay(day: DayPlan, lang: string): DayPlan {
  const slo = !lang || lang.startsWith("sl");
  const city = day.city || day.focusName || (slo ? "destinacija" : "destination");
  return {
    ...day,
    title: slo ? `${city} — prosti / lokalni dan` : `${city} — free / local day`,
    travelHack: slo
      ? "Dan je bil podvojen v osnutku — zamenjan z lahkotnim lokalnim programom."
      : "Day was duplicated in the draft — replaced with a light local schedule.",
    morning: "",
    afternoon: "",
    evening: "",
    mapPins: [],
    transportation: undefined,
    activities: {
      morning: [],
      afternoon: [
        {
          name: slo ? `Lokalni pomembnejši ogled v ${city}` : `Key local sight in ${city}`,
          type: "SIGHT",
          description: slo
            ? `En konkreten ogled (muzej, trg ali park) — drugačen od prejšnjega dne.`
            : `One concrete sight (museum, square, or park) — different from the previous day.`,
          bullets: slo
            ? [`Izberi eno znamenitost, ki je še nisi videl.`, `Vrni se pred večerjo.`]
            : [`Pick one sight you have not done yet.`, `Be back before dinner.`],
        },
      ],
      evening: [
        {
          name: slo ? `Večerja v ${city}` : `Dinner in ${city}`,
          type: "EAT",
          description: slo
            ? `Ena sproščena lokalna večerja — brez drugega večernega bloka.`
            : `One relaxed local dinner — no second evening meal block.`,
          bullets: slo
            ? [`Rezerviraj mizo, če je sezona.`]
            : [`Book a table in high season.`],
        },
      ],
    },
  };
}

/** Drop Paris sights on Lyon days (and other city-locked landmarks). */
export function stripWrongCityDayActivities(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    const city = day.city || day.focusName || "";
    if (day.activities) {
      for (const slot of SLOTS) {
        const list = day.activities[slot] ?? [];
        const next = list.filter((a) => {
          const drop = isWrongCityPoi(a.name ?? "", a.description ?? "", city);
          if (drop) removed += 1;
          return !drop;
        });
        day.activities[slot] = next;
      }
    }
    if (day.mapPins?.length) {
      const nextPins = day.mapPins.filter((p) => {
        const drop = isWrongCityPoi(p.name ?? "", p.description ?? "", city);
        if (drop) removed += 1;
        return !drop;
      });
      day.mapPins = nextPins;
    }
  }
  return removed;
}

/** Strip leftover template sentences from day prose + activity copy. */
export function scrubForbiddenTemplateCopy(plan: AiTripPlan): number {
  let fixed = 0;
  const clean = (raw: string | undefined, assign: (v: string) => void) => {
    if (typeof raw !== "string" || !raw) return;
    const next = sanitizeLegacyTemplateLeak(raw);
    if (next !== raw) {
      assign(next);
      fixed += 1;
    }
  };
  for (const day of plan.days ?? []) {
    clean(day.morning, (v) => {
      day.morning = v;
    });
    clean(day.afternoon, (v) => {
      day.afternoon = v;
    });
    clean(day.evening, (v) => {
      day.evening = v;
    });
    clean(day.travelHack, (v) => {
      day.travelHack = v;
    });
    clean(day.transportationTips, (v) => {
      day.transportationTips = v;
    });
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      for (const a of day.activities[slot] ?? []) {
        clean(a.name, (v) => {
          a.name = v;
        });
        clean(a.description, (v) => {
          a.description = v;
        });
        if (a.bullets) {
          a.bullets = a.bullets.map((b) => sanitizeLegacyTemplateLeak(b));
        }
      }
    }
  }
  return fixed;
}

/** Drop enricher / prompt placeholder activities from every day. */
export function stripPlaceholderActivities(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    if (day.mapPins?.length) {
      const nextPins = day.mapPins.filter((p) => {
        const drop = isEnricherPlaceholderActivity(p);
        if (drop) removed += 1;
        return !drop;
      });
      day.mapPins = nextPins;
    }
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      const list = day.activities[slot] ?? [];
      const next = list.filter((a) => {
        const drop = isEnricherPlaceholderActivity(a);
        if (drop) removed += 1;
        return !drop;
      });
      day.activities[slot] = next;
    }
  }
  return removed;
}

type NamedEvening = { name: string; description: string };

const NAMED_EVENINGS: Array<{
  city: RegExp;
  sl: NamedEvening;
  en: NamedEvening;
  de: NamedEvening;
}> = [
  {
    city: /paris|pariz/i,
    sl: {
      name: "Večerja: Le Comptoir du Relais",
      description:
        "Majhen bistro v 6. okrožju (Odéon). Rezervacija priporočena; sicer pridi pred 19:00. Po večerji kratek sprehod do Seine.",
    },
    en: {
      name: "Dinner: Le Comptoir du Relais",
      description:
        "Small bistro in the 6th (Odéon). Book ahead, or arrive before 19:00. Walk to the Seine after.",
    },
    de: {
      name: "Abendessen: Le Comptoir du Relais",
      description:
        "Kleines Bistro im 6. Arrondissement (Odéon). Reservieren oder vor 19:00 da sein. Danach kurz zur Seine.",
    },
  },
  {
    city: /lyon/i,
    sl: {
      name: "Večerja: Café Comptoir Abel",
      description:
        "Klasičen bouchon pri Ainay. Quenelle in salade lyonnaise; zvečer je polno, rezerviraj.",
    },
    en: {
      name: "Dinner: Café Comptoir Abel",
      description:
        "Classic bouchon near Ainay. Quenelle and salade lyonnaise — book, evenings fill up.",
    },
    de: {
      name: "Abendessen: Café Comptoir Abel",
      description:
        "Klassischer Bouchon bei Ainay. Quenelle und Salade lyonnaise — reservieren, abends voll.",
    },
  },
  {
    city: /rome|rim|roma/i,
    sl: {
      name: "Večerja: Da Enzo al 29",
      description:
        "Trastevere, via dei Vascellari. Kratka karta, rezervacija nujna. Po večerji sprehod ob Tiberi.",
    },
    en: {
      name: "Dinner: Da Enzo al 29",
      description:
        "Trastevere, via dei Vascellari. Short menu, book ahead. Walk the Tiber after.",
    },
    de: {
      name: "Abendessen: Da Enzo al 29",
      description:
        "Trastevere, Via dei Vascellari. Kurze Karte, reservieren. Danach am Tiber entlang.",
    },
  },
  {
    city: /barcelona|barcelon/i,
    sl: {
      name: "Večerja: Cal Pep",
      description:
        "Barceloneta / Born — tapas pri pultu. Pridi zgodaj ali stoj v vrsti; ni rezervacij za pult.",
    },
    en: {
      name: "Dinner: Cal Pep",
      description:
        "Barceloneta / Born — tapas at the counter. Come early or queue; no bar reservations.",
    },
    de: {
      name: "Abendessen: Cal Pep",
      description:
        "Barceloneta / Born — Tapas an der Theke. Früh kommen oder anstehen; keine Theken-Reservierung.",
    },
  },
];

function eveningLang(plan: AiTripPlan): "sl" | "en" | "de" {
  const code = (plan.contentLanguage ?? "en").slice(0, 2).toLowerCase();
  if (code === "sl" || code === "de") return code;
  return "en";
}

function isHomeboundDay(day: DayPlan): boolean {
  const blob = [
    day.title,
    day.category,
    ...SLOTS.flatMap((s) => (day.activities?.[s] ?? []).map((a) => a.name ?? "")),
  ].join(" ");
  return /odhod iz|return flight|mednarodni povratni|hotel check-out|prevoz na letališč|international return/i.test(
    blob,
  );
}

function namedEveningForCity(city: string, lang: "sl" | "en" | "de"): NamedEvening | null {
  const hit = NAMED_EVENINGS.find((row) => row.city.test(city));
  return hit ? hit[lang] : null;
}

/**
 * After generic evening meals are stripped, put back one real venue when we know the city.
 * Unknown cities stay empty — better than “cocktails in an elegant bar”.
 */
export function fillNamedEveningIfEmpty(
  plan: AiTripPlan,
  onlyDays?: Set<DayPlan>,
): number {
  let filled = 0;
  const lang = eveningLang(plan);
  for (const day of plan.days ?? []) {
    if (onlyDays && !onlyDays.has(day)) continue;
    if (!day.activities || isHomeboundDay(day)) continue;
    const evening = day.activities.evening ?? [];
    if (evening.some((a) => a.type === "EAT" || /večerja|dinner|abendessen|dîner|cena/i.test(a.name ?? ""))) {
      continue;
    }
    const venue = namedEveningForCity(day.city || day.focusName || "", lang);
    if (!venue) continue;
    day.activities.evening = [
      ...evening,
      { name: venue.name, type: "EAT", description: venue.description },
    ];
    filled += 1;
  }
  return filled;
}

/** Drop venue-less meal fillers worldwide (all languages). */
export function stripGenericMealActivities(plan: AiTripPlan): number {
  let removed = 0;
  const eveningsToName = new Set<DayPlan>();
  for (const day of plan.days ?? []) {
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      const list = day.activities[slot] ?? [];
      const next = list.filter((a) => {
        const drop = isGenericMealActivity(a);
        if (drop) {
          removed += 1;
          if (slot === "evening") eveningsToName.add(day);
        }
        return !drop;
      });
      day.activities[slot] = next;
    }
  }
  if (eveningsToName.size) fillNamedEveningIfEmpty(plan, eveningsToName);
  return removed;
}

/** Fix common truncated logistics fragments left by the model. */
export function repairIncompleteLogisticsCopy(plan: AiTripPlan): number {
  let fixed = 0;
  const scrub = (raw: string | undefined): string | undefined => {
    if (typeof raw !== "string" || !raw) return raw;
    let t = raw;
    const before = t;
    t = t
      // "(ca. – €15–35)" and bare "ca. – 15-20 Min" (FRA→EZE)
      .replace(/\(\s*ca\.?\s*[–—-]\s*€/gi, "(ca. €")
      .replace(/\bca\.?\s*[–—-]\s*(?=€|\d)/gi, "ca. ")
      .replace(/Terminal-?\s*vs\.?\s*$/gi, "Terminal- vs. Off-site-Parkplatz.")
      .replace(/\btrain\s*\/\s*taxi\b/gi, "Zug / Taxi")
      .replace(/\bmit train\b/gi, "mit Zug")
      // Spam filler appended after real dinner copy
      .replace(
        /\s*Abendessen im Viertel:\s*Abendessen abseits der Haupttouristenstraßen[^.]*\.?/gi,
        "",
      )
      .replace(
        /\s*Dinner in the (?:neighbourhood|neighborhood):\s*Dinner away from the main tourist streets[^.]*\.?/gi,
        "",
      );
    // Drop dangling ellipsis leftovers that repairTruncatedCopy missed mid-phrase.
    t = t.replace(/\s*[–—-]\s*höchstens…\s*$/iu, ".")
      .replace(/\s*[–—-]\s*optional light evening…\s*$/i, ".")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (t !== before) fixed += 1;
    return t;
  };
  for (const day of plan.days ?? []) {
    day.transportationTips = scrub(day.transportationTips) ?? day.transportationTips;
    day.travelHack = scrub(day.travelHack) ?? day.travelHack;
    day.localWarnings = scrub(day.localWarnings) ?? day.localWarnings;
    if (!day.activities) continue;
    for (const slot of SLOTS) {
      for (const a of day.activities[slot] ?? []) {
        a.name = scrub(a.name) ?? a.name;
        a.description = scrub(a.description) ?? a.description;
        if (a.bullets?.length) {
          a.bullets = a.bullets.map((b) => scrub(b) ?? b);
        }
      }
    }
  }
  return fixed;
}

/**
 * Drop nonsense "FLIGHT" legs that are walks/sights (FRA→EZE: FLIGHT · Spaziergang durch Recoleta).
 */
export function sanitizeTransportationLegs(plan: AiTripPlan): number {
  let removed = 0;
  const nonAirPlace =
    /spaziergang|stroll|walk|paseo|passeggiata|promenade|friedhof|cemetery|museum|park\b|plaza|caminito|recoleta|malba|viertel|neighbourhood|neighborhood|straße|street|mercado|market|garten|garden|temple|tempel|kirche|church|cathedral/i;
  const groundAirportTransfer =
    /ankunft|arrival|prihod|transfer|prevoz|taxi|uber|shuttle|von\s+flughafen|from\s+(the\s+)?airport|zum\s+hotel|to\s+(the\s+)?hotel/i;
  for (const day of plan.days ?? []) {
    if (!day.transportation?.length) continue;
    const next: NonNullable<DayPlan["transportation"]> = [];
    for (const leg of day.transportation) {
      if (leg.type !== "flight") {
        next.push(leg);
        continue;
      }
      const place = `${leg.from ?? ""} ${leg.to ?? ""}`;
      if (nonAirPlace.test(place)) {
        removed += 1;
        continue;
      }
      // "FLIGHT · Ankunft am Flughafen EZE → City" is ground transfer, not a flight leg.
      if (groundAirportTransfer.test(place) && !/\b(rückflug|return flight|povratni|abflug nach|flight to)\b/i.test(place)) {
        next.push({ ...leg, type: "taxi" });
        removed += 1; // count as sanitized
        continue;
      }
      if (
        leg.from &&
        leg.to &&
        leg.from.trim().toLowerCase() === leg.to.trim().toLowerCase() &&
        leg.estimatedPrice === 0
      ) {
        removed += 1;
        continue;
      }
      next.push(leg);
    }
    day.transportation = next.length ? next : undefined;
  }
  return removed;
}

/** Keep at most one international return-flight row on the last calendar day. */
export function dedupeLastDayReturnFlights(plan: AiTripPlan): number {
  const days = plan.days ?? [];
  if (days.length < 1) return 0;
  const last = days[days.length - 1]!;
  if (!last.activities) return 0;
  const isReturnFlight = (a: Activity): boolean =>
    /internationaler\s*(rück)?flug|international\s*(return\s*)?flight|mednarodni\s*(povratni\s*)?let|volo\s*(di\s*ritorno|internazionale)|vuelo\s*(de\s*regreso|internacional)|vol\s*(retour|international)|rückflug|flight home|povratek\s*domov/i.test(
      a.name ?? "",
    );

  const slots: Slot[] = ["evening", "afternoon", "morning"];
  let keepSlot: Slot | null = null;
  let keepIdx = -1;
  for (const slot of slots) {
    const list = last.activities[slot] ?? [];
    const idx = list.findIndex(isReturnFlight);
    if (idx >= 0) {
      keepSlot = slot;
      keepIdx = idx;
      break;
    }
  }
  if (!keepSlot) return 0;

  let removed = 0;
  for (const slot of SLOTS) {
    const list = last.activities[slot] ?? [];
    last.activities[slot] = list.filter((a, i) => {
      if (!isReturnFlight(a)) return true;
      if (slot === keepSlot && i === keepIdx) return true;
      removed += 1;
      return false;
    });
  }
  return removed;
}

/**
 * Keep at most one evening meal per day.
 * Prefer a named venue over generic “Lokalna večerja” / “Sproščena večerja…”.
 */
export function dedupeSameDayMeals(plan: AiTripPlan): number {
  let removed = 0;
  for (const day of plan.days ?? []) {
    if (!day.activities?.evening?.length) continue;
    const evening = day.activities.evening;
    const mealIdx: number[] = [];
    evening.forEach((a, i) => {
      if (isEveningMeal(a)) mealIdx.push(i);
    });
    if (mealIdx.length <= 1) continue;

    const score = (a: Activity): number => {
      const n = a.name ?? "";
      if (/^lokalna večerja|^local dinner|^cena locale|^dîner local|^lokales abendessen/i.test(n)) {
        return 0;
      }
      if (/sproščena večerja|relaxed dinner|after returning|po vrnitvi/i.test(n)) return 1;
      return 3 + Math.min(n.length, 40) / 40;
    };

    let keep = mealIdx[0]!;
    for (const i of mealIdx) {
      if (score(evening[i]!) > score(evening[keep]!)) keep = i;
    }
    day.activities.evening = evening.filter((a, i) => {
      if (!mealIdx.includes(i)) return true;
      if (i === keep) return true;
      removed += 1;
      return false;
    });
  }
  return removed;
}

/** Strip airport-arrival logistics from every day except the real arrival day. */
export function stripPhantomArrivals(plan: AiTripPlan, arrivalDay = 1): number {
  let removed = 0;
  const days = plan.days ?? [];
  const lastDayNum = days.length ? Math.max(...days.map((d) => d.day)) : 0;
  for (const day of days) {
    if (!day.activities) continue;
    if (day.day === arrivalDay) continue;
    // Last calendar day owns departure logistics (check-in / transfer / return flight).
    if (day.day === lastDayNum) continue;
    for (const slot of SLOTS) {
      const list = day.activities[slot] ?? [];
      const next = list.filter((a) => {
        const drop = isAirportArrivalLogistics(a);
        if (drop) removed += 1;
        return !drop;
      });
      day.activities[slot] = next;
    }
  }
  return removed;
}

/**
 * If two consecutive days share ~the same activity set, replace the later day
 * with a thin local day (stops Casco Viejo copy-paste clones).
 */
export function dedupeNearIdenticalConsecutiveDays(
  plan: AiTripPlan,
  opts?: { language?: string; threshold?: number },
): number {
  const lang = opts?.language ?? plan.contentLanguage ?? "sl";
  const threshold = opts?.threshold ?? 0.82;
  let fixed = 0;
  const days = plan.days ?? [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const cur = days[i]!;
    if (prev.inFlightDay || cur.inFlightDay) continue;
    const fpPrev = activityFingerprint(prev);
    const fpCur = activityFingerprint(cur);
    if (!fpPrev || !fpCur) continue;
    const identical = fpPrev === fpCur;
    const sim = jaccard(dayNameTokens(prev), dayNameTokens(cur));
    if (!identical && sim < threshold) continue;
    // Need at least 2 named activities to treat as a real clone (not two empty days).
    if (dayNameTokens(cur).length < 2 && !identical) continue;
    days[i] = thinLocalDay(cur, lang);
    fixed += 1;
  }
  return fixed;
}

function parseHhMmToMinutes(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Earliest departure / flight clock on a day (boarding-pass or activity fields). */
function earliestDepartureMinutes(day: DayPlan): number | null {
  let best: number | null = null;
  const consider = (t?: string | null) => {
    const m = parseHhMmToMinutes(t);
    if (m == null) return;
    if (best == null || m < best) best = m;
  };
  for (const slot of SLOTS) {
    for (const a of day.activities?.[slot] ?? []) {
      const blob = `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase();
      if (
        /odlet|odhod|departure|return flight|mednarodni|international|flight home|prevoz na letališč|airport transfer/i.test(
          blob,
        )
      ) {
        consider(a.arrivalTime);
        consider(a.departureTime);
      }
    }
  }
  return best;
}

function parseApproxHoursFromTips(tips: string): number | null {
  const m =
    /(?:approx\.?|approximately|približno|circa|etwa|about|~)\s*(\d+(?:[.,]\d+)?)\s*(?:h\b|ur[ae]?|hours?|stunden?)/i.exec(
      tips,
    ) || /\b(\d+(?:[.,]\d+)?)\s*(?:hours?|ur[ae]?|stunden?)\b/i.exec(tips);
  if (!m) return null;
  const n = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 48 ? n : null;
}

function parseDurationToHours(duration: string): number | null {
  const s = duration.trim().toLowerCase();
  const hm = /^(\d+)\s*h(?:\s*(\d+)\s*m(?:in)?)?$/.exec(s);
  if (hm) return Number(hm[1]) + (hm[2] ? Number(hm[2]) / 60 : 0);
  const hOnly = /^(\d+(?:[.,]\d+)?)\s*h$/.exec(s);
  if (hOnly) return Number(String(hOnly[1]).replace(",", "."));
  const minOnly = /^(\d+)\s*m(?:in)?$/.exec(s);
  if (minOnly) return Number(minOnly[1]) / 60;
  return null;
}

function formatHoursDuration(hours: number): string {
  const whole = Math.floor(hours);
  const mins = Math.round((hours - whole) * 60);
  if (mins <= 0) return `${whole}h`;
  if (whole <= 0) return `${mins}min`;
  return `${whole}h ${mins}min`;
}

/**
 * Drop "first metro/RER at 04:50" advice when the flight is early morning —
 * public transit first trains are almost never safe for a 06:00 international departure.
 */
export function scrubUnsafeEarlyAirportTips(plan: AiTripPlan): number {
  let fixed = 0;
  for (const day of plan.days ?? []) {
    const tips = day.transportationTips?.trim();
    if (!tips) continue;
    const departMin = earliestDepartureMinutes(day);
    const earlyByClock = departMin != null && departMin < 8 * 60;
    const earlyByCopy =
      /early\s+(morning\s+)?flight|zgodnj[iae]\s+(jutranj[iae]\s+)?let|frühen?\s+(morgen)?flug|vol\s+(très\s+)?tôt|vuelo\s+temprano/i.test(
        tips,
      ) ||
      /0?[4-6]:\d{2}/.test(tips);
    if (!earlyByClock && !earlyByCopy) continue;

    const next = tips
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        const s = sentence.toLowerCase();
        const mentionsFirstTransit =
          /\b(rer|metro|métro|underground|u-bahn|s-bahn|train|vlak|zug|tren)\b/i.test(s) &&
          /starts?\s+running|začne\s+voziti|erste[rn]?\s+|first\s+|od\s+okoli|around\s+0?[4-5]|ab\s+0?[4-5]|vers\s+0?[4-5]/i.test(
            s,
          );
        const lateForFlight =
          /0?[4-5][:.][0-5]\d/.test(s) &&
          /\b(rer|metro|métro|train|vlak|check-?in|align)/i.test(s);
        const altPublic =
          /alternativ|or\s+take|lahko\s+tudi|če\s+ostajaš|if\s+staying|ensure\s+it\s+aligns/i.test(
            s,
          ) && /\b(rer|metro|métro|train|vlak|underground)\b/i.test(s);
        return !(mentionsFirstTransit || lateForFlight || altPublic);
      })
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;])/g, "$1")
      .trim();

    if (next && next !== tips) {
      day.transportationTips = next;
      fixed += 1;
    } else if (!next && tips) {
      // Fall back to a safe taxi-only tip when we stripped everything.
      const slo = !(plan.contentLanguage && !plan.contentLanguage.startsWith("sl"));
      day.transportationTips = slo
        ? "Za zgodnji jutranji let vnaprej rezerviraj taxi ali Uber/Bolt zvečer prej. Na mednarodni let pridi ~3 ure pred odhodom."
        : "For an early morning flight, pre-book a taxi or Uber/Bolt the night before. Arrive ~3 hours before an international departure.";
      fixed += 1;
    }
  }
  return fixed;
}

/**
 * When transport tips say "~2 hours" but the banner duration says "1h", prefer the tip
 * (LLM often understates the card while writing a correct prose note).
 */
export function alignTransportationDurationWithTips(plan: AiTripPlan): number {
  let fixed = 0;
  for (const day of plan.days ?? []) {
    const tips = day.transportationTips ?? "";
    const tipHours = parseApproxHoursFromTips(tips);
    if (tipHours == null) continue;
    for (const leg of day.transportation ?? []) {
      if (!leg.duration?.trim()) continue;
      const legHours = parseDurationToHours(leg.duration);
      if (legHours == null) continue;
      if (tipHours >= legHours + 0.5) {
        leg.duration = formatHoursDuration(tipHours);
        fixed += 1;
      }
    }
  }
  return fixed;
}

/** Move Tirana museums off the evening slot (they close ~18:00). */
export function relocateClosedEveningSights(plan: AiTripPlan): number {
  let n = 0;
  for (const day of plan.days ?? []) {
    const city = `${day.city ?? ""} ${day.focusName ?? ""}`;
    if (!/tirana|tiranë/i.test(city)) continue;
    const evening = day.activities?.evening ?? [];
    if (!evening.length) continue;
    const move = evening.filter((a) =>
      /bunk.?art|narodni muzej|national museum|galerij|gallery|pyramid|piramid|skanderbeg/i.test(
        `${a.name ?? ""} ${a.description ?? ""}`,
      ),
    );
    if (!move.length) continue;
    const keep = evening.filter((a) => !move.includes(a));
    day.activities = day.activities ?? { morning: [], afternoon: [], evening: [] };
    day.activities.evening = keep;
    day.activities.afternoon = [...(day.activities.afternoon ?? []), ...move];
    n += move.length;
  }
  return n;
}

/** Run all structural guards once (catalog finalize + after flight rewrite). */
export function applyItineraryGuards(
  plan: AiTripPlan,
  opts?: { arrivalDay?: number; language?: string },
): {
  placeholders: number;
  genericMeals: number;
  meals: number;
  arrivals: number;
  clones: number;
  truncated: number;
  logisticsCopy: number;
  transportLegs: number;
  returnFlights: number;
  earlyAirport: number;
  durationAlign: number;
  driveTimes: number;
  homeStays: number;
  balkanTips: number;
  overlongDrives: number;
  hitAndRun: number;
  wrongCity: number;
  templateScrub: number;
} {
  const placeholders = stripPlaceholderActivities(plan);
  dedupeSameDayActivities(plan);
  const wrongCity = stripWrongCityDayActivities(plan);
  const templateScrub = scrubForbiddenTemplateCopy(plan);
  const genericMeals = stripGenericMealActivities(plan);
  if (plan.summary && plan.days?.length) {
    plan.summary = alignSummaryTripLength(plan.summary, plan.days.length);
  }
  const meals = dedupeSameDayMeals(plan);
  const arrivals = stripPhantomArrivals(plan, opts?.arrivalDay ?? 1);
  const clones = dedupeNearIdenticalConsecutiveDays(plan, {
    language: opts?.language ?? plan.contentLanguage,
  });
  const truncated = stripTruncatedCopyFromPlan(plan);
  const logisticsCopy = repairIncompleteLogisticsCopy(plan);
  const transportLegs = sanitizeTransportationLegs(plan);
  const returnFlights = dedupeLastDayReturnFlights(plan);
  const earlyAirport = scrubUnsafeEarlyAirportTips(plan);
  const durationAlign = alignTransportationDurationWithTips(plan);
  const driveTimes = repairImplausibleDriveTimes(plan);
  stripSightseeingOnBrutalDriveDays(plan);
  const overlongDrives = annotateOverlongDriveStages(plan);
  const hitAndRun = annotateHitAndRunStays(plan);
  relocateClosedEveningSights(plan);
  const homeStays = stripHomeboundPaidStays(plan);
  const balkanTips = annotateBalkanRoadTips(plan);
  return {
    placeholders,
    genericMeals,
    meals,
    arrivals,
    clones,
    truncated,
    logisticsCopy,
    transportLegs,
    returnFlights,
    earlyAirport,
    durationAlign,
    driveTimes,
    homeStays,
    balkanTips,
    overlongDrives,
    hitAndRun,
    wrongCity,
    templateScrub,
  };
}
