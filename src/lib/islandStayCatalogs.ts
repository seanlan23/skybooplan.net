import type { Activity } from "@/lib/aiPlan.functions";

export type IslandCatalogFactory = (slo: boolean) => Activity[];

/** island = beach/island days; bay_cruise = overnight boat in a large bay (Ha Long). */
export type IslandStayKind = "island" | "bay_cruise" | "mainland_base";

export type IslandDef = {
  match: RegExp;
  activities: IslandCatalogFactory;
  stayKind?: IslandStayKind;
};

function act(
  slo: boolean,
  name: { sl: string; en: string },
  type: string,
  price: { sl: string; en: string },
  desc: { sl: string; en: string },
): Activity {
  return {
    name: slo ? name.sl : name.en,
    type,
    priceLabel: slo ? price.sl : price.en,
    description: slo ? desc.sl : desc.en,
  };
}

const caribbeanGeneric = (slo: boolean): Activity[] => [
  act(slo, { sl: "Glavna plaža otoka", en: "Main island beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
    sl: "Sončenje, plavanje in počasen ritem — dneve si razporediš po svoje.",
    en: "Swim, sunbathe, slow pace — plan days at your own rhythm.",
  }),
  act(slo, { sl: "Snorkljanje ob koralnem grebenu", en: "Coral reef snorkeling" }, "ACTIVITY", { sl: "20–50 €", en: "€20–50" }, {
    sl: "Najem opreme ali izlet z lokalnim čolnom do grebena in lagune.",
    en: "Gear rental or local boat trip to reef and lagoon.",
  }),
  act(slo, { sl: "Izlet z lokalnim čolnom", en: "Local boat tour" }, "ACTIVITY", { sl: "30–70 €", en: "€30–70" }, {
    sl: "Pol-dnevni ali celodnevni izlet — snorkljanje, prazne plaže, piknik na morju.",
    en: "Half or full-day trip — snorkeling, quiet coves, picnic at sea.",
  }),
  act(slo, { sl: "Razgledna točka / obala ob sončnem zahodu", en: "Viewpoint / sunset coast" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
    sl: "Večerni sončni zahod z beach barom ali kratkim vzponom na razgled.",
    en: "Sunset from a beach bar or short viewpoint hike.",
  }),
  act(slo, { sl: "Vodni športi (kajak, paddleboard)", en: "Water sports (kayak, SUP)" }, "ACTIVITY", { sl: "15–40 €", en: "€15–40" }, {
    sl: "Najem kajaka ali SUP ob glavni plaži — mirna voda, lasten tempo.",
    en: "Kayak or SUP rental at the main beach.",
  }),
  act(slo, { sl: "Lokalna karibska večerja", en: "Local Caribbean dinner" }, "EAT", { sl: "15–35 €", en: "€15–35" }, {
    sl: "Morski sadeži, jerk chicken ali rum cake v beach baru ob morju.",
    en: "Seafood, jerk chicken or beach-bar dinner by the sea.",
  }),
];

const medIslandGeneric = (slo: boolean): Activity[] => [
  act(slo, { sl: "Plaže in zalivi otoka", en: "Island beaches & coves" }, "BEACH", { sl: "brezplačno", en: "free" }, {
    sl: "Raziskuj peščene in kamnite plaže — vsak dan drug zaliv po želji.",
    en: "Explore sand and pebble coves — a different bay each day.",
  }),
  act(slo, { sl: "Izlet z ladjico / čolnom", en: "Boat day trip" }, "ACTIVITY", { sl: "25–60 €", en: "€25–60" }, {
    sl: "Skupinski ali zasebni izlet do sosednjih otokov in skritih plaž.",
    en: "Group or private trip to nearby islets and hidden beaches.",
  }),
  act(slo, { sl: "Snorkljanje v čistem morju", en: "Clear-water snorkeling" }, "ACTIVITY", { sl: "10–30 €", en: "€10–30" }, {
    sl: "Kristalno morje — najem maske ali izlet z lokalnim vodnikom.",
    en: "Crystal-clear sea — mask rental or guided snorkel trip.",
  }),
  act(slo, { sl: "Razgledna točka / staro mestno jedro", en: "Viewpoint / old town" }, "SIGHT", { sl: "brezplačno – 10 €", en: "free – €10" }, {
    sl: "Kratek vzpon ali sprehod po ozkih ulicah z razgledom na morje.",
    en: "Short hike or old-town stroll with sea views.",
  }),
  act(slo, { sl: "Večerja ob morju", en: "Seaside dinner" }, "EAT", { sl: "20–45 €", en: "€20–45" }, {
    sl: "Taverna ali beach bar z lokalno hrano in sončnim zahodom.",
    en: "Taverna or beach bar with local food and sunset.",
  }),
];

const tropicalGeneric = (slo: boolean): Activity[] => [
  act(slo, { sl: "Plaže in lagune", en: "Beaches & lagoons" }, "BEACH", { sl: "brezplačno", en: "free" }, {
    sl: "Majhen otok — sončenje, plavanje in brez nujnega urnika.",
    en: "Small island — swim, sunbathe, no fixed schedule needed.",
  }),
  act(slo, { sl: "Snorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "20–55 €", en: "€20–55" }, {
    sl: "Grebeni in morski življenje v bližini — najem čolna ali lokalni operater.",
    en: "Nearby reefs and marine life — boat hire or local operator.",
  }),
  act(slo, { sl: "Izlet z lokalnim čolnom", en: "Local boat excursion" }, "ACTIVITY", { sl: "25–60 €", en: "€25–60" }, {
    sl: "Island hopping, prazne plaže in snorkljanje na lastnem ritmu.",
    en: "Island hopping, empty beaches and snorkeling at your pace.",
  }),
  act(slo, { sl: "Razgled / sončni zahod", en: "Viewpoint / sunset" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
    sl: "Najvišja točka ali zahodna obala — panoramski razgled.",
    en: "Highest point or west coast — panoramic views.",
  }),
  act(slo, { sl: "Lokalna večerja ob morju", en: "Local beach dinner" }, "EAT", { sl: "10–30 €", en: "€10–30" }, {
    sl: "Morski sadeži in ulična hrana v beach baru ali na promenadi.",
    en: "Seafood and street food at a beach bar or promenade.",
  }),
];

