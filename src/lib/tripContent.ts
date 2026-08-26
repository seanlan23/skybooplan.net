import type { SkeletonHighlight, TripRegion } from "@/lib/aiPlan.functions";
import { arrivalDaySlot, isRedEyeArrival, type TripFlightContext } from "@/lib/flightScheduling";

/** AI echoed prompt scaffolding instead of real copy. */
export function isAiPlaceholderText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 6) return true;
  return (
    /2[–-]3\s*stavki/i.test(t) ||
    /120[–-]280\s*znak/i.test(t) ||
    /max\s*280\s*znak/i.test(t) ||
    /what to see|why it matters|practical tip/i.test(t) ||
    /kaj vidiš.*zakaj je vredno/i.test(t) ||
    /^berljivo\.?$/i.test(t) ||
    /^konkretno, berljivo\.?$/i.test(t) ||
    /glavni dopoldanski ogled/i.test(t) ||
    /mesto ali znamenitost,?\s*ki jo je najbolje obiskati zjutraj/i.test(t) ||
    /main morning sight\s*[—-]\s*visit while/i.test(t)
  );
}

/** POIs tied to a home region — drop when the trip city is elsewhere. */
const REGION_LOCKED_POI: Array<{ test: RegExp; homePattern: RegExp }> = [
  // France
  {
    test: /louvre|eiffel|montmartre|versailles|notre.?dame|champs.?élys|arc de triomphe|musée d'orsay/i,
    homePattern: /paris|nice|lyon|france|fran[cç]a|\bfr\b/i,
  },
  // Italy
  {
    test:
      /colosseum|colosseo|vatican museums|vatican city|st\.?\s*peter|trevi fountain|pantheon rome|duomo di milano|galleria vittorio|uffizi|ponte vecchio|doge's palace|rialto bridge/i,
    homePattern:
      /rome|roma|milan|milano|venice|venezia|florence|firenze|naples|napoli|italy|italij|\bit\b/i,
  },
  // Spain
  {
    test:
      /sagrada familia|park g[uü]ell|alhambra|prado museum|reina sofía|la rambla|gothic quarter barcelona|plaza mayor madrid/i,
    homePattern: /barcelona|madrid|seville|sevilla|granada|valencia|málaga|malaga|spain|španij|\bes\b/i,
  },
  // United Kingdom
  {
    test:
      /big ben|tower of london|buckingham palace|westminster abbey|british museum|london eye|hyde park corner|covent garden market|stonehenge/i,
    homePattern: /london|edinburgh|manchester|england|scotland|wales|britain|united kingdom|\buk\b|\bgb\b/i,
  },
  // United States
  {
    test:
      /statue of liberty|empire state|central park zoo|brooklyn bridge|times square|golden gate|alcatraz|hollywood walk|griffith observatory|las vegas strip|bellagio fountains/i,
    homePattern:
      /new york|los angeles|san francisco|chicago|las vegas|miami|honolulu|hawaii|boston|washington|\bus\b|jfk|lax|sfo|ord|las|hnl/i,
  },
  {
    test:
      /art institute of chicago|millennium park|navy pier|willis tower|360 chicago|field museum|shedd aquarium|magnificent mile|wrigley|route\s*66|gateway arch|cloud gate|chicago river/i,
    homePattern: /chicago|illinois|\bus\b|ord|mdw|route 66/i,
  },
  // Japan
  {
    test:
      /senso-?ji|meiji shrine|tokyo skytree|shibuya crossing|fushimi inari|kinkaku-ji|arashiyama bamboo|teamlab borderless/i,
    homePattern: /tokyo|kyoto|osaka|hiroshima|nara|japan|japonsk|\bjp\b/i,
  },
  // Greece
  {
    test: /acropolis|parthenon|acropolis museum|delphi archaeological|meteora monasteries/i,
    homePattern: /athens|santorini|mykonos|crete|thessaloniki|greece|grčij|\bgr\b/i,
  },
  // Germany
  {
    test: /brandenburg gate|reichstag|neuschwanstein|museum island berlin|checkpoint charlie/i,
    homePattern: /berlin|munich|münchen|hamburg|frankfurt|germany|nemčij|\bde\b/i,
  },
  // Netherlands
  {
    test: /rijksmuseum|van gogh museum|anne frank house|keukenhof|canal ring amsterdam/i,
    homePattern: /amsterdam|rotterdam|the hague|netherlands|nizozem|\bnl\b/i,
  },
  // Australia
  {
    test: /sydney opera house|harbour bridge|bondi beach|great ocean road|uluru/i,
    homePattern: /sydney|melbourne|brisbane|perth|cairns|australia|australij|\bau\b/i,
  },
  // Turkey
  {
    test: /hagia sophia|blue mosque|topkapi palace|grand bazaar istanbul|galata tower|cappadocia/i,
    homePattern: /istanbul|ankara|antalya|cappadocia|turkey|turčij|\btr\b/i,
  },
  // Canada
  {
    test: /maid of the mist|cave of the winds/i,
    homePattern: /niagara|canada|kanad|\bca\b|toronto|vancouver|ottawa|montreal|calgary/i,
  },
  // Thailand (sub-region)
  {
    test: /maya bay|phi phi|ko phi phi|pi pi|otoke? phi\b|otoki phi\b/i,
    homePattern: /krabi|phuket|phi phi|ao nang|railay|phang nga/i,
  },
  {
    test: /railay|phra nang|\bao nang\b|the hilltop/i,
    homePattern: /krabi|ao nang|railay|phra nang/i,
  },
  {
    test: /james bond island|phang nga bay/i,
    homePattern: /phuket|krabi|phang/i,
  },
  {
    test: /lanta old town|ko lanta|koh lanta|saladan/i,
    homePattern: /lanta|ko lanta|koh lanta/i,
  },
];

