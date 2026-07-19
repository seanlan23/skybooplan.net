import type { Activity } from "@/lib/aiPlan.functions";
import { ensureBangkokMustSee } from "@/lib/bangkokMustSee";
import { isCentralVietnamFloodDate } from "@/lib/seasonalHints";
import {
  isBeachLoungingPoi,
  isEarlyClosingPoi,
  isEveningOnlyPoi,
  isEveningStrollPoi,
  isNightlifeOnlyPoi,
  isSunsetTemplePoi,
  stripFalseArrivalCopy,
} from "@/lib/tripContent";
import type { TripLocale } from "@/lib/tripLocale";
import {
  rewriteActivityCityLeak,
  rewriteCountryFoodLeak,
  sanitizeDaySlots,
} from "@/lib/textSanitize";

type DaySlots = { morning: Activity[]; afternoon: Activity[]; evening: Activity[] };

function normCity(city: string) {
  return city.toLowerCase().trim();
}

function priceEur(locale: TripLocale, _local: string): string {
  return locale.mealPrice;
}

/** Afternoon sights on heavy inbound travel days (after flight/train into a new city). */
export function buildInboundArrivalAfternoonSights(city: string, locale: TripLocale): Activity[] {
  const slo = locale.slo;
  const c = normCity(city);

  if (c.includes("ayutthaya")) {
    return [
      {
        name: "Wat Phra Si Sanphet",
        type: "SIGHT",
        priceLabel: "50 THB (~1,5 €)",
        description: slo
          ? "Tri stolpične stope — obišči takoj ob prihodu (popoldan 13:00–16:00), pred Wat Mahathat. Vstopnina 50 THB."
          : "Three chedis — visit right after arrival (afternoon 1–4 pm), before Wat Mahathat. 50 THB entry.",
      },
    ];
  }

  if (c.includes("chiang mai")) {
    return [
      {
        name: slo ? "Wat Phra That Doi Suthep" : "Doi Suthep Temple",
        type: "SIGHT",
        priceLabel: "30 THB",
        description: slo
          ? "Popoldanski vzpon na Doi Suthep (pred 17:00) — zlata pagoda in razgled na mesto. Songthaew ali Grab iz hotela."
          : "Afternoon trip to Doi Suthep (before 5 pm) — golden pagoda and city views. Songthaew or Grab from hotel.",
      },
    ];
  }

  return [];
}

/** After rest on arrival day — culture shock + recovery. */
export function buildArrivalEveningCulture(city: string, locale: TripLocale): Activity[] {
  const slo = locale.slo;
  const c = normCity(city);

  if (c.includes("ho chi minh") || c.includes("saigon")) {
    return [
      {
        name: slo ? "District 1 / Ben Thanh Market" : "District 1 / Ben Thanh Market",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: slo
          ? "Po počitku v hotelu večernji sprehod po District 1 in okolici trga Ben Thanh — ulična hrana (pho, banh mi), neon in prvi stik z Vietnamom. Najbolj živahno med 18:00 in 21:00."
          : "After resting, explore District 1 and Ben Thanh Market area — street food, neon, first taste of Vietnam; liveliest 6–9 pm.",
      },
      {
        name: slo ? "Vietnamska masaža" : "Vietnamese massage",
        type: "ACTIVITY",
        priceLabel: locale.massagePrice,
        description: slo
          ? "Po letu 60–90 min tradicionalne masaže v salonu blizu hotela. Rezervacija ni nujna, a pri priljubljenih salonih priporočljiva. Odličen začetek potovanja."
          : "60–90 min traditional massage near your hotel after the flight.",
      },
    ];
  }

  if (c.includes("hanoi")) {
    return [
      {
        name: slo ? "Stara četrt (Old Quarter)" : "Old Quarter",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: slo
          ? "Po počitku večernji sprehod po Old Quarter — ozke ulice, ulična hrana, pivnice z lokalnim pivom. Začni pri jezeru Hoan Kiem."
          : "Evening stroll in the Old Quarter — narrow streets, street food, local beer spots. Start at Hoan Kiem Lake.",
      },
      {
        name: slo ? "Foot massage" : "Foot massage",
        type: "ACTIVITY",
        priceLabel: locale.massagePrice,
        description: slo
          ? "Krajša masaža stopal v enem od salonov v stari četrti — poceni in sproščujoče po potovanju."
          : "Short foot massage in the Old Quarter — cheap and relaxing after travel.",
      },
    ];
  }

  if (c.includes("hoi an")) {
    return [
      {
        name: slo ? "Ancient Town ob mraku" : "Ancient Town at dusk",
        type: "SIGHT",
        priceLabel: slo ? "brezplačno" : "free",
        description: slo
          ? "Po počitku lahek večerni sprehod po Ancient Town — lanterne, kanali, prvi vtis brez gneče dopoldanskega turizma."
          : "Light evening walk through Ancient Town at dusk — lanterns and canals without midday crowds.",
      },
      {
        name: slo ? "Lokalna večerja ob reki" : "Riverside local dinner",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: slo
          ? "Večerja v lokalni restavraciji ob reki Thu Bon — cao lau ali fresh spring rolls. Rezervacija ni nujna."
          : "Dinner at a riverside local spot — cao lau or fresh spring rolls.",
      },
    ];
  }

  if (c.includes("bangkok")) {
    return [
      {
        name: slo ? "Chinatown (Yaowarat)" : "Chinatown (Yaowarat)",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: slo
          ? "Po počitku v hotelu se odpravi v Yaowarat — Bangkokov Chinatown. Neon, dim, ulična hrana. Kulturni šok v najboljšem smislu; najbolj živahno med 18:00 in 22:00. Grab do stacije Wat Mangkon."
          : "After resting, head to Yaowarat — Bangkok's Chinatown. Street food and neon; liveliest 6–10 pm.",
      },
      {
        name: slo ? "Tajska masaža" : "Thai massage",
        type: "ACTIVITY",
        priceLabel: locale.massagePrice,
        description: slo
          ? "Po letu 60–90 min tradicionalne tajske masaže v salonu blizu hotela. Popolna prva večer."
          : "60–90 min traditional Thai massage near your hotel after the flight.",
      },
    ];
  }

  if (c.includes("chiang mai")) {
    return [
      {
        name: slo ? "Night Bazaar / Chiang Mai Gate" : "Night Bazaar",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: slo
          ? "Po prihodu večernji sprehod po nočnem trgu — lokalna hrana, rokodelstvo, sproščena atmosfera."
          : "Evening stroll at the night bazaar — local food and crafts.",
      },
      {
        name: slo ? "Foot massage" : "Foot massage",
        type: "ACTIVITY",
        priceLabel: locale.massagePrice,
        description: slo
          ? "60-min masaža stopal ob stari mestni obzidju — cenejše kot Bangkok, odlično po potovanju."
          : "60-min foot massage near the old city walls.",
      },
    ];
  }

  if (c.includes("phuket") || c.includes("krabi") || c.includes("koh")) {
    return [
      {
        name: slo ? "Večer na plaži / promenadi" : "Beach sunset & promenade",
        type: "ACTIVITY",
        priceLabel: slo ? "brezplačno" : "free",
        description: slo
          ? "Po počitku lahek večerni sprehod ob morju in sončni zahod. Ne planiraj dolgega programa."
          : "Light evening beach walk and sunset after rest.",
      },
      {
        name: slo ? "Seafood večerja" : "Seafood dinner",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: slo
          ? "Restavracija z dnevnim ulovom — sveži morski sadeži, cene odvisno od lokacije."
          : "Fresh-catch seafood dinner — prices vary by area.",
      },
    ];
  }

  const transfer =
    locale.country === "CA" || locale.country === "US"
      ? slo
        ? "peš ali z Uberjem"
        : "on foot or via Uber"
      : locale.country === "TH" ||
          locale.country === "VN" ||
          locale.country === "PH" ||
          locale.country === "ID" ||
          locale.country === "MY" ||
          locale.country === "SG"
        ? slo
          ? "peš ali z Grabom"
          : "on foot or via Grab"
        : slo
          ? "peš ali z lokalnim prevozom"
          : "on foot or local transit";

  return [
    {
      name: slo ? "Večernji sprehod in lokalna večerja" : "Evening stroll & local dinner",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: slo
        ? `Po počitku razišči okolico hotela ${transfer} — prva večerja v lokalni restavraciji. Opazuj ritem mesta brez hitenja.`
        : `After rest, explore near the hotel ${transfer} and have your first local dinner.`,
    },
  ];
}

