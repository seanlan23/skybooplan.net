export type AccommodationMode = "hotel" | "motorhome";

/** e.g. "vsak 5 dan hotel", "hotel na 3 dni" → interval */
export function detectHotelRestInterval(wishes?: string, customPrompt?: string): number | null {
  const text = `${wishes ?? ""} ${customPrompt ?? ""}`.toLowerCase();
  const patterns = [
    /vsak(?:ih)?\s*(\d+)\s*dan(?:a|ov)?(?:\s+\w+){0,10}\s*(?:v\s+)?hotelu?/i,
    /hotelu?\s+na\s+(\d+)\s+dni/i,
    /(\d+)\s*dni(?:v|h)?\s*(?:v\s+)?hotelu?/i,
    /hotelu?(?:\s+\w+){0,10}\s*vsak(?:ih)?\s*(\d+)\s*dan/i,
    /every\s*(\d+)\s*days?\s*(?:in\s+)?(?:a\s+)?hotel/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 2 && n <= 14) return n;
  }
  return null;
}

export function isHotelRestDay(
  tripDay: number,
  interval: number,
  opts?: { totalDays?: number },
): boolean {
  if (tripDay <= 0 || interval < 2) return false;
  if (opts?.totalDays != null && tripDay >= opts.totalDays) return false;
  return tripDay % interval === 0;
}

export function motorhomeCampingHint(city: string, slo: boolean): string {
  return slo
    ? `Parkiraj avtodom na avtokampu izven jedra mesta ${city} — ne v centru. V center z javnim prevozom ali P+R; RV pusti na kampu.`
    : `Park the motorhome at a campsite outside ${city} — not downtown. Use transit or P+R into the centre; leave the RV at camp.`;
}

export function motorhomeLocalTransportTips(city: string, slo: boolean): string {
  return slo
    ? `Iz avtokampa pri ${city} v center z metrojem ali avtobusom (15–35 €). RV ne voziš v jedro mesta — parkiranje na kampu.`
    : `From camp near ${city} use metro/bus into the centre (€15–35). Do not drive the RV downtown — park at camp.`;
}

/** Single source of truth for motorhome + periodic hotel nights (UI + budget). */
export function resolveTripAccommodation(opts: {
  accommodationMode?: AccommodationMode;
  hotelRestEveryNDays?: number;
  wishes?: string;
  customPrompt?: string;
}): { accommodationMode: AccommodationMode; hotelRestEveryNDays?: number } {
  const accommodationMode =
    opts.accommodationMode ?? detectAccommodationMode(opts.wishes, opts.customPrompt);
  const hotelRestEveryNDays =
    opts.hotelRestEveryNDays ??
    (accommodationMode === "motorhome"
      ? detectHotelRestInterval(opts.wishes, opts.customPrompt) ?? undefined
      : undefined);
  return { accommodationMode, hotelRestEveryNDays };
}

export function detectAccommodationMode(wishes?: string, customPrompt?: string): AccommodationMode {
  const text = `${wishes ?? ""} ${customPrompt ?? ""}`.toLowerCase();
  if (
    /avtodom|motorhome|campervan|camper van|\bcamper\b|wohnmobil|autocaravana|rv rental|najem avtodoma|najeli bi avtodom|najela bi avtodom|najel[a]?\s+bova?\s+avtodom|bova\s+najel|imeli bi avtodom|majhen avtodom|route\s*66/i.test(
      text,
    )
  ) {
    return "motorhome";
  }
  return "hotel";
}

export function motorhomeTransportBetween(
  km: number,
  fromCity: string,
  toCity: string,
  slo = true,
): { type: string; duration: string; costLabel: string; howTo: string } {
  const driveH = Math.max(2, Math.round(km / 75));
  const fuelEur = Math.round(km * 0.22);
  return {
    type: "drive",
    duration: km >= 400 ? `${driveH}–${driveH + 2}h` : `${Math.max(1, driveH - 1)}–${driveH + 1}h`,
    costLabel: `${fuelEur}–${fuelEur + 40} €`,
    howTo: slo
      ? `Vožnja z avtodomom ${fromCity} → ${toCity} (${Math.round(km)} km). Parkiraj na avtokampu izven mestnega jedra; v center z javnim prevozom.`
      : `Drive the motorhome ${fromCity} → ${toCity} (${Math.round(km)} km). Park at a campsite outside the centre; use transit into town.`,
  };
}

