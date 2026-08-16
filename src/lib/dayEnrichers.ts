import type { Activity } from "@/lib/aiPlan.functions";
import { ensureBangkokMustSee } from "@/lib/bangkokMustSee";
import { ensureBangkokKwaiDayTrip } from "@/lib/bangkokKwaiDayTrip";
import { isCentralVietnamFloodDate } from "@/lib/seasonalHints";
import {
  isBeachLoungingPoi,
  isEarlyClosingPoi,
  isEveningOnlyPoi,
  isEveningStrollPoi,
  isFullDayExcursion,
  isNightlifeOnlyPoi,
  isSunsetTemplePoi,
  stripFalseArrivalCopy,
} from "@/lib/tripContent";
import { planLangCopy } from "@/lib/planLangCopy";
import type { TripLocale } from "@/lib/tripLocale";
import {
  rewriteActivityCityLeak,
  rewriteCountryFoodLeak,
  sanitizeDaySlots,
} from "@/lib/textSanitize";

function loc(locale: TripLocale, copies: Parameters<typeof planLangCopy>[1]): string {
  return planLangCopy(locale.langCode, copies);
}

type DaySlots = { morning: Activity[]; afternoon: Activity[]; evening: Activity[] };

function normCity(city: string) {
  return city.toLowerCase().trim();
}

function priceEur(locale: TripLocale, _local: string): string {
  return locale.mealPrice;
}

