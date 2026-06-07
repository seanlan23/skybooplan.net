type CuratedHighlight = {
  day: number;
  name: string;
  description: string;
  priceLabel: string;
  visitDuration?: string;
  lat: number;
  lng: number;
};

type CuratedPoi = {
  name: string;
  nameSl: string;
  descSl: string;
  descEn: string;
  priceSl: string;
  priceEn: string;
  duration?: string;
  lat: number;
  lng: number;
};

const HANOI_POIS: CuratedPoi[] = [
  {
    name: "Ho Chi Minh Mausoleum",
    nameSl: "Mauzolej Ho Chi Minha",
    descSl: "Spomenik in trg Ba Dinh — obišči zjutraj (odprto v dopoldanskih urah, zaprto ob ponedeljkih).",
    descEn: "Ba Dinh memorial — morning visit only (closed Mondays).",
    priceSl: "brezplačno",
    priceEn: "free",
    duration: "2h",
    lat: 21.0369,
    lng: 105.8342,
  },
  {
    name: "Temple of Literature",
    nameSl: "Tempelj literature (Van Mieu)",
    descSl: "Prva vietnamska univerza — mirni vrtovi in stele; idealno za popoldanski obisk.",
    descEn: "Vietnam's first university — quiet courtyards; ideal afternoon stop.",
    priceSl: "3 €",
    priceEn: "€3",
    duration: "2h",
    lat: 21.0285,
    lng: 105.8356,
  },
  {
    name: "Imperial Citadel of Thang Long",
    nameSl: "Imperialna trdnjava Thang Long",
    descSl: "UNESCO ostanki kraljeve trdnjave — arheološki sloji in stolp severno od jezera.",
    descEn: "UNESCO royal citadel ruins — archaeological layers north of the lake.",
    priceSl: "4 €",
    priceEn: "€4",
    duration: "2h",
    lat: 21.0365,
    lng: 105.8402,
  },
  {
    name: "Hanoi Train Street",
    nameSl: "Hanoi Train Street",
    descSl: "Ozka ulica ob tirnicah — živahno ob ~19:00, ko vlak pripelje; kava in fotografije.",
    descEn: "Alley along the tracks — lively around 7 pm when trains pass.",
    priceSl: "brezplačno",
    priceEn: "free",
    duration: "1h",
    lat: 21.0253,
    lng: 105.8412,
  },
];

const HCMC_POIS: CuratedPoi[] = [
  {
    name: "War Remnants Museum",
    nameSl: "Muzej vojnih ostankov",
    descSl: "Močna zgodovinska razstava — načrtuj 2–3 ure; najboljše zjutraj.",
    descEn: "Powerful war history museum — plan 2–3 hours; best in the morning.",
    priceSl: "5 €",
    priceEn: "€5",
    duration: "pol dneva",
    lat: 10.7794,
    lng: 106.692,
  },
  {
    name: "Cafe Apartments (Nguyen Hue)",
    nameSl: "Cafe Apartments (Nguyen Hue)",
    descSl: "Balkoni nad pešcono — kava in opazovanje lokalnega življenja; popoldanski tempo.",
    descEn: "Balconied cafés on Nguyen Hue Walking Street — relaxed afternoon.",
    priceSl: "brezplačno",
    priceEn: "free",
    duration: "2h",
    lat: 10.7731,
    lng: 106.7042,
  },
  {
    name: "Ben Thanh Market",
    nameSl: "Tržnica Ben Thanh",
    descSl: "Kratki nakupi in street food — primerno za lahek zadnji dan pred prevozom.",
    descEn: "Quick souvenirs and street food — light last-day stop before transfer.",
    priceSl: "brezplačno",
    priceEn: "free",
    duration: "2h",
    lat: 10.772,
    lng: 106.698,
  },
];