type PoolContext = {
  phiPhiDone?: boolean;
  intensive?: boolean;
};

type PoolEntry = {
  slot: keyof DaySlots;
  activity: (locale: TripLocale, dayIdx?: number, ctx?: PoolContext) => Activity;
  dayIdx?: number;
};

const HOI_AN_POOL: PoolEntry[] = [
  {
    slot: "morning",
    activity: (locale, dayIdx = 1) => {
      const options = [
        {
          name: locale.slo ? "Ancient Town — japonski most" : "Ancient Town — Japanese Bridge",
          description: locale.slo
            ? "Zgodnji sprehod po starem mestu — japonski most Chùa Cầu brez dopoldanske gneče."
            : "Early old-town stroll — Chùa Cầu bridge before midday crowds.",
        },
        {
          name: locale.slo ? "Tra Que Village — zelišča" : "Tra Que herb village",
          description: locale.slo
            ? "Kolesarski izlet v vas Tra Que — zelišča, riževi njivi in lokalni zajtrk."
            : "Bike to Tra Que — herb gardens, rice fields, local breakfast.",
        },
        {
          name: locale.slo ? "Basket boat v mangrovah" : "Basket boat mangroves",
          description: locale.slo
            ? "Kratka vožnja s košarnimi čolni v mangrovah — tipičen Hoi An, rezerviraj zjutraj."
            : "Short basket-boat ride in the mangroves — classic Hoi An morning trip.",
        },
      ];
      const pick = options[(dayIdx - 1) % options.length]!;
      return { name: pick.name, type: "SIGHT" as const, priceLabel: locale.mealPrice, description: pick.description };
    },
  },
  {
    slot: "afternoon",
    activity: (locale, dayIdx = 1) => {
      const options = [
        {
          name: locale.slo ? "Kuharski tečaj (Hoi An)" : "Cooking class (Hoi An)",
          description: locale.slo
            ? "Tržnica + kuhanje pod streho — odlična popoldanska aktivnost ob vročini ali dežju."
            : "Market tour and indoor cooking — great afternoon when hot or rainy.",
        },
        {
          name: locale.slo ? "Delavnica lampionov" : "Lantern workshop",
          description: locale.slo
            ? "Izdelava svetlečih lampionov v pokriti delavnici v starem mestu."
            : "Lantern-making in a covered old-town workshop.",
        },
        {
          name: locale.slo ? "Reka Thu Bon — vožnja s čolnom" : "Thu Bon river boat",
          description: locale.slo
            ? "Popoldanska vožnja po reki — ribiške vasice in fotogenični sončni zahodi ob vodi."
            : "Afternoon river cruise — fishing villages and waterfront views.",
        },
      ];
      const pick = options[(dayIdx - 1) % options.length]!;
      return {
        name: pick.name,
        type: "ACTIVITY" as const,
        priceLabel: locale.slo ? "15–40 €" : "€15–40",
        description: pick.description,
      };
    },
  },
  {
    slot: "evening",
    activity: (locale, dayIdx = 1) => {
      const options = [
        {
          name: locale.slo ? "Ancient Town ob mraku" : "Ancient Town at dusk",
          description: locale.slo
            ? "Lanterne in ozke ulice ob mraku — brez ponavljanja plažnega dne."
            : "Lanterns and alleys at dusk — not a repeat beach block.",
        },
        {
          name: locale.slo ? "Central Market — večerja" : "Central Market dinner",
          description: locale.slo
            ? "Cao lau ali white rose dumplings na lokalnem trgu — avtentična večerja."
            : "Cao lau or white rose dumplings at the central market.",
        },
        {
          name: locale.slo ? "Riverside BBQ" : "Riverside BBQ",
          description: locale.slo
            ? "Večerja ob reki Thu Bon — sveže morske sadeže ali BBQ, manj turistično kot An Bang."
            : "Thu Bon riverside BBQ — fresh seafood, less touristy than the beach strip.",
        },
      ];
      const pick = options[(dayIdx - 1) % options.length]!;
      return { name: pick.name, type: "EAT" as const, priceLabel: locale.mealPrice, description: pick.description };
    },
  },
];

const VIETNAM_POOL: PoolEntry[] = [
  {
    slot: "morning",
    activity: (locale) => ({
      name: locale.slo ? "Lokalni zajtrk / kava" : "Local breakfast",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: locale.slo
        ? "Začni z pho ali banh mi na uličnem stojalu — poceni, hitro, avtentično. Idealno pred večjimi znamenitostmi."
        : "Start with pho or banh mi at a street stall before major sights.",
    }),
  },
  {
    slot: "afternoon",
    activity: (locale) => ({
      name: locale.slo ? "Pavza v kavarni / klimatiziranem prostoru" : "Café break",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: locale.slo
        ? "Med 12:00 in 15:00 je vroče — planiraj pavzo v kavarni ali nakupovalnem centru. Hladna pijača, načrt za popoldan."
        : "Midday heat break in an air-conditioned café.",
    }),
  },
  {
    slot: "evening",
    activity: (locale) => ({
      name: locale.slo ? "Ulična hrana / nočni trg" : "Street food / night market",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: locale.slo
        ? "Zaključi dan z ulično hrano ali nočnim trgom — lokalno, poceni, živahno. Grab nazaj v hotel."
        : "End the day at a street food stall or night market — Grab back to hotel.",
    }),
  },
];

const PHILIPPINES_POOL: PoolEntry[] = [
  {
    slot: "morning",
    activity: (locale) => ({
      name: locale.slo ? "Filipinski zajtrk (Tapsilog)" : "Filipino breakfast (Tapsilog)",
      type: "EAT",
      priceLabel: priceEur(locale, "80–150 PHP"),
      description: locale.slo
        ? "Začni z tapsilog (sušena govedina, jajce, riž) ali sinangag — lokalni zajtrk, ne vietnamski pho."
        : "Start with tapsilog or sinangag — local Filipino breakfast.",
    }),
  },
  {
    slot: "afternoon",
    activity: (locale) => ({
      name: locale.slo ? "Pavza v klimatiziranem kavarni" : "Air-con café break",
      type: "EAT",
      priceLabel: priceEur(locale, "100–200 PHP"),
      description: locale.slo
        ? "Popoldanska pavza — halo-halo ali kava v mallu; monsun prinaša plohe."
        : "Afternoon break — halo-halo or mall coffee; monsoon showers possible.",
    }),
  },
  {
    slot: "evening",
    activity: (locale) => ({
      name: locale.slo ? "Seafood / night market" : "Seafood / night market",
      type: "EAT",
      priceLabel: priceEur(locale, "200–500 PHP"),
      description: locale.slo
        ? "Večerja z morskimi sadeži ali nočni trg — D'Talipapa (Boracay), Binondo (Manila) ali lokalni BBQ."
        : "Seafood dinner or night market — D'Talipapa, Binondo, or local BBQ.",
    }),
  },
];

const CANADA_POOL: PoolEntry[] = [
  {
    slot: "morning",
    activity: (locale) => ({
      name: locale.slo ? "Lokalni zajtrk / kava" : "Local breakfast",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: locale.slo
        ? "Začni z zajtrkom v lokalni kavarni — idealno pred večjimi znamenitostmi."
        : "Start with breakfast at a local café before major sights.",
    }),
  },
  {
    slot: "afternoon",
    activity: (locale) => ({
      name: locale.slo ? "Pavza v kavarni" : "Café break",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: locale.slo
        ? "Kratka popoldanska pavza — kava, načrt za večer."
        : "Short afternoon café break.",
    }),
  },
  {
    slot: "evening",
    activity: (locale) => ({
      name: locale.slo ? "Lokalna večerja" : "Local dinner",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: locale.slo
        ? "Večerja v restavraciji, kamor hodijo domačini. Uber ali javni prevoz nazaj — Grab v Kanadi ne obstaja."
        : "Dinner where locals eat. Uber or transit back — no Grab in Canada.",
    }),
  },
];