/** Afternoon sights on heavy inbound travel days (after flight/train into a new city). */
export function buildInboundArrivalAfternoonSights(city: string, locale: TripLocale): Activity[] {
  const c = normCity(city);

  if (c.includes("ayutthaya")) {
    return [
      {
        name: "Wat Phra Si Sanphet",
        type: "SIGHT",
        priceLabel: "50 THB (~1,5 €)",
        description: loc(locale, {
          sl: "Tri stolpične stope — obišči takoj ob prihodu (popoldan 13:00–16:00), pred Wat Mahathat. Vstopnina 50 THB.",
          en: "Three chedis — visit right after arrival (afternoon 1–4 pm), before Wat Mahathat. 50 THB entry.",
          it: "Tre chedi — visita subito dopo l'arrivo (pomeriggio 13:00–16:00), prima di Wat Mahathat. Ingresso 50 THB.",
          es: "Tres chedis — visita justo después de llegar (tarde 13:00–16:00), antes de Wat Mahathat. Entrada 50 THB.",
          fr: "Trois chedis — visite juste après l'arrivée (après-midi 13h–16h), avant Wat Mahathat. Entrée 50 THB.",
          de: "Drei Chedis — gleich nach der Ankunft besuchen (Nachmittag 13:00–16:00), vor Wat Mahathat. Eintritt 50 THB.",
        }),
      },
    ];
  }

  if (c.includes("chiang mai")) {
    return [
      {
        name: loc(locale, {
          sl: "Wat Phra That Doi Suthep",
          en: "Doi Suthep Temple",
          it: "Tempio Doi Suthep",
          es: "Templo Doi Suthep",
          fr: "Temple Doi Suthep",
          de: "Doi-Suthep-Tempel",
        }),
        type: "SIGHT",
        priceLabel: "30 THB",
        description: loc(locale, {
          sl: "Popoldanski vzpon na Doi Suthep (pred 17:00) — zlata pagoda in razgled na mesto. Songthaew ali Grab iz hotela.",
          en: "Afternoon trip to Doi Suthep (before 5 pm) — golden pagoda and city views. Songthaew or Grab from hotel.",
          it: "Escursione pomeridiana a Doi Suthep (prima delle 17:00) — pagoda dorata e vista sulla città. Songthaew o Grab dall'hotel.",
          es: "Excursión por la tarde a Doi Suthep (antes de las 17:00) — pagoda dorada y vistas de la ciudad. Songthaew o Grab desde el hotel.",
          fr: "Excursion l'après-midi à Doi Suthep (avant 17h) — pagode dorée et vue sur la ville. Songthaew ou Grab depuis l'hôtel.",
          de: "Nachmittagsausflug zum Doi Suthep (vor 17:00) — goldene Pagode und Stadtblick. Songthaew oder Grab vom Hotel.",
        }),
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
        ? `Po počitku razišči okolico namestitve ${transfer} — prva večerja v lokalni restavraciji. Opazuj ritem mesta brez hitenja.`
        : `After rest, explore near your stay ${transfer} and have your first local dinner.`,
    },
  ];
}

/** Light camp evening — no restaurant meal (motorhome default). */
function buildMotorhomeCampEvening(locale: TripLocale): Activity {
  const slo = locale.slo;
  return {
    name: slo ? "Večer v kampu" : "Evening at camp",
    type: "ACTIVITY",
    priceLabel: slo ? "brezplačno" : "free",
    description: slo
      ? "Lahek večer pri kampu — sprehod, počitek ob avtodomu. Hrano si pripraviš v vozilu, razen če si že načrtoval posebno lokalno večerjo."
      : "Easy evening at camp — stroll and rest by the RV. Cook onboard unless you already planned a special local dinner.",
  };
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
          name: loc(locale, {
            sl: "Ancient Town — japonski most",
            en: "Ancient Town — Japanese Bridge",
            it: "Città antica — Ponte Giapponese",
            es: "Casco antiguo — Puente Japonés",
            fr: "Vieille ville — Pont Japonais",
            de: "Altstadt — Japanische Brücke",
          }),
          description: loc(locale, {
            sl: "Zgodnji sprehod po starem mestu — japonski most Chùa Cầu brez dopoldanske gneče.",
            en: "Early old-town stroll — Chùa Cầu bridge before midday crowds.",
            it: "Passeggiata mattutina nella città vecchia — ponte Chùa Cầu prima della folla di mezzogiorno.",
            es: "Paseo matutino por el casco antiguo — puente Chùa Cầu antes de la multitud del mediodía.",
            fr: "Promenade matinale dans la vieille ville — pont Chùa Cầu avant la foule de midi.",
            de: "Früher Spaziergang durch die Altstadt — Chùa-Cầu-Brücke vor dem Mittagsandrang.",
          }),
        },
        {
          name: loc(locale, {
            sl: "Tra Que Village — zelišča",
            en: "Tra Que herb village",
            it: "Villaggio delle erbe Tra Que",
            es: "Aldea de hierbas Tra Que",
            fr: "Village aux herbes Tra Que",
            de: "Kräuterdorf Tra Que",
          }),
          description: loc(locale, {
            sl: "Kolesarski izlet v vas Tra Que — zelišča, riževi njivi in lokalni zajtrk.",
            en: "Bike to Tra Que — herb gardens, rice fields, local breakfast.",
            it: "Gita in bici a Tra Que — giardini di erbe, risaie e colazione locale.",
            es: "Paseo en bici a Tra Que — jardines de hierbas, arrozales y desayuno local.",
            fr: "Balade à vélo à Tra Que — jardins d'herbes, rizières et petit-déjeuner local.",
            de: "Radtour nach Tra Que — Kräutergärten, Reisfelder und lokales Frühstück.",
          }),
        },
        {
          name: loc(locale, {
            sl: "Basket boat v mangrovah",
            en: "Basket boat mangroves",
            it: "Barca cestino nelle mangrovie",
            es: "Barco cesta en manglares",
            fr: "Barque panier dans les mangroves",
            de: "Korbfahrten in den Mangroven",
          }),
          description: loc(locale, {
            sl: "Kratka vožnja s košarnimi čolni v mangrovah — tipičen Hoi An, rezerviraj zjutraj.",
            en: "Short basket-boat ride in the mangroves — classic Hoi An morning trip.",
            it: "Breve gita in barca cestino nelle mangrovie — classico Hoi An al mattino.",
            es: "Breve paseo en barco cesta por los manglares — clásico de Hoi An por la mañana.",
            fr: "Courte balade en barque panier dans les mangroves — classique du matin à Hoi An.",
            de: "Kurze Korbfahrten in den Mangroven — klassischer Hoi-An-Morgenausflug.",
          }),
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
          name: loc(locale, {
            sl: "Kuharski tečaj (Hoi An)",
            en: "Cooking class (Hoi An)",
            it: "Corso di cucina (Hoi An)",
            es: "Clase de cocina (Hoi An)",
            fr: "Cours de cuisine (Hoi An)",
            de: "Kochkurs (Hoi An)",
          }),
          description: loc(locale, {
            sl: "Tržnica + kuhanje pod streho — odlična popoldanska aktivnost ob vročini ali dežju.",
            en: "Market tour and indoor cooking — great afternoon when hot or rainy.",
            it: "Mercato e cucina al coperto — ottimo pomeriggio con caldo o pioggia.",
            es: "Mercado y cocina bajo techo — excelente tarde con calor o lluvia.",
            fr: "Marché et cuisine à l'intérieur — parfait l'après-midi par chaleur ou pluie.",
            de: "Marktbesuch und Kochen unter Dach — ideal am Nachmittag bei Hitze oder Regen.",
          }),
        },
        {
          name: loc(locale, {
            sl: "Delavnica lampionov",
            en: "Lantern workshop",
            it: "Laboratorio di lanterne",
            es: "Taller de linternas",
            fr: "Atelier de lanternes",
            de: "Laternen-Workshop",
          }),
          description: loc(locale, {
            sl: "Izdelava svetlečih lampionov v pokriti delavnici v starem mestu.",
            en: "Lantern-making in a covered old-town workshop.",
            it: "Creazione di lanterne in un laboratorio coperto nella città vecchia.",
            es: "Elaboración de linternas en un taller cubierto del casco antiguo.",
            fr: "Fabrication de lanternes dans un atelier couvert de la vieille ville.",
            de: "Laternen basteln in einer überdachten Werkstatt in der Altstadt.",
          }),
        },
        {
          name: loc(locale, {
            sl: "Reka Thu Bon — vožnja s čolnom",
            en: "Thu Bon river boat",
            it: "Gita in barca sul fiume Thu Bon",
            es: "Paseo en barca por el río Thu Bon",
            fr: "Balade en bateau sur la Thu Bon",
            de: "Bootsfahrt auf dem Thu-Bon-Fluss",
          }),
          description: loc(locale, {
            sl: "Popoldanska vožnja po reki — ribiške vasice in fotogenični sončni zahodi ob vodi.",
            en: "Afternoon river cruise — fishing villages and waterfront views.",
            it: "Crociera pomeridiana sul fiume — villaggi di pescatori e tramonti sulle rive.",
            es: "Crucero vespertino por el río — pueblos pesqueros y atardeceres junto al agua.",
            fr: "Croisière l'après-midi sur la rivière — villages de pêcheurs et couchers de soleil.",
            de: "Nachmittagsbootsfahrt auf dem Fluss — Fischerdörfer und Sonnenuntergänge am Wasser.",
          }),
        },
      ];
      const pick = options[(dayIdx - 1) % options.length]!;
      return {
        name: pick.name,
        type: "ACTIVITY" as const,
        priceLabel: loc(locale, {
          sl: "15–40 €",
          en: "€15–40",
          it: "15–40 €",
          es: "15–40 €",
          fr: "15–40 €",
          de: "15–40 €",
        }),
        description: pick.description,
      };
    },
  },
  {
    slot: "evening",
    activity: (locale, dayIdx = 1) => {
      const options = [
        {
          name: loc(locale, {
            sl: "Ancient Town ob mraku",
            en: "Ancient Town at dusk",
            it: "Città antica al tramonto",
            es: "Casco antiguo al atardecer",
            fr: "Vieille ville au crépuscule",
            de: "Altstadt in der Dämmerung",
          }),
          description: loc(locale, {
            sl: "Lanterne in ozke ulice ob mraku — brez ponavljanja plažnega dne.",
            en: "Lanterns and alleys at dusk — not a repeat beach block.",
            it: "Lanterne e vicoli al tramonto — niente ripetizione della giornata in spiaggia.",
            es: "Linternas y callejones al atardecer — sin repetir el día de playa.",
            fr: "Lanternes et ruelles au crépuscule — pas de répétition de la journée plage.",
            de: "Laternen und Gassen in der Dämmerung — kein Wiederholen des Strandtages.",
          }),
        },
        {
          name: loc(locale, {
            sl: "Central Market — večerja",
            en: "Central Market dinner",
            it: "Cena al mercato centrale",
            es: "Cena en el mercado central",
            fr: "Dîner au marché central",
            de: "Abendessen auf dem Zentralmarkt",
          }),
          description: loc(locale, {
            sl: "Cao lau ali white rose dumplings na lokalnem trgu — avtentična večerja.",
            en: "Cao lau or white rose dumplings at the central market.",
            it: "Cao lau o ravioli white rose al mercato centrale — cena autentica.",
            es: "Cao lau o dumplings white rose en el mercado central — cena auténtica.",
            fr: "Cao lau ou raviolis white rose au marché central — dîner authentique.",
            de: "Cao lau oder White-Rose-Dumplings auf dem Zentralmarkt — authentisches Abendessen.",
          }),
        },
        {
          name: loc(locale, {
            sl: "Riverside BBQ",
            en: "Riverside BBQ",
            it: "BBQ sul fiume",
            es: "BBQ junto al río",
            fr: "BBQ au bord de la rivière",
            de: "BBQ am Flussufer",
          }),
          description: loc(locale, {
            sl: "Večerja ob reki Thu Bon — sveže morske sadeže ali BBQ, manj turistično kot An Bang.",
            en: "Thu Bon riverside BBQ — fresh seafood, less touristy than the beach strip.",
            it: "Cena sul Thu Bon — pesce fresco o BBQ, meno turistico di An Bang.",
            es: "Cena junto al Thu Bon — mariscos frescos o BBQ, menos turístico que An Bang.",
            fr: "Dîner au bord de la Thu Bon — fruits de mer frais ou BBQ, moins touristique qu'An Bang.",
            de: "Abendessen am Thu Bon — frische Meeresfrüchte oder BBQ, weniger touristisch als An Bang.",
          }),
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
      name: loc(locale, {
        sl: "Lokalni zajtrk / kava",
        en: "Local breakfast",
        it: "Colazione locale",
        es: "Desayuno local",
        fr: "Petit-déjeuner local",
        de: "Lokales Frühstück",
      }),
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: loc(locale, {
        sl: "Začni z pho ali banh mi na uličnem stojalu — poceni, hitro, avtentično. Idealno pred večjimi znamenitostmi.",
        en: "Start with pho or banh mi at a street stall before major sights.",
        it: "Inizia con pho o banh mi da un banco di strada — economico, veloce, autentico. Ideale prima delle attrazioni principali.",
        es: "Empieza con pho o banh mi en un puesto callejero — barato, rápido, auténtico. Ideal antes de las atracciones principales.",
        fr: "Commencez par un pho ou banh mi au stand de rue — bon marché, rapide, authentique. Idéal avant les sites majeurs.",
        de: "Starte mit Pho oder Banh Mi an einem Straßenstand — günstig, schnell, authentisch. Ideal vor den Hauptsehenswürdigkeiten.",
      }),
    }),
  },
  {
    slot: "afternoon",
    activity: (locale) => ({
      name: loc(locale, {
        sl: "Pavza v kavarni / klimatiziranem prostoru",
        en: "Café break",
        it: "Pausa caffè",
        es: "Pausa en cafetería",
        fr: "Pause café",
        de: "Kaffeepause",
      }),
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: loc(locale, {
        sl: "Med 12:00 in 15:00 je vroče — planiraj pavzo v kavarni ali nakupovalnem centru. Hladna pijača, načrt za popoldan.",
        en: "Midday heat break in an air-conditioned café.",
        it: "Pausa dal caldo di mezzogiorno in un caffè climatizzato.",
        es: "Pausa del calor del mediodía en una cafetería con aire acondicionado.",
        fr: "Pause fraîcheur de midi dans un café climatisé.",
        de: "Mittags-Hitzepause in einem klimatisierten Café.",
      }),
    }),
  },
  {
    slot: "evening",
    activity: (locale) => ({
      name: loc(locale, {
        sl: "Ulična hrana / nočni trg",
        en: "Street food / night market",
        it: "Cibo di strada / mercato notturno",
        es: "Comida callejera / mercado nocturno",
        fr: "Street food / marché de nuit",
        de: "Streetfood / Nachtmarkt",
      }),
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: loc(locale, {
        sl: "Zaključi dan z ulično hrano ali nočnim trgom — lokalno, poceni, živahno. Grab nazaj v hotel.",
        en: "End the day at a street food stall or night market — Grab back to hotel.",
        it: "Concludi la giornata con street food o mercato notturno — Grab per tornare in hotel.",
        es: "Termina el día con comida callejera o mercado nocturno — Grab de vuelta al hotel.",
        fr: "Terminez la journée au street food ou marché de nuit — Grab pour retourner à l'hôtel.",
        de: "Beende den Tag mit Streetfood oder Nachtmarkt — Grab zurück zum Hotel.",
      }),
    }),
  },
];