function regionContext(region: TripRegion, country?: string): string {
  return `${region.city} ${country ?? ""}`.toLowerCase();
}

/** City-only landmarks — Louvre is Paris, not Lyon; Jim Thompson is Bangkok, not Samui. */
const CITY_LOCKED_POI: Array<{ test: RegExp; cityPattern: RegExp }> = [
  {
    test: /louvre|tour eiffel|eiffel tower|montmartre|versailles|champs[-\s]?[eé]lys|arc de triomphe|mus[eé]e d['’]?orsay|orsay museum|sacr[eé][-\s]?c[oe]ur|centre pompidou|sainte[-\s]?chapelle|tuileries|le marais/i,
    cityPattern: /paris|versailles/i,
  },
  {
    test: /fourvi[eè]re|traboule|vieux lyon|t[eê]te d['’]or|place bellecour|mus[eé]e des confluences|presqu['’]?[iî]le/i,
    cityPattern: /lyon/i,
  },
  {
    test:
      /jim thompson|jima thompson|yaowarat|wat pho|wat arun|khao san|grand palace|bts skytrain|airport rail link|chatuchak|asiatique|mae klong|king power mahanakhon/i,
    cityPattern: /bangkok|krung thep|don mueang/i,
  },
  {
    test: /doi suthep|doi inthanon|nimman|wat phra singh|sunday walking street|\bcnx\b/i,
    cityPattern: /chiang mai|chiangmai/i,
  },
  {
    test: /savoey|\bpatong\b|bangla road/i,
    cityPattern: /phuket|patong/i,
  },
];

export function isCityLockedPoi(name: string, description: string, city: string): boolean {
  const blob = `${name} ${description}`;
  return CITY_LOCKED_POI.some((r) => r.test.test(blob) && !r.cityPattern.test(city));
}

export function isForeignPoiForRegion(
  name: string,
  region: TripRegion,
  country?: string,
  description = "",
): boolean {
  if (isCityLockedPoi(name, description, region.city ?? "")) return true;
  const ctx = regionContext(region, country).toLowerCase();
  return REGION_LOCKED_POI.some(
    (r) => r.test.test(`${name} ${description}`) && !r.homePattern.test(ctx),
  );
}

/** POI tied to a different city (Louvre on a Lyon day, Maya Bay on Koh Lipe). */
export function isWrongCityPoi(name: string, description: string, city: string): boolean {
  if (isCityLockedPoi(name, description, city)) return true;
  const fakeRegion = { city, startDay: 1, endDay: 1 } as TripRegion;
  return isForeignPoiForRegion(name, fakeRegion, "TH", description);
}

/** Markets / events that only run on specific weekdays (0 = Sunday). */
const WEEKDAY_GATED: Array<{ test: RegExp; allowedDays: number[]; label: string }> = [
  { test: /el rastro|rastro/i, allowedDays: [0], label: "nedelja" },
  { test: /soulard farmers market|soulard market/i, allowedDays: [4, 5, 6], label: "četek–sobota" },
  {
    test: /sunday walking street|nedeljski večern|bazar nedeljskega večera|wualai sunday|walking street.*chiang/i,
    allowedDays: [0],
    label: "nedelja",
  },
  {
    test: /chatuchak|jj market|chatuchak weekend/i,
    allowedDays: [6, 0],
    label: "sobota–nedelja",
  },
  {
    test: /weekend night market|naka market|phuket weekend|vikend.*nočn.*tržnic|night market.*weekend/i,
    allowedDays: [6, 0],
    label: "sobota–nedelja",
  },
];

/** Description says open only on certain days — drop if trip day mismatches. */
const DESC_WEEKDAY_HINTS: Array<{ test: RegExp; allowedDays: number[] }> = [
  { test: /četrtka do sobote|thursday to saturday|thu(?:rsday)?[–-]sat/i, allowedDays: [4, 5, 6] },
  { test: /samo ob nedeljah|only on sundays?|samo nedelj|only (?:on )?sunday/i, allowedDays: [0] },
  { test: /ob nedeljah|on sundays?/i, allowedDays: [0] },
  {
    test: /ob sobotah in nedeljah|saturday.*sunday|weekends? only|samo ob vikendih/i,
    allowedDays: [6, 0],
  },
];

export function tripDayOfWeek(departDate: string, tripDay: number): number | null {
  const base = new Date(`${departDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + tripDay - 1);
  return base.getDay();
}

/** Temples / palaces that close mid-afternoon — impossible after 14:00 airport landing. */
export function isEarlyClosingPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return (
    /grand palace|velika palača|wat phra kaew|wat pho|wat arun|arun|royal palace|emerald buddha|zapre ob|closes? (?:at )?1[45]:|closes? (?:at )?3\s*pm|zaprt.*15/i.test(
      t,
    )
  );
}

/** Sunday / evening-only street markets — dead by day, lively from ~17:00. */
export function isSundayWalkingStreetPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return /sunday walking street|bazar nedeljskega večera|nedeljski bazar|wualai sunday|walking street.*chiang/i.test(
    t,
  );
}

/** Nguyen Hue Walking Street & similar promenades — lively after dusk, not Cafe Apartments by day. */
export function isEveningStrollPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  if (/cafe apartments/i.test(t)) return false;
  return (
    (/nguyen hue|nguyễn huệ/i.test(t) && /walking street|pešcona|peš cono/i.test(t)) ||
    (/walking street|pešcona/i.test(t) &&
      /večern|evening|prvi večer|after dark|ob mraku/i.test(t))
  );
}

/** Night markets / river malls that only open from ~16:00. */
export function isEveningOnlyPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return (
    isSundayWalkingStreetPoi(name, description) ||
    isNightlifeOnlyPoi(name, description) ||
    isEveningStrollPoi(name, description) ||
    (/asiatique|night market(?!\s+every)|nočna tržnica|odpre.*16|opens? (?:at )?4\s*pm|večern.*tržnica|after\s*4\s*pm|18:00.*22:00/i.test(
      t,
    ) &&
      !/night bazaar|chang chun/i.test(t))
  );
}

/** Beach lounging — poor fit when Hoi An streets flood in monsoon. */
export function isBeachLoungingPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return (
    /an bang|an bang beach|my khe beach/i.test(t) ||
    (/plaž|beach/i.test(t) &&
      /poležavanje|sunbathe|ležanje|relax|sproščen dan|cel dan na plaži|beach day|loung/i.test(
        t,
      ))
  );
}

/** Party streets / districts — dead by day, lively from ~18:00. */
export function isNightlifeOnlyPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return (
    /khao san|khaosan|bangla road|bangla|patong.*night|nočno življenje|nightlife|night life|bar street|pub street|živahno.*noč|večern.*življenj|night bazaar|nočni bazar|bia hoi|biahoi/i.test(
      t,
    ) && !/chang chun/i.test(t)
  );
}

/** Sights that permanently closed or are misleading to schedule. */
export function isClosedDeprecatedPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return /bitexco.*sky\s*deck|bitexco financial tower.*(skydeck|razgledna)|saigon skydeck/i.test(
    t,
  );
}

/** Half-day+ hill trips — do not stack with city temples the same morning. */
export function isHillTempleExcursion(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return /doi suthep|doi inthanon|tiger cave temple|hang nak|1237 stopnic/i.test(t);
}

/** Boat / island day trips that block the whole calendar day. */
export function isFullDayExcursion(h: Pick<SkeletonHighlight, "name" | "description" | "visitDuration">): boolean {
  const t = `${h.name} ${h.description} ${h.visitDuration ?? ""}`.toLowerCase();
  return (
    /phi phi|maya bay|james bond island|similan|surin islands|celodnevni izlet|celodnevni|cel dan|full.?day|day trip|izlet z ladjo|boat tour|speedboat tour|od 7:00|7:00.*17:00|8:00.*18:00/i.test(
      t,
    ) || /cel dan|full day|8h|9h|10h/i.test(h.visitDuration ?? "")
  );
}

/** Viewpoints famous for sunsets — never schedule in the morning. */
export function isSunsetOnlyPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return /promthep|phromthep|sunset point|laem phromthep/i.test(t);
}

/** Markets and fairs that need half a day or more. */
export function isLongFormMarket(h: Pick<SkeletonHighlight, "name" | "description" | "visitDuration">): boolean {
  const t = `${h.name} ${h.description} ${h.visitDuration ?? ""}`.toLowerCase();
  return (
    /chatuchak|jj market|weekend market|vikend.*tržnic|floating market|damnoen saduak/i.test(t) ||
    (/tržnica|market|bazar/i.test(t) &&
      /pol dneva|cel dan|vsaj \d|nekaj ur|several hours|3h|4h|5h|6h/i.test(t))
  );
}

export function isRegionalTravelHighlight(h: Pick<SkeletonHighlight, "name" | "description">): boolean {
  const t = `${h.name} ${h.description}`.toLowerCase();
  return (
    /^prevoz:/i.test(h.name.trim()) ||
    (/→|->|\bdo\b|\bto\b/.test(t) &&
      /\b(vlak|train|let|flight|avtobus|bus|ferry|boat|plane|notranji)\b/.test(t))
  );
}

export function isTransportLikeHighlight(h: Pick<SkeletonHighlight, "name" | "description">): boolean {
  return isRegionalTravelHighlight(h);
}

/** Inter-city hop on the last day of a region (train, flight, bus). */
export function isInterCityTransport(transport: {
  type?: string;
  duration?: string;
  howTo?: string;
}): boolean {
  if (isHeavyRegionalTravel(transport)) return true;
  const s = `${transport.type ?? ""} ${transport.duration ?? ""} ${transport.howTo ?? ""}`.toLowerCase();
  return /train|vlak|bus|avtobus|flight|let|ferry|boat|plane|minivan/i.test(s);
}

function highlightAllowedOnWeekday(h: SkeletonHighlight, dow: number): boolean {
  for (const gate of WEEKDAY_GATED) {
    if (!gate.test.test(h.name) && !gate.test.test(h.description)) continue;
    return gate.allowedDays.includes(dow);
  }
  for (const hint of DESC_WEEKDAY_HINTS) {
    if (!hint.test.test(h.description)) continue;
    return hint.allowedDays.includes(dow);
  }
  return true;
}

/** Whether a POI is open on the calendar day of this trip day (Sat/Sun gates, etc.). */
export function isPoiOpenOnTripDay(
  name: string,
  description: string,
  departDate: string | undefined,
  tripDay: number,
): boolean {
  if (!departDate) return true;
  const dow = tripDayOfWeek(departDate, tripDay);
  if (dow === null) return true;
  return highlightAllowedOnWeekday({ name, description, day: tripDay } as SkeletonHighlight, dow);
}

type WeekdayActivity = { name: string; description: string; priceLabel?: string; type?: string };

function bangkokWeekdayMallReplacement(tripDay: number, langCode: string): WeekdayActivity {
  const slo = langCode === "sl" || langCode.startsWith("sl");
  if (tripDay % 2 === 1) {
    return {
      name: "ICONSIAM",
      type: "SIGHT",
      priceLabel: slo ? "brezplačno" : "free",
      description: slo
        ? "Nakupovalni kompleks ob Chao Phrayi — klimatizirano, hrana, razgled na reko. Odprto vsak dan; odlična menjjava za vikend tržnice."
        : "Riverside mall with A/C and food hall — open daily; weekday swap for weekend-only markets.",
    };
  }
  return {
    name: "Siam Paragon",
    type: "SIGHT",
    priceLabel: slo ? "brezplačno" : "free",
    description: slo
      ? "Velik nakupovalni center ob BTS Siam — luksuzne trgovine, kino, hrana. Odprto vsak dan; blizu centra."
      : "Major mall at BTS Siam — shops, cinema, food court; open daily near central Bangkok.",
  };
}

/** Swap weekend-only markets (Chatuchak) for open-daily Bangkok malls on weekdays. */
export function reconcileWeekdayGatedActivities<T extends WeekdayActivity>(
  slots: { morning: T[]; afternoon: T[]; evening: T[] },
  departDate: string | undefined,
  tripDay: number,
  langCode: string,
): { morning: T[]; afternoon: T[]; evening: T[] } {
  if (!departDate) return slots;

  const fixList = (list: T[]): T[] => {
    const out: T[] = [];
    for (const a of list) {
      if (isPoiOpenOnTripDay(a.name, a.description, departDate, tripDay)) {
        out.push(a);
        continue;
      }
      if (/chatuchak|jj market|weekend market|vikend.*tržnic/i.test(`${a.name} ${a.description}`)) {
        out.push({ ...a, ...bangkokWeekdayMallReplacement(tripDay, langCode) });
        continue;
      }
    }
    return out;
  };

  return {
    morning: fixList(slots.morning),
    afternoon: fixList(slots.afternoon),
    evening: fixList(slots.evening),
  };
}

/** Move or drop long markets that clash with same-day inter-city departure. */
export function resolveMarketTravelConflicts(
  regions: TripRegion[],
  departDate: string,
  trace?: (msg: string) => void,
): TripRegion[] {
  return regions.map((region) => {
    const transport = region.transportToNext;
    if (!transport || !isInterCityTransport(transport)) return region;

    const travelDay = region.endDay;
    let highlights = [...(region.highlights ?? [])];

    for (const h of [...highlights]) {
      if (h.day !== travelDay || !isLongFormMarket(h)) continue;

      const prevDay = travelDay - 1;
      if (prevDay >= region.startDay && departDate) {
        const prevDow = tripDayOfWeek(departDate, prevDay);
        if (prevDow !== null && highlightAllowedOnWeekday(h, prevDow)) {
          highlights = highlights.map((x) => (x === h ? { ...x, day: prevDay } : x));
          trace?.(`content: moved "${h.name}" day ${travelDay} → ${prevDay} (travel day conflict)`);
          continue;
        }
      }
      highlights = highlights.filter((x) => x !== h);
      trace?.(`content: removed "${h.name}" on travel day ${travelDay}`);
    }

    highlights = highlights.filter((h) => {
      if (h.day !== travelDay || !isTransportLikeHighlight(h)) return true;
      trace?.(`content: deduped transport highlight "${h.name}" on day ${travelDay}`);
      return false;
    });

    return { ...region, highlights };
  });
}

/** After a flight/train into a new region — sights wait until the next day. */
export function filterInboundTravelDayHighlights(highlights: SkeletonHighlight[]): SkeletonHighlight[] {
  return highlights.filter(isRegionalTravelHighlight);
}

/** Last day of region with outbound transport — no long markets or island day trips. */
export function filterTravelOutDayHighlights(
  highlights: SkeletonHighlight[],
  transportToNext?: { type?: string; duration?: string; howTo?: string },
): SkeletonHighlight[] {
  if (!transportToNext || !isInterCityTransport(transportToNext)) return highlights;
  return highlights.filter(
    (h) =>
      !isLongFormMarket(h) &&
      !isFullDayExcursion(h) &&
      !isTransportLikeHighlight(h),
  );
}

export function isMorningOnlyPoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return (
    /sagrada familia|park güell|park guell|gaudí.*park|prado museum|museo del prado|reina sofía|reina sofia|alhambra|guggenheim/i.test(
      t,
    ) ||
    /doi suthep|doi inthanon|wat arun|angkor wat|temple.*sunrise|sunrise.*temple/i.test(t) ||
    /sunset crater|meteor crater|grand canyon|national park|volcano|monument valley|arches national/i.test(
      t,
    ) ||
    /priporočamo obisk zjutraj|priporočamo obisk v zgodnjih|zgodnjih jutranjih urah|obisk zjutraj|early morning|sončn\w* vzhod|sunrise|pred 8:00|before 8\s*am/i.test(
      t,
    )
  );
}

/** Major sights that need 2–3+ hours — don't stack two in the same half-day. */
export function isMajorHalfDaySight(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return (
    isEarlyClosingPoi(name, description) ||
    /grand palace|velika palača|wat pho|jim thompson|national museum|versailles|louvre|vatican|colosseum/i.test(
      t,
    ) ||
    /pol dneva|2[–-]3\s*ur|3\s*ur|half day/i.test(t)
  );
}

const BANGKOK_ZONE: Array<{ test: RegExp; zone: string }> = [
  { test: /chatuchak|mochit|jj market|don mueang/i, zone: "north" },
  { test: /lumphini|lumpini|silom|sathorn|sukhumvit|asok/i, zone: "south" },
  { test: /grand palace|wat pho|khao san|chinatown|yaowarat|old town|staro mest/i, zone: "oldtown" },
  { test: /jim thompson|siam|chulalongkorn|erawan|chit lom|centralworld|siam paragon/i, zone: "central" },
  { test: /chatuchak|weekend market/i, zone: "north" },
];

function bangkokZone(name: string, description = ""): string | null {
  const n = `${name} ${description}`.toLowerCase();
  for (const z of BANGKOK_ZONE) {
    if (z.test.test(n)) return z.zone;
  }
  return null;
}

/** Temples marketed for sunset — too late after 15:00 landing. */
/** Prepend Wat Phra Si Sanphet on Ayutthaya arrival (short hop from Bangkok). */
/** Strip “upon arrival / first taste of Vietnam” copy when the traveller is already acclimated. */
export function stripFalseArrivalCopy(text: string): string {
  return text
    .replace(/\bpo prihodu[^.!?]*/gi, "")
    .replace(/\bprvi stik z vietnamsko[^.!?]*/gi, "")
    .replace(/\bpo prihodu v hotelu[^.!?]*/gi, "")
    .replace(/\bupon arrival[^.!?]*/gi, "")
    .replace(/\bfirst taste of vietnam[^.!?]*/gi, "")
    .replace(/\bPO PRIHODU\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

/** Inject real afternoon sights on heavy inbound travel days (flight/train into a new city). */
export function ensureInboundArrivalHighlights(
  highlights: SkeletonHighlight[],
  city: string,
  day: number,
  langCode = "sl",
): SkeletonHighlight[] {
  const slo = langCode.startsWith("sl");
  let out = highlights;
  if (/ayutthaya/i.test(city)) {
    out = ensureAyutthayaArrivalHighlights(out, day);
  }
  if (/chiang mai/i.test(city)) {
    const inject: SkeletonHighlight[] = [];
    if (!out.some((h) => /doi suthep|suthep/i.test(`${h.name} ${h.description}`))) {
      inject.push({
        day,
        name: slo ? "Wat Phra That Doi Suthep" : "Doi Suthep Temple",
        description: slo
          ? "Popoldanski obisk zlate pagode na hribu — najboljši razgled na Chiang Mai. Pojdi pred 17:00; songthaew ali Grab iz hotela."
          : "Afternoon visit to the golden pagoda on the hill — best views over Chiang Mai. Go before 5 pm.",
        visitDuration: "2h",
        priceLabel: "30 THB",
        lat: 18.8047,
        lng: 98.9216,
      });
    }
    if (!out.some((h) => /old city|stari|tha phae|chedi luang|phra singh/i.test(`${h.name} ${h.description}`))) {
      inject.push({
        day,
        name: slo ? "Staro mesto (Tha Phae Gate)" : "Old City (Tha Phae Gate)",
        description: slo
          ? "Popoldanski sprehod ob obzidju in templjih v starem mestu — Wat Chedi Luang ali Wat Phra Singh pred večerno gnečo."
          : "Afternoon walk along the old city walls and temples before evening crowds.",
        visitDuration: "2h",
        priceLabel: slo ? "brezplačno" : "free",
        lat: 18.7877,
        lng: 98.9933,
      });
    }
    out = [...inject, ...out];
  }
  return out;
}

export function ensureAyutthayaArrivalHighlights(
  highlights: SkeletonHighlight[],
  day: number,
): SkeletonHighlight[] {
  const hasSanphet = highlights.some((h) =>
    /sanphet|phra si/i.test(`${h.name} ${h.description}`),
  );
  if (hasSanphet) return highlights;
  const sanphet: SkeletonHighlight = {
    day,
    name: "Wat Phra Si Sanphet",
    description:
      "Tri stolpične stope — obišči takoj ob prihodu (8:30–11:00), pred Wat Mahathat. Vstopnina 50 THB.",
    visitDuration: "1.5h",
    priceLabel: "50 THB (~1,5 €)",
    lat: 14.35,
    lng: 100.56,
  };
  return [sanphet, ...highlights];
}

export function isSunsetTemplePoi(name: string, description = ""): boolean {
  const t = `${name} ${description}`.toLowerCase();
  return (
    /wat arun|arun temple|sončni zahod|sunset|ob sončnem zahodu|at sunset/i.test(t) &&
    /wat|temple|tempelj|shrine/i.test(t)
  );
}

/** Drop far-apart Bangkok parks/areas crammed on one day (e.g. Chatuchak + Lumphini). */
export function dedupeSameDayGeoConflicts(
  highlights: SkeletonHighlight[],
  city: string,
): SkeletonHighlight[] {
  if (!/bangkok/i.test(city) || highlights.length < 2) return highlights;

  let out = [...highlights];

  const parks = out.filter((h) => /\bpark\b/i.test(h.name));
  if (parks.length > 1) {
    const zones = parks.map((p) => bangkokZone(p.name, p.description) ?? "other");
    if (new Set(zones).size > 1) {
      const keep = parks[0]!;
      out = out.filter((h) => !parks.includes(h) || h === keep);
    }
  }

  const withZone = out.map((h) => ({
    h,
    z: bangkokZone(h.name, h.description) ?? "other",
  }));
  const zones = new Set(withZone.map((x) => x.z));

  if (zones.has("north") && (zones.has("central") || zones.has("oldtown") || zones.has("south"))) {
    out = out.filter((h) => {
      const z = bangkokZone(h.name, h.description);
      if (z === "north") return true;
      if (/chatuchak|weekend market/i.test(`${h.name} ${h.description}`)) return true;
      return z !== "central" && z !== "oldtown";
    });
  }

  const northSouth = withZone.filter((x) => x.z === "north" || x.z === "south");
  if (northSouth.length > 1) {
    const hasNorth = northSouth.some((x) => x.z === "north");
    const hasSouth = northSouth.some((x) => x.z === "south");
    if (hasNorth && hasSouth) {
      const dropSouth = northSouth.find((x) => x.z === "south")?.h;
      if (dropSouth) out = out.filter((h) => h !== dropSouth);
    }
  }

  const majors = out.filter((h) => isMajorHalfDaySight(h.name, h.description));
  if (majors.length > 2) {
    const keep = majors.slice(0, 2);
    out = out.filter((h) => !majors.includes(h) || keep.includes(h));
  }

  return out;
}

const KRABI_BOAT_EXCURSION =
  /phi phi|maya bay|bamboo island|viking cave|hong island|four islands|james bond|similan|surin islands|pp islands/i;

function isKrabiBoatExcursion(h: Pick<SkeletonHighlight, "name" | "description">): boolean {
  return (
    isFullDayExcursion(h) || KRABI_BOAT_EXCURSION.test(`${h.name} ${h.description}`)
  );
}

/** Tiger Cave (north Krabi) must not share a day with Emerald Pool / Hot Springs (south). */
export function splitKrabiHillTempleDays(
  highlights: SkeletonHighlight[],
  region: { city: string; startDay: number; endDay: number },
): SkeletonHighlight[] {
  if (!/krabi/i.test(region.city)) return highlights;
  const out = highlights.map((h) => ({ ...h }));

  const isSouthCluster = (name: string, description: string) =>
    /emerald pool|hot spring|klong thom|klong luk/i.test(`${name} ${description}`);

  for (const hill of out.filter((h) => isHillTempleExcursion(h.name, h.description))) {
    const crowded = out.some(
      (h) =>
        h.day === hill.day &&
        h !== hill &&
        (isSouthCluster(h.name, h.description) ||
          isFullDayExcursion(h) ||
          isKrabiBoatExcursion(h)),
    );
    if (!crowded) continue;

    let bestDay = -1;
    let bestCount = Number.POSITIVE_INFINITY;
    for (let d = region.startDay; d <= region.endDay; d++) {
      if (d === hill.day) continue;
      const dayList = out.filter((h) => h.day === d);
      if (dayList.some((h) => isHillTempleExcursion(h.name, h.description))) continue;
      if (dayList.some((h) => isSouthCluster(h.name, h.description))) continue;
      if (dayList.some((h) => isFullDayExcursion(h) || isKrabiBoatExcursion(h))) continue;
      if (dayList.length < bestCount) {
        bestCount = dayList.length;
        bestDay = d;
      }
    }
    if (bestDay > 0) hill.day = bestDay;
  }

  return out;
}

function krabiBoatExcursionPriority(h: SkeletonHighlight): number {
  const t = `${h.name} ${h.description}`.toLowerCase();
  if (/phi phi|maya bay/i.test(t)) return 0;
  if (/bamboo island/i.test(t)) return 1;
  if (/viking cave/i.test(t)) return 2;
  return 3;
}

/** Max one boat/island excursion per Krabi day — spread Phi Phi cluster across the stay. */
export function spreadKrabiBoatExcursions(
  highlights: SkeletonHighlight[],
  region: { city: string; startDay: number; endDay: number },
): SkeletonHighlight[] {
  if (!/krabi/i.test(region.city)) return highlights;
  const out = highlights.map((h) => ({ ...h }));

  for (let d = region.startDay; d <= region.endDay; d++) {
    const onDay = out.filter((h) => h.day === d && isKrabiBoatExcursion(h));
    if (onDay.length <= 1) continue;

    const sorted = [...onDay].sort(
      (a, b) => krabiBoatExcursionPriority(a) - krabiBoatExcursionPriority(b),
    );
    for (const h of sorted.slice(1)) {
      let target = -1;
      let lightest = Number.POSITIVE_INFINITY;
      for (let dd = region.startDay; dd <= region.endDay; dd++) {
        if (dd === d) continue;
        if (out.some((x) => x.day === dd && isKrabiBoatExcursion(x))) continue;
        const count = out.filter((x) => x.day === dd).length;
        if (count < lightest) {
          lightest = count;
          target = dd;
        }
      }
      if (target > 0) h.day = target;
    }
  }

  return out;
}

/** Hills / far suburbs — risky on departure day near LAX/JFK. */
export function isRiskyDepartureSight(name: string, destinationIata: string): boolean {
  const n = name.toLowerCase();
  const iata = destinationIata.toUpperCase();
  if (iata === "LAX") {
    return /griffith|hollywood|malibu|santa monica|universal|beverly|runyon|getty|venice beach/i.test(n);
  }
  if (iata === "JFK" || iata === "EWR") {
    return /statue of liberty|liberty island|coney island/i.test(n);
  }
  return false;
}

export function filterDepartureDayHighlights(
  highlights: SkeletonHighlight[],
  destinationIata: string,
  inboundDepart?: string,
): SkeletonHighlight[] {
  if (!inboundDepart) return highlights;
  const [h, m] = inboundDepart.split(":").map(Number);
  const depMin = (h ?? 12) * 60 + (m ?? 0);
  const laxRush = destinationIata.toUpperCase() === "LAX" && depMin <= 18 * 60;
  const afternoon = depMin <= 17 * 60;
  let out = highlights;
  if (laxRush || afternoon) {
    out = out.filter((hl) => !isRiskyDepartureSight(hl.name, destinationIata));
  }
  if (depMin >= 21 * 60) {
    out = out.filter((hl) => !isEveningOnlyPoi(hl.name, hl.description));
  }
  out = out.filter((hl) => !isNightlifeOnlyPoi(hl.name, hl.description));
  return out;
}

function isHeavyArrivalHighlight(h: SkeletonHighlight): boolean {
  const t = `${h.name} ${h.description}`.toLowerCase();
  return /museum|muzej|remnants|palace|citadel|trdnjava|war |temple|tempelj/i.test(t);
}

/** Day 1 after midday landing — drop palaces and full-day items; cap count. */
export function filterArrivalDayHighlights(
  highlights: SkeletonHighlight[],
  flights?: TripFlightContext,
): SkeletonHighlight[] {
  if (isRedEyeArrival(flights)) {
    return highlights.filter((h) => !isHeavyArrivalHighlight(h)).slice(0, 0);
  }
  const slot = arrivalDaySlot(flights);
  if (slot === "morning") return highlights;
  const filtered = highlights.filter(
    (h) =>
      !isEarlyClosingPoi(h.name, h.description) &&
      !isMorningOnlyPoi(h.name, h.description) &&
      !isSunsetTemplePoi(h.name, h.description) &&
      !isFullDayExcursion(h),
  );
  const max = slot === "evening" ? 0 : slot === "afternoon" ? 0 : 2;
  return filtered.slice(0, max);
}

export function isHeavyRegionalTravel(transport: {
  type?: string;
  duration?: string;
  howTo?: string;
}): boolean {
  const type = (transport.type ?? "").toLowerCase();
  const s = `${type} ${transport.duration ?? ""} ${transport.howTo ?? ""}`.toLowerCase();
  if (
    /flight|ferry|feribot|speedboat|overnight|van\+flight|ferry\+flight|boat\+flight/.test(type) ||
    /\b(let|airport|notranji let|domestic flight)\b/i.test(s)
  ) {
    return true;
  }
  const dur = transport.duration ?? "";
  const range = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*h/i.exec(dur);
  if (range) {
    const maxH = Math.max(Number(range[1]), Number(range[2]));
    if (maxH >= 3) return true;
  } else {
    const single = /^(\d+(?:\.\d+)?)\s*h/i.exec(dur);
    if (single && Number(single[1]) >= 3) return true;
  }
  return /cel dan|full day|\d{2,3}\s*km/.test(s);
}

/** Correct entrance fees when AI echoes wrong "brezplačno" from generic templates. */
const POI_PRICE_OVERRIDES: Array<{
  test: RegExp;
  sl: string;
  en: string;
  wrong?: RegExp;
}> = [
  {
    test: /wat phra si sanphet|wat mahathat|wat ratchaburana|ratchaburana/i,
    wrong: /brezplačno|^free$|^—$|^-$/i,
    sl: "50 THB (~1,5 €)",
    en: "50 THB (~1.5 EUR)",
  },
];

export function fixPoiPriceLabel(
  name: string,
  priceLabel: string | undefined,
  langCode: string,
): string | undefined {
  if (!priceLabel && !name) return priceLabel;
  const slo = langCode === "sl" || langCode.startsWith("sl");
  for (const rule of POI_PRICE_OVERRIDES) {
    if (!rule.test.test(name)) continue;
    if (priceLabel && rule.wrong && !rule.wrong.test(priceLabel)) return priceLabel;
    return slo ? rule.sl : rule.en;
  }
  return priceLabel;
}

const POI_DESC_SL: Record<string, string> = {
  "wat phra si sanphet": "Tri stolpične stope v zgodovinskem parku Ayutthaye — simbol stare prestolnice. Vstopnina 50 THB; najbolje zjutraj pred vročino.",
  "wat mahathat": "Znameniti glava Bude v koreninah drevesa — ikona Ayutthaye. Vstopnina 50 THB; kombiniraj z Wat Phra Si Sanphet isti dan.",
  "wat ratchaburana": "Ikonična stolpična grobnica v zgodovinskem parku Ayutthaye — vstopnina 50 THB; dopoldanski obisk z Wat Mahathat.",
  "museo del prado": "Španska slikarska zbirka svetovnega formata — Velázquez, Goya. Vstopnice online; dopoldanski obisk.",
  "plaza mayor": "Zgodovinski trg v centru — večernja terasa, tapas in živahna atmosfera po prihodu.",
  "la boqueria": "Barcelonska tržnica — sveže sadje, sušenka, smoothie. Najbolje dopoldan pred gnečo.",
  "sagrada familia": "Gaudíjeva bazilika — rezerviraj termin zjutraj; notranjost in fasada sta vredni pol dneva.",
  "park güell": "Gaudíjev park z razgledom na mesto — jutranji slot, vstopnica z urnikom.",
  "el rastro": "Nedeljski bolšji sejem v La Latini — samo nedelja zjutraj do ~15:00.",
};

function fallbackDescription(name: string, regionCity: string): string {
  const key = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
  for (const [k, desc] of Object.entries(POI_DESC_SL)) {
    if (key.includes(k)) return desc;
  }
  return `${name} — obišči v ${regionCity}; prilagodi urnik glede na sezono in gnečo.`;
}

export function cleanseHighlightText(
  name: string,
  description: string,
  regionCity: string,
): { name: string; description: string } {
  let desc = description.trim();
  if (isAiPlaceholderText(desc) || desc.length < 20) {
    desc = fallbackDescription(name, regionCity);
  }
  return { name: name.trim(), description: desc };
}

export function cleanseRegionHighlights(
  region: TripRegion,
  opts?: { departDate?: string; country?: string },
  trace?: (msg: string) => void,
): SkeletonHighlight[] {
  return (region.highlights ?? [])
    .map((h) => {
      if (isForeignPoiForRegion(h.name, region, opts?.country, h.description)) {
        trace?.(`content: removed "${h.name}" — wrong region for ${region.city}`);
        return null;
      }
      if (opts?.departDate) {
        const dow = tripDayOfWeek(opts.departDate, h.day);
        if (dow !== null) {
          for (const gate of WEEKDAY_GATED) {
            if (!gate.test.test(h.name) && !gate.test.test(h.description)) continue;
            if (!gate.allowedDays.includes(dow)) {
              trace?.(`content: removed "${h.name}" — only on ${gate.label} (day ${h.day})`);
              return null;
            }
          }
          for (const hint of DESC_WEEKDAY_HINTS) {
            if (!hint.test.test(h.description)) continue;
            if (!hint.allowedDays.includes(dow)) {
              trace?.(`content: removed "${h.name}" — hours mismatch day ${h.day}`);
              return null;
            }
          }
        }
      }
      const cleaned = cleanseHighlightText(h.name, h.description, region.city);
      if (isAiPlaceholderText(cleaned.name)) return null;
      const priceLabel = fixPoiPriceLabel(cleaned.name, h.priceLabel, "sl");
      return { ...h, ...cleaned, priceLabel: priceLabel ?? h.priceLabel };
    })
    .filter((h): h is SkeletonHighlight => h !== null);
}