const CITY_DAY_POOLS: Record<string, PoolEntry[]> = {
  canada: CANADA_POOL,
  philippines: PHILIPPINES_POOL,
  bangkok: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: locale.slo ? "Lokalni zajtrk / kava" : "Local breakfast",
        type: "EAT",
        priceLabel: priceEur(locale, "80–150 THB"),
        description: locale.slo
          ? "Začni z jajčnim rižem (khao pad) ali mango sticky rice na uličnem stojalu."
          : "Street breakfast before major sights.",
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: locale.slo ? "Odmor v klimatiziranem kavarni" : "Air-con café break",
        type: "EAT",
        priceLabel: priceEur(locale, "100–200 THB"),
        description: locale.slo
          ? "Med 12:00 in 15:00 je vroče — pavza v kavarni ali nakupovalnem centru."
          : "Midday heat break in air-conditioned café.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Rooftop bar ali večernji trg" : "Rooftop or night market",
        type: "EAT",
        priceLabel: priceEur(locale, "200–600 THB"),
        description: locale.slo
          ? "Zaključi dan z razgledom ali hrano na nočnem trgu. Grab nazaj v hotel."
          : "Rooftop bar or night market to end the day.",
      }),
    },
  ],
  "chiang mai": [
    {
      slot: "morning",
      activity: (locale) => ({
        name: locale.slo ? "Kava v old city" : "Old city coffee",
        type: "EAT",
        priceLabel: priceEur(locale, "80–120 THB"),
        description: locale.slo
          ? "Začni v specialty kavarni v stari mestni coni."
          : "Specialty coffee in the old city.",
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: locale.slo ? "Pavza v Nimman" : "Nimman area break",
        type: "ACTIVITY",
        priceLabel: locale.slo ? "brezplačno" : "free",
        description: locale.slo
          ? "Popoldanski odmor v Nimman Road coni — galerije, klimatizirani prostori."
          : "Afternoon break in Nimman area.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Night Bazaar" : "Night market",
        type: "EAT",
        priceLabel: priceEur(locale, "150–350 THB"),
        description: locale.slo
          ? "Večer na trgu — rokodelstvo, ulična hrana."
          : "Evening market — crafts and street food.",
      }),
    },
  ],
  ayutthaya: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: locale.slo ? "Zgodnji obisk ruševin" : "Early ruins visit",
        type: "SIGHT",
        priceLabel: priceEur(locale, "50–100 THB"),
        description: locale.slo
          ? "Ruševine obišči zjutraj (8:00–11:00). Najem kolesa ali tuk-tuk med lokacijami."
          : "Visit ruins early morning; bike or tuk-tuk between sites.",
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: locale.slo ? "Pavza ob reki + lokalna hrana" : "River lunch break",
        type: "EAT",
        priceLabel: priceEur(locale, "100–250 THB"),
        description: locale.slo
          ? "Popoldanski odmor ob reki — pad thai, počasi."
          : "Lunch by the river — slow pace.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Večernji sprehod med ruševinami" : "Evening ruins walk",
        type: "SIGHT",
        priceLabel: locale.slo ? "brezplačno" : "free",
        description: locale.slo
          ? "Nekateri templji so čudoviti ob sončnem zahodu."
          : "Some temples are stunning at sunset.",
      }),
    },
  ],
  phuket: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: locale.slo ? "Zajtrk ob morju" : "Beach breakfast",
        type: "EAT",
        priceLabel: priceEur(locale, "150–300 THB"),
        description: locale.slo
          ? "Zajtrk v beach café — počasi pred izletom."
          : "Relaxed beach café breakfast.",
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: locale.slo ? "Siesta / bazen" : "Pool siesta",
        type: "ACTIVITY",
        priceLabel: locale.slo ? "vključeno v hotel" : "hotel included",
        description: locale.slo
          ? "Tropska pavza 13:00–16:00 — bazen ali senčnik."
          : "Tropical afternoon pause.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Seafood ali nočni trg" : "Seafood or night market",
        type: "EAT",
        priceLabel: priceEur(locale, "300–700 THB"),
        description: locale.slo
          ? "Večerja z morskimi sadeži ali nočni trg v Phuket Town."
          : "Seafood dinner or Phuket Town night market.",
      }),
    },
  ],
  krabi: [
    {
      slot: "morning",
      activity: (locale, dayIdx, ctx) => ({
        name: locale.slo ? "Zajtrk v Ao Nang" : "Ao Nang breakfast",
        type: "EAT",
        priceLabel: priceEur(locale, "150–300 THB"),
        description: locale.slo
          ? ctx?.phiPhiDone
            ? "Zajtrk ob plaži v Ao Nang — dan za Railay, snorkljanje ali počasen ritem ob morju."
            : dayIdx && dayIdx > 1
              ? "Zajtrk v Ao Nang — dan za Railay, plaže v zalivu ali lokalni izlet z ladjo."
              : "Zajtrk ob plaži v Ao Nang — pred celodnevnim izletom na Phi Phi ali Railay."
          : ctx?.phiPhiDone
            ? "Beach breakfast in Ao Nang — Railay, snorkel, or slow beach day."
            : dayIdx && dayIdx > 1
              ? "Ao Nang breakfast — Railay, bay beaches, or local boat trip."
              : "Beach breakfast before a Phi Phi or Railay day trip.",
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: locale.slo ? "Siesta ob morju" : "Beach siesta",
        type: "ACTIVITY",
        priceLabel: locale.slo ? "brezplačno" : "free",
        description: locale.slo
          ? "Popoldanska pavza v senčniku ali na plaži — tropična vročina."
          : "Afternoon shade or beach pause.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Seafood v Ao Nang" : "Ao Nang seafood",
        type: "EAT",
        priceLabel: priceEur(locale, "300–700 THB"),
        description: locale.slo
          ? "Večerja z morskimi sadeži ob Ao Nang ali nočni trg v Krabiju."
          : "Seafood dinner in Ao Nang or Krabi night market.",
      }),
    },
  ],
  koh_lipe: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: locale.slo ? "Zajtrk na otoku" : "Island breakfast",
        type: "EAT",
        priceLabel: priceEur(locale, "150–300 THB"),
        description: locale.slo
          ? "Počasen zajtrk v beach baru — otok je majhen, brez naglice."
          : "Slow island beach breakfast.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Walking Street" : "Walking Street dinner",
        type: "EAT",
        priceLabel: priceEur(locale, "300–600 THB"),
        description: locale.slo
          ? "Večerja na Walking Street — morski sadeži in ulična hrana na Koh Lipeju."
          : "Walking Street seafood and street food on Koh Lipe.",
      }),
    },
  ],
  vietnam: VIETNAM_POOL,
  hoi_an: HOI_AN_POOL,
  europe: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: locale.slo ? "Jutranji sprehod do prve znamenitosti" : "Morning walk to first sight",
        type: "ACTIVITY",
        priceLabel: locale.slo ? "brezplačno" : "free",
        description: locale.slo
          ? "Peš ali z javnim prevozom do prve točke dneva — mesto je zjutraj mirnejše in bolj fotogenično."
          : "Walk or take transit to your first stop — cities are calmer and photogenic in the morning.",
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: locale.slo ? "Pavza na trgu / v parku" : "Square or park break",
        type: "ACTIVITY",
        priceLabel: locale.slo ? "brezplačno" : "free",
        description: locale.slo
          ? "Popoldanski odmor na glavnem trgu ali v mestnem parku — people-watching in počasnejši ritem."
          : "Afternoon pause on a main square or in a city park.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Aperitivo / lokalna večerja" : "Aperitivo / local dinner",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Večerja v bistru ali trattorii, kamor hodijo domačini — rezervacija pri priljubljenih krajih."
          : "Dinner at a bistro or trattoria where locals eat.",
      }),
    },
  ],
  americas: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: locale.slo ? "Jutranji sprehod / kava pred ogledom" : "Morning walk & coffee",
        type: "ACTIVITY",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Kratek sprehod po okolici hotela in kava na poti — orientacija pred glavnim ogledom dopoldan."
          : "Short neighbourhood walk and coffee on the way to your main morning sight.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Večerja v soseski" : "Neighbourhood dinner",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Večerja izven glavnih turističnih ulic — boljše cene in vzdušje."
          : "Dinner off the main tourist strips.",
      }),
    },
  ],
  safari: [
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: locale.slo ? "Siesta v tented campu / lodge" : "Camp / lodge siesta",
        type: "ACTIVITY",
        priceLabel: locale.slo ? "vključeno v nastanitev" : "included in lodge",
        description: locale.slo
          ? "Popoldanski odmor v kampu med game drives — senca, bazen (če je), priprava na večernji safari. V divjini ni mestnih kavarn."
          : "Afternoon rest at camp between game drives — no city cafés in the bush.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Večerja in campfire v kampu" : "Camp dinner & campfire",
        type: "EAT",
        priceLabel: "25–50 €",
        description: locale.slo
          ? "Večerja v lodge ali tented campu — pogosto boma dinner z lokalno kuhinjo. Večerni game drive po dogovoru z vodnikom."
          : "Lodge dinner — often boma style; optional evening game drive with your guide.",
      }),
    },
  ],
  zanzibar: [
    {
      slot: "evening",
      activity: (locale, dayIdx) => ({
        name: locale.slo ? "Forodhani Night Market (Stone Town)" : "Forodhani Night Market",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Večernja ulična hrana na Forodhani — zanzibarski pizza, seafood skewers, sok. Najbolj živahno ob sončnem zahodu, ko se tržnica oživi."
          : "Street food at Forodhani — Zanzibar pizza, seafood; liveliest at sunset.",
      }),
      dayIdx: 0,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "The Rock Restaurant (Pingwe)" : "The Rock Restaurant",
        type: "EAT",
        priceLabel: "35–60 €",
        description: locale.slo
          ? "Ikonična restavracija na skali ob plimi — rezervacija obvezna. Idealno po dnevu na vzhodni obali (Paje/Matemwe)."
          : "Iconic rock restaurant — reservation required; best after an east-coast day.",
      }),
      dayIdx: 1,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Seafood na severni obali (Nungwi)" : "Nungwi seafood dinner",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Sveži morski sadeži v Nungwi po dnevu na severu — lobster, prawns, ugali. Plačaj po teži."
          : "Fresh catch dinner in Nungwi after a north-beach day.",
      }),
      dayIdx: 2,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Kizimkazi — večer ob plaži" : "Kizimkazi beach dinner",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Lahka večerja ob južni obali po delfinarnem ali plažnem dnevu — počasen ritem, lokalni gostilni."
          : "Relaxed southern beach dinner after a Kizimkazi day.",
      }),
      dayIdx: 3,
    },
  ],
  los_angeles: [
    {
      slot: "evening",
      activity: (locale, dayIdx) => ({
        name: locale.slo ? "Grand Central Market" : "Grand Central Market",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Večer v Grand Central Market (Downtown) — Eggslut, tacos, lokalni ponudniki pod eno streho. Odlično po dnevu v centru."
          : "Evening at Grand Central Market — Eggslut, tacos, local vendors under one roof.",
      }),
      dayIdx: 0,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Republique (Mid-Wilshire)" : "Republique",
        type: "EAT",
        priceLabel: "25–45 €",
        description: locale.slo
          ? "Francosko-kalifornijska kuhinja v lepi stavbi — rezervacija priporočljiva za večer. Parkiranje prek valet ali Uber."
          : "French-Californian in a stunning building — reserve for dinner; Uber recommended.",
      }),
      dayIdx: 1,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Guelaguetza (Oaxacan)" : "Guelaguetza",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Avtentična oaxaška kuhinja v Koreatown — mole, tlayudas. Živahno in lokalno."
          : "Authentic Oaxacan in Koreatown — mole, tlayudas; lively local spot.",
      }),
      dayIdx: 2,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Santa Monica Pier / Third Street Promenade" : "Santa Monica evening",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Večer ob morju — seafood ali burger na promenadi, sončni zahod na molo. Idealno po dnevu na zahodni obali."
          : "Beach evening — seafood or burgers on the promenade after a Westside day.",
      }),
      dayIdx: 3,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Bestia (Arts District)" : "Bestia",
        type: "EAT",
        priceLabel: "35–55 €",
        description: locale.slo
          ? "Priljubljena italijanska v Arts District — rezervacija tedne vnaprej. Uber, ne vozite sami."
          : "Popular Italian in Arts District — book weeks ahead; Uber strongly recommended.",
      }),
      dayIdx: 4,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "In-N-Out Burger (Hollywood)" : "In-N-Out Hollywood",
        type: "EAT",
        priceLabel: "8–15 €",
        description: locale.slo
          ? "Kalifornijska ikona po dnevu v Hollywoodu — hitro, poceni, avtentično. Not secret menu."
          : "California icon after a Hollywood day — fast, cheap, authentic.",
      }),
      dayIdx: 5,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Malibu Farm Pier Cafe" : "Malibu Farm Pier Cafe",
        type: "EAT",
        priceLabel: "20–40 €",
        description: locale.slo
          ? "Večerja na koncu Malibu Pira — sveže, ob morju. Idealno po dnevu na PCH; rezervacija priporočljiva."
          : "Dinner at Malibu Pier — fresh, oceanfront; ideal after a PCH day.",
      }),
      dayIdx: 6,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "The Original Farmers Market" : "Farmers Market",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Večer v Farmers Market ob The Grove — raznolika hrana, lokalno vzdušje, manj turistično kot Hollywood Blvd."
          : "Evening at Farmers Market by The Grove — varied food, local vibe.",
      }),
      dayIdx: 7,
    },
  ],
  generic: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: locale.slo ? "Jutranji ogled / sprehod" : "Morning sight or stroll",
        type: "ACTIVITY",
        priceLabel: locale.slo ? "brezplačno" : "free",
        description: locale.slo
          ? "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj."
          : "Main morning sight — visit while it's still quiet.",
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: locale.slo ? "Pavza v kavarni" : "Café break",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Kratka popoldanska pavza — kava, načrt za večer."
          : "Short afternoon café break.",
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: locale.slo ? "Lokalna večerja" : "Local dinner",
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: locale.slo
          ? "Večerja v restavraciji, kamor hodijo domačini."
          : "Dinner where locals eat.",
      }),
    },
  ],
};