const PHILIPPINES_POOL: PoolEntry[] = [
  {
    slot: "morning",
    activity: (locale) => ({
      name: loc(locale, {
        sl: "Filipinski zajtrk (Tapsilog)",
        en: "Filipino breakfast (Tapsilog)",
        it: "Colazione filippina (Tapsilog)",
        es: "Desayuno filipino (Tapsilog)",
        fr: "Petit-déjeuner philippin (Tapsilog)",
        de: "Philippinisches Frühstück (Tapsilog)",
      }),
      type: "EAT",
      priceLabel: priceEur(locale, "80–150 PHP"),
      description: loc(locale, {
        sl: "Začni z tapsilog (sušena govedina, jajce, riž) ali sinangag — lokalni zajtrk, ne vietnamski pho.",
        en: "Start with tapsilog or sinangag — local Filipino breakfast.",
        it: "Inizia con tapsilog o sinangag — colazione tipica filippina.",
        es: "Empieza con tapsilog o sinangag — desayuno filipino local.",
        fr: "Commencez par tapsilog ou sinangag — petit-déjeuner philippin local.",
        de: "Starte mit Tapsilog oder Sinangag — lokales philippinisches Frühstück.",
      }),
    }),
  },
  {
    slot: "afternoon",
    activity: (locale) => ({
      name: loc(locale, {
        sl: "Pavza v klimatiziranem kavarni",
        en: "Air-con café break",
        it: "Pausa in caffè climatizzato",
        es: "Pausa en café con aire acondicionado",
        fr: "Pause café climatisé",
        de: "Pause im klimatisierten Café",
      }),
      type: "EAT",
      priceLabel: priceEur(locale, "100–200 PHP"),
      description: loc(locale, {
        sl: "Popoldanska pavza — halo-halo ali kava v mallu; monsun prinaša plohe.",
        en: "Afternoon break — halo-halo or mall coffee; monsoon showers possible.",
        it: "Pausa pomeridiana — halo-halo o caffè al mall; possibili piogge monsoniche.",
        es: "Pausa de tarde — halo-halo o café en el centro comercial; posibles lluvias monzónicas.",
        fr: "Pause de l'après-midi — halo-halo ou café au mall ; averses de mousson possibles.",
        de: "Nachmittagspause — Halo-Halo oder Mall-Kaffee; Monsunregen möglich.",
      }),
    }),
  },
  {
    slot: "evening",
    activity: (locale) => ({
      name: loc(locale, {
        sl: "Morski sadeži / nočni trg",
        en: "Seafood / night market",
        it: "Pesce / mercato notturno",
        es: "Mariscos / mercado nocturno",
        fr: "Fruits de mer / marché de nuit",
        de: "Meeresfrüchte / Nachtmarkt",
      }),
      type: "EAT",
      priceLabel: priceEur(locale, "200–500 PHP"),
      description: loc(locale, {
        sl: "Večerja z morskimi sadeži ali nočni trg — D'Talipapa (Boracay), Binondo (Manila) ali lokalni BBQ.",
        en: "Seafood dinner or night market — D'Talipapa, Binondo, or local BBQ.",
        it: "Cena di pesce o mercato notturno — D'Talipapa, Binondo o BBQ locale.",
        es: "Cena de mariscos o mercado nocturno — D'Talipapa, Binondo o BBQ local.",
        fr: "Dîner fruits de mer ou marché de nuit — D'Talipapa, Binondo ou BBQ local.",
        de: "Meeresfrüchte-Abendessen oder Nachtmarkt — D'Talipapa, Binondo oder lokales BBQ.",
      }),
    }),
  },
];