export function motorhomeTravelDayDescription(km: number, destCity: string, slo = true): string {
  return slo
    ? `Celodnevna vožnja z avtodomom (cca. ${Math.round(km)} km) do avtokampa pri ${destCity}. Brez mestnih hotelov — parkiraj izven jedra, center z metro/avtobusom.`
    : `Full-day motorhome drive (~${Math.round(km)} km) to a campground near ${destCity}. No downtown hotels — park outside the core, metro/bus into town.`;
}

export function motorhomePromptRules(slo: boolean): string {
  return slo
    ? [
        "NAČIN: AVTODOM — parkiraj na kampih IZVEN mestnih jeder. NE mestni hoteli.",
        "PREPOVEDANO v opisih: beseda 'hotel' / 'okolica hotela' — piši kamp, avtodom, sosta.",
        "HRANA: NE načrtuj kosila/večerje skoraj vsak dan. Potniki kuhajo v avtodomu. Največ 1–2 posebni lokalni večerji ali zajtrka na celotno pot (npr. dobra konoba) — ostali dnevi brez food aktivnosti.",
        "PREPOVEDANO: generične aktivnosti 'Lokalna večerja', 'Kosilo na Rivi', 'Pavza v kavarni' kot dnevni filler.",
        "Med mesti samo VOŽNJA (ZDA: 400–800 km = cel dan). Nikoli notranji let z RV. V mesto javni prevoz/P+R.",
        "dailyBudget = NA OSEBO (gorivo/kamp deli s pax); tipično 45–90 €/osebo/dan, NE skupinski 200+.",
        "KAMPI: uporabi REALNA imena v PRAVI regiji (npr. Camping Fusina pri Benetkah, Piani di Clodia pri Lazise).",
        "Število kampov/baz ≠ število dni: za 10-dnevni izlet vrni 10 day{} (več dni na istem kampu), ne samo 5–6 day{}.",
        "PREPOVEDANO: Kamp Centro Vacanze San Francesco pri San Daniele del Friuli — ta kamp je v Caorleju ob morju, ne v Furlaniji. Za San Daniele: area sosta / PZA v mestu ali bližnji agriturizem.",
        "PREPOVEDANO: 'Titova jama' pri Sperlongi — pravilno je Tiberijeva jama / Villa di Tiberio (cesar Tiberij, ne Tito).",
        "Če datumi vključujejo 10.–20. avgust (Ferragosto): v transportationTips opozori na obvezno predhodno rezervacijo kampov (Benetke, Garda, obala).",
        "Etape ≥400 km (npr. Jadranska obala → Trst): v transportationTips omeni trajanje 4,5–5+ ur in možne zastoje.",
      ].join(" ")
    : [
        "MODE: MOTORHOME — campgrounds outside city centers. No downtown hotels.",
        "FORBIDDEN in copy: the word 'hotel' / 'near the hotel' — write campsite, RV, sosta.",
        "FOOD: do NOT schedule lunch/dinner almost every day. Travelers cook in the RV. At most 1–2 special local dinners or breakfasts for the whole trip — other days have no food activities.",
        "FORBIDDEN: generic fillers like 'Local dinner', 'Lunch on the waterfront', 'Café break' as daily padding.",
        "Inter-city = DRIVING full days (US hops 400–800 km are NOT 90-minute local trips). No domestic flights with RV.",
        "dailyBudget = PER PERSON (split fuel/camp by pax); typical 45–90 €/person/day, NOT household 200+.",
        "CAMPS: real names in the correct region (e.g. Camping Fusina near Venice, Piani di Clodia near Lazise).",
        "Camp count ≠ day count: a 10-day trip needs 10 day{} objects (multi-night camps), never only 5–6 day{}.",
        "FORBIDDEN: Centro Vacanze San Francesco near San Daniele del Friuli — that camp is in Caorle by the sea, not Friuli. Use a local sosta/PZA instead.",
        "FORBIDDEN: 'Tito's Cave' at Sperlonga — correct is Villa di Tiberio / Tiberius Grotto (Emperor Tiberius, not Tito).",
        "If dates include 10–20 Aug (Ferragosto): warn in transportationTips to pre-book camps (Venice, Garda, coast).",
        "Legs ≥400 km (e.g. Adriatic coast → Trieste): note 4.5–5+ hours and possible traffic in transportationTips.",
      ].join(" ");
}