const EUROPE = new Set(["IT", "FR", "DE", "ES", "PT", "AT", "CH", "SI", "GR", "GB"]);
const AMERICAS = new Set(["US", "MX", "BR", "AR"]);
const SEA_GRAB = new Set(["TH", "VN", "PH", "ID", "MY", "SG"]);

function poolKey(city: string, country: string, destinationIata?: string): string {
  const c = normCity(city);
  if (/serengeti|ngorongoro|manyara|tarangire/i.test(c)) return "safari";
  if (/zanzibar|stone town|nungwi|kendwa|paje|kizimkazi/i.test(c)) return "zanzibar";
  if (
    country === "US" &&
    (destinationIata?.toUpperCase() === "LAX" ||
      /los angeles|hollywood|santa monica|malibu|venice|beverly/.test(c))
  ) {
    return "los_angeles";
  }
  if (c.includes("hoi an")) return "hoi_an";
  if (
    country === "VN" ||
    /ho chi minh|saigon|hanoi|hue|da nang|ha long|nha trang|phu quoc|mekong/.test(c)
  ) {
    return "vietnam";
  }
  if (c.includes("bangkok")) return "bangkok";
  if (c.includes("chiang mai")) return "chiang mai";
  if (c.includes("koh lipe") || c.includes("lipe")) return "koh_lipe";
  if (c.includes("krabi") || c.includes("ao nang") || c.includes("railay")) return "krabi";
  if (c.includes("phuket") || c.includes("patong") || c.includes("kata")) return "phuket";
  if (c.includes("ayutthaya")) return "ayutthaya";
  if (
    country === "PH" ||
    /manila|boracay|el nido|palawan|cebu|bohol|siquijor|siargao/i.test(c)
  ) {
    return "philippines";
  }
  if (SEA_GRAB.has(country)) return country === "TH" ? "bangkok" : "vietnam";
  if (
    country === "CA" ||
    /toronto|vancouver|ottawa|banff|niagara|calgary|montreal|quebec/.test(c)
  ) {
    return "canada";
  }
  if (EUROPE.has(country)) return "europe";
  if (AMERICAS.has(country) || country === "AU") return "americas";
  if (country === "JP" || country === "KR") return "generic";
  return "generic";
}

function pickRotatingEvening(
  pool: PoolEntry[],
  dayIndexInRegion: number,
  locale: TripLocale,
): Activity {
  const evenings = pool.filter((e) => e.slot === "evening");
  const idx = (dayIndexInRegion - 1) % evenings.length;
  const entry = evenings[idx] ?? evenings[0]!;
  return entry.activity(locale, dayIndexInRegion);
}

type ZanzibarZone = "north" | "east" | "south" | "stone";

function inferZanzibarZone(slots: DaySlots, highlightNames: string[]): ZanzibarZone {
  const text = [
    ...highlightNames,
    ...slots.morning,
    ...slots.afternoon,
    ...slots.evening,
  ]
    .map((x) => (typeof x === "string" ? x : `${x.name} ${x.description}`))
    .join(" ")
    .toLowerCase();

  if (/kizimkazi|dolphin|south/i.test(text)) return "south";
  if (/nungwi|kendwa/i.test(text)) return "north";
  if (/jozani|paje|matemwe|rock|pingwe|east/i.test(text)) return "east";
  if (/stone town|forodhani/i.test(text)) return "stone";
  return "stone";
}