const CANADA_POOL: PoolEntry[] = [
  {
    slot: "morning",
    activity: (locale) => ({
      name: loc(locale, {
        sl: "Lokalni zajtrk / kava",
        en: "Local breakfast",
        it: "Colazione locale",
        es: "Desayuno local",
        fr: "Petit-déjeuner local",
        de: "Lokales Frühstück",
      }),
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: loc(locale, {
        sl: "Začni z zajtrkom v lokalni kavarni — idealno pred večjimi znamenitostmi.",
        en: "Start with breakfast at a local café before major sights.",
        it: "Inizia con colazione in un caffè locale — ideale prima delle attrazioni principali.",
        es: "Empieza con desayuno en una cafetería local — ideal antes de las atracciones principales.",
        fr: "Commencez par un petit-déjeuner dans un café local — idéal avant les sites majeurs.",
        de: "Starte mit Frühstück in einem lokalen Café — ideal vor den Hauptsehenswürdigkeiten.",
      }),
    }),
  },
  {
    slot: "afternoon",
    activity: (locale) => ({
      name: loc(locale, {
        sl: "Pavza v kavarni",
        en: "Café break",
        it: "Pausa caffè",
        es: "Pausa en cafetería",
        fr: "Pause café",
        de: "Kaffeepause",
      }),
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: loc(locale, {
        sl: "Kratka popoldanska pavza — kava, načrt za večer.",
        en: "Short afternoon café break.",
        it: "Breve pausa pomeridiana al caffè.",
        es: "Breve pausa vespertina en cafetería.",
        fr: "Courte pause café l'après-midi.",
        de: "Kurze Nachmittags-Kaffeepause.",
      }),
    }),
  },
  {
    slot: "evening",
    activity: (locale) => ({
      name: loc(locale, {
        sl: "Lokalna večerja",
        en: "Local dinner",
        it: "Cena locale",
        es: "Cena local",
        fr: "Dîner local",
        de: "Lokales Abendessen",
      }),
      type: "EAT",
      priceLabel: locale.mealPrice,
      description: loc(locale, {
        sl: "Večerja v restavraciji, kamor hodijo domačini. Uber ali javni prevoz nazaj — Grab v Kanadi ne obstaja.",
        en: "Dinner where locals eat. Uber or transit back — no Grab in Canada.",
        it: "Cena dove mangiano i locali. Uber o trasporto pubblico per tornare — niente Grab in Canada.",
        es: "Cena donde comen los locales. Uber o transporte público de vuelta — no hay Grab en Canadá.",
        fr: "Dîner où mangent les locaux. Uber ou transports en commun pour le retour — pas de Grab au Canada.",
        de: "Abendessen, wo Einheimische essen. Uber oder ÖPNV zurück — kein Grab in Kanada.",
      }),
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
        name: loc(locale, {
          sl: "Lokalni zajtrk / kava",
          en: "Local breakfast",
          it: "Colazione locale",
          es: "Desayuno local",
          fr: "Petit-déjeuner local",
          de: "Lokales Frühstück",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "80–150 THB"),
        description: loc(locale, {
          sl: "Začni z jajčnim rižem (khao pad) ali mango sticky rice na uličnem stojalu.",
          en: "Street breakfast before major sights.",
          it: "Colazione di strada prima delle attrazioni principali.",
          es: "Desayuno callejero antes de las atracciones principales.",
          fr: "Petit-déjeuner de rue avant les sites majeurs.",
          de: "Straßenfrühstück vor den Hauptsehenswürdigkeiten.",
        }),
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Odmor v klimatiziranem kavarni",
          en: "Air-con café break",
          it: "Pausa in caffè climatizzato",
          es: "Pausa en café con aire acondicionado",
          fr: "Pause café climatisé",
          de: "Pause im klimatisierten Café",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "100–200 THB"),
        description: loc(locale, {
          sl: "Med 12:00 in 15:00 je vroče — pavza v kavarni ali nakupovalnem centru.",
          en: "Midday heat break in air-conditioned café.",
          it: "Pausa dal caldo di mezzogiorno in un caffè climatizzato.",
          es: "Pausa del calor del mediodía en una cafetería con aire acondicionado.",
          fr: "Pause fraîcheur de midi dans un café climatisé.",
          de: "Mittags-Hitzepause in einem klimatisierten Café.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Rooftop bar ali večernji trg",
          en: "Rooftop or night market",
          it: "Rooftop bar o mercato notturno",
          es: "Bar en azotea o mercado nocturno",
          fr: "Rooftop bar ou marché de nuit",
          de: "Rooftop-Bar oder Nachtmarkt",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "200–600 THB"),
        description: loc(locale, {
          sl: "Zaključi dan z razgledom ali hrano na nočnem trgu. Grab nazaj v hotel.",
          en: "Rooftop bar or night market to end the day.",
          it: "Rooftop bar o mercato notturno per concludere la giornata.",
          es: "Bar en azotea o mercado nocturno para terminar el día.",
          fr: "Rooftop bar ou marché de nuit pour clôturer la journée.",
          de: "Rooftop-Bar oder Nachtmarkt zum Tagesabschluss.",
        }),
      }),
    },
  ],
  "chiang mai": [
    {
      slot: "morning",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Kava v old city",
          en: "Old city coffee",
          it: "Caffè nella città vecchia",
          es: "Café en el casco antiguo",
          fr: "Café dans la vieille ville",
          de: "Kaffee in der Altstadt",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "80–120 THB"),
        description: loc(locale, {
          sl: "Začni v specialty kavarni v stari mestni coni.",
          en: "Specialty coffee in the old city.",
          it: "Caffè specialty nella città vecchia.",
          es: "Café de especialidad en el casco antiguo.",
          fr: "Café de spécialité dans la vieille ville.",
          de: "Spezialitätenkaffee in der Altstadt.",
        }),
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Pavza v Nimman",
          en: "Nimman area break",
          it: "Pausa nel quartiere Nimman",
          es: "Pausa en la zona Nimman",
          fr: "Pause dans le quartier Nimman",
          de: "Pause im Nimman-Viertel",
        }),
        type: "ACTIVITY",
        priceLabel: loc(locale, {
          sl: "brezplačno",
          en: "free",
          it: "gratuito",
          es: "gratis",
          fr: "gratuit",
          de: "kostenlos",
        }),
        description: loc(locale, {
          sl: "Popoldanski odmor v Nimman Road coni — galerije, klimatizirani prostori.",
          en: "Afternoon break in Nimman area.",
          it: "Pausa pomeridiana nel quartiere Nimman — gallerie e spazi climatizzati.",
          es: "Pausa vespertina en la zona Nimman — galerías y espacios con aire acondicionado.",
          fr: "Pause l'après-midi dans le quartier Nimman — galeries et espaces climatisés.",
          de: "Nachmittagspause im Nimman-Viertel — Galerien und klimatisierte Räume.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Night Bazaar",
          en: "Night market",
          it: "Mercato notturno",
          es: "Mercado nocturno",
          fr: "Marché de nuit",
          de: "Nachtmarkt",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "150–350 THB"),
        description: loc(locale, {
          sl: "Večer na trgu — rokodelstvo, ulična hrana.",
          en: "Evening market — crafts and street food.",
          it: "Serata al mercato — artigianato e street food.",
          es: "Noche en el mercado — artesanía y comida callejera.",
          fr: "Soirée au marché — artisanat et street food.",
          de: "Abend auf dem Markt — Handwerk und Streetfood.",
        }),
      }),
    },
  ],
  ayutthaya: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Zgodnji obisk ruševin",
          en: "Early ruins visit",
          it: "Visita mattutina alle rovine",
          es: "Visita matutina a las ruinas",
          fr: "Visite matinale des ruines",
          de: "Früher Besuch der Ruinen",
        }),
        type: "SIGHT",
        priceLabel: priceEur(locale, "50–100 THB"),
        description: loc(locale, {
          sl: "Ruševine obišči zjutraj (8:00–11:00). Najem kolesa ali tuk-tuk med lokacijami.",
          en: "Visit ruins early morning; bike or tuk-tuk between sites.",
          it: "Visita le rovine al mattino presto (8:00–11:00). Bici o tuk-tuk tra i siti.",
          es: "Visita las ruinas por la mañana (8:00–11:00). Bici o tuk-tuk entre los sitios.",
          fr: "Visitez les ruines tôt le matin (8h–11h). Vélo ou tuk-tuk entre les sites.",
          de: "Ruinen am Morgen besuchen (8:00–11:00). Fahrrad oder Tuk-Tuk zwischen den Stätten.",
        }),
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Pavza ob reki + lokalna hrana",
          en: "River lunch break",
          it: "Pausa pranzo sul fiume",
          es: "Pausa para almorzar junto al río",
          fr: "Pause déjeuner au bord de la rivière",
          de: "Mittagspause am Fluss",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "100–250 THB"),
        description: loc(locale, {
          sl: "Popoldanski odmor ob reki — pad thai, počasi.",
          en: "Lunch by the river — slow pace.",
          it: "Pausa pomeridiana sul fiume — pad thai, ritmo lento.",
          es: "Descanso vespertino junto al río — pad thai, ritmo pausado.",
          fr: "Pause l'après-midi au bord de la rivière — pad thai, rythme lent.",
          de: "Nachmittagspause am Fluss — Pad Thai, gemütliches Tempo.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Večernji sprehod med ruševinami",
          en: "Evening ruins walk",
          it: "Passeggiata serale tra le rovine",
          es: "Paseo vespertino entre las ruinas",
          fr: "Promenade du soir parmi les ruines",
          de: "Abendspaziergang zwischen den Ruinen",
        }),
        type: "SIGHT",
        priceLabel: loc(locale, {
          sl: "brezplačno",
          en: "free",
          it: "gratuito",
          es: "gratis",
          fr: "gratuit",
          de: "kostenlos",
        }),
        description: loc(locale, {
          sl: "Nekateri templji so čudoviti ob sončnem zahodu.",
          en: "Some temples are stunning at sunset.",
          it: "Alcuni templi sono spettacolari al tramonto.",
          es: "Algunos templos son impresionantes al atardecer.",
          fr: "Certains temples sont magnifiques au coucher du soleil.",
          de: "Manche Tempel sind bei Sonnenuntergang atemberaubend.",
        }),
      }),
    },
  ],
  phuket: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Zajtrk ob morju",
          en: "Beach breakfast",
          it: "Colazione in spiaggia",
          es: "Desayuno en la playa",
          fr: "Petit-déjeuner à la plage",
          de: "Strandfrühstück",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "150–300 THB"),
        description: loc(locale, {
          sl: "Zajtrk v beach café — počasi pred izletom.",
          en: "Relaxed beach café breakfast.",
          it: "Colazione rilassata in un beach café prima dell'escursione.",
          es: "Desayuno relajado en un café de playa antes de la excursión.",
          fr: "Petit-déjeuner détendu au beach café avant l'excursion.",
          de: "Entspanntes Frühstück im Beach-Café vor dem Ausflug.",
        }),
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Siesta / bazen",
          en: "Pool siesta",
          it: "Siesta / piscina",
          es: "Siesta / piscina",
          fr: "Sieste / piscine",
          de: "Siesta / Pool",
        }),
        type: "ACTIVITY",
        priceLabel: loc(locale, {
          sl: "vključeno v hotel",
          en: "hotel included",
          it: "incluso in hotel",
          es: "incluido en hotel",
          fr: "inclus à l'hôtel",
          de: "im Hotel inbegriffen",
        }),
        description: loc(locale, {
          sl: "Tropska pavza 13:00–16:00 — bazen ali senčnik.",
          en: "Tropical afternoon pause.",
          it: "Pausa tropicale pomeridiana 13:00–16:00 — piscina o ombrellone.",
          es: "Pausa tropical vespertina 13:00–16:00 — piscina o sombrilla.",
          fr: "Pause tropicale l'après-midi 13h–16h — piscine ou parasol.",
          de: "Tropische Nachmittagspause 13:00–16:00 — Pool oder Sonnenschirm.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Seafood ali nočni trg",
          en: "Seafood or night market",
          it: "Pesce o mercato notturno",
          es: "Mariscos o mercado nocturno",
          fr: "Fruits de mer ou marché de nuit",
          de: "Meeresfrüchte oder Nachtmarkt",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "300–700 THB"),
        description: loc(locale, {
          sl: "Večerja z morskimi sadeži ali nočni trg v Phuket Town.",
          en: "Seafood dinner or Phuket Town night market.",
          it: "Cena di pesce o mercato notturno a Phuket Town.",
          es: "Cena de mariscos o mercado nocturno en Phuket Town.",
          fr: "Dîner fruits de mer ou marché de nuit à Phuket Town.",
          de: "Meeresfrüchte-Abendessen oder Nachtmarkt in Phuket Town.",
        }),
      }),
    },
  ],
  krabi: [
    {
      slot: "morning",
      activity: (locale, dayIdx, ctx) => ({
        name: loc(locale, {
          sl: "Zajtrk v Ao Nang",
          en: "Ao Nang breakfast",
          it: "Colazione ad Ao Nang",
          es: "Desayuno en Ao Nang",
          fr: "Petit-déjeuner à Ao Nang",
          de: "Frühstück in Ao Nang",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "150–300 THB"),
        description: ctx?.phiPhiDone
          ? loc(locale, {
              sl: "Zajtrk ob plaži v Ao Nang — dan za Railay, snorkljanje ali počasen ritem ob morju.",
              en: "Beach breakfast in Ao Nang — Railay, snorkel, or slow beach day.",
              it: "Colazione in spiaggia ad Ao Nang — Railay, snorkeling o giornata lenta al mare.",
              es: "Desayuno en la playa de Ao Nang — Railay, snorkel o día tranquilo en la playa.",
              fr: "Petit-déjeuner à la plage à Ao Nang — Railay, snorkeling ou journée plage tranquille.",
              de: "Strandfrühstück in Ao Nang — Railay, Schnorcheln oder entspannter Strandtag.",
            })
          : dayIdx && dayIdx > 1
            ? loc(locale, {
                sl: "Zajtrk v Ao Nang — dan za Railay, plaže v zalivu ali lokalni izlet z ladjo.",
                en: "Ao Nang breakfast — Railay, bay beaches, or local boat trip.",
                it: "Colazione ad Ao Nang — Railay, spiagge della baia o gita in barca locale.",
                es: "Desayuno en Ao Nang — Railay, playas de la bahía o excursión en barco local.",
                fr: "Petit-déjeuner à Ao Nang — Railay, plages de la baie ou excursion en bateau local.",
                de: "Frühstück in Ao Nang — Railay, Buchtstrände oder lokaler Bootsausflug.",
              })
            : loc(locale, {
                sl: "Zajtrk ob plaži v Ao Nang — pred celodnevnim izletom na Phi Phi ali Railay.",
                en: "Beach breakfast before a Phi Phi or Railay day trip.",
                it: "Colazione in spiaggia ad Ao Nang — prima dell'escursione giornaliera a Phi Phi o Railay.",
                es: "Desayuno en la playa de Ao Nang — antes de la excursión de día completo a Phi Phi o Railay.",
                fr: "Petit-déjeuner à la plage à Ao Nang — avant l'excursion d'une journée à Phi Phi ou Railay.",
                de: "Strandfrühstück in Ao Nang — vor dem Ganztagesausflug nach Phi Phi oder Railay.",
              }),
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Siesta ob morju",
          en: "Beach siesta",
          it: "Siesta in spiaggia",
          es: "Siesta en la playa",
          fr: "Sieste à la plage",
          de: "Strandsiesta",
        }),
        type: "ACTIVITY",
        priceLabel: loc(locale, {
          sl: "brezplačno",
          en: "free",
          it: "gratuito",
          es: "gratis",
          fr: "gratuit",
          de: "kostenlos",
        }),
        description: loc(locale, {
          sl: "Popoldanska pavza v senčniku ali na plaži — tropična vročina.",
          en: "Afternoon shade or beach pause.",
          it: "Pausa pomeridiana all'ombra o in spiaggia — caldo tropicale.",
          es: "Pausa vespertina a la sombra o en la playa — calor tropical.",
          fr: "Pause l'après-midi à l'ombre ou à la plage — chaleur tropicale.",
          de: "Nachmittagspause im Schatten oder am Strand — tropische Hitze.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Seafood v Ao Nang",
          en: "Ao Nang seafood",
          it: "Pesce ad Ao Nang",
          es: "Mariscos en Ao Nang",
          fr: "Fruits de mer à Ao Nang",
          de: "Meeresfrüchte in Ao Nang",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "300–700 THB"),
        description: loc(locale, {
          sl: "Večerja z morskimi sadeži ob Ao Nang ali nočni trg v Krabiju.",
          en: "Seafood dinner in Ao Nang or Krabi night market.",
          it: "Cena di pesce ad Ao Nang o mercato notturno a Krabi.",
          es: "Cena de mariscos en Ao Nang o mercado nocturno en Krabi.",
          fr: "Dîner fruits de mer à Ao Nang ou marché de nuit à Krabi.",
          de: "Meeresfrüchte-Abendessen in Ao Nang oder Nachtmarkt in Krabi.",
        }),
      }),
    },
  ],
  koh_lipe: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Zajtrk na otoku",
          en: "Island breakfast",
          it: "Colazione sull'isola",
          es: "Desayuno en la isla",
          fr: "Petit-déjeuner sur l'île",
          de: "Inselfrühstück",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "150–300 THB"),
        description: loc(locale, {
          sl: "Počasen zajtrk v beach baru — otok je majhen, brez naglice.",
          en: "Slow island beach breakfast.",
          it: "Colazione lenta in un beach bar — l'isola è piccola, senza fretta.",
          es: "Desayuno tranquilo en un bar de playa — la isla es pequeña, sin prisas.",
          fr: "Petit-déjeuner tranquille au beach bar — l'île est petite, sans précipitation.",
          de: "Gemütliches Frühstück in der Beach-Bar — die Insel ist klein, kein Stress.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Walking Street",
          en: "Walking Street dinner",
          it: "Cena in Walking Street",
          es: "Cena en Walking Street",
          fr: "Dîner à Walking Street",
          de: "Abendessen in der Walking Street",
        }),
        type: "EAT",
        priceLabel: priceEur(locale, "300–600 THB"),
        description: loc(locale, {
          sl: "Večerja na Walking Street — morski sadeži in ulična hrana na Koh Lipeju.",
          en: "Walking Street seafood and street food on Koh Lipe.",
          it: "Cena in Walking Street — pesce e street food a Koh Lipe.",
          es: "Cena en Walking Street — mariscos y comida callejera en Koh Lipe.",
          fr: "Dîner à Walking Street — fruits de mer et street food à Koh Lipe.",
          de: "Abendessen in der Walking Street — Meeresfrüchte und Streetfood auf Koh Lipe.",
        }),
      }),
    },
  ],
  vietnam: VIETNAM_POOL,
  hoi_an: HOI_AN_POOL,
  europe: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Jutranji sprehod do prve znamenitosti",
          en: "Morning walk to first sight",
          it: "Passeggiata mattutina verso la prima tappa",
          es: "Paseo matutino hasta la primera visita",
          fr: "Promenade matinale vers le premier site",
          de: "Morgenspaziergang zur ersten Sehenswürdigkeit",
        }),
        type: "ACTIVITY",
        priceLabel: loc(locale, {
          sl: "brezplačno",
          en: "free",
          it: "gratuito",
          es: "gratis",
          fr: "gratuit",
          de: "kostenlos",
        }),
        description: loc(locale, {
          sl: "Peš ali z javnim prevozom do prve točke dneva — mesto je zjutraj mirnejše in bolj fotogenično.",
          en: "Walk or take transit to your first stop — cities are calmer and photogenic in the morning.",
          it: "A piedi o con i mezzi pubblici fino alla prima tappa — la città è più tranquilla e fotogenica al mattino.",
          es: "A pie o en transporte público hasta la primera parada — la ciudad es más tranquila y fotogénica por la mañana.",
          fr: "À pied ou en transports en commun jusqu'à la première étape — la ville est plus calme et photogénique le matin.",
          de: "Zu Fuß oder mit öffentlichen Verkehrsmitteln zur ersten Station — Städte sind morgens ruhiger und fotogener.",
        }),
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Pavza na trgu / v parku",
          en: "Square or park break",
          it: "Pausa in piazza o al parco",
          es: "Pausa en la plaza o el parque",
          fr: "Pause sur la place ou au parc",
          de: "Pause auf dem Platz oder im Park",
        }),
        type: "ACTIVITY",
        priceLabel: loc(locale, {
          sl: "brezplačno",
          en: "free",
          it: "gratuito",
          es: "gratis",
          fr: "gratuit",
          de: "kostenlos",
        }),
        description: loc(locale, {
          sl: "Popoldanski odmor na glavnem trgu ali v mestnem parku — people-watching in počasnejši ritem.",
          en: "Afternoon pause on a main square or in a city park.",
          it: "Pausa pomeridiana sulla piazza principale o in un parco cittadino — osservare la gente a ritmo lento.",
          es: "Descanso vespertino en la plaza principal o en un parque urbano — observar a la gente a ritmo pausado.",
          fr: "Pause l'après-midi sur la place principale ou dans un parc urbain — observer la vie à rythme lent.",
          de: "Nachmittagspause auf dem Hauptplatz oder im Stadtpark — Menschen beobachten in gemütlichem Tempo.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Aperitivo / lokalna večerja",
          en: "Aperitivo / local dinner",
          it: "Aperitivo / cena locale",
          es: "Aperitivo / cena local",
          fr: "Apéritif / dîner local",
          de: "Aperitivo / lokales Abendessen",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Večerja v bistru ali trattorii, kamor hodijo domačini — rezervacija pri priljubljenih krajih.",
          en: "Dinner at a bistro or trattoria where locals eat.",
          it: "Cena in un bistro o trattoria frequentati dai locali — prenotazione consigliata nei posti popolari.",
          es: "Cena en un bistró o trattoria donde comen los locales — reserva recomendada en los sitios populares.",
          fr: "Dîner dans un bistro ou une trattoria fréquentés par les locaux — réservation conseillée aux adresses populaires.",
          de: "Abendessen in einem Bistro oder einer Trattoria, wo Einheimische essen — Reservierung bei beliebten Orten empfohlen.",
        }),
      }),
    },
  ],
  americas: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Jutranji sprehod / kava pred ogledom",
          en: "Morning walk & coffee",
          it: "Passeggiata mattutina e caffè",
          es: "Paseo matutino y café",
          fr: "Promenade matinale et café",
          de: "Morgenspaziergang und Kaffee",
        }),
        type: "ACTIVITY",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Kratek sprehod po okolici hotela in kava na poti — orientacija pred glavnim ogledom dopoldan.",
          en: "Short neighbourhood walk and coffee on the way to your main morning sight.",
          it: "Breve passeggiata nel quartiere e caffè per strada — orientamento prima della visita principale del mattino.",
          es: "Breve paseo por el barrio y café de camino — orientación antes de la visita principal de la mañana.",
          fr: "Courte promenade dans le quartier et café en chemin — repérage avant la visite principale du matin.",
          de: "Kurzer Spaziergang in der Umgebung und Kaffee unterwegs — Orientierung vor der Hauptbesichtigung am Vormittag.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Večerja v soseski",
          en: "Neighbourhood dinner",
          it: "Cena di quartiere",
          es: "Cena de barrio",
          fr: "Dîner de quartier",
          de: "Abendessen im Viertel",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Večerja izven glavnih turističnih ulic — boljše cene in vzdušje.",
          en: "Dinner off the main tourist strips.",
          it: "Cena lontano dalle strade turistiche principali — prezzi migliori e atmosfera più autentica.",
          es: "Cena fuera de las calles turísticas principales — mejores precios y ambiente.",
          fr: "Dîner loin des rues touristiques principales — meilleurs prix et ambiance.",
          de: "Abendessen abseits der Haupttouristenstraßen — bessere Preise und Atmosphäre.",
        }),
      }),
    },
  ],
  safari: [
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Siesta v tented campu / lodge",
          en: "Camp / lodge siesta",
          it: "Siesta nel tented camp / lodge",
          es: "Siesta en campamento / lodge",
          fr: "Sieste au camp / lodge",
          de: "Siesta im Zeltcamp / Lodge",
        }),
        type: "ACTIVITY",
        priceLabel: loc(locale, {
          sl: "vključeno v nastanitev",
          en: "included in lodge",
          it: "incluso nel lodge",
          es: "incluido en el lodge",
          fr: "inclus au lodge",
          de: "in der Lodge inbegriffen",
        }),
        description: loc(locale, {
          sl: "Popoldanski odmor v kampu med game drives — senca, bazen (če je), priprava na večernji safari. V divjini ni mestnih kavarn.",
          en: "Afternoon rest at camp between game drives — no city cafés in the bush.",
          it: "Riposo pomeridiano al campo tra i game drive — ombra, piscina (se c'è), preparazione al safari serale. Niente caffè cittadini nella savana.",
          es: "Descanso vespertino en el campamento entre safaris — sombra, piscina (si hay), preparación para el safari nocturno. No hay cafés urbanos en la sabana.",
          fr: "Repos l'après-midi au camp entre les safaris — ombre, piscine (si disponible), préparation au safari du soir. Pas de cafés urbains dans la brousse.",
          de: "Nachmittagsruhe im Camp zwischen Game Drives — Schatten, Pool (falls vorhanden), Vorbereitung auf die Abendsafari. Keine Stadtcafés in der Wildnis.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Večerja in campfire v kampu",
          en: "Camp dinner & campfire",
          it: "Cena e falò al campo",
          es: "Cena y fogata en el campamento",
          fr: "Dîner et feu de camp",
          de: "Camp-Abendessen und Lagerfeuer",
        }),
        type: "EAT",
        priceLabel: "25–50 €",
        description: loc(locale, {
          sl: "Večerja v lodge ali tented campu — pogosto boma dinner z lokalno kuhinjo. Večerni game drive po dogovoru z vodnikom.",
          en: "Lodge dinner — often boma style; optional evening game drive with your guide.",
          it: "Cena al lodge o tented camp — spesso boma dinner con cucina locale. Game drive serale opzionale con la guida.",
          es: "Cena en el lodge o campamento — a menudo estilo boma con cocina local. Safari nocturno opcional con el guía.",
          fr: "Dîner au lodge ou camp — souvent style boma avec cuisine locale. Safari du soir optionnel avec le guide.",
          de: "Abendessen in der Lodge oder im Camp — oft Boma-Dinner mit lokaler Küche. Optionaler Abend-Game-Drive mit dem Guide.",
        }),
      }),
    },
  ],
  zanzibar: [
    {
      slot: "evening",
      activity: (locale, dayIdx) => ({
        name: loc(locale, {
          sl: "Forodhani Night Market (Stone Town)",
          en: "Forodhani Night Market",
          it: "Mercato notturno Forodhani (Stone Town)",
          es: "Mercado nocturno Forodhani (Stone Town)",
          fr: "Marché de nuit Forodhani (Stone Town)",
          de: "Forodhani-Nachtmarkt (Stone Town)",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Večernja ulična hrana na Forodhani — zanzibarski pizza, seafood skewers, sok. Najbolj živahno ob sončnem zahodu, ko se tržnica oživi.",
          en: "Street food at Forodhani — Zanzibar pizza, seafood; liveliest at sunset.",
          it: "Street food a Forodhani — pizza zanzibarina, spiedini di pesce, succhi. Più vivace al tramonto.",
          es: "Comida callejera en Forodhani — pizza zanzibarí, brochetas de marisco, zumos. Más animado al atardecer.",
          fr: "Street food à Forodhani — pizza zanzibarite, brochettes de fruits de mer, jus. Plus animé au coucher du soleil.",
          de: "Streetfood am Forodhani — Sansibar-Pizza, Meeresfrüchte-Spieße, Säfte. Am lebhaftesten bei Sonnenuntergang.",
        }),
      }),
      dayIdx: 0,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "The Rock Restaurant (Pingwe)",
          en: "The Rock Restaurant",
          it: "The Rock Restaurant (Pingwe)",
          es: "The Rock Restaurant (Pingwe)",
          fr: "The Rock Restaurant (Pingwe)",
          de: "The Rock Restaurant (Pingwe)",
        }),
        type: "EAT",
        priceLabel: "35–60 €",
        description: loc(locale, {
          sl: "Ikonična restavracija na skali ob plimi — rezervacija obvezna. Idealno po dnevu na vzhodni obali (Paje/Matemwe).",
          en: "Iconic rock restaurant — reservation required; best after an east-coast day.",
          it: "Ristorante iconico sulla roccia — prenotazione obbligatoria. Ideale dopo una giornata sulla costa est (Paje/Matemwe).",
          es: "Restaurante icónico sobre la roca — reserva obligatoria. Ideal tras un día en la costa este (Paje/Matemwe).",
          fr: "Restaurant emblématique sur le rocher — réservation obligatoire. Idéal après une journée sur la côte est (Paje/Matemwe).",
          de: "Ikonisches Felsrestaurant — Reservierung erforderlich. Ideal nach einem Tag an der Ostküste (Paje/Matemwe).",
        }),
      }),
      dayIdx: 1,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Seafood na severni obali (Nungwi)",
          en: "Nungwi seafood dinner",
          it: "Cena di pesce a Nungwi (costa nord)",
          es: "Mariscos en la costa norte (Nungwi)",
          fr: "Fruits de mer sur la côte nord (Nungwi)",
          de: "Meeresfrüchte an der Nordküste (Nungwi)",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Sveži morski sadeži v Nungwi po dnevu na severu — lobster, prawns, ugali. Plačaj po teži.",
          en: "Fresh catch dinner in Nungwi after a north-beach day.",
          it: "Pesce fresco a Nungwi dopo una giornata al nord — aragosta, gamberi, ugali. Si paga al peso.",
          es: "Mariscos frescos en Nungwi tras un día en el norte — langosta, gambas, ugali. Se paga por peso.",
          fr: "Fruits de mer frais à Nungwi après une journée au nord — homard, crevettes, ugali. Paiement au poids.",
          de: "Frischer Fisch in Nungwi nach einem Nordküsten-Tag — Hummer, Garnelen, Ugali. Bezahlung nach Gewicht.",
        }),
      }),
      dayIdx: 2,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Kizimkazi — večer ob plaži",
          en: "Kizimkazi beach dinner",
          it: "Kizimkazi — cena in spiaggia",
          es: "Kizimkazi — cena en la playa",
          fr: "Kizimkazi — dîner à la plage",
          de: "Kizimkazi — Strandabendessen",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Lahka večerja ob južni obali po delfinarnem ali plažnem dnevu — počasen ritem, lokalni gostilni.",
          en: "Relaxed southern beach dinner after a Kizimkazi day.",
          it: "Cena leggera sulla costa sud dopo una giornata a Kizimkazi — ritmo lento, trattorie locali.",
          es: "Cena ligera en la costa sur tras un día en Kizimkazi — ritmo pausado, restaurantes locales.",
          fr: "Dîner léger sur la côte sud après une journée à Kizimkazi — rythme lent, restaurants locaux.",
          de: "Leichtes Abendessen an der Südküste nach einem Kizimkazi-Tag — gemütliches Tempo, lokale Gaststätten.",
        }),
      }),
      dayIdx: 3,
    },
  ],
  los_angeles: [
    {
      slot: "evening",
      activity: (locale, dayIdx) => ({
        name: loc(locale, {
          sl: "Grand Central Market",
          en: "Grand Central Market",
          it: "Grand Central Market",
          es: "Grand Central Market",
          fr: "Grand Central Market",
          de: "Grand Central Market",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Večer v Grand Central Market (Downtown) — Eggslut, tacos, lokalni ponudniki pod eno streho. Odlično po dnevu v centru.",
          en: "Evening at Grand Central Market — Eggslut, tacos, local vendors under one roof.",
          it: "Serata al Grand Central Market (Downtown) — Eggslut, tacos, venditori locali sotto lo stesso tetto. Ottimo dopo una giornata in centro.",
          es: "Noche en Grand Central Market (Downtown) — Eggslut, tacos, vendedores locales bajo un mismo techo. Ideal tras un día en el centro.",
          fr: "Soirée au Grand Central Market (Downtown) — Eggslut, tacos, vendeurs locaux sous un même toit. Parfait après une journée au centre.",
          de: "Abend im Grand Central Market (Downtown) — Eggslut, Tacos, lokale Anbieter unter einem Dach. Ideal nach einem Tag in der Innenstadt.",
        }),
      }),
      dayIdx: 0,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Republique (Mid-Wilshire)",
          en: "Republique",
          it: "Republique (Mid-Wilshire)",
          es: "Republique (Mid-Wilshire)",
          fr: "Republique (Mid-Wilshire)",
          de: "Republique (Mid-Wilshire)",
        }),
        type: "EAT",
        priceLabel: "25–45 €",
        description: loc(locale, {
          sl: "Francosko-kalifornijska kuhinja v lepi stavbi — rezervacija priporočljiva za večer. Parkiranje prek valet ali Uber.",
          en: "French-Californian in a stunning building — reserve for dinner; Uber recommended.",
          it: "Cucina franco-californiana in uno splendido edificio — prenotazione consigliata per la cena. Parcheggio valet o Uber.",
          es: "Cocina franco-californiana en un edificio impresionante — reserva recomendada para la cena. Aparcamiento valet o Uber.",
          fr: "Cuisine franco-californienne dans un superbe bâtiment — réservation conseillée pour le dîner. Valet ou Uber.",
          de: "Französisch-kalifornische Küche in einem beeindruckenden Gebäude — Reservierung für das Abendessen empfohlen. Valet oder Uber.",
        }),
      }),
      dayIdx: 1,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Guelaguetza (Oaxacan)",
          en: "Guelaguetza",
          it: "Guelaguetza (Oaxacan)",
          es: "Guelaguetza (Oaxacan)",
          fr: "Guelaguetza (Oaxacan)",
          de: "Guelaguetza (Oaxacan)",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Avtentična oaxaška kuhinja v Koreatown — mole, tlayudas. Živahno in lokalno.",
          en: "Authentic Oaxacan in Koreatown — mole, tlayudas; lively local spot.",
          it: "Autentica cucina oaxaqueña a Koreatown — mole, tlayudas. Vivace e locale.",
          es: "Auténtica cocina oaxaqueña en Koreatown — mole, tlayudas. Animado y local.",
          fr: "Authentique cuisine oaxaqueña à Koreatown — mole, tlayudas. Animé et local.",
          de: "Authentische oaxakanische Küche in Koreatown — Mole, Tlayudas. Lebhaft und lokal.",
        }),
      }),
      dayIdx: 2,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Santa Monica Pier / Third Street Promenade",
          en: "Santa Monica evening",
          it: "Santa Monica Pier / Third Street Promenade",
          es: "Santa Monica Pier / Third Street Promenade",
          fr: "Santa Monica Pier / Third Street Promenade",
          de: "Santa Monica Pier / Third Street Promenade",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Večer ob morju — seafood ali burger na promenadi, sončni zahod na molo. Idealno po dnevu na zahodni obali.",
          en: "Beach evening — seafood or burgers on the promenade after a Westside day.",
          it: "Serata al mare — pesce o burger sulla promenade, tramonto sul molo. Ideale dopo una giornata sulla Westside.",
          es: "Noche junto al mar — mariscos o hamburguesas en el paseo, atardecer en el muelle. Ideal tras un día en la costa oeste.",
          fr: "Soirée au bord de mer — fruits de mer ou burgers sur la promenade, coucher de soleil sur la jetée. Idéal après une journée côté ouest.",
          de: "Abend am Meer — Meeresfrüchte oder Burger auf der Promenade, Sonnenuntergang am Pier. Ideal nach einem Tag an der Westküste.",
        }),
      }),
      dayIdx: 3,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Bestia (Arts District)",
          en: "Bestia",
          it: "Bestia (Arts District)",
          es: "Bestia (Arts District)",
          fr: "Bestia (Arts District)",
          de: "Bestia (Arts District)",
        }),
        type: "EAT",
        priceLabel: "35–55 €",
        description: loc(locale, {
          sl: "Priljubljena italijanska v Arts District — rezervacija tedne vnaprej. Uber, ne vozite sami.",
          en: "Popular Italian in Arts District — book weeks ahead; Uber strongly recommended.",
          it: "Rinomato italiano nell'Arts District — prenotare settimane prima. Uber, non guidare da soli.",
          es: "Italiano popular en Arts District — reservar semanas antes. Uber, no conduzcas tú mismo.",
          fr: "Italien prisé dans l'Arts District — réserver des semaines à l'avance. Uber, ne conduisez pas vous-même.",
          de: "Beliebtes Italienisch im Arts District — Wochen im Voraus buchen. Uber, nicht selbst fahren.",
        }),
      }),
      dayIdx: 4,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "In-N-Out Burger (Hollywood)",
          en: "In-N-Out Hollywood",
          it: "In-N-Out Burger (Hollywood)",
          es: "In-N-Out Burger (Hollywood)",
          fr: "In-N-Out Burger (Hollywood)",
          de: "In-N-Out Burger (Hollywood)",
        }),
        type: "EAT",
        priceLabel: "8–15 €",
        description: loc(locale, {
          sl: "Kalifornijska ikona po dnevu v Hollywoodu — hitro, poceni, avtentično. Not secret menu.",
          en: "California icon after a Hollywood day — fast, cheap, authentic.",
          it: "Icona californiana dopo una giornata a Hollywood — veloce, economico, autentico. Not secret menu.",
          es: "Icono californiano tras un día en Hollywood — rápido, barato, auténtico. Not secret menu.",
          fr: "Icône californienne après une journée à Hollywood — rapide, bon marché, authentique. Not secret menu.",
          de: "Kalifornische Ikone nach einem Hollywood-Tag — schnell, günstig, authentisch. Not secret menu.",
        }),
      }),
      dayIdx: 5,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Malibu Farm Pier Cafe",
          en: "Malibu Farm Pier Cafe",
          it: "Malibu Farm Pier Cafe",
          es: "Malibu Farm Pier Cafe",
          fr: "Malibu Farm Pier Cafe",
          de: "Malibu Farm Pier Cafe",
        }),
        type: "EAT",
        priceLabel: "20–40 €",
        description: loc(locale, {
          sl: "Večerja na koncu Malibu Pira — sveže, ob morju. Idealno po dnevu na PCH; rezervacija priporočljiva.",
          en: "Dinner at Malibu Pier — fresh, oceanfront; ideal after a PCH day.",
          it: "Cena alla fine del Malibu Pier — fresco, fronte mare. Ideale dopo una giornata sulla PCH; prenotazione consigliata.",
          es: "Cena al final del muelle de Malibu — fresco, frente al mar. Ideal tras un día en la PCH; reserva recomendada.",
          fr: "Dîner au bout du Malibu Pier — frais, face à la mer. Idéal après une journée sur la PCH ; réservation conseillée.",
          de: "Abendessen am Ende des Malibu Piers — frisch, direkt am Meer. Ideal nach einem PCH-Tag; Reservierung empfohlen.",
        }),
      }),
      dayIdx: 6,
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "The Original Farmers Market",
          en: "Farmers Market",
          it: "The Original Farmers Market",
          es: "The Original Farmers Market",
          fr: "The Original Farmers Market",
          de: "The Original Farmers Market",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Večer v Farmers Market ob The Grove — raznolika hrana, lokalno vzdušje, manj turistično kot Hollywood Blvd.",
          en: "Evening at Farmers Market by The Grove — varied food, local vibe.",
          it: "Serata al Farmers Market vicino a The Grove — cibo vario, atmosfera locale, meno turistico di Hollywood Blvd.",
          es: "Noche en Farmers Market junto a The Grove — comida variada, ambiente local, menos turístico que Hollywood Blvd.",
          fr: "Soirée au Farmers Market près de The Grove — nourriture variée, ambiance locale, moins touristique que Hollywood Blvd.",
          de: "Abend am Farmers Market bei The Grove — vielfältiges Essen, lokale Atmosphäre, weniger touristisch als Hollywood Blvd.",
        }),
      }),
      dayIdx: 7,
    },
  ],
  generic: [
    {
      slot: "morning",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Jutranji ogled / sprehod",
          en: "Morning sight or stroll",
          it: "Visita o passeggiata mattutina",
          es: "Visita o paseo matutino",
          fr: "Visite ou promenade matinale",
          de: "Morgendliche Besichtigung oder Spaziergang",
        }),
        type: "ACTIVITY",
        priceLabel: loc(locale, {
          sl: "brezplačno",
          en: "free",
          it: "gratuito",
          es: "gratis",
          fr: "gratuit",
          de: "kostenlos",
        }),
        description: loc(locale, {
          sl: "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj.",
          en: "Main morning sight — visit while it's still quiet.",
          it: "Principale visita del mattino — luogo o attrazione da vedere al mattino presto.",
          es: "Visita principal de la mañana — lugar o atracción mejor visitados temprano.",
          fr: "Visite principale du matin — lieu ou site à voir tôt le matin.",
          de: "Hauptbesichtigung am Vormittag — Ort oder Sehenswürdigkeit am besten früh morgens besuchen.",
        }),
      }),
    },
    {
      slot: "afternoon",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Pavza v kavarni",
          en: "Café break",
          it: "Pausa caffè",
          es: "Pausa en cafetería",
          fr: "Pause café",
          de: "Kaffeepause",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Kratka popoldanska pavza — kava, načrt za večer.",
          en: "Short afternoon café break.",
          it: "Breve pausa pomeridiana al caffè.",
          es: "Breve pausa vespertina en cafetería.",
          fr: "Courte pause café l'après-midi.",
          de: "Kurze Nachmittags-Kaffeepause.",
        }),
      }),
    },
    {
      slot: "evening",
      activity: (locale) => ({
        name: loc(locale, {
          sl: "Lokalna večerja",
          en: "Local dinner",
          it: "Cena locale",
          es: "Cena local",
          fr: "Dîner local",
          de: "Lokales Abendessen",
        }),
        type: "EAT",
        priceLabel: locale.mealPrice,
        description: loc(locale, {
          sl: "Večerja v restavraciji, kamor hodijo domačini.",
          en: "Dinner where locals eat.",
          it: "Cena in un ristorante frequentato dai locali.",
          es: "Cena en un restaurante donde comen los locales.",
          fr: "Dîner dans un restaurant fréquenté par les locaux.",
          de: "Abendessen in einem Restaurant, wo Einheimische essen.",
        }),
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
  // Do NOT map unknown cities (incl. origin hubs like Milan) onto Bangkok/Vietnam pools.
  if (SEA_GRAB.has(country)) return "generic";
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

/** Beach breakfast / siesta / pool before the plane has landed. */
function isPreArrivalFiller(a: Activity): boolean {
  const t = `${a.name} ${a.description ?? ""} ${a.type ?? ""}`.toLowerCase();
  if (/letališč|airport|transfer|check-?in|odhod|mednarodn|\blet\b|flight|prihod/i.test(t)) {
    return false;
  }
  return /zajtrk|breakfast|siesta|tropska\s*pavza|bazen|\bpool\b|beach\s*caf|promenad|plaž|senčnik|brunch|klimatiziran|jutranji sprehod|kava pred ogledom|morning walk|morning stroll|coffee before/i.test(
    t,
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
    const hadBenThanhOrBitexco =
      notFirstArrival &&
      [...slots.morning, ...slots.afternoon, ...slots.evening].some((a) =>
        /ben thanh|bitexco/i.test(`${a.name} ${a.description}`),
      );
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
      hadBenThanhOrBitexco ||
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
    /** Total Bangkok stay nights/days in this trip (for Kwai day-trip scheduling). */
    bangkokStayDays?: number;
    /** Day title / focus / highlight blob — forces Kwai overwrite when labeled but polluted. */
    dayLabelText?: string;
    isDepartureDay?: boolean;
    /** RV / campervan — no hotel copy, no daily meal padding. */
    motorhome?: boolean;
  },
): DaySlots {
  let result = {
    morning: [...slots.morning],
    afternoon: [...slots.afternoon],
    evening: [...slots.evening],
  };

  if (opts?.motorhome) {
    // Never inject hotel-style arrival dinners; light camp evening only if empty.
    if (result.evening.length === 0 && !opts.isDepartureDay) {
      result.evening.push(buildMotorhomeCampEvening(locale));
    }
    // Skip generic café/dinner pool padding — meals are optional, not daily slots.
    return sanitizeDaySlots(result, locale.langCode, locale.country, city);
  }

  if (opts?.isTripDay1 && !opts.skipEveningCulture) {
    const slimEvening = opts.lateArrival || opts.tightArrivalDay;
    const culture = slimEvening
      ? buildArrivalEveningCulture(city, locale).slice(0, 1)
      : buildArrivalEveningCulture(city, locale);
    for (const act of culture) {
      // Never stack a second dinner on top of an existing evening meal.
      if (act.type === "EAT" && result.evening.some((a) => a.type === "EAT" || /večerja|dinner/i.test(a.name))) {
        continue;
      }
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
    const slot =
      opts.arrivalSlot ??
      (opts.lateArrival ? "evening" : opts.redEyeArrival ? "morning" : "afternoon");
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
  // Generic pool ("Glavni dopoldanski ogled…") is last-resort only — never pad over real sights.
  const skipGenericPoolPad =
    skipGenericVietnamPad ||
    (poolKeyName === "generic" && (plannedSights >= 1 || hasMainSight || countActivities(result) >= 3));
  const minTotal = skipGenericPoolPad
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
  const hasFullDayExcursion = [...result.morning, ...result.afternoon, ...result.evening].some(
    (a) => isFullDayExcursion({ name: a.name, description: a.description ?? "" }),
  );
  const skipAfternoonFiller =
    locale.country === "US" ||
    hasFullDayExcursion ||
    result.afternoon.some((a) => a.type === "SIGHT" || a.type === "ACTIVITY");

  if (intensive || hasFullDayExcursion) {
    result.afternoon = result.afternoon.filter((a) => !isWeakFillerActivity(a));
    if (
      (hasMorningSight || hasFullDayExcursion) &&
      result.afternoon.every(isWeakFillerActivity)
    ) {
      result.afternoon = [];
    }
  }

  for (let pass = 0; pass < 3 && !skipGenericPoolPad && countActivities(result) < minTotal; pass++) {
    for (const entry of pool) {
      if (result[entry.slot].length === 0) {
        if (entry.slot === "morning" && hasMorningSight) continue;
        if (entry.slot === "afternoon" && skipAfternoonFiller) continue;
        if (intensive && entry.slot === "afternoon" && hasMorningSight) continue;
        if (
          entry.slot === "evening" &&
          result.evening.some((a) => a.type === "EAT" || /večerja|dinner/i.test(a.name))
        ) {
          continue;
        }
        const act = entry.activity(locale, dayIndexInRegion, poolCtx);
        if (intensive && isWeakFillerActivity(act) && hasMorningSight) continue;
        if (
          act.type === "EAT" &&
          result.evening.some((a) => a.type === "EAT" || /večerja|dinner/i.test(a.name))
        ) {
          continue;
        }
        if (!hasSimilar(result, act.name)) {
          result[entry.slot].push(act);
        }
      }
    }
    const idx = (dayIndexInRegion + pass) % pool.length;
    const entry = pool[idx];
    if (entry.slot !== "afternoon" || !skipAfternoonFiller) {
      if (intensive && entry.slot === "afternoon" && hasMorningSight) continue;
      if (
        entry.slot === "evening" &&
        result.evening.some((a) => a.type === "EAT" || /večerja|dinner/i.test(a.name))
      ) {
        continue;
      }
      if (result[entry.slot].length < 2 && countActivities(result) < minTotal) {
        const act = entry.activity(locale, dayIndexInRegion, poolCtx);
        if (intensive && isWeakFillerActivity(act) && hasMorningSight) continue;
        if (
          act.type === "EAT" &&
          result.evening.some((a) => a.type === "EAT" || /večerja|dinner/i.test(a.name))
        ) {
          continue;
        }
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
            name: loc(locale, {
              sl: "Wat Arun (ob sončnem zahodu)",
              en: "Wat Arun (sunset)",
              it: "Wat Arun (al tramonto)",
              es: "Wat Arun (al atardecer)",
              fr: "Wat Arun (au coucher du soleil)",
              de: "Wat Arun (bei Sonnenuntergang)",
            }),
            description: isSunsetTemplePoi(a.name, a.description ?? "")
              ? a.description
              : loc(locale, {
                  sl: "Sončni zahod ob 18:00–19:00 — čez reko iz Wat Pho (5 THB trajekt). Ne obiskuj dopoldan.",
                  en: "Sunset visit ~18:00–19:00 — ferry from Wat Pho pier. Not a midday stop.",
                  it: "Tramonto ~18:00–19:00 — traghetto da Wat Pho (5 THB). Non di mattina.",
                  es: "Atardecer ~18:00–19:00 — ferry desde Wat Pho (5 THB). No por la mañana.",
                  fr: "Coucher de soleil ~18h–19h — ferry depuis Wat Pho (5 THB). Pas le matin.",
                  de: "Sonnenuntergang ~18:00–19:00 — Fähre von Wat Pho (5 THB). Nicht vormittags.",
                }),
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
    // Full-day Maeklong → Kwai → Death Railway loop (generic “your hotel”, never a brand).
    result = ensureBangkokKwaiDayTrip(result, locale, {
      dayInRegion: dayIndexInRegion,
      bangkokStayDays: opts?.bangkokStayDays ?? 3,
      priorScheduledText: opts?.priorScheduledText,
      isArrivalDay: opts?.isArrivalDay,
      isDepartureDay: opts?.isDepartureDay,
      dayLabelText: [opts?.dayLabelText, ...(opts?.dayHighlightNames ?? [])]
        .filter(Boolean)
        .join(" "),
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