/** Specific islands first; regional generics at the end (first match wins). */
export const SMALL_ISLAND_DEFS: IslandDef[] = [
  // —— Southeast Asia (existing) ——
  {
    match: /koh lipe|\blipe\b/i,
    activities: (slo) => [
      act(slo, { sl: "Sunrise Beach & Pattaya Beach", en: "Sunrise Beach & Pattaya Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Tri glavne plaže na južnem delu otoka — plavanje, sončenje, brez avtomobilov.",
        en: "Three main south beaches — swim, sunbathe, no cars on the island.",
      }),
      act(slo, { sl: "Snorkljanje ob grebenih", en: "Reef snorkeling" }, "ACTIVITY", { sl: "15–40 € (čoln)", en: "€15–40 (boat)" }, {
        sl: "Longtail čoln ali skupinski izlet — koralni grebeni in želve v bližini.",
        en: "Longtail or group trip — coral reefs and turtles nearby.",
      }),
      act(slo, { sl: "Izlet do Koh Rawi / Koh Adang", en: "Koh Rawi / Koh Adang boat trip" }, "ACTIVITY", { sl: "25–50 €", en: "€25–50" }, {
        sl: "Pol- ali celodnevni izlet v morski rezervat — snorkljanje in piknik na čolnu.",
        en: "Half or full-day marine park trip — snorkeling and boat picnic.",
      }),
      act(slo, { sl: "Viewpoint nad Pattaya Beach", en: "Pattaya Beach viewpoint" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Kratek vzpon — panoramski razgled na otok (zjutraj ali pred sončnim zahodom).",
        en: "Short climb — panoramic island views (morning or before sunset).",
      }),
      act(slo, { sl: "Sunset Beach & Walking Street", en: "Sunset Beach & Walking Street" }, "EAT", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Večer na zahodni plaži, nato morski sadeži na Walking Street.",
        en: "West beach evening, then seafood on Walking Street.",
      }),
      act(slo, { sl: "Kayak ob obali", en: "Coastal kayaking" }, "ACTIVITY", { sl: "10–20 €", en: "€10–20" }, {
        sl: "Najem kajaka ob Sunrise Beach — mirna voda, lasten tempo.",
        en: "Kayak rental at Sunrise Beach — calm water at your pace.",
      }),
    ],
  },
  {
    match: /krabi|ao nang|railay/i,
    stayKind: "mainland_base",
    activities: (slo) => [
      act(
        slo,
        { sl: "Hong Island / 4 otoki (Phra Nang, Poda, Chicken, Tup)", en: "Hong Island / 4 Islands (Phra Nang, Poda, Chicken, Tup)" },
        "ACTIVITY",
        { sl: "30–55 €", en: "€30–55" },
        {
          sl: "Drugačen čoln kot Phi Phi — lagune Hong Island ali 4 Islands iz Ao Nanga.",
          en: "A different boat from Phi Phi — Hong Island lagoons or the 4 Islands from Ao Nang.",
        },
      ),
      act(slo, { sl: "Railay / Phra Nang Beach", en: "Railay / Phra Nang Beach" }, "ACTIVITY", { sl: "5–15 € (čoln)", en: "€5–15 (boat)" }, {
        sl: "Kratek longtail iz Ao Nanga — pečine in Phra Nang jama, ne celodnevni Phi Phi.",
        en: "Short longtail from Ao Nang — cliffs and Phra Nang cave, not a full-day Phi Phi trip.",
      }),
    ],
  },
  {
    match: /boracay/i,
    activities: (slo) => [
      act(slo, { sl: "White Beach", en: "White Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "4 km finega peska — glavna plaža in kratki izleti z barko ob obali.",
        en: "4 km powder sand — main beach and short boat hops.",
      }),
      act(slo, { sl: "Island hopping", en: "Island hopping" }, "ACTIVITY", { sl: "20–35 €", en: "€20–35" }, {
        sl: "Crystal Cove, Crocodile Island, snorkljanje in piknik.",
        en: "Crystal Cove, Crocodile Island, snorkeling and lunch.",
      }),
      act(slo, { sl: "Mount Luho viewpoint", en: "Mount Luho viewpoint" }, "SIGHT", { sl: "3–5 €", en: "€3–5" }, {
        sl: "Najvišja točka — 360° razgled na White Beach.",
        en: "Highest point — 360° views over White Beach.",
      }),
      act(slo, { sl: "Puka Shell Beach", en: "Puka Shell Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Mirnejša severna plaža — manj gneče kot White Beach.",
        en: "Quieter north beach — fewer crowds than White Beach.",
      }),
      act(slo, { sl: "Snorkljanje & parasailing", en: "Snorkeling & parasailing" }, "ACTIVITY", { sl: "15–45 €", en: "€15–45" }, {
        sl: "Vodni športi ob White Beach z lokalnim operaterjem.",
        en: "Water sports at White Beach with local operators.",
      }),
      act(slo, { sl: "Diniwid Beach", en: "Diniwid Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Skrita plaža na severu — mirnejši pol-dan.",
        en: "Hidden north cove — quieter half-day escape.",
      }),
    ],
  },
  {
    match: /el nido/i,
    activities: (slo) => [
      act(slo, { sl: "Tour A: Big Lagoon & Secret Lagoon", en: "Tour A: Big Lagoon & Secret Lagoon" }, "ACTIVITY", { sl: "25–40 €", en: "€25–40" }, {
        sl: "Klasičen island hopping — turkizne lagune in snorkljanje (rezerviraj dan prej).",
        en: "Classic island hopping — turquoise lagoons and snorkeling.",
      }),
      act(slo, { sl: "Tour C: Hidden Beach & Matinloc", en: "Tour C: Hidden Beach & Matinloc" }, "ACTIVITY", { sl: "25–40 €", en: "€25–40" }, {
        sl: "Skrite plaže in pečine — drug dan drug tour (A, B, C, D).",
        en: "Hidden beaches and cliffs — pick a different tour each day.",
      }),
      act(slo, { sl: "Nacpan Beach", en: "Nacpan Beach" }, "BEACH", { sl: "brezplačno – 10 € prevoz", en: "free – €10 transport" }, {
        sl: "4 km zlata plaža severno — trikaj ali tricikel, manj gneče kot v mestu.",
        en: "4 km golden beach north of town — tricycle ride, fewer crowds.",
      }),
      act(slo, { sl: "Zasebni čoln / private boat", en: "Private boat charter" }, "ACTIVITY", { sl: "80–150 €", en: "€80–150" }, {
        sl: "Cel dan po meri — lagune in plaže brez skupinskega urnika.",
        en: "Full custom day — lagoons and beaches without group schedule.",
      }),
      act(slo, { sl: "Las Cabanas sunset", en: "Las Cabanas sunset" }, "EAT", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Beach bar z razgledom na zahod — večerja ob sončnem zahodu.",
        en: "Beach bar with west views — sunset dinner.",
      }),
      act(slo, { sl: "Bioluminiscenca (nočni izlet)", en: "Bioluminescence night tour" }, "ACTIVITY", { sl: "25–45 €", en: "€25–45" }, {
        sl: "Nočni čoln ali kayak — svetleči plankton v temnejših lagunah. Najbolje ob mlaju (temna luna); ob polni luni manj vidno.",
        en: "Night boat or kayak — glowing plankton in darker lagoons. Best on dark/new moon nights.",
      }),
    ],
  },
  {
    match: /phi phi|ko phi phi|koh phi/i,
    activities: (slo) => [
      act(slo, { sl: "Maya Bay (izlet z ladjo)", en: "Maya Bay (boat trip)" }, "ACTIVITY", { sl: "30–50 €", en: "€30–50" }, {
        sl: "Slavna plaža iz The Beach — rezerviraj zjutraj zaradi kvot.",
        en: "Famous beach from The Beach — book early for quotas.",
      }),
      act(slo, { sl: "Phi Phi Viewpoint", en: "Phi Phi Viewpoint" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Vzpon nad Tonsai — ikoničen pogled na zaliv (zjutraj).",
        en: "Hike above Tonsai — iconic bay panorama (morning).",
      }),
      act(slo, { sl: "Monkey Beach & Bamboo Island", en: "Monkey Beach & Bamboo Island" }, "ACTIVITY", { sl: "20–40 €", en: "€20–40" }, {
        sl: "Longtail izlet — snorkljanje, opice, prazne peščene plaže.",
        en: "Longtail trip — snorkeling, monkeys, sandbars.",
      }),
      act(slo, { sl: "Snorkljanje v zalivu", en: "Bay snorkeling" }, "ACTIVITY", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Grebeni tik ob otoku — najem maske ali kratek izlet.",
        en: "Reefs off the island — mask rental or short trip.",
      }),
      act(slo, { sl: "Loh Dalum Beach & Tonsai Bay", en: "Loh Dalum Beach & Tonsai Bay" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Plaže na južnem delu — plavanje dopoldan, večer ob obali.",
        en: "South beaches — swim by day, evening along the shore.",
      }),
    ],
  },
  {
    match: /\bgili\b|gili trawangan|gili air|gili meno/i,
    activities: (slo) => [
      act(slo, { sl: "Kolesarjenje okoli otoka", en: "Bike around the island" }, "ACTIVITY", { sl: "3–8 €", en: "€3–8" }, {
        sl: "Obhod v 1–2 urah s postanki na plažah.",
        en: "Circle the island in 1–2 hours with beach stops.",
      }),
      act(slo, { sl: "Snorkljanje s želvami", en: "Turtle snorkeling" }, "ACTIVITY", { sl: "brezplačno – 15 €", en: "free – €15" }, {
        sl: "Želve ob obali — samostojno ali z vodnikom.",
        en: "Turtles off the shore — solo or with a guide.",
      }),
      act(slo, { sl: "Čoln med Gili otoki", en: "Boat between Gili islands" }, "ACTIVITY", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Meno (mir), Air (potapljanje), Trawangan (živahno).",
        en: "Meno (quiet), Air (diving), Trawangan (lively).",
      }),
      act(slo, { sl: "Sunset na zahodni obali", en: "West-coast sunset" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Sončni zahod z beach barom — brez avtomobilov.",
        en: "Sunset beach bar — no cars on the islands.",
      }),
    ],
  },
  {
    match: /nusa penida/i,
    activities: (slo) => [
      act(slo, { sl: "Kelingking Beach", en: "Kelingking Beach" }, "SIGHT", { sl: "5–15 € prevoz", en: "€5–15 transport" }, {
        sl: "Ikoničen T-Rex klif — skuter ali voznik za dan na otoku.",
        en: "Iconic T-Rex cliff — scooter or driver for the day.",
      }),
      act(slo, { sl: "Angel's Billabong & Broken Beach", en: "Angel's Billabong & Broken Beach" }, "SIGHT", { sl: "vključeno", en: "included" }, {
        sl: "Naravni bazeni in morski lok — najbolje ob nizkem plimovanju.",
        en: "Natural pools and sea arch — best at low tide.",
      }),
      act(slo, { sl: "Manta Point", en: "Manta Point" }, "ACTIVITY", { sl: "35–60 €", en: "€35–60" }, {
        sl: "Sezonsko snorkljanje z morskimi puščicami.",
        en: "Seasonal manta ray snorkeling.",
      }),
      act(slo, { sl: "Crystal Bay & Atuh Beach", en: "Crystal Bay & Atuh Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Mirnejše vzhodne plaže — počasnejši dan.",
        en: "Quieter east-coast beaches.",
      }),
    ],
  },
  {
    match: /nusa lembongan|nusa ceningan|lembongan|ceningan/i,
    activities: (slo) => [
      act(slo, { sl: "Dream Beach & Mushroom Bay", en: "Dream Beach & Mushroom Bay" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Majhna plaža pod pečino — sončenje in snorkljanje ob obali.",
        en: "Cliff-framed coves — sun and shore snorkeling.",
      }),
      act(slo, { sl: "Yellow Bridge & Ceningan cliff jump", en: "Yellow Bridge & Ceningan cliff jump" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Peš ali skuter med otokoma — modra laguna in skoki v morje.",
        en: "Walk or scooter between islets — blue lagoon and cliff jumps.",
      }),
      act(slo, { sl: "Mangrove tour s čolnom", en: "Mangrove boat tour" }, "ACTIVITY", { sl: "10–20 €", en: "€10–20" }, {
        sl: "Vožnja skozi mangrove na Lembonganu — mirno dopoldne.",
        en: "Mangrove channel boat ride — calm morning trip.",
      }),
      act(slo, { sl: "Snorkljanje pri mangrovah / reef", en: "Mangrove & reef snorkeling" }, "ACTIVITY", { sl: "15–30 €", en: "€15–30" }, {
        sl: "Najem čolna ali maska z obale — koral in morski življenje.",
        en: "Boat hire or shore mask — coral and marine life.",
      }),
      act(slo, { sl: "Sunset na Jungut Batu", en: "Jungut Batu sunset" }, "EAT", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Večerja v beach baru z razgledom na Agung (Bali).",
        en: "Beach bar dinner with Mount Agung views.",
      }),
    ],
  },
  {
    match: /lombok|kuta lombok|senggigi|selong belanak|tanjung aan/i,
    activities: (slo) => [
      act(slo, { sl: "Selong Belanak & Tanjung Aan", en: "Selong Belanak & Tanjung Aan" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Zaobljen pesek in turkizna laguna na jugu Lomboka — učenje surfanja.",
        en: "Curved bay and turquoise south Lombok — beginner surf.",
      }),
      act(slo, { sl: "Izlet na Gili otoke", en: "Day trip to Gili Islands" }, "ACTIVITY", { sl: "15–35 €", en: "€15–35" }, {
        sl: "Speedboat iz Bangsal — snorkljanje in plaže na Gili Meno/Air/Trawangan.",
        en: "Speedboat from Bangsal — snorkeling on the Gilis.",
      }),
      act(slo, { sl: "Snorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "25–55 €", en: "€25–55" }, {
        sl: "Grebeni ob obali ali izlet z lokalnim operaterjem.",
        en: "Shore reefs or trip with local dive shop.",
      }),
      act(slo, { sl: "Pergasingan Hill / Sendang Gile", en: "Pergasingan Hill / Sendang Gile" }, "SIGHT", { sl: "5–15 €", en: "€5–15" }, {
        sl: "Vzpon ali slap na severu — panoramski razgled na zaliv.",
        en: "Hill trek or waterfall north coast — bay panorama.",
      }),
      act(slo, { sl: "Sasak vas & tradicionalna večerja", en: "Sasak village & local dinner" }, "EAT", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Lokalna kultura in pečen tuna ob morju.",
        en: "Sasak culture and grilled tuna by the sea.",
      }),
    ],
  },
  {
    match: /komodo|labuan bajo|rinca|padar/i,
    activities: (slo) => [
      act(slo, { sl: "Komodo National Park (2D/1N ladja)", en: "Komodo NP (2D/1N boat)" }, "ACTIVITY", { sl: "80–150 €", en: "€80–150" }, {
        sl: "Klasika — zmaji na Rinci, Padar viewpoint, Pink Beach, snorkljanje.",
        en: "Classic — dragons on Rinca, Padar hike, Pink Beach, snorkeling.",
      }),
      act(slo, { sl: "Padar Island viewpoint", en: "Padar Island viewpoint" }, "SIGHT", { sl: "vključeno v tour", en: "included in tour" }, {
        sl: "Vzpon ob sončnem vzhodu — tri barvne plaže iz ikoničnega kadra.",
        en: "Sunrise hike — three-colored beaches panorama.",
      }),
      act(slo, { sl: "Pink Beach & Manta Point", en: "Pink Beach & Manta Point" }, "BEACH", { sl: "vključeno", en: "included" }, {
        sl: "Roza pesek in snorkljanje z morskimi puščicami (sezonsko).",
        en: "Pink sand and manta snorkeling (seasonal).",
      }),
      act(slo, { sl: "Cunca Wulang & Air Terjun", en: "Cunca Wulang waterfall" }, "NATURE", { sl: "20–35 €", en: "€20–35" }, {
        sl: "Pol-dnevni izlet na celini Flores — kanjon in slapovi blizu Labuan Baja.",
        en: "Half-day Flores mainland — canyon and waterfalls near Labuan Bajo.",
      }),
      act(slo, { sl: "Sunset v Labuan Baju", en: "Labuan Bajo sunset" }, "EAT", { sl: "10–30 €", en: "€10–30" }, {
        sl: "Morski sadeži na pomolu — priprava na jutrišnji odhod z ladjo.",
        en: "Seafood on the pier — eve before boat departure.",
      }),
    ],
  },
  {
    match: /raja ampat|waisai|wayag|sorong/i,
    activities: (slo) => [
      act(slo, { sl: "Wayag viewpoint (ladja)", en: "Wayag viewpoint (boat)" }, "SIGHT", { sl: "100–200 €", en: "€100–200" }, {
        sl: "Ikonične zelené otočke iz letalskih posnetkov — večdnevni liveaboard ali speedboat.",
        en: "Iconic karst islets — multi-day liveaboard or speedboat.",
      }),
      act(slo, { sl: "Snorkljanje & potapljanje na grebenu", en: "Reef snorkeling & diving" }, "ACTIVITY", { sl: "40–90 €", en: "€40–90" }, {
        sl: "Najbolj biodiverziteta na svetu — vsak dan drug dive site.",
        en: "World's richest reefs — different dive site each day.",
      }),
      act(slo, { sl: "Piaynemo / Fam Islands", en: "Piaynemo / Fam Islands" }, "ACTIVITY", { sl: "50–100 €", en: "€50–100" }, {
        sl: "Vzpon na razgled in lagune — manj gneče kot Wayag.",
        en: "Viewpoint hike and lagoons — less crowded than Wayag.",
      }),
      act(slo, { sl: "Otrojno jezero & mangrovi", en: "Jellyfish lake & mangroves" }, "NATURE", { sl: "30–60 €", en: "€30–60" }, {
        sl: "Plavanje z nežnimi meduzami (če je dovoljeno) in čoln skozi mangrove.",
        en: "Jellyfish lake swim (where permitted) and mangrove channels.",
      }),
      act(slo, { sl: "Lokalna vas & homestay večerja", en: "Village homestay dinner" }, "EAT", { sl: "8–20 €", en: "€8–20" }, {
        sl: "Fresh tuna in kokosova omaka — počasen ritem Raja Ampat.",
        en: "Fresh tuna in coconut sauce — slow Raja Ampat pace.",
      }),
    ],
  },
  {
    match: /sumba/i,
    activities: (slo) => [
      act(slo, { sl: "Mandorak & Weekuri Lagoon", en: "Mandorak & Weekuri Lagoon" }, "BEACH", { sl: "5–15 € prevoz", en: "€5–15 transport" }, {
        sl: "Naravna slana laguna in skrite plaže — najem avta/skuterja.",
        en: "Natural salt lagoon and hidden beaches — car or scooter.",
      }),
      act(slo, { sl: "Traditional villages & pasola", en: "Traditional villages" }, "SIGHT", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Ikonične hiše z visokimi strehami — kultura poleg plaž.",
        en: "High-roof traditional houses — culture beside beaches.",
      }),
      act(slo, { sl: "Surf Nihiwatu / occy\'s left", en: "Surf Occy's Left area" }, "ACTIVITY", { sl: "brezplačno – 30 €", en: "free – €30" }, {
        sl: "Svetovno znani valovi na zahodu — ali mirnejše plaže na jugu.",
        en: "World-famous west breaks — or quieter south beaches.",
      }),
      act(slo, { sl: "Wairinding savana & sunset", en: "Wairinding savanna & sunset" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Zelena savana in dramatičen sončni zahod — Sumba je drugačen od Balija.",
        en: "Green savanna and dramatic sunset — Sumba unlike Bali.",
      }),
    ],
  },
  {
    match: /karimunjawa/i,
    activities: tropicalGeneric,
  },
  {
    match: /bunaken|manado|pulau weh|sabang/i,
    activities: (slo) => [
      act(slo, { sl: "Bunaken / Weh greben", en: "Bunaken / Weh reef" }, "ACTIVITY", { sl: "30–60 €", en: "€30–60" }, {
        sl: "Snorkljanje in potapljanje na stenem grebenu — čoln iz pristanišča.",
        en: "Wall reef snorkeling and diving — boat from harbour.",
      }),
      act(slo, { sl: "Pantai Iboih / Pasir Putih", en: "Iboih / Pasir Putih beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Mirne plaže in koral tik ob obali.",
        en: "Quiet beaches with coral right off shore.",
      }),
      act(slo, { sl: "Izlet z lokalnim čolnom", en: "Local boat trip" }, "ACTIVITY", { sl: "20–40 €", en: "€20–40" }, {
        sl: "Otočki okoli Bunakna ali Weh — snorkljanje in piknik.",
        en: "Islets around Bunaken or Weh — snorkel and picnic.",
      }),
    ],
  },
  {
    match: /derawan|maratua|sangalaki/i,
    activities: (slo) => [
      act(slo, { sl: "Snorkljanje z morskimi penzini", en: "Turtle snorkeling" }, "ACTIVITY", { sl: "20–45 €", en: "€20–45" }, {
        sl: "Sangalaki — želve v naravi, Derawan laguna.",
        en: "Sangalaki turtles, Derawan lagoon.",
      }),
      act(slo, { sl: "Maratua lake & overwater vibe", en: "Maratua lake & overwater" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Laguna sredi grebena — počasen otok zunaj glavnih poti.",
        en: "Reef-enclosed lagoon — remote slow island.",
      }),
      act(slo, { sl: "Izlet z ladjo med otoki", en: "Inter-island boat trip" }, "ACTIVITY", { sl: "30–60 €", en: "€30–60" }, {
        sl: "Kakaban (meduze), Sangalaki, Derawan v enem dnevu ali več dni.",
        en: "Kakaban jellyfish lake, Sangalaki, Derawan — day or multi-day.",
      }),
    ],
  },
  {
    match: /wakatobi/i,
    activities: (slo) => [
      act(slo, { sl: "House reef potapljanje", en: "House reef diving" }, "ACTIVITY", { sl: "40–80 €", en: "€40–80" }, {
        sl: "Top potapljaška destinacija — grebeni tik ob resortu.",
        en: "Top dive destination — reefs at the resort doorstep.",
      }),
      act(slo, { sl: "Snorkljanje & kayak", en: "Snorkeling & kayak" }, "ACTIVITY", { sl: "15–35 €", en: "€15–35" }, {
        sl: "Mirna laguna — lasten tempo brez gneče Balija.",
        en: "Calm lagoon — your pace without Bali crowds.",
      }),
      act(slo, { sl: "Otoške plaže & mangrovi", en: "Island beaches & mangroves" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Bela peščena plaža in čoln skozi mangrove.",
        en: "White sand and mangrove boat channels.",
      }),
    ],
  },
  {
    match: /bintan|batam|riau islands/i,
    activities: (slo) => [
      act(slo, { sl: "Plaže in resorti Bintana", en: "Bintan resort beaches" }, "BEACH", { sl: "brezplačno – resort", en: "free – resort" }, {
        sl: "Kratki pobeg iz Singapurja — laguna in golf ob morju.",
        en: "Quick escape from Singapore — lagoon and coastal resorts.",
      }),
      act(slo, { sl: "Snorkljanje & vodni športi", en: "Snorkeling & water sports" }, "ACTIVITY", { sl: "20–50 €", en: "€20–50" }, {
        sl: "Jet ski, banana boat ali snorkljanje z lokalnim operaterjem.",
        en: "Jet ski, banana boat or snorkel with local operator.",
      }),
      act(slo, { sl: "Izlet z ladjo po zalivu", en: "Bay boat tour" }, "ACTIVITY", { sl: "25–45 €", en: "€25–45" }, {
        sl: "Otočki v Riau arhipelagu — piknik in plavanje.",
        en: "Riau archipelago islets — picnic and swimming.",
      }),
    ],
  },
  {
    match: /phu quoc/i,
    activities: (slo) => [
      act(slo, { sl: "Sao Beach & Long Beach", en: "Sao Beach & Long Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Beli pesek in mirna voda na vzhodu otoka.",
        en: "White sand and calm water on the east coast.",
      }),
      act(slo, { sl: "Šnorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "20–45 €", en: "€20–45" }, {
        sl: "An Thoi arhipelag — čolni izleti do grebenov.",
        en: "An Thoi islands — boat trips to reefs.",
      }),
      act(slo, { sl: "Izlet z ladjo do sosednjih otokov", en: "Southern island boat tour" }, "ACTIVITY", { sl: "15–30 €", en: "€15–30" }, {
        sl: "3–4 otoki, snorkljanje in ribji krožnik na čolnu.",
        en: "3–4 islets, snorkeling and seafood lunch on boat.",
      }),
      act(slo, { sl: "Sunset na zahodni obali", en: "West-coast sunset" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Ribja omaka in beach bar ob sončnem zahodu.",
        en: "Seafood and beach bar at sunset.",
      }),
    ],
  },
  {
    match: /langkawi/i,
    activities: (slo) => [
      act(slo, { sl: "Pantai Cenang", en: "Pantai Cenang" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Glavna plaža z beach bari — sončenje in vodni športi.",
        en: "Main beach with bars — sun and water sports.",
      }),
      act(slo, { sl: "Island hopping (Dayang Bunting)", en: "Island hopping (Dayang Bunting)" }, "ACTIVITY", { sl: "20–35 €", en: "€20–35" }, {
        sl: "Jezero na otoku, eagle feeding, snorkljanje.",
        en: "Lake island, eagle feeding, snorkeling.",
      }),
      act(slo, { sl: "Skydome / cable car", en: "Cable car & Sky Bridge" }, "SIGHT", { sl: "15–25 €", en: "€15–25" }, {
        sl: "Vzpon na Gunung Mat Cincang — razgled na otok.",
        en: "Cable car to Mat Cincang — island panorama.",
      }),
      act(slo, { sl: "Tanjung Rhu & Datai", en: "Tanjung Rhu & Datai" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Mirnejše severne plaže — mangrovi in čist pesek.",
        en: "Quieter north beaches — mangroves and clean sand.",
      }),
    ],
  },
  {
    match: /perhentian/i,
    activities: (slo) => [
      act(slo, { sl: "Long Beach & Coral Bay", en: "Long Beach & Coral Bay" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Perhentian Besar — bel pesek, snorkljanje tik ob obali, brez avtomobilov.",
        en: "Perhentian Besar — white sand, shore snorkeling, no cars.",
      }),
      act(slo, { sl: "Snorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "20–45 €", en: "€20–45" }, {
        sl: "Turtle Point, Shark Point — najem čolna ali potapljaški center.",
        en: "Turtle Point, Shark Point — boat hire or dive shop.",
      }),
      act(slo, { sl: "Izlet z ladjo med Perhentian Besar/Kecil", en: "Boat between Besar & Kecil" }, "ACTIVITY", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Water taxi in snorkljanje — vsak dan drug zaliv.",
        en: "Water taxi and snorkel — different bay each day.",
      }),
      act(slo, { sl: "Fire show & BBQ na plaži", en: "Beach fire show & BBQ" }, "EAT", { sl: "8–20 €", en: "€8–20" }, {
        sl: "Večer na Long Beach — morski sadeži in živahna atmosfera.",
        en: "Long Beach evening — seafood and lively vibe.",
      }),
    ],
  },
  {
    match: /redang/i,
    activities: (slo) => [
      act(slo, { sl: "Pasir Panjang & Teluk Dalam", en: "Pasir Panjang & Teluk Dalam" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Glavna plaža resortov — turkizna voda in bel pesek.",
        en: "Main resort beach — turquoise water and white sand.",
      }),
      act(slo, { sl: "Snorkljanje na morskem parku", en: "Marine park snorkeling" }, "ACTIVITY", { sl: "25–50 €", en: "€25–50" }, {
        sl: "Zaščiten greben — čoln do Turtle Bay in Ma' Daerah.",
        en: "Protected reef — boat to Turtle Bay and Ma' Daerah.",
      }),
      act(slo, { sl: "Potapljanje", en: "Diving" }, "ACTIVITY", { sl: "40–80 €", en: "€40–80" }, {
        sl: "Redang je znana potapljaška destinacija — wreck in koral.",
        en: "Redang diving — wrecks and coral gardens.",
      }),
      act(slo, { sl: "Laguna & jungle trek", en: "Lagoon & jungle trek" }, "NATURE", { sl: "brezplačno – 15 €", en: "free – €15" }, {
        sl: "Kratek trek do skrite lagune — počasnejši dan stran od plaže.",
        en: "Short trek to hidden lagoon — slower day off the beach.",
      }),
    ],
  },
  {
    match: /tioman/i,
    activities: (slo) => [
      act(slo, { sl: "Salang & ABC Beach", en: "Salang & ABC Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Glavne plaže na zahodu otoka — snorkljanje in sončenje.",
        en: "Main west-coast beaches — snorkeling and sun.",
      }),
      act(slo, { sl: "Snorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "25–55 €", en: "€25–55" }, {
        sl: "Koral tik ob obali — Renggis, Soyak Island izleti.",
        en: "Shore coral — Renggis and Soyak Island trips.",
      }),
      act(slo, { sl: "Juara Beach (vzhod)", en: "Juara Beach (east)" }, "BEACH", { sl: "brezplačno – 10 €", en: "free – €10" }, {
        sl: "Mirnejša stran otoka — trek čez hrib ali čoln.",
        en: "Quieter east coast — hike over the island or boat.",
      }),
      act(slo, { sl: "Mangrove & kampung sprehod", en: "Mangrove & village walk" }, "ACTIVITY", { sl: "brezplačno", en: "free" }, {
        sl: "Tehoru vas in mangrovi — počasen ritem Tiomana.",
        en: "Tehoru village and mangroves — Tioman's slow pace.",
      }),
    ],
  },
  {
    match: /pangkor/i,
    activities: (slo) => [
      act(slo, { sl: "Pasir Bogak & Coral Beach", en: "Pasir Bogak & Coral Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Družinske plaže z mirno vodo — lokalni vibe, manj turistov kot Langkawi.",
        en: "Family beaches with calm water — local vibe, fewer tourists.",
      }),
      act(slo, { sl: "Snorkljanje & kayak", en: "Snorkeling & kayak" }, "ACTIVITY", { sl: "15–35 €", en: "€15–35" }, {
        sl: "Najem opreme ob Pasir Bogak — koral in ribe blizu obale.",
        en: "Gear rental at Pasir Bogak — coral and fish near shore.",
      }),
      act(slo, { sl: "Dutch Fort & fishing village", en: "Dutch Fort & fishing village" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Kratka kultura + morski sadeži v kampungu.",
        en: "Short culture stop plus kampung seafood.",
      }),
      act(slo, { sl: "Sunset cruise", en: "Sunset cruise" }, "ACTIVITY", { sl: "20–40 €", en: "€20–40" }, {
        sl: "Večerni izlet z ladjo okoli otoka.",
        en: "Evening boat loop around the island.",
      }),
    ],
  },
  {
    match: /sipadan|mabul|kapalai/i,
    activities: (slo) => [
      act(slo, { sl: "Sipadan potapljanje (dovoljenje)", en: "Sipadan diving (permit)" }, "ACTIVITY", { sl: "100–200 €", en: "€100–200" }, {
        sl: "Svetovni top dive — barracuda tornado, želve (omejena kvota, rezerviraj vnaprej).",
        en: "World-class diving — barracuda tornado, turtles (limited permits, book ahead).",
      }),
      act(slo, { sl: "Mabul & Kapalai snorkljanje", en: "Mabul & Kapalai snorkeling" }, "ACTIVITY", { sl: "30–60 €", en: "€30–60" }, {
        sl: "Makro potapljanje in house reef — baza na Mabulu.",
        en: "Muck diving and house reef — base on Mabul.",
      }),
      act(slo, { sl: "Bajau Laut vas", en: "Bajau Laut village" }, "SIGHT", { sl: "brezplačno – 10 €", en: "free – €10" }, {
        sl: "Palačke nad vodo — kultura morskih nomadov.",
        en: "Stilt village — sea nomad culture.",
      }),
      act(slo, { sl: "Sunset na Mabulu", en: "Mabul sunset" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Počasen večer med potapljaškimi izleti.",
        en: "Slow evenings between dive trips.",
      }),
    ],
  },
  {
    match: /con dao/i,
    activities: (slo) => [
      act(slo, { sl: "Dam Trau & An Hai Beach", en: "Dam Trau & An Hai Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Mirne plaže ob letališču in v mestu — počasen otok brez množic.",
        en: "Quiet beaches near town — slow island without crowds.",
      }),
      act(slo, { sl: "Snorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "25–50 €", en: "€25–50" }, {
        sl: "Zaščiten morski park — koral in morske želve.",
        en: "Marine protected area — coral and sea turtles.",
      }),
      act(slo, { sl: "Bay Canh Island (želve)", en: "Bay Canh Island (turtles)" }, "NATURE", { sl: "20–40 €", en: "€20–40" }, {
        sl: "Sezonsko gnezdenje želv — nočni obiski z vodnikom.",
        en: "Seasonal turtle nesting — guided night visits.",
      }),
      act(slo, { sl: "Motorbike okoli otoka", en: "Scooter around the island" }, "ACTIVITY", { sl: "5–10 €", en: "€5–10" }, {
        sl: "Coastal road, svetilnik in lokalna restavracija z morskimi sadeži.",
        en: "Coastal road, lighthouse and local seafood.",
      }),
    ],
  },
  {
    match: /ha long|halong|cat ba|lan ha/i,
    stayKind: "bay_cruise",
    activities: (slo) => [
      act(slo, { sl: "Nočna križarka po zalivu", en: "Overnight bay cruise" }, "ACTIVITY", { sl: "80–150 €", en: "€80–150" }, {
        sl: "1–2 noči na ladji — kraški otoki, kajak, večerja na krovu.",
        en: "1–2 nights on boat — karst islets, kayak, deck dinner.",
      }),
      act(slo, { sl: "Kayak & plavanje v lagunah", en: "Kayak & lagoon swimming" }, "ACTIVITY", { sl: "vključeno v cruise", en: "included in cruise" }, {
        sl: "Tihi zalivi brez gneče — jutranji kajak pred drugimi turisti.",
        en: "Quiet lagoons — morning kayak before crowds.",
      }),
      act(slo, { sl: "Sung Sot / Surprise Cave", en: "Sung Sot Cave" }, "SIGHT", { sl: "vključeno", en: "included" }, {
        sl: "Velika kraška jama — standard na večini cruise-ov.",
        en: "Large karst cave — on most cruise routes.",
      }),
      act(slo, { sl: "Cat Ba National Park", en: "Cat Ba National Park" }, "NATURE", { sl: "5–15 €", en: "€5–15" }, {
        sl: "Trek do razgleda in opice — pol dneva na največjem otoku zaliva.",
        en: "Viewpoint trek and monkeys — half day on the largest bay island.",
      }),
      act(slo, { sl: "Lan Ha Bay (mirnejša alternativa)", en: "Lan Ha Bay (quieter)" }, "ACTIVITY", { sl: "90–160 €", en: "€90–160" }, {
        sl: "Manj turistov kot Ha Long — enaka lepota, manj ladij.",
        en: "Fewer tourists than Ha Long — same beauty, fewer boats.",
      }),
    ],
  },
  {
    match: /koh rong|koh rong samloem/i,
    activities: (slo) => [
      act(slo, { sl: "Sok San & Long Set Beach", en: "Sok San & Long Set Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "7 km peščene plaže na Koh Rong — party na Koh Toch, mir na Samloem.",
        en: "7 km sand on Koh Rong — party at Koh Toch, quiet on Samloem.",
      }),
      act(slo, { sl: "Snorkljanje & bioluminiscenca", en: "Snorkeling & bioluminescence" }, "ACTIVITY", { sl: "15–35 €", en: "€15–35" }, {
        sl: "Nočni plankton v vodi — čoln ali snorkljanje ob mraku.",
        en: "Night plankton glow — boat or dusk snorkel.",
      }),
      act(slo, { sl: "Izlet z ladjo / kayak", en: "Boat trip / kayak" }, "ACTIVITY", { sl: "10–30 €", en: "€10–30" }, {
        sl: "Skriti zalivi med Koh Rong in Samloem — piknik na morju.",
        en: "Hidden coves between the two islands — picnic at sea.",
      }),
      act(slo, { sl: "Jungle trek do svetilnika", en: "Jungle trek to lighthouse" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Pogled na zaliv s hriba — pol dneva stran od plaže.",
        en: "Bay view from the hill — half day off the beach.",
      }),
      act(slo, { sl: "Seafood BBQ na plaži", en: "Beach seafood BBQ" }, "EAT", { sl: "5–15 €", en: "€5–15" }, {
        sl: "Kambodža poceni morski sadeži — večer ob ognju na pesku.",
        en: "Cheap Cambodian seafood — bonfire evenings on the sand.",
      }),
    ],
  },
  {
    match: /koh samui|koh phangan|koh tao/i,
    activities: (slo) => [
      act(slo, { sl: "Glavne plaže otoka", en: "Main island beaches" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Chaweng/Lamai (Samui), Sairee (Tao), Haad Rin (Phangan) — vsak dan druga plaža.",
        en: "Chaweng/Lamai, Sairee, Haad Rin — different beach each day.",
      }),
      act(slo, { sl: "Snorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "25–60 €", en: "€25–60" }, {
        sl: "Koh Tao = potapljaška meka; Samui/Phangan = čolni izleti do grebenov.",
        en: "Koh Tao diving mecca; Samui/Phangan reef boat trips.",
      }),
      act(slo, { sl: "Izlet z ladjo", en: "Boat day trip" }, "ACTIVITY", { sl: "20–45 €", en: "€20–45" }, {
        sl: "Ang Thong (Samui), Sail Rock (Tao) — odvisno od baze.",
        en: "Ang Thong from Samui, Sail Rock from Tao — depends on base.",
      }),
      act(slo, { sl: "Viewpoint & sunset", en: "Viewpoint & sunset" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Kratek vzpon ali beach bar ob sončnem zahodu.",
        en: "Short hike or sunset beach bar.",
      }),
    ],
  },
  {
    match: /malapascua|siargao|camiguin|panglao/i,
    activities: tropicalGeneric,
  },

  // —— Caribbean (specific) ——
  {
    match: /aruba/i,
    activities: (slo) => [
      act(slo, { sl: "Eagle Beach & Palm Beach", en: "Eagle Beach & Palm Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Top plaži z divjimi divjadmi in visokimi palmami — sončenje in plavanje.",
        en: "Top beaches with divi-divi trees — swim and sunbathe.",
      }),
      act(slo, { sl: "Snorkljanje pri Antilla shipwreck", en: "Antilla shipwreck snorkeling" }, "ACTIVITY", { sl: "35–55 €", en: "€35–55" }, {
        sl: "Potopljeni nemški tanker — snorkljanje ali potapljanje z čolnom.",
        en: "Sunken German freighter — snorkel or dive by boat.",
      }),
      act(slo, { sl: "Arikok National Park", en: "Arikok National Park" }, "NATURE", { sl: "15 € vstop", en: "€15 entry" }, {
        sl: "Puščavski kraš, Natural Pool in indijanske skale — najem 4x4 priporočljiv.",
        en: "Desert terrain, Natural Pool and Indian caves — 4x4 recommended.",
      }),
      act(slo, { sl: "Baby Beach & Rodgers Beach", en: "Baby Beach & Rodgers Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Mirna plitvina voda — idealno za snorkljanje z otroki ali začetnike.",
        en: "Calm shallow water — ideal for beginner snorkeling.",
      }),
      act(slo, { sl: "Sunset cruise", en: "Sunset cruise" }, "ACTIVITY", { sl: "40–70 €", en: "€40–70" }, {
        sl: "Jadranje ob zahodni obali z koktajlom ob sončnem zahodu.",
        en: "Sail along the west coast with sunset cocktails.",
      }),
    ],
  },
  {
    match: /cura[cç]ao|curacao/i,
    activities: (slo) => [
      act(slo, { sl: "Playa Kenepa (Knip Beach)", en: "Playa Kenepa (Knip Beach)" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Najlepša plaža otoka — turkizna voda in skale.",
        en: "Island's finest beach — turquoise water and cliffs.",
      }),
      act(slo, { sl: "Potapljanje & snorkljanje", en: "Diving & snorkeling" }, "ACTIVITY", { sl: "40–80 €", en: "€40–80" }, {
        sl: "Curaçao = svetovna potapljaška destinacija — grebeni dostopni z obale.",
        en: "World-class diving — reefs accessible from shore.",
      }),
      act(slo, { sl: "Willemstad & ponton most", en: "Willemstad & Queen Emma Bridge" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "UNESCO pastelna obala — pol dneva kultura, pol dneva plaža.",
        en: "UNESCO pastel waterfront — half culture, half beach.",
      }),
      act(slo, { sl: "Cas Abao & Porto Marie", en: "Cas Abao & Porto Marie" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Mirne plaže z ležalniki in beach barom.",
        en: "Quiet beaches with loungers and beach bars.",
      }),
      act(slo, { sl: "Izlet z ladjo na Klein Curaçao", en: "Klein Curaçao boat trip" }, "ACTIVITY", { sl: "50–80 €", en: "€50–80" }, {
        sl: "Nenaseljen otok z majhnim svetilnikom — cel dan na morju.",
        en: "Uninhabited islet with lighthouse — full day at sea.",
      }),
    ],
  },
  {
    match: /bonaire/i,
    activities: (slo) => [
      act(slo, { sl: "Shore diving & snorkljanje", en: "Shore diving & snorkeling" }, "ACTIVITY", { sl: "30–70 €", en: "€30–70" }, {
        sl: "Markerji ob obali — potapljanje neposredno z plaže.",
        en: "Shore markers — dive straight from the beach.",
      }),
      act(slo, { sl: "Pink Beach & Lac Bay", en: "Pink Beach & Lac Bay" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Roza pesek in windsurfing zaliv na vzhodu.",
        en: "Pink sand and windsurfing bay on the east.",
      }),
      act(slo, { sl: "Washington Slagbaai NP", en: "Washington Slagbaai NP" }, "NATURE", { sl: "25 €", en: "€25" }, {
        sl: "Flamingi, slane jezera in divja obala — najem avta priporočljiv.",
        en: "Flamingos, salt flats and wild coast — car recommended.",
      }),
      act(slo, { sl: "Kraljeve morske punce", en: "Seahorse spotting" }, "ACTIVITY", { sl: "45–65 €", en: "€45–65" }, {
        sl: "Nočno potapljanje ali snorkljanje z vodnikom.",
        en: "Night dive or guided snorkel for seahorses.",
      }),
    ],
  },
  {
    match: /barbados/i,
    activities: (slo) => [
      act(slo, { sl: "Crane Beach & Bottom Bay", en: "Crane Beach & Bottom Bay" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Dramatične pečine in rdeč pesek na vzhodni obali.",
        en: "Dramatic cliffs and pink sand on the east coast.",
      }),
      act(slo, { sl: "Catamaran cruise", en: "Catamaran cruise" }, "ACTIVITY", { sl: "60–100 €", en: "€60–100" }, {
        sl: "Snorkljanje z želvami, odprt bar in plavanje ob ladji.",
        en: "Turtle snorkel, open bar and swim off the catamaran.",
      }),
      act(slo, { sl: "Harrison's Cave", en: "Harrison's Cave" }, "SIGHT", { sl: "30 €", en: "€30" }, {
        sl: "Podzemni tramvaj skozi stalaktitne dvorane.",
        en: "Underground tram through stalactite halls.",
      }),
      act(slo, { sl: "Oistins Friday fish fry", en: "Oistins Friday fish fry" }, "EAT", { sl: "15–30 €", en: "€15–30" }, {
        sl: "Ikonična petkovska ulična hrana — morski sadeži in reggae.",
        en: "Iconic Friday street seafood and reggae.",
      }),
    ],
  },
  {
    match: /exuma|bahamas/i,
    activities: (slo) => [
      act(slo, { sl: "Pig Beach (Big Major Cay)", en: "Pig Beach (Big Major Cay)" }, "ACTIVITY", { sl: "80–150 €", en: "€80–150" }, {
        sl: "Plavajoče prašiči — celodnevni speedboat izlet iz Nassau ali Staniel Cay.",
        en: "Swimming pigs — full-day speedboat from Nassau or Staniel Cay.",
      }),
      act(slo, { sl: "Thunderball Grotto", en: "Thunderball Grotto" }, "SIGHT", { sl: "vključeno v tour", en: "included in tour" }, {
        sl: "Snorkljanje v podvodni jami (James Bond) — ob nizkem plimovanju.",
        en: "Snorkel in the underwater cave — at low tide.",
      }),
      act(slo, { sl: "Cable Beach / Pink Sand", en: "Cable Beach / Pink Sand" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Roza pesek na Harbour Island ali glavne plaže Nassauja.",
        en: "Pink sand on Harbour Island or Nassau main beaches.",
      }),
      act(slo, { sl: "Island hopping z speedboatom", en: "Speedboat island hopping" }, "ACTIVITY", { sl: "100–200 €", en: "€100–200" }, {
        sl: "Več otokov v enem dnevu — iguanas, snorkljanje, prazne plaže.",
        en: "Multiple cays in one day — iguanas, snorkeling, empty beaches.",
      }),
    ],
  },
  {
    match: /jamaica|negril|montego/i,
    activities: (slo) => [
      act(slo, { sl: "Seven Mile Beach (Negril)", en: "Seven Mile Beach (Negril)" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Dolga bela plaža — sončenje, jerk chicken in rum punch.",
        en: "Long white beach — sun, jerk chicken and rum punch.",
      }),
      act(slo, { sl: "Rick's Café cliff diving", en: "Rick's Café cliff diving" }, "SIGHT", { sl: "brezplačno – 10 €", en: "free – €10" }, {
        sl: "Skoki v morje in sončni zahod na pečinah.",
        en: "Cliff jumps and sunset on the cliffs.",
      }),
      act(slo, { sl: "Snorkljanje & catamaran", en: "Snorkeling & catamaran" }, "ACTIVITY", { sl: "50–80 €", en: "€50–80" }, {
        sl: "Izlet ob koralnih grebenih z odprtim barom.",
        en: "Reef trip with open bar on catamaran.",
      }),
      act(slo, { sl: "Dunn's River Falls (iz Ocho Rios)", en: "Dunn's River Falls" }, "NATURE", { sl: "25 €", en: "€25" }, {
        sl: "Penjanje po slapovih v tropskem gozdu — pol dneva izlet.",
        en: "Climb the tiered waterfalls — half-day trip from Ocho Rios.",
      }),
    ],
  },
  {
    match: /st\.?\s*lucia|saint lucia/i,
    activities: (slo) => [
      act(slo, { sl: "Reduit Beach & Rodney Bay", en: "Reduit Beach & Rodney Bay" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Glavna plaža severa — vodni športi in beach bari.",
        en: "Main north beach — water sports and beach bars.",
      }),
      act(slo, { sl: "Pitons boat tour & snorkljanje", en: "Pitons boat tour & snorkeling" }, "ACTIVITY", { sl: "60–90 €", en: "€60–90" }, {
        sl: "Ikonični vulkanski špici iz morja — snorkljanje v Marine Reserve.",
        en: "Iconic volcanic peaks from the sea — marine reserve snorkeling.",
      }),
      act(slo, { sl: "Sulphur Springs / drive-in volcano", en: "Sulphur Springs" }, "SIGHT", { sl: "10–20 €", en: "€10–20" }, {
        sl: "Edini drive-in vulkan na svetu — blato in termalna kopel.",
        en: "World's only drive-in volcano — mud bath and thermal pools.",
      }),
      act(slo, { sl: "Anse Chastanet snorkljanje", en: "Anse Chastanet snorkeling" }, "ACTIVITY", { sl: "brezplačno – 30 €", en: "free – €30" }, {
        sl: "Koralni vrt tik ob plaži — maske na voljo v resortu.",
        en: "Coral garden off the beach — gear at nearby resort.",
      }),
    ],
  },
  {
    match: /turks|caicos|providenciales/i,
    activities: (slo) => [
      act(slo, { sl: "Grace Bay Beach", en: "Grace Bay Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Večkrat najboljša plaža na svetu — turkizna voda in bel pesek.",
        en: "Often ranked world's best beach — turquoise water, white sand.",
      }),
      act(slo, { sl: "Snorkljanje pri koralu", en: "Reef snorkeling" }, "ACTIVITY", { sl: "40–70 €", en: "€40–70" }, {
        sl: "Bight Reef ali boat trip do Smith's Reef.",
        en: "Bight Reef or boat to Smith's Reef.",
      }),
      act(slo, { sl: "Mudjin Harbor (Middle Caicos)", en: "Mudjin Harbor" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Dramatične pečine na sosednjem otoku — izlet z ladjo ali avtom.",
        en: "Dramatic cliffs on Middle Caicos — boat or car day trip.",
      }),
      act(slo, { sl: "Conch Bar Caves", en: "Conch Bar Caves" }, "SIGHT", { sl: "15 €", en: "€15" }, {
        sl: "Največja jamska sistema v Karibih — pol dneva avantura.",
        en: "Largest cave system in the Caribbean.",
      }),
    ],
  },
  {
    match: /punta cana|dominican republic|samana/i,
    activities: (slo) => [
      act(slo, { sl: "Bávaro & Macao Beach", en: "Bávaro & Macao Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Dolge peščene plaže — resorti in javni dostop do morja.",
        en: "Long sand beaches — resorts and public beach access.",
      }),
      act(slo, { sl: "Saona Island day trip", en: "Saona Island day trip" }, "ACTIVITY", { sl: "50–80 €", en: "€50–80" }, {
        sl: "Naravni rezervat — palmote, lagune in piknik na plaži.",
        en: "Nature reserve — palms, lagoons and beach BBQ.",
      }),
      act(slo, { sl: "Hoyo Azul cenote", en: "Hoyo Azul cenote" }, "SIGHT", { sl: "30 €", en: "€30" }, {
        sl: "Modra podzemna laguna v pečini — kratka pustolovščina.",
        en: "Blue underground lagoon in the cliff.",
      }),
      act(slo, { sl: "Snorkljanje & catamaran", en: "Snorkeling & catamaran" }, "ACTIVITY", { sl: "45–75 €", en: "€45–75" }, {
        sl: "Koralni grebeni in odprt bar na morju.",
        en: "Coral reefs and open bar at sea.",
      }),
    ],
  },
  {
    match: /vieques|culebra|puerto rico/i,
    activities: (slo) => [
      act(slo, { sl: "Flamenco Beach (Culebra)", en: "Flamenco Beach (Culebra)" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Top 10 plaž na svetu — tanki v vodi in bel pesek.",
        en: "World top-10 beach — tanks in the bay and white sand.",
      }),
      act(slo, { sl: "Mosquito Bay bioluminiscenca", en: "Mosquito Bay bioluminescence" }, "ACTIVITY", { sl: "40–60 €", en: "€40–60" }, {
        sl: "Nočni kayak v svetlečem zalivu na Vieques — rezerviraj vnaprej.",
        en: "Night kayak in glowing bay on Vieques — book ahead.",
      }),
      act(slo, { sl: "Snorkljanje & izlet z ladjo", en: "Snorkeling & boat trip" }, "ACTIVITY", { sl: "50–80 €", en: "€50–80" }, {
        sl: "Koralni grebeni okoli Culebre in Vieques.",
        en: "Reefs around Culebra and Vieques.",
      }),
      act(slo, { sl: "Playa Negra & Secret Beach", en: "Playa Negra & Secret Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Črni pesek in skrite plaže na Vieques.",
        en: "Black sand and hidden coves on Vieques.",
      }),
    ],
  },
  {
    match: /varadero|cayo coco|cayo santa maria/i,
    activities: (slo) => [
      act(slo, { sl: "Plaže Varadera / Cayo", en: "Varadero / Cayo beaches" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "20 km peščenih plaž — sončenje in kristalno morje.",
        en: "20 km of sand — sun and crystal-clear sea.",
      }),
      act(slo, { sl: "Snorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "30–60 €", en: "€30–60" }, {
        sl: "Koralni grebeni ob severni obali — izlet z ladjo.",
        en: "North-coast reefs — boat excursions.",
      }),
      act(slo, { sl: "Catamaran izlet", en: "Catamaran trip" }, "ACTIVITY", { sl: "50–70 €", en: "€50–70" }, {
        sl: "Odprt bar, snorkljanje in piknik na morju.",
        en: "Open bar, snorkeling and lunch at sea.",
      }),
      act(slo, { sl: "Delfini & mangrovi (Guanaroca)", en: "Dolphins & mangroves" }, "NATURE", { sl: "40 €", en: "€40" }, {
        sl: "Opazovanje delfinov in čoln skozi mangrove blizu Cienfuegos.",
        en: "Dolphin watching and mangrove boat near Cienfuegos.",
      }),
    ],
  },
  {
    match: /grand cayman|cayman/i,
    activities: (slo) => [
      act(slo, { sl: "Seven Mile Beach", en: "Seven Mile Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Dolga peščena plaža — javni dostopi med resorti.",
        en: "Long sand beach — public access between resorts.",
      }),
      act(slo, { sl: "Stingray City", en: "Stingray City" }, "ACTIVITY", { sl: "50–80 €", en: "€50–80" }, {
        sl: "Plavanje z morskimi piškoti na plitvi peščeni banki.",
        en: "Swim with stingrays on shallow sandbar.",
      }),
      act(slo, { sl: "Snorkljanje & potapljanje", en: "Snorkeling & diving" }, "ACTIVITY", { sl: "40–90 €", en: "€40–90" }, {
        sl: "Urbina Wall, Kittiwake wreck — svetovno znano potapljanje.",
        en: "Urbina Wall, Kittiwake wreck — world-class diving.",
      }),
      act(slo, { sl: "Starfish Point", en: "Starfish Point" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Plitva voda in morske zvezde na severu otoka.",
        en: "Shallow water and starfish on the north coast.",
      }),
    ],
  },
  {
    match: /antigua|barbuda/i,
    activities: (slo) => [
      act(slo, { sl: "365 plaž — Dickenson Bay & Half Moon", en: "365 beaches — Dickenson & Half Moon" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Vsak dan druga plaža — najbolj znani zalivi ob severu.",
        en: "A different beach each day — famous north-coast bays.",
      }),
      act(slo, { sl: "Snorkljanje & sailing", en: "Snorkeling & sailing" }, "ACTIVITY", { sl: "50–90 €", en: "€50–90" }, {
        sl: "Jadranje regate otok — snorkljanje in beach BBQ.",
        en: "Island sailing regatta — snorkel and beach BBQ.",
      }),
      act(slo, { sl: "Barbuda day trip", en: "Barbuda day trip" }, "ACTIVITY", { sl: "80–120 €", en: "€80–120" }, {
        sl: "Pink Beach in frigate bird colony — speedboat iz St. John's.",
        en: "Pink Beach and frigate birds — speedboat from St. John's.",
      }),
      act(slo, { sl: "Shirley Heights sunset", en: "Shirley Heights sunset" }, "SIGHT", { sl: "10 €", en: "€10" }, {
        sl: "Razgled na pristanišče in živa glasba ob nedeljah.",
        en: "Harbour view and live music on Sundays.",
      }),
    ],
  },
  {
    match: /roatan|utila/i,
    activities: (slo) => [
      act(slo, { sl: "West Bay & West End Beach", en: "West Bay & West End Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Beli pesek in koralni greben tik ob obali.",
        en: "White sand and reef right off the shore.",
      }),
      act(slo, { sl: "Potapljanje na grebenu", en: "Reef diving" }, "ACTIVITY", { sl: "35–70 €", en: "€35–70" }, {
        sl: "Mesoameriški greben — poceni potapljanje svetovnega razreda.",
        en: "Mesoamerican Reef — world-class affordable diving.",
      }),
      act(slo, { sl: "Zip-lining & mangrovi", en: "Zip-line & mangroves" }, "ACTIVITY", { sl: "40–60 €", en: "€40–60" }, {
        sl: "Džungla in čoln skozi mangrove — pol dneva avantura.",
        en: "Jungle zip-line and mangrove boat — half-day adventure.",
      }),
    ],
  },
  {
    match: /ambergris|caye caulker|belize/i,
    activities: (slo) => [
      act(slo, { sl: "Hol Chan & Shark Ray Alley", en: "Hol Chan & Shark Ray Alley" }, "ACTIVITY", { sl: "40–60 €", en: "€40–60" }, {
        sl: "Snorkljanje z morskimi psi in morskimi piškoti — top izlet.",
        en: "Snorkel with nurse sharks and stingrays — top trip.",
      }),
      act(slo, { sl: "The Split (Caye Caulker)", en: "The Split (Caye Caulker)" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Legendarni beach bar in laguna — go slow attitude.",
        en: "Legendary beach bar and lagoon — go slow island vibe.",
      }),
      act(slo, { sl: "Great Blue Hole (let)", en: "Great Blue Hole (flight)" }, "ACTIVITY", { sl: "200–350 €", en: "€200–350" }, {
        sl: "Scenic flight nad ikonično luknjo — enkratna izkušnja.",
        en: "Scenic flight over the iconic sinkhole — once-in-a-lifetime.",
      }),
      act(slo, { sl: "Snorkljanje ob grebenu", en: "Reef snorkeling" }, "ACTIVITY", { sl: "25–45 €", en: "€25–45" }, {
        sl: "Drugi največji greben na svetu — pol dneva na morju.",
        en: "Second-largest reef system — half day at sea.",
      }),
    ],
  },
  {
    match: /st\.?\s*thomas|st\.?\s*john|virgin islands|tortola|virgin gorda/i,
    activities: caribbeanGeneric,
  },
  {
    match: /grenada|carriacou/i,
    activities: caribbeanGeneric,
  },
  {
    match: /martinique|guadeloupe|st\.?\s*barth|st\.?\s*martin|sint maarten/i,
    activities: (slo) => [
      ...caribbeanGeneric(slo),
      act(slo, { sl: "Francoski / karibski trg", en: "French-Caribbean market" }, "EAT", { sl: "10–25 €", en: "€10–25" }, {
        sl: "Bouillabaisse in rum na lokalnem trgu — mešanica kultur.",
        en: "Creole markets — French Caribbean cuisine and rum.",
      }),
    ],
  },
  {
    match: /tobago/i,
    activities: caribbeanGeneric,
  },

  // —— Mediterranean ——
  {
    match: /santorini/i,
    activities: (slo) => [
      act(slo, { sl: "Red Beach & Perissa", en: "Red Beach & Perissa" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Vulkanični pesek in črna plaža — vsak dan drug zaliv.",
        en: "Volcanic red sand and black beach — different cove each day.",
      }),
      act(slo, { sl: "Caldera cruise & hot springs", en: "Caldera cruise & hot springs" }, "ACTIVITY", { sl: "30–50 €", en: "€30–50" }, {
        sl: "Ladja po kalderi, Nea Kameni in termalni izviri.",
        en: "Caldera boat, Nea Kameni volcano and hot springs.",
      }),
      act(slo, { sl: "Oia sunset", en: "Oia sunset" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Najslavnejši sončni zahod — pridi zgodaj zaradi gneče.",
        en: "Famous sunset — arrive early for crowds.",
      }),
      act(slo, { sl: "Akrotiri & wine tasting", en: "Akrotiri & wine tasting" }, "SIGHT", { sl: "15–35 €", en: "€15–35" }, {
        sl: "Minojska ruševina in vinska klet z razgledom.",
        en: "Minoan ruins and cliffside winery.",
      }),
    ],
  },
  {
    match: /mykonos/i,
    activities: (slo) => [
      act(slo, { sl: "Paradise & Super Paradise Beach", en: "Paradise & Super Paradise Beach" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Živahne plaže z beach partyji — ali mirnejši Agios Sostis.",
        en: "Lively beach clubs — or quieter Agios Sostis.",
      }),
      act(slo, { sl: "Delos day trip", en: "Delos day trip" }, "ACTIVITY", { sl: "25 €", en: "€25" }, {
        sl: "UNESCO antična svetišča na sosednjem otoku.",
        en: "UNESCO ancient sanctuary on nearby islet.",
      }),
      act(slo, { sl: "Little Venice & windmills", en: "Little Venice & windmills" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Sprehod po mestu in sončni zahod ob mlinih.",
        en: "Town stroll and sunset at the windmills.",
      }),
      act(slo, { sl: "Rhenia & south beaches (čoln)", en: "Rhenia & south beaches (boat)" }, "ACTIVITY", { sl: "40–70 €", en: "€40–70" }, {
        sl: "Zasebni zalivi dostopni samo z ladjo.",
        en: "Private coves reachable only by boat.",
      }),
    ],
  },
  {
    match: /milos|sarakiniko/i,
    activities: (slo) => [
      act(slo, { sl: "Sarakiniko (beli skalni plaži)", en: "Sarakiniko white rocks" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Lunarni beli skalni relief — najbolj fotogenična plaža.",
        en: "Moon-like white rock beach — most photogenic spot.",
      }),
      act(slo, { sl: "Kleftiko & Sikia cave (ladja)", en: "Kleftiko & Sikia cave (boat)" }, "ACTIVITY", { sl: "40–60 €", en: "€40–60" }, {
        sl: "Skrito plovilo piratov in jama z naravno svetlobo.",
        en: "Pirate cove and sea cave with natural light.",
      }),
      act(slo, { sl: "Tsigrado & Firiplaka", en: "Tsigrado & Firiplaka" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Barviti pečinski zalivi — vsak dan druga plaža.",
        en: "Colorful cliff beaches — a different bay daily.",
      }),
    ],
  },
  {
    match: /hvar|korčula|korcula|brač|brac|pakleni/i,
    activities: medIslandGeneric,
  },
  {
    match: /capri/i,
    activities: (slo) => [
      act(slo, { sl: "Grotta Azzurra", en: "Blue Grotto" }, "SIGHT", { sl: "15–20 €", en: "€15–20" }, {
        sl: "Modra jama z vstopom z majhnim čolnom — ob nizkem plimovanju.",
        en: "Blue cave entry by small boat — at low tide.",
      }),
      act(slo, { sl: "Faraglioni boat tour", en: "Faraglioni boat tour" }, "ACTIVITY", { sl: "20–40 €", en: "€20–40" }, {
        sl: "Ikonične pečine in plavanje v zalivih.",
        en: "Iconic sea stacks and swimming in coves.",
      }),
      act(slo, { sl: "Monte Solaro", en: "Monte Solaro" }, "SIGHT", { sl: "12 €", en: "€12" }, {
        sl: "Žičnica na najvišjo točko — razgled na Vesuv in morje.",
        en: "Chairlift to highest point — Bay of Naples views.",
      }),
      act(slo, { sl: "Marina Piccola & beach clubs", en: "Marina Piccola & beach clubs" }, "BEACH", { sl: "15–40 €", en: "€15–40" }, {
        sl: "Sončenje na južni strani otoka.",
        en: "Sunbathing on the south side of the island.",
      }),
    ],
  },
  {
    match: /zakynthos|zante|kefalonia|corfu|kerkyra|skiathos|skopelos|paros|naxos|ios\b|crete.*chania|milos/i,
    activities: medIslandGeneric,
  },

  // —— Mexico & Central America ——
  {
    match: /holbox|isla mujeres|cozumel/i,
    activities: (slo) => [
      act(slo, { sl: "Plaže brez avtomobilov", en: "Car-free beaches" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Holbox/Mujeres — golf kart, pesek in laguna.",
        en: "Holbox/Mujeres — golf carts, sand and lagoon.",
      }),
      act(slo, { sl: "Snorkljanje & whale sharks (sezona)", en: "Snorkeling & whale sharks (season)" }, "ACTIVITY", { sl: "50–90 €", en: "€50–90" }, {
        sl: "Cozumel greben ali whale shark Holbox (jun–sep).",
        en: "Cozumel reef or Holbox whale sharks (Jun–Sep).",
      }),
      act(slo, { sl: "Izlet z ladjo", en: "Boat excursion" }, "ACTIVITY", { sl: "30–60 €", en: "€30–60" }, {
        sl: "Punta Mosquito, Passion Island ali Palancar reef.",
        en: "Punta Mosquito, Passion Island or Palancar reef.",
      }),
      act(slo, { sl: "Sunset na zahodni obali", en: "West-coast sunset" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Beach bar in sončni zahod nad Karibskim morjem.",
        en: "Beach bar sunset over the Caribbean.",
      }),
    ],
  },

  // —— Indian Ocean & Pacific ——
  {
    match: /maldives|maafushi|thulusdhoo/i,
    activities: (slo) => [
      act(slo, { sl: "Bikini beach / local island", en: "Bikini beach / local island" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Določena plaža za turiste na lokalnih otokih — turkizna laguna.",
        en: "Designated tourist beach on local islands — turquoise lagoon.",
      }),
      act(slo, { sl: "Snorkljanje z morskimi želvami", en: "Turtle snorkeling" }, "ACTIVITY", { sl: "25–50 €", en: "€25–50" }, {
        sl: "Izlet z ladjo do grebena — želve, mante in sandbanks.",
        en: "Boat trip to reef — turtles, mantas and sandbanks.",
      }),
      act(slo, { sl: "Sandbank picnic", en: "Sandbank picnic" }, "ACTIVITY", { sl: "40–80 €", en: "€40–80" }, {
        sl: "Nenaseljen pesek sredi lagune — piknik in snorkljanje.",
        en: "Uninhabited sandbank in the lagoon — picnic and snorkel.",
      }),
      act(slo, { sl: "Sunset dolphin cruise", en: "Sunset dolphin cruise" }, "ACTIVITY", { sl: "35–60 €", en: "€35–60" }, {
        sl: "Delfini ob sončnem zahodu — romantičen večer na morju.",
        en: "Dolphins at sunset — romantic evening cruise.",
      }),
    ],
  },
  {
    match: /mauritius/i,
    activities: tropicalGeneric,
  },
  {
    match: /seychelles|la digue|praslin|mahe/i,
    activities: (slo) => [
      act(slo, { sl: "Anse Source d'Argent (La Digue)", en: "Anse Source d'Argent" }, "BEACH", { sl: "10 € vstop", en: "€10 entry" }, {
        sl: "Granitne skale in plitva laguna — najfotografiranejša plaža.",
        en: "Granite boulders and shallow lagoon — iconic beach.",
      }),
      act(slo, { sl: "Anse Lazio & Anse Georgette", en: "Anse Lazio & Anse Georgette" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Praslin — pršič bel pesek in turkizna voda.",
        en: "Praslin — powder white sand and turquoise water.",
      }),
      act(slo, { sl: "Snorkljanje & izlet z ladjo", en: "Snorkeling & boat trip" }, "ACTIVITY", { sl: "50–90 €", en: "€50–90" }, {
        sl: "Curieuse, St. Pierre ali Cousin Island.",
        en: "Curieuse, St. Pierre or Cousin Island trips.",
      }),
      act(slo, { sl: "Kolesarjenje po La Digue", en: "Cycling La Digue" }, "ACTIVITY", { sl: "5–10 €", en: "€5–10" }, {
        sl: "Otok brez avtomobilov — kolo do plaž in vanilije plantaž.",
        en: "Car-free island — bike to beaches and vanilla plantations.",
      }),
    ],
  },
  {
    match: /zanzibar|nungwi|paje|kendwa|stone town/i,
    activities: (slo) => [
      act(slo, { sl: "Plaže severa (Nungwi/Kendwa)", en: "North beaches (Nungwi/Kendwa)" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Plimovanje in sončenje — mirnejši ritem kot Stone Town.",
        en: "Tidal beaches for sun — slower pace than Stone Town.",
      }),
      act(slo, { sl: "Paje & Jozani (vzhod)", en: "Paje & Jozani (east)" }, "BEACH", { sl: "brezplačno – 10 €", en: "free – €10" }, {
        sl: "Kitesurfing v Paje, rdeči colobus v gozdu Jozani.",
        en: "Kitesurfing in Paje, red colobus in Jozani forest.",
      }),
      act(slo, { sl: "Snorkljanje & delfini (Kizimkazi)", en: "Snorkeling & dolphins (Kizimkazi)" }, "ACTIVITY", { sl: "30–60 €", en: "€30–60" }, {
        sl: "Delfini zgodaj zjutraj, snorkljanje na grebenu.",
        en: "Early-morning dolphins and reef snorkeling.",
      }),
      act(slo, { sl: "Prison Island & Nakupenda", en: "Prison Island & Nakupenda" }, "ACTIVITY", { sl: "25–45 €", en: "€25–45" }, {
        sl: "Želve in pesek sredi morja — izlet z ladjo.",
        en: "Giant tortoises and sandbank — boat day trip.",
      }),
      act(slo, { sl: "Stone Town & Forodhani", en: "Stone Town & Forodhani" }, "EAT", { sl: "5–15 €", en: "€5–15" }, {
        sl: "Zgodovinsko jedro in večerna ulična hrana ob pristanišču.",
        en: "Historic core and evening street food at the harbour.",
      }),
    ],
  },
  {
    match: /bora bora|moorea|tahiti|french polynesia/i,
    activities: (slo) => [
      act(slo, { sl: "Laguna & overwater vibes", en: "Lagoon & overwater vibes" }, "BEACH", { sl: "brezplačno", en: "free" }, {
        sl: "Plavanje v turkizni laguni — vsak zaliv drugačen odtenek.",
        en: "Swim in turquoise lagoon — each bay a different shade.",
      }),
      act(slo, { sl: "Snorkljanje z morskimi želvami & mante", en: "Turtle & manta snorkeling" }, "ACTIVITY", { sl: "50–100 €", en: "€50–100" }, {
        sl: "Lagoon tour z lokalnim vodnikom — želve, mante, coral gardens.",
        en: "Lagoon tour — turtles, mantas, coral gardens.",
      }),
      act(slo, { sl: "Jet ski / kayak po laguni", en: "Jet ski / lagoon kayak" }, "ACTIVITY", { sl: "40–80 €", en: "€40–80" }, {
        sl: "Raziskuj laguno po svoje — Motu picnic.",
        en: "Explore the lagoon — motu picnic stops.",
      }),
      act(slo, { sl: "Mount Rotui / belvedere", en: "Mount Rotui / belvedere" }, "SIGHT", { sl: "brezplačno", en: "free" }, {
        sl: "Panoramski razgled na dve laguni (Moorea).",
        en: "Panoramic twin-lagoon views (Moorea).",
      }),
    ],
  },
  {
    match: /fiji|yasawa|mamanuca/i,
    activities: tropicalGeneric,
  },

  // —— Regional fallbacks (must be last) ——
  {
    match: /caribbean|antilles|west indies/i,
    activities: caribbeanGeneric,
  },
  {
    match: /\b(cayo|cay|isla|atol|atoll)\b/i,
    activities: tropicalGeneric,
  },
];

export function findIslandDef(city: string): IslandDef | undefined {
  const c = city.trim();
  if (!c) return undefined;
  return SMALL_ISLAND_DEFS.find((d) => d.match.test(c));
}

export function getIslandStayKind(city: string): IslandStayKind {
  return findIslandDef(city)?.stayKind ?? "island";
}