/** Venue key for cross-day dedup (The Rock only once per trip). */
export function eveningVenueKey(name: string): string {
  const n = normalizeActKey(name);
  if (/rock/i.test(n)) return "the-rock";
  if (/forodhani/i.test(n)) return "forodhani";
  if (/nungwi/i.test(n)) return "nungwi";
  if (/kizimkazi/i.test(n)) return "kizimkazi";
  if (/paje|matemwe/i.test(n)) return "east-beach";
  if (/night bazaar|nočni bazar/i.test(n)) return "night-bazaar";
  if (/chinatown|yaowarat/i.test(n)) return "chinatown";
  if (/asiatique/i.test(n)) return "asiatique";
  if (/chang phuak/i.test(n)) return "chang-phuak";
  if (/nimman/i.test(n)) return "nimman-evening";
  return n.slice(0, 40);
}

function pickChiangMaiEvening(
  locale: TripLocale,
  dayIndexInRegion: number,
  usedVenues: Set<string>,
): Activity {
  const slo = locale.slo;
  const options: Array<{ key: string; activity: Activity }> = [
    {
      key: "night-bazaar",
      activity: {
        name: slo ? "Chiang Mai Night Bazaar" : "Chiang Mai Night Bazaar",
        type: "EAT",
        priceLabel: priceEur(locale, "150–350 THB"),
        description: slo
          ? "Večer na nočnem trgu — rokodelstvo, spominki, ulična hrana. Najbolj živahno 18:00–22:00."
          : "Evening at the night bazaar — crafts, souvenirs, street food; liveliest 6–10 pm.",
      },
    },
    {
      key: "chang-phuak",
      activity: {
        name: slo ? "Ulična hrana pri Chang Phuak Gate" : "Street food at Chang Phuak Gate",
        type: "EAT",
        priceLabel: priceEur(locale, "80–200 THB"),
        description: slo
          ? "Večer ob severnih vratih starega mesta — lokalna ulična hrana, manj turistično kot Night Bazaar."
          : "Evening street food at the north gate — local stalls, less touristy than the Night Bazaar.",
      },
    },
    {
      key: "nimman-evening",
      activity: {
        name: slo ? "Nimman Road — večerni sprehod" : "Nimman Road evening stroll",
        type: "ACTIVITY",
        priceLabel: slo ? "brezplačno" : "free",
        description: slo
          ? "Sproščen večer v četrti Nimman — kavarne, galerije, butične trgovine. Grab ali songthaew iz starega mesta."
          : "Relaxed evening in Nimman — cafés, galleries, boutiques. Grab or songthaew from the old city.",
      },
    },
  ];

  const order = [0, 1, 2].map((i) => (i + dayIndexInRegion - 1) % options.length);
  for (const idx of order) {
    const opt = options[idx]!;
    if (!usedVenues.has(opt.key)) return opt.activity;
  }
  return options[1]!.activity;
}

function zanzibarEveningFallback(zone: ZanzibarZone, locale: TripLocale): Activity {
  const slo = locale.slo;
  const fallbacks: Record<ZanzibarZone, Activity> = {
    north: {
      name: slo ? "Lokalna večerja ob plaži (Nungwi/Kendwa)" : "Beach dinner (north coast)",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: slo
        ? "Sproščena večerja v lokalni gostilni ob severni obali — sveži morski sadeži, brez dolge vožnje."
        : "Relaxed local beach dinner on the north coast.",
    },
    east: {
      name: slo ? "Lokalna večerja ob plaži (Paje/Matemwe)" : "Beach dinner (east coast)",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: slo
        ? "Večer v eni od plažnih restavracij na vzhodni obali — blizu Paje, brez vožnje do The Rock."
        : "Evening at an east-coast beach restaurant near Paje.",
    },
    south: {
      name: slo ? "Lokalna večerja ob južni obali" : "South coast beach dinner",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: slo
        ? "Lahka večerja v lokalni gostilni blizu Kizimkazija — ostani v isti coni kot popoldanski program."
        : "Light dinner at a local spot near Kizimkazi.",
    },
    stone: {
      name: slo ? "Lokalna večerja v Stone Townu" : "Stone Town local dinner",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: slo
        ? "Večerja v manj turistični restavraciji v Stone Townu — blizu hotela, peš ali s tuk-tukom."
        : "Dinner at a less touristy Stone Town restaurant near your stay.",
    },
  };
  return fallbacks[zone];
}

function pickZanzibarEveningByZone(
  pool: PoolEntry[],
  zone: ZanzibarZone,
  locale: TripLocale,
  dayIndexInRegion: number,
  usedVenues: Set<string>,
): Activity {
  const evenings = pool.filter((e) => e.slot === "evening");
  const zoneOrder: RegExp[] =
    zone === "north"
      ? [/nungwi/i]
      : zone === "east"
        ? [/rock/i]
        : zone === "south"
          ? [/kizimkazi/i]
          : [/forodhani/i];

  for (const re of zoneOrder) {
    const entry = evenings.find((e) => re.test(e.activity(locale).name));
    if (!entry) continue;
    const act = entry.activity(locale, dayIndexInRegion);
    const key = eveningVenueKey(act.name);
    if (!usedVenues.has(key)) return act;
  }

  return zanzibarEveningFallback(zone, locale);
}

function hasNameInSlot(slot: Activity[], name: string): boolean {
  const key = normalizeActKey(name);
  return slot.some((a) => normalizeActKey(a.name) === key);
}

function eveningNeedsFill(evening: Activity[]): boolean {
  return evening.length === 0 || evening.every((a) => !a.name?.trim());
}

function countActivities(slots: DaySlots): number {
  return slots.morning.length + slots.afternoon.length + slots.evening.length;
}

function normalizeActKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSimilar(slots: DaySlots, name: string): boolean {
  const key = normalizeActKey(name);
  const all = [...slots.morning, ...slots.afternoon, ...slots.evening];
  return all.some((a) => {
    const ak = normalizeActKey(a.name);
    return ak === key || ak.includes(key) || key.includes(ak);
  });
}

function isWeakFillerActivity(a: Activity): boolean {
  const t = `${a.name} ${a.description}`.toLowerCase();
  return (
    (/pavza v kavarni|café break|air-con café|klimatiziran|siesta|bazen|pool siesta|odmor v klimatiziranem/i.test(
      t,
    ) ||
      /ulična hrana \/ nočni trg|street food \/ night market/i.test(a.name)) &&
    a.type !== "SIGHT"
  );
}

function stripWeakFillers(slots: DaySlots): DaySlots {
  const keep = (list: Activity[]) => list.filter((a) => !isWeakFillerActivity(a));
  return {
    morning: keep(slots.morning),
    afternoon: keep(slots.afternoon),
    evening: keep(slots.evening),
  };
}

function weakFillerUsedInPriorDays(priorText: string): boolean {
  return /pavza v kavarni|klimatiziranem prostoru|ulična hrana \/ nočni trg/i.test(priorText);
}

function slotHasRealSight(slot: Activity[]): boolean {
  return slot.some((a) => a.type === "SIGHT" || /wat |temple|palace|museum|znamenit/i.test(a.name));
}

function hasSimilarName(slots: DaySlots, needle: RegExp): boolean {
  const all = [...slots.morning, ...slots.afternoon, ...slots.evening];
  return all.some((a) => needle.test(`${a.name} ${a.description}`));
}

function stripFromSlots(slots: DaySlots, needle: RegExp): DaySlots {
  const drop = (list: Activity[]) =>
    list.filter((a) => !needle.test(`${a.name} ${a.description}`));
  return {
    morning: drop(slots.morning),
    afternoon: drop(slots.afternoon),
    evening: drop(slots.evening),
  };
}