const PHU_QUOC_POIS: CuratedPoi[] = [
  {
    name: "Sao Beach",
    nameSl: "Plaža Sao",
    descSl: "Beli pesek in mirnejše vode — dopoldanski izlet z ležalnikom.",
    descEn: "White sand and calm water — morning beach time.",
    priceSl: "brezplačno",
    priceEn: "free",
    duration: "pol dneva",
    lat: 10.227,
    lng: 103.967,
  },
  {
    name: "Phu Quoc Night Market",
    nameSl: "Nočna tržnica Phu Quoc",
    descSl: "Seafood in lokalni večer — idealno pred odhodom z otoka.",
    descEn: "Seafood night market — good farewell evening.",
    priceSl: "10–20 €",
    priceEn: "€10–20",
    duration: "2h",
    lat: 10.227,
    lng: 103.957,
  },
];

const HOI_AN_POIS: CuratedPoi[] = [
  {
    name: "An Bang Beach",
    nameSl: "Plaža An Bang",
    descSl: "Kratko kopanje ali sončni zahod — lahek dan pred prevozom.",
    descEn: "Short swim or sunset — easy day before transfer.",
    priceSl: "brezplačno",
    priceEn: "free",
    duration: "2h",
    lat: 15.916,
    lng: 108.358,
  },
  {
    name: "Hoi An Ancient Town",
    nameSl: "Staro mesto Hoi An",
    descSl: "Svetilke in ozke uličice — popoldanski sprehod in lokalna hrana.",
    descEn: "Lanterns and alleys — afternoon stroll and local food.",
    priceSl: "5 €",
    priceEn: "€5",
    duration: "2h",
    lat: 15.8794,
    lng: 108.327,
  },
];

function poiToHighlight(poi: CuratedPoi, day: number, slo: boolean): CuratedHighlight {
  return {
    day,
    name: slo ? poi.nameSl : poi.name,
    description: slo ? poi.descSl : poi.descEn,
    priceLabel: slo ? poi.priceSl : poi.priceEn,
    visitDuration: poi.duration ?? "2h",
    lat: poi.lat,
    lng: poi.lng,
  };
}

function cityKey(city: string): string {
  const c = city.toLowerCase();
  if (/hanoi/.test(c)) return "hanoi";
  if (/ho chi minh|saigon/.test(c)) return "hcmc";
  if (/phu quoc/.test(c)) return "phuquoc";
  if (/hoi an/.test(c)) return "hoian";
  if (/ha long|halong/.test(c)) return "halong";
  return "";
}

function catalogForCity(city: string): CuratedPoi[] {
  switch (cityKey(city)) {
    case "hanoi":
      return HANOI_POIS;
    case "hcmc":
      return HCMC_POIS;
    case "phuquoc":
      return PHU_QUOC_POIS;
    case "hoian":
      return HOI_AN_POIS;
    case "halong":
      return [
        {
          name: "Ha Long Bay Cruise",
          nameSl: "Križarka Ha Long Bay",
          descSl: "Karstni otoki z ladjico — glavna izkušnja v zalivu.",
          descEn: "Karst islets by boat — core bay experience.",
          priceSl: "80–120 €",
          priceEn: "€80–120",
          duration: "cel dan",
          lat: 20.91,
          lng: 107.183,
        },
      ];
    default:
      return [];
  }
}

function hasHighlightOnDay(
  highlights: CuratedHighlight[],
  day: number,
  regionCity: string,
): boolean {
  return highlights.some(
    (h) =>
      h.day === day &&
      h.name.trim().toLowerCase() !== regionCity.trim().toLowerCase() &&
      !/raziskovanje/i.test(h.name),
  );
}

/** Inject real Vietnam POIs so capped AI / blueprint fallback never leaves blank days. */
export function injectVietnamCuratedHighlights<
  T extends { city: string; startDay: number; endDay: number; highlights: CuratedHighlight[] },
>(regions: T[], langCode: string): T[] {
  const slo = langCode === "sl" || langCode.startsWith("sl");

  return regions.map((r) => {
    const catalog = catalogForCity(r.city);
    if (!catalog.length) return r;

    const highlights = [...r.highlights];
    const span = r.endDay - r.startDay + 1;

    for (let i = 0; i < span; i++) {
      const day = r.startDay + i;
      if (hasHighlightOnDay(highlights, day, r.city)) continue;

      const poi = catalog[i % catalog.length]!;
      highlights.push(poiToHighlight(poi, day, slo));
    }

    return {
      ...r,
      highlights: highlights.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name)),
    };
  });
}