function hoiAnIndoorRainBackup(locale: TripLocale): Activity[] {
  const slo = locale.slo;
  return [
    {
      name: slo ? "Kuharski tečaj (Hoi An)" : "Cooking class (Hoi An)",
      type: "ACTIVITY",
      priceLabel: slo ? "25–45 €" : "€25–45",
      description: slo
        ? "Deževna rezerva — tržnica in lokalna kuhinja pod streho; pri poplavah je bolj zanesljivo kot plaža."
        : "Rainy-day backup — market tour and indoor cooking; more reliable than the beach during floods.",
    },
    {
      name: slo ? "Delavnica lampionov" : "Lantern-making workshop",
      type: "ACTIVITY",
      priceLabel: slo ? "8–15 €" : "€8–15",
      description: slo
        ? "Pokrita delavnica v starem mestu — izdelava svetlečih lampionov, tipičen Hoi An pod streho ob dežju."
        : "Covered old-town workshop — make silk lanterns, classic rainy-day Hoi An activity.",
    },
  ];
}

function isHanoiReturnFromHaLong(priorText: string, dayInRegion: number, city: string): boolean {
  return (
    normCity(city).includes("hanoi") &&
    dayInRegion === 1 &&
    /ha long|halong|križark|cruise/i.test(priorText)
  );
}

/** Hanoi return from Ha Long + HCMC day-3+ timing fixes. */
function fixVietnamDaySlots(
  slots: DaySlots,
  city: string,
  dayIndexInRegion: number,
  locale: TripLocale,
  opts?: {
    priorScheduledText?: string;
    isTripDay1?: boolean;
    isArrivalDay?: boolean;
    tripDate?: string;
  },
): DaySlots {
  const c = normCity(city);
  const slo = locale.slo;
  let result = { ...slots };

  const fromHaLong = isHanoiReturnFromHaLong(
    opts?.priorScheduledText ?? "",
    dayIndexInRegion,
    city,
  );

  if (c.includes("hanoi") && fromHaLong) {
    const biaHoiRe = /bia hoi|biahoi/i;
    const pulled: Activity[] = [];
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const a of result[slot]) {
        if (biaHoiRe.test(`${a.name} ${a.description}`)) pulled.push(a);
      }
      result[slot] = result[slot].filter((a) => !biaHoiRe.test(`${a.name} ${a.description}`));
    }
    const biaHoi: Activity = pulled[0] ?? {
      name: "Bia Hoi Junction",
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: slo
        ? "Legendarno križišče poceni piva — živahen šele po 18:00. Plastični stoli in ulična hrana; klasičen večerni Hanoi."
        : "Legendary cheap-beer corner — lively after 6 pm only. Plastic stools and street food.",
    };
    if (!hasSimilarName(result, biaHoiRe)) {
      result.evening = [
        {
          ...biaHoi,
          description: slo
            ? "Legendarno križišče poceni piva — živahen šele po 18:00. Plastični stoli in ulična hrana; klasičen večerni Hanoi."
            : "Legendary cheap-beer corner — lively after 6 pm only.",
        },
        ...result.evening,
      ].slice(0, 2);
    }

    const hasHoanAfternoon = [...result.morning, ...result.afternoon].some((a) =>
      /hoan kiem|ngoc son|jezero hoan/i.test(a.name),
    );
    if (!hasHoanAfternoon) {
      result.afternoon = [
        {
          name: slo ? "Jezero Hoan Kiem & tempelj Ngoc Son" : "Hoan Kiem Lake & Ngoc Son Temple",
          type: "SIGHT",
          priceLabel: slo ? "30 000 VND (~1 €)" : "30,000 VND (~€1)",
          description: slo
            ? "Sproščen popoldanski sprehod okoli jezera — rdeči most Thê Húc, pagoda Ngoc Son. Po prevozu z Ha Longa je to prijeten, lahek tempo."
            : "Relaxed afternoon lake stroll — Ngoc Son Temple. Easy pace after the Ha Long transfer.",
        },
        ...result.afternoon,
      ].slice(0, 2);
    }

    result.evening = result.evening.filter(
      (a) => !/old quarter|stara četrt/i.test(`${a.name} ${a.description}`),
    );
  }

  if (c.includes("ho chi minh") || c.includes("saigon")) {
    const notFirstArrival =
      !opts?.isTripDay1 && !opts?.isArrivalDay && dayIndexInRegion > 1;
    const badAfternoonPopoldan =
      notFirstArrival &&
      slots.afternoon.some((a) => /ben thanh|bitexco/i.test(`${a.name} ${a.description}`));
    if (notFirstArrival) {
      const cleanDesc = (a: Activity) => ({
        ...a,
        description: stripFalseArrivalCopy(a.description ?? ""),
      });
      result = {
        morning: result.morning.map(cleanDesc),
        afternoon: result.afternoon.map(cleanDesc),
        evening: result.evening.map(cleanDesc),
      };
      result = stripFromSlots(result, /ben thanh/i);
    }

    const bitexcoRe = /bitexco/i;
    const cafeApartments: Activity = {
      name: slo ? "Cafe Apartments (Nguyen Hue)" : "Cafe Apartments (Nguyen Hue)",
      type: "SIGHT",
      priceLabel: slo ? "brezplačno" : "free",
      description: slo
        ? "Zgodovinska stavba z balkoni nad peš cono Nguyen Hue — kavarne, butične trgovine in opazovanje lokalnega življenja. Popoldanski sprehod brez hitenja."
        : "Historic balconied building on Nguyen Hue Walking Street — cafés, boutiques, people-watching.",
    };
    if (
      badAfternoonPopoldan ||
      result.afternoon.some((a) => bitexcoRe.test(`${a.name} ${a.description}`))
    ) {
      result.afternoon = result.afternoon
        .filter(
          (a) =>
            !bitexcoRe.test(`${a.name} ${a.description}`) &&
            !/ben thanh/i.test(`${a.name} ${a.description}`),
        )
        .concat(cafeApartments)
        .slice(0, 2);
    }

    const strollToEvening: Activity[] = [];
    for (const slot of ["morning", "afternoon"] as const) {
      for (const a of result[slot]) {
        const text = `${a.name} ${a.description ?? ""}`;
        if (
          isEveningStrollPoi(a.name, a.description ?? "") ||
          (/nguyen hue|walking street|pešcona/i.test(text) &&
            /večern|evening|prvi večer/i.test(text))
        ) {
          strollToEvening.push(a);
        }
      }
      result[slot] = result[slot].filter((a) => {
        const text = `${a.name} ${a.description ?? ""}`;
        return !(
          isEveningStrollPoi(a.name, a.description ?? "") ||
          (/nguyen hue|walking street|pešcona/i.test(text) &&
            /večern|evening|prvi večer/i.test(text))
        );
      });
    }
    for (const a of strollToEvening) {
      if (!hasSimilarName(result, /nguyen hue|walking street/i)) {
        result.evening = [{ ...a, type: a.type ?? "SIGHT" }, ...result.evening].slice(0, 2);
      }
    }
  }

  if (c.includes("hoi an")) {
    const prior = opts?.priorScheduledText ?? "";
    const anBangPrior = /an bang/i.test(prior);
    const stripAnBangDup = (list: Activity[]) =>
      list.filter((a) => {
        if (!/an bang/i.test(`${a.name} ${a.description}`)) return true;
        return !anBangPrior;
      });
    result = {
      morning: stripAnBangDup(result.morning),
      afternoon: stripAnBangDup(result.afternoon),
      evening: stripAnBangDup(result.evening),
    };
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      const beaches = result[slot].filter((a) => isBeachLoungingPoi(a.name, a.description ?? ""));
      if (beaches.length > 1) {
        const keep = beaches[0]!;
        result[slot] = result[slot].filter(
          (a) => !isBeachLoungingPoi(a.name, a.description ?? "") || a === keep,
        );
      }
    }
    if (result.evening.some((a) => isBeachLoungingPoi(a.name, a.description ?? ""))) {
      result.morning = result.morning.filter(
        (a) => !isBeachLoungingPoi(a.name, a.description ?? ""),
      );
    }
  }

  if (c.includes("hoi an") && opts?.tripDate && isCentralVietnamFloodDate(opts.tripDate)) {
    const hadBeach = [...result.morning, ...result.afternoon, ...result.evening].some((a) =>
      isBeachLoungingPoi(a.name, a.description ?? ""),
    );
    result = {
      morning: result.morning.filter((a) => !isBeachLoungingPoi(a.name, a.description ?? "")),
      afternoon: result.afternoon.filter((a) => !isBeachLoungingPoi(a.name, a.description ?? "")),
      evening: result.evening.filter((a) => !isBeachLoungingPoi(a.name, a.description ?? "")),
    };
    if (hadBeach || result.afternoon.length === 0) {
      const indoor = hoiAnIndoorRainBackup(locale);
      result.afternoon = [...indoor.slice(0, 1), ...result.afternoon].slice(0, 2);
      if (result.evening.length < 2) {
        result.evening = [...result.evening, indoor[1]!].slice(0, 2);
      }
    }
  }

  const moveEvening: Activity[] = [];
  for (const slot of ["morning", "afternoon"] as const) {
    for (const a of result[slot]) {
      if (
        isNightlifeOnlyPoi(a.name, a.description ?? "") ||
        isEveningOnlyPoi(a.name, a.description ?? "")
      ) {
        moveEvening.push(a);
      }
    }
    result[slot] = result[slot].filter(
      (a) =>
        !isNightlifeOnlyPoi(a.name, a.description ?? "") &&
        !isEveningOnlyPoi(a.name, a.description ?? ""),
    );
  }
  for (const a of moveEvening) {
    if (!hasSimilarName(result, new RegExp(a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))) {
      result.evening.push(a);
    }
  }
  result.evening = result.evening.slice(0, 2);

  return result;
}

/** Pad sparse days to feel like a full dopoldan / popoldan / večer plan. */
export function enrichDayActivities(
  slots: DaySlots,
  city: string,
  dayIndexInRegion: number,
  locale: TripLocale,
  opts?: {
    isTripDay1?: boolean;
    isArrivalDay?: boolean;
    skipEveningCulture?: boolean;
    /** Landing ≥18:00 or next calendar day — no morning/afternoon fillers. */
    lateArrival?: boolean;
    /** Midday/afternoon landing — max 1 light evening add-on, no filler spam. */
    tightArrivalDay?: boolean;
    /** Which day-part matches real landing (from flight times). */
    arrivalSlot?: "morning" | "afternoon" | "evening";
    /** Red-eye landing (e.g. 01:35) — recovery first, no museums before rest. */
    redEyeArrival?: boolean;
    destinationIata?: string;
    /** Named skeleton sights already assigned to this day. */
    plannedSights?: number;
    dayHighlightNames?: string[];
    /** Cross-day venue dedup (e.g. The Rock only once). Mutated in place. */
    usedEveningVenues?: Set<string>;
    paceLabel?: string;
    /** Phi Phi / Maya Bay already scheduled earlier in the trip. */
    phiPhiExcursionDone?: boolean;
    /** After long inter-city hop — light evening only. */
    inboundTravelDay?: boolean;
    /** Highlights on earlier calendar days only (Bangkok must-see dedup). */
    priorScheduledText?: string;
    /** YYYY-MM-DD for seasonal swaps (Hoi An monsoon). */
    tripDate?: string;
  },
): DaySlots {
  let result = {
    morning: [...slots.morning],
    afternoon: [...slots.afternoon],
    evening: [...slots.evening],
  };

  if (opts?.isTripDay1 && !opts.skipEveningCulture) {
    const slimEvening = opts.lateArrival || opts.tightArrivalDay;
    const culture = slimEvening
      ? buildArrivalEveningCulture(city, locale).slice(0, 1)
      : buildArrivalEveningCulture(city, locale);
    for (const act of culture) {
      if (!hasSimilar(result, act.name)) {
        result.evening.push(act);
      }
    }
    if (slimEvening) {
      result.evening = result.evening.slice(0, 2);
    } else if (!isLateSightsDay1(result)) {
      result.afternoon = result.afternoon.slice(0, 1);
    }
  } else if (opts?.isArrivalDay && !opts?.isTripDay1) {
    const skipHanoiDup =
      isHanoiReturnFromHaLong(opts?.priorScheduledText ?? "", dayIndexInRegion, city);
    if (!skipHanoiDup) {
      const culture = buildArrivalEveningCulture(city, locale).slice(0, 1);
      for (const act of culture) {
        if (!hasSimilar(result, act.name)) result.evening.push(act);
      }
    }
  }

  if (opts?.lateArrival || opts?.tightArrivalDay || opts?.redEyeArrival) {
    const slot = opts.arrivalSlot ?? (opts.lateArrival ? "evening" : "afternoon");
    // Never invent breakfast / siesta before the plane lands.
    if (slot === "evening" || opts.lateArrival) {
      result.morning = [];
      result.afternoon = [];
    } else if (slot === "afternoon") {
      result.morning = [];
    }
    result.morning = result.morning.filter((a) => !isPreArrivalFiller(a));
    result.afternoon = result.afternoon.filter((a) => !isPreArrivalFiller(a));
    if (normCity(city).includes("bangkok")) {
      result.morning = result.morning.filter(
        (a) => !isEarlyClosingPoi(a.name, a.description ?? ""),
      );
      result.afternoon = result.afternoon.filter(
        (a) => !isEarlyClosingPoi(a.name, a.description ?? ""),
      );
      result.evening = result.evening.filter(
        (a) => !isEarlyClosingPoi(a.name, a.description ?? ""),
      );
    }
    return sanitizeDaySlots(result, locale.langCode, locale.country, city);
  }

  if (opts?.inboundTravelDay) {
    for (const act of buildInboundArrivalAfternoonSights(city, locale)) {
      if (!hasSimilar(result, act.name)) result.afternoon.push(act);
    }
    const culture = buildArrivalEveningCulture(city, locale).slice(0, 1);
    for (const act of culture) {
      if (!hasSimilar(result, act.name)) result.evening.push(act);
    }
    const pk = poolKey(city, locale.country, opts?.destinationIata);
    if (pk === "vietnam" || pk === "hoi_an") {
      result = fixVietnamDaySlots(result, city, dayIndexInRegion, locale, {
        priorScheduledText: opts?.priorScheduledText,
        isTripDay1: opts?.isTripDay1,
        isArrivalDay: opts?.isArrivalDay,
        tripDate: opts?.tripDate,
      });
    }
    return sanitizeDaySlots(result, locale.langCode, locale.country, city);
  }

  const intensive = opts?.paceLabel === "intensive";
  const poolCtx: PoolContext = { phiPhiDone: opts?.phiPhiExcursionDone, intensive };
  const poolKeyName = poolKey(city, locale.country, opts?.destinationIata);
  const pool = CITY_DAY_POOLS[poolKeyName] ?? CITY_DAY_POOLS.generic;
  const plannedSights = opts?.plannedSights ?? 0;
  const hasMainSight = result.morning.some((a) => a.type === "SIGHT") ||
    result.afternoon.some((a) => a.type === "SIGHT" || /universal|studios/i.test(a.name));
  const isLaSprawl = poolKeyName === "los_angeles";
  const isSafari = poolKeyName === "safari";
  const isZanzibar = poolKeyName === "zanzibar";

  if (isSafari) {
    if (result.afternoon.length === 0) {
      const siesta = pool.find((e) => e.slot === "afternoon");
      if (siesta) {
        const act = siesta.activity(locale, dayIndexInRegion);
        if (!hasSimilar(result, act.name)) result.afternoon.push(act);
      }
    }
    if (result.evening.length === 0) {
      const dinner = pool.find((e) => e.slot === "evening");
      if (dinner) {
        const act = dinner.activity(locale, dayIndexInRegion);
        if (!hasSimilar(result, act.name)) result.evening.push(act);
      }
    }
    return sanitizeDaySlots(result, locale.langCode, locale.country, city);
  }

  if (isZanzibar) {
    result.evening = result.evening.filter((a) => Boolean(a.name?.trim()));
    if (eveningNeedsFill(result.evening)) {
      const used = opts?.usedEveningVenues ?? new Set<string>();
      const zone = inferZanzibarZone(result, opts?.dayHighlightNames ?? []);
      const dinner = pickZanzibarEveningByZone(
        pool,
        zone,
        locale,
        dayIndexInRegion,
        used,
      );
      if (!hasNameInSlot(result.evening, dinner.name)) {
        result.evening.push(dinner);
        used.add(eveningVenueKey(dinner.name));
      }
    }
    return sanitizeDaySlots(result, locale.langCode, locale.country, city);
  }

  if (isLaSprawl) {
    if (result.evening.length === 0) {
      const dinner = pickRotatingEvening(pool, dayIndexInRegion, locale);
      if (!hasSimilar(result, dinner.name)) {
        result.evening.push(dinner);
      }
    }
    if (result.morning.length === 0 && !hasMainSight) {
      const morning = pool.find((e) => e.slot === "morning");
      if (morning) {
        const act = morning.activity(locale, dayIndexInRegion);
        if (!hasSimilar(result, act.name)) result.morning.push(act);
      }
    }
    return sanitizeDaySlots(result, locale.langCode, locale.country, city);
  }

  if (poolKeyName === "vietnam" && (plannedSights >= 1 || hasMainSight)) {
    result = stripWeakFillers(result);
  }
  if (poolKeyName === "hoi_an") {
    result = stripWeakFillers(result);
  }

  const skipGenericVietnamPad =
    poolKeyName === "vietnam" && (plannedSights >= 1 || weakFillerUsedInPriorDays(opts?.priorScheduledText ?? ""));
  const minTotal = skipGenericVietnamPad
    ? countActivities(result)
    : intensive
      ? plannedSights >= 2 || hasMainSight
        ? 4
        : 5
      : plannedSights >= 2 || hasMainSight
        ? 3
        : opts?.isTripDay1
          ? 5
          : 4;
  const hasMorningSight = slotHasRealSight(result.morning);
  const skipAfternoonFiller =
    locale.country === "US" ||
    result.afternoon.some((a) => a.type === "SIGHT" || a.type === "ACTIVITY");

  if (intensive) {
    result.afternoon = result.afternoon.filter((a) => !isWeakFillerActivity(a));
    if (hasMorningSight && result.afternoon.every(isWeakFillerActivity)) {
      result.afternoon = [];
    }
  }

  for (let pass = 0; pass < 3 && !skipGenericVietnamPad && countActivities(result) < minTotal; pass++) {
    for (const entry of pool) {
      if (result[entry.slot].length === 0) {
        if (entry.slot === "morning" && hasMorningSight) continue;
        if (entry.slot === "afternoon" && skipAfternoonFiller) continue;
        if (intensive && entry.slot === "afternoon" && hasMorningSight) continue;
        const act = entry.activity(locale, dayIndexInRegion, poolCtx);
        if (intensive && isWeakFillerActivity(act) && hasMorningSight) continue;
        if (!hasSimilar(result, act.name)) {
          result[entry.slot].push(act);
        }
      }
    }
    const idx = (dayIndexInRegion + pass) % pool.length;
    const entry = pool[idx];
    if (entry.slot !== "afternoon" || !skipAfternoonFiller) {
      if (intensive && entry.slot === "afternoon" && hasMorningSight) continue;
      if (result[entry.slot].length < 2 && countActivities(result) < minTotal) {
        const act = entry.activity(locale, dayIndexInRegion, poolCtx);
        if (intensive && isWeakFillerActivity(act) && hasMorningSight) continue;
        if (!hasSimilar(result, act.name)) {
          result[entry.slot].push(act);
        }
      }
    }
  }

  if (poolKeyName === "philippines") {
    const rewritePh = (list: Activity[]) =>
      list.map((a) => ({
        ...a,
        name: rewriteActivityCityLeak(a.name, city),
        description: rewriteCountryFoodLeak(a.description ?? "", locale.country),
        priceLabel: a.priceLabel
          ? rewriteCountryFoodLeak(a.priceLabel, locale.country)
          : a.priceLabel,
      }));
    result = {
      morning: rewritePh(result.morning),
      afternoon: rewritePh(result.afternoon),
      evening: rewritePh(result.evening),
    };
  }

  if (poolKeyName === "koh_lipe") {
    const rewriteLipe = (list: Activity[]) =>
      list.map((a) => ({
        ...a,
        name: rewriteActivityCityLeak(a.name, city),
        description: rewriteActivityCityLeak(a.description ?? "", city),
        priceLabel: a.priceLabel
          ? rewriteActivityCityLeak(a.priceLabel, city)
          : a.priceLabel,
      }));
    result = {
      morning: rewriteLipe(result.morning),
      afternoon: rewriteLipe(result.afternoon),
      evening: rewriteLipe(result.evening),
    };
    if (result.evening.length === 0) {
      const walking = pool.find((e) => e.slot === "evening");
      if (walking) result.evening.push(walking.activity(locale, dayIndexInRegion, poolCtx));
    }
  }

  if (poolKeyName === "bangkok") {
    const used = opts?.usedEveningVenues ?? new Set<string>();
    const prior = opts?.priorScheduledText ?? "";
    const chinatownDone =
      used.has("chinatown") || /chinatown|yaowarat/i.test(prior);
    if (chinatownDone) {
      const stripChinatown = (list: Activity[]) =>
        list.filter((a) => !/chinatown|yaowarat/i.test(`${a.name} ${a.description}`));
      result = {
        morning: stripChinatown(result.morning),
        afternoon: stripChinatown(result.afternoon),
        evening: stripChinatown(result.evening),
      };
    } else {
      result.afternoon = result.afternoon.filter(
        (a) => !/chinatown|yaowarat/i.test(`${a.name} ${a.description}`),
      );
    }

    const watArunMisplaced = [
      ...result.morning.filter((a) => /wat arun/i.test(a.name)),
      ...result.afternoon.filter((a) => /wat arun/i.test(a.name)),
    ];
    if (watArunMisplaced.length) {
      result.morning = result.morning.filter((a) => !/wat arun/i.test(a.name));
      result.afternoon = result.afternoon.filter((a) => !/wat arun/i.test(a.name));
      for (const a of watArunMisplaced) {
        if (result.evening.length >= 2) {
          const weakIdx = result.evening.findIndex(
            (e) =>
              e.type === "EAT" &&
              !/asiatique|chinatown|yaowarat|chao phraya|wat arun/i.test(`${e.name} ${e.description}`),
          );
          if (weakIdx >= 0) result.evening.splice(weakIdx, 1);
        }
        if (result.evening.length < 2) {
          result.evening.push({
            ...a,
            name: locale.slo ? "Wat Arun (ob sončnem zahodu)" : "Wat Arun (sunset)",
            description: isSunsetTemplePoi(a.name, a.description ?? "")
              ? a.description
              : locale.slo
                ? "Sončni zahod ob 18:00–19:00 — čez reko iz Wat Pho (5 THB trajekt). Ne obiskuj dopoldan."
                : "Sunset visit ~18:00–19:00 — ferry from Wat Pho pier. Not a midday stop.",
          });
        }
      }
    }
    result.afternoon = result.afternoon.filter(
      (a) =>
        !(
          a.type === "SIGHT" &&
          /wat |palace|temple|tempelj|grand palace/i.test(`${a.name} ${a.description}`) &&
          !/jim thompson|museum|muzej/i.test(a.name)
        ),
    );
    result = ensureBangkokMustSee(result, locale, {
      priorScheduledText: opts?.priorScheduledText,
      dayInRegion: dayIndexInRegion,
    });
    for (const a of result.evening) {
      const key = eveningVenueKey(a.name);
      if (key === "chinatown" || key === "asiatique") used.add(key);
    }
  }

  if (poolKeyName === "vietnam" || poolKeyName === "hoi_an") {
    result = fixVietnamDaySlots(result, city, dayIndexInRegion, locale, {
      priorScheduledText: opts?.priorScheduledText,
      isTripDay1: opts?.isTripDay1,
      isArrivalDay: opts?.isArrivalDay,
      tripDate: opts?.tripDate,
    });
  }

  if (poolKeyName === "chiang mai") {
    const used = opts?.usedEveningVenues ?? new Set<string>();
    const seenTonight = new Set<string>();
    const rebuilt: Activity[] = [];
    for (const a of result.evening.filter((x) => Boolean(x.name?.trim()))) {
      const key = eveningVenueKey(a.name);
      const isNightBazaar = /night.?bazaar|nočni bazar|night market/i.test(
        `${a.name} ${a.description}`,
      );
      if (
        (isNightBazaar && used.has("night-bazaar")) ||
        seenTonight.has(key)
      ) {
        const alt = pickChiangMaiEvening(locale, dayIndexInRegion, used);
        const altKey = eveningVenueKey(alt.name);
        if (!seenTonight.has(altKey)) {
          rebuilt.push(alt);
          used.add(altKey);
          seenTonight.add(altKey);
        }
      } else {
        rebuilt.push(a);
        used.add(key);
        seenTonight.add(key);
      }
    }
    result.evening = rebuilt;
    if (eveningNeedsFill(result.evening)) {
      const dinner = pickChiangMaiEvening(locale, dayIndexInRegion, used);
      if (!hasNameInSlot(result.evening, dinner.name)) {
        result.evening.push(dinner);
        used.add(eveningVenueKey(dinner.name));
      }
    }
  }

  return sanitizeDaySlots(result, locale.langCode, locale.country, city);
}

function isLateSightsDay1(slots: DaySlots): boolean {
  return slots.afternoon.length === 0 && slots.morning.length === 0;
}
