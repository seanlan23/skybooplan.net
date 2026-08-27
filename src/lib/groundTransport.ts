import type { AiTripPlan, DayPlan, GroundJourney, GroundJourneyStop, GroundTransportMode } from "@/lib/aiPlan.functions";
import { translate, type Lang } from "@/lib/i18n";
import {
  HARD_DRIVE_HOURS,
  HARD_DRIVE_KM,
  LAST_DAY_HOME_MAX_HOURS,
  TARGET_DRIVE_HOURS,
  TARGET_DRIVE_KM,
} from "@/lib/plannerQuality";

export type { GroundJourney, GroundJourneyStop, GroundTransportMode };

export const GROUND_TRANSPORT_MODES: GroundTransportMode[] = ["car", "motorhome", "train"];

const TRANSPORT_I18N: Record<GroundTransportMode, "transport.car" | "transport.motorhome" | "transport.train"> = {
  car: "transport.car",
  motorhome: "transport.motorhome",
  train: "transport.train",
};

export function groundTransportLabel(mode: GroundTransportMode, lang: Lang = "sl"): string {
  return translate(lang, TRANSPORT_I18N[mode]);
}

export function isGroundTransportMode(value: unknown): value is GroundTransportMode {
  return value === "car" || value === "motorhome" || value === "train";
}

/**
 * Universal car + camper roundtrip pacing (own vehicle: start = end at home).
 * Destination names in the example are illustrations — the model picks real cities.
 */
export function ownVehicleRoundtripRulesPrompt(): string {
  return `
CESTNI KROG — AVTO IN AVTODOM (univerzalno, izhodišče = cilj poti):
- Dnevna etapa: ${TARGET_DRIVE_KM}–${HARD_DRIVE_KM} km (cilj ≤${TARGET_DRIVE_KM} km), z vmesnimi postanki največ 6–${HARD_DRIVE_HOURS} ur. Čista vožnja cilj ≤${TARGET_DRIVE_HOURS} h, trdo max ${HARD_DRIVE_HOURS} h / ${HARD_DRIVE_KM} km.
- PREPOVEDANO nerealne enodnevne etape 1500–2200 km (ali 10–16 h) brez nočitve. Če je Google >${TARGET_DRIVE_HOURS} h ALI razdalja >${HARD_DRIVE_KM} km ALI 2+ počasni kopenski meji: obvezna nočitev vmes ŽE V SKELETU.
- Pri lastnem vozilu pravilo “nad 500 km = let” NE VELJA — vedno vožnja z nočitvami, nikoli notranji let namesto etape.
- Outbound in inbound tvorita logičen krog (druga cesta nazaj) ALI povratek vstavi tranzitne baze z 1 nočitvijo na vsakem hopu v limitu. PREPOVEDANO isto avtocesto 1500 km v enem JSON dnevu.
- Primer razporeda (model izbere konkretna mesta na poti): zadnja destinacijska baza → vmesna obala/regija (1 noč) → naslednja vmesna baza (1 noč) → dom. Ne stisniti cele razdalje v Day N.
- Day N = SAMO zadnja zmerna etapa do izhodišča (≤${LAST_DAY_HOME_MAX_HOURS} h, raje 4 h). Če je predzadnja baza še ≥${LAST_DAY_HOME_MAX_HOURS}–6 h od doma, dodaj nočitev vmes na dnevu N−1.`;
}

/** Mapbox geocodes “Balkan” to Balkan Province, Turkmenistan (TM). */
export function sanitizeGroundDestinationPlace(place: string): string {
  const t = place.trim();
  if (!t) return t;
  if (/\bbalkan\b/i.test(t) && /\bTM\b/i.test(t)) return "Balkan";
  return t;
}

function isAlbaniaRoadTripDestination(place: string): boolean {
  return /albania|albanij|tirana|berat|sarand|gjirokast|vlor|ksamil|shkod|dhermi|himar/i.test(
    place,
  );
}

function isWesternBalkansDestination(place: string): boolean {
  const t = place.toLowerCase();
  if (/\bbalkan/.test(t)) return true;
  if (isAlbaniaRoadTripDestination(t)) return true;
  if (/montenegro|črna\s*gora|crna\s*gora|kotor|budva/.test(t)) return true;
  const hits = [
    /bosnia|bosna|mostar|sarajevo/,
    /montenegro|črna\s*gora|crna\s*gora|kotor|budva/,
    /albania|albanij|shkod|tirana|saranda/,
  ].filter((re) => re.test(t)).length;
  return hits >= 2;
}

function albaniaCarRoadTripPrompt(dest: string): string {
  if (!isAlbaniaRoadTripDestination(dest) && !/\bbalkan/.test(dest.toLowerCase())) return "";
  return `
ALBANIJA / JADRAN Z AVTOM (obvezno):
- Če je cilj Albanija: vsaj 3 nočitve V Albaniji, od tega ≥2 IZVEN Tirane (Himarë / Dhërmi / Sarandë / Ksamil ALI Shkodër / Theth / Valbona). PREPOVEDANO: samo Tirana + dnevni izlet v Berat. Berat = nočitev tam, ne round-trip iz Tirane.
- Tirana: NAJVEČ 1 poln ogledni dan (Bunk'Art, Skanderbeg, Blloku). PREPOVEDANO 2–3 dnevi galerij/jezera v Tirani. Extra nočitev daj Shkodër / Skadarsko jezero na poti DOL ali plaže Dhërmi / Himarë na rivieri.
- Riviera: Sarandë/Ksamil PLUS vsaj en dan Himarë ali Dhërmi — Vlorë ni edini obalni postanek. Sever (Theth/Valbona) je alternativa rivieri, ne sme ostati samo prestolnica.
- Mostar→Tirana: 2 meji (BiH→MNE→AL). Konec avgusta 7–8 h, ne 5h 30min. Če nočeš 8h dneva: nočitev v Shkodëru ali Podgorici vmes.
- PREPOVEDANO: Vlorë→Split (ali Vlorë→Zadar) v ENEM dnevu. To je 9–11 ur čiste vožnje + 3 meje (AL–MNE, MNE–HR). Poletne kolone na Sukobin/Božaj in Debeli Brijeg. Obvezna nočitev v Črni gori (Kotor ali Budva) ALI vsaj Dubrovnik. Split šele naslednji dan. Kosilo v Splitu isti dan odpade.
- PREPOVEDANO v ENEM dnevu: Berat / Tirana / Vlorë / Sarandë / Gjirokastër / Himarë / Ksamil → Zagreb, Split, Zadar, Ljubljana ali Dunaj. Berat→Zagreb ≈ 800 km, 2 meji, 14–16 ur v avtu. To NI etapa.
- POVRATEK IZ ALBANIJE (lestvica, vsaka točka = nočitev razen zadnjega dne domov): (1) zadnja noč v Albaniji, (2) noč v Črni gori (Kotor ali Budva), (3) če je Kotor→dom >6 h: noč Split / Zadar / Plitvice, (4) zadnji koledarski dan = samo avtocesta domov (Zagreb→Dunaj ~4 h). PREPOVEDANO Berat kot predzadnja noč. Zadnji 2–3 dnevi so SAMO vožnja nazaj — ne ogledi v Zagrebu.
- Hotel v Zagrebu na povratku SAMO če si tja prišel prejšnji večer iz Kotora/Splita. PREPOVEDANO isti dan iz Albanije + hotel Zagreb + naslednji dan Dunaj.
- Tirana muzeji (Bunk'Art 1/2, Narodni muzej): DOPOLDAN ali zgodaj popoldan (do 16:00). PREPOVEDANO večerni slot — zaprejo ~18:00.
- Kotor→Plitvice: meja Debeli Brijeg avgusta ima večurne kolone. drivingDurationHours ≥ 8h. PREPOVEDANO 6h 30min. Odhod zelo zgodaj.
- Črna gora obala: NI avtoceste — počasna cesta. drivingDurationHours mora vključiti meje (tabela počasnih meja, poleti +2–4 h), ne samo Google čas.
- Plitvice: vstopnice kupi SPLETNO vnaprej (np-plitvicka-jezera.hr) za točno uro vstopa — konec sezone razprodano. Vstop zjutraj ob rezerviranem slotu. PREPOVEDANO popoldanski obisk po vožnji Split→Plitvice. Če Split→Zagreb preko Plitvic: nočitev PRI parku prejšnji večer.
- eSIM: BiH, Črna gora in Albanija NISO v EU roamingu. Regionalni balkanski eSIM pred odhodom ali lokalna kartica na vsaki meji.
- PRVA NOČ iz Dunaja / Gradca / Ljubljane / Maribora / Győra / Budimpešte proti Albaniji, Črni gori ali “Balkanu”: PREPOVEDANO Zagreb (3–4,5 h avtoceste — kosilo ob poti, NE hotel). PREPOVEDANO drugi dan “raziskovanje Zagreba”. Prva nočitev = Zadar, Split ali Plitvice (~5–6 h isti dan). Največ 1 hrvaška tranzitna noč na poti DOL — ne 2+ noči v Zagrebu.
- Povratek: Zagreb→Dunaj ≈ 4 h avtoceste. PREPOVEDANO nočitev v Gradcu + naslednji dan “prihod na Dunaj”. Gradec je kvečjemu kosilo ob poti; isti večer spi na Dunaju / doma. Ne mešaj “Vožnja domov” z večerjo v Gradcu.`;
}

function westernBalkansRoadTripPrompt(dest: string): string {
  if (!isWesternBalkansDestination(dest)) return "";
  return `
ZAHODNI BALKAN (obvezno, če je cilj Balkan / BiH / Črna gora / Albanija):
- Večina NOČITEV mora biti v državah, ki jih je uporabnik navedel (Bosna in Hercegovina, Črna gora, Albanija) — plaže, gore, narava.
- Hrvaška (Zadar/Split/Dubrovnik) je samo kratek tranzit, če je nujna za vožnjo iz Slovenije/Avstrije — NE 6 od 11 noči na Hrvaškem.
- Ne zamenjaj “Balkan” z Italijo, Turkmenistanom ali FCO.
- transportation[]: type "car", nikoli "van" za etape z lastnim avtom.
${albaniaCarRoadTripPrompt(dest)}`;
}

export function groundTransportPromptBlock(
  mode: GroundTransportMode,
  originPlace: string,
  destinationPlace: string,
): string {
  const origin = originPlace.trim();
  const dest = destinationPlace.trim();
  if (mode === "train") {
    return `
PREVOZ DO DESTINACIJE — VLAK (obvezno):
- Potnik potuje iz "${origin}" do "${dest}" z vlakom (ne z letalom za ta del poti).
- Prvi dni itinerarja morajo vključevati logistiko poti od doma: ključne postaje, prestope, trajanje in oceno cene.
- Označi vsak dan poti z jasnim naslovom (npr. "Pot do Rima — vlak preko Dunaja").
- V transportation[] na dneh poti uporabi type "train" z realnimi imeni postaj/mest.
- Po prihodu na destinacijo nadaljuj z običajnim oglednim programom.

POVRATEK DOMOV — VLAK (obvezno, zadnji dnevi):
- Potnik se NE vrača z mednarodnega letala! Celotno potovanje je vlak iz "${origin}" do "${dest}" in nazaj.
- Zadnji dan (ali zadnja 1–2 dni) mora biti vožnja/vlak NAZAJ do izhodišča "${origin}".
- Na zadnjem dnevu NE načrtuj mednarodnega leta, odhoda z letališča ali trip_metadata.return_flight_eu.
- transportation[] zadnjega dne: type "train" proti domu.`;
  }

  if (mode === "motorhome") {
    return `
PREVOZ DO DESTINACIJE — AVTODOM (obvezno):
- Potnik potuje iz "${origin}" do "${dest}" z avtodomom (ne z letalom za ta del poti).
- Prvi dni morajo pokrivati celotno pot od doma do destinacije z realističnimi postanki (npr. "Postanek v Milanu", "Nočitev v Münchenu").
- Vsak dan poti: drivingDistanceKm, drivingDurationHours, smiselne postanke ali kratki ogledi ob poti.
${ownVehicleRoundtripRulesPrompt()}
- Za avtodom: kampiri/RV parki ob poti, ne hoteli v centru mest.
- Proračun: v dailyBudget vključni DELEŽ cestnin/vinjet, goriva in kampa (deljeno na potnike) — IT/FR avtoceste so drage.
- Po prihodu na destinacijo nadaljuj z glavnim programom na cilju.
${westernBalkansRoadTripPrompt(dest)}

POVRATEK DOMOV — AVTODOM (obvezno, zadnji dnevi):
- Potnik se NE vrača z mednarodnega letala! Celotno potovanje je z avtodomom iz "${origin}" do "${dest}" in nazaj.
- Zadnji dan (ali zadnja 1–3 dni, glede na razdaljo) mora biti vožnja NAZAJ do izhodišča "${origin}" z realističnimi postanki, drivingDistanceKm in drivingDurationHours. day.city zadnjega dne = "${origin}". Day N = samo zadnja zmerna etapa (≤${LAST_DAY_HOME_MAX_HOURS} h); če je predzadnja baza dlje, nočitev vmes (ne 12 h / 1500 km).
- Na zadnjem dnevu NE načrtuj mednarodnega leta, category airport za odlet v EU, prevoza na letališče ali trip_metadata.return_flight_eu.
- transportation[] zadnjega dne: vožnja z avtodomom proti domu — ne flight.`;
  }

  // car
  return `
PREVOZ DO DESTINACIJE — AVTO (obvezno):
- Potnik potuje iz "${origin}" do "${dest}" z avtom (ne z letalom za ta del poti).
- Prvi dni morajo pokrivati celotno pot od doma do destinacije z realističnimi postanki (npr. "Postanek v Milanu", "Nočitev v Münchenu").
- Vsak dan poti: drivingDistanceKm, drivingDurationHours, smiselne postanke ali kratki ogledi ob poti.
${ownVehicleRoundtripRulesPrompt()}
- PREPOVEDANO kosilo/muzej/ogled v ciljnem mestu isti dan po ≥6 h vožnji.
- NOČITVE: vsak večer hotel v mestu (Booking.com). hotels[] = samo city + nights — PREPOVEDANO izmišljati imena hotelov. UI odpre 2+ živi opciji. PREPOVEDANO: kamp, RV park, campground, sosta ali "spanje v avtu" kot namestitev.
- PRVA NOČ: če je cilj še daleč (>500 km, npr. Albanija, Črna gora, Grčija, Španija), PREPOVEDANO hotel v mestu ≤4 h / ≤350 km od "${origin}" (npr. Dunaj→Zagreb na poti v Albanijo). To je kava ob avtocesti, ne nočitev.
- transportation[] na dneh poti: type "car" (vožnja) — PREPOVEDANO type "flight" ali type "van" za cestne etape.
- Proračun: v dailyBudget vključni DELEŽ cestnin/vinjet in goriva (deljeno na število potnikov) — IT/FR/ES/HR avtoceste so drage; AT/SI/CH vinjeta. V hotels[] ali estimatedCostEur dodaj okvirno ceno hotela/noč v mestu nočitve.
- Po prihodu na destinacijo nadaljuj z glavnim programom na cilju.
${westernBalkansRoadTripPrompt(dest)}

POVRATEK DOMOV — AVTO (obvezno, zadnji dnevi):
- Potnik se NE vrača z mednarodnega letala! Celotno potovanje je z avtom iz "${origin}" do "${dest}" in nazaj.
- ČAS VOŽNJE mora biti realističen: avtocesta ~80 km/h povprečno (meje, počivališča). Primer: Győr→Zagreb ≈ 320 km / 3h 15min–4h — NIKOLI 1h 45min. Če je etapa >250 km, drivingDurationHours ≥ 3h. Počasne kopenske meje (HR–ME, ME–AL, US–MX, TH–KH…): prištej extra ure iz tabele, ne samo zemljevid.
- Zadnja PLAČANA hotelska nočitev je tam, od koder je vožnja domov še predolga za isti dan. PREPOVEDANO: hotel v izhodišču "${origin}" in PREPOVEDANO hotel v mestu, ki je ~2–3 h vožnje od doma, na zadnjih 1–2 dneh (npr. Ljubljana, če je dom Maribor; Nürnberg, če je dom München; Gradec, če je dom Dunaj). Zagreb hotel na povratku SAMO če si prišel prejšnji večer (Kotor/Split) — NE isti dan iz Berata/Tirane. Če je Zagreb→Dunaj ~4 h in si v Zagrebu že spal: isti dan vožnja domov — NE nočitev v Gradcu. Zadnji koledarski dan = vožnja domov, spanje doma, estimatedCostEur hotela = 0. day.city zadnjega dne = "${origin}" — ne Munich/Zagreb/Nîmes z naslovom povratka.
- Zadnji dan (ali zadnja 1–3 dni, glede na razdaljo) mora biti vožnja NAZAJ do izhodišča "${origin}" z realističnimi postanki, drivingDistanceKm in drivingDurationHours. Day N = samo zadnja zmerna etapa (≤${LAST_DAY_HOME_MAX_HOURS} h); če je predzadnja baza dlje, nočitev vmes, ne 10–16 h / 1500 km JSON dan.
- Na zadnjem dnevu NE načrtuj mednarodnega leta, category airport za odlet v EU, prevoza na letališče ali trip_metadata.return_flight_eu.
- transportation[] zadnjega dne: type "car" proti domu — ne flight. Ne izmišljuj novega turističnega mesta (npr. Rijeka), če ni na najkrajši poti domov.`;
}

/** Last-day return rules — must match groundTransportMode (car ≠ flight home). */
export function lastDayReturnPromptBlock(params: {
  groundTransportMode?: GroundTransportMode;
  originPlace?: string;
  returnFromIata?: string;
  destinationIata?: string;
}): string {
  const origin = params.originPlace?.trim() || "izhodišče potnika";
  const mode = params.groundTransportMode;

  if (mode === "car" || mode === "motorhome") {
    const vehicle = mode === "motorhome" ? "avtodomom" : "avtom";
    return `ZADNJI DAN — POVRATEK DOMOV (obvezno, ${mode === "motorhome" ? "AVTODOM" : "AVTO"}):
- Day N (zadnji koledarski dan) MUST ALWAYS be the departure day: vožnja NAZAJ na "${origin}".
- Striktno: potnik potuje z ${vehicle} od "${origin}" — zadnji dan je vožnja NAZAJ na "${origin}", NE mednarodni let z letališča!
- Zadnji dan JSON: day.city MORA biti "${origin}" (ne Munich/Zagreb/Nîmes/Barcelona z naslovom „vožnja domov“).
- Day N = SAMO zadnja zmerna etapa (≤${LAST_DAY_HOME_MAX_HOURS} h). Outbound+inbound = krog ALI vmesne tranzitne nočitve — PREPOVEDANO 1500–2200 km v enem dnevu.
- Če bi vožnja do "${origin}" ≥${LAST_DAY_HOME_MAX_HOURS} h ALI >${HARD_DRIVE_KM} km: nočitev vmes na predzadnjem dnevu — PREPOVEDANO 10–16 h / 1500 km zadnji dan.
- Zadnji dan: check-out v tujini (če je treba), nato SAMO zadnja zmerna etapa domov (≤${LAST_DAY_HOME_MAX_HOURS} h, avtocesta ~80 km/h, ne izmišljuj 1–2h za 300 km). PREPOVEDANO zadnji dan iz oddaljene obale/prestolnice 800–2000 km stran.
- PREPOVEDANO: hotel/nočitev z estimatedCostEur > 0 v "${origin}" ali v mestu ~2–3 h od izhodišča na zadnjih dneh (Gradec, če je dom Dunaj) — spanje je doma. Ne dodajaj turistične nočitve v Gradcu, če je Zagreb→dom ~4 h.
- Prepovedano na zadnjem dnevu: mednarodni let, aktivnost category airport za odlet v EU, prevoz na letališče za povratek domov.
- trip_metadata.return_flight_eu NE izpolnjuj — potnik se vrne z ${vehicle}.`;
  }

  if (mode === "train") {
    return `ZADNJI DAN — POVRATEK DOMOV (obvezno, VLAK):
- Day N (zadnji koledarski dan) MUST ALWAYS be the departure day: vlak NAZAJ na "${origin}".
- Striktno: potnik se vrača z vlakom na "${origin}" — NE z mednarodnega letala!
- Zadnji dan(i): vlak/postaje proti domu; transportation[] type "train".
- trip_metadata.return_flight_eu NE izpolnjuj.`;
  }

  const airport = params.returnFromIata ?? params.destinationIata ?? "izhodno letališče";
  return `ZADNJI DAN — STROGI JSON (LET — vpiši logistiko iz IZBRANI LET):
- Day N (zadnji koledarski dan) MUST ALWAYS be the departure day: hotel check-out, airport transfer, international return flight home.
- V JSON vpiši check-out → transfer → letališče → mednarodni let z urami iz IZBRANI LET. Aplikacija tega JSON-a ne prepisuje.
- PREPOVEDANO: Day N kot poln ogledni dan v novem mestu/regiji.
- Ne dodajaj novih mest/oddaljenih regij; noč pred odhodom blizu izhodnega letališča (${airport}).
- trip_metadata.return_flight_eu: kopiraj ure iz IZBRANI LET, ne izmišljuj.`;
}

export function isJourneyDay(day: DayPlan, plan: AiTripPlan): boolean {
  if (day.journeyPhase === "outbound") return true;
  if (!plan.groundTransportMode || !plan.groundJourney) return false;
  const stopDays = new Set(plan.groundJourney.stops.map((s) => s.day).filter(Boolean));
  return stopDays.has(day.day);
}

const COUNTRY_DEST_RE =
  /^(italy|italija|italia|croatia|hrvaška|hrvatska|spain|španija|france|francija|germany|nemčija|austria|avstrija|slovenia|slovenija|greece|grčija|portugal|netherlands|switzerland|švica)(,|\s|$)/i;

function isCountryOnlyDestination(label: string): boolean {
  const s = label.replace(/\s+/g, " ").trim();
  if (!s) return false;
  const head = s.split(",")[0]!.trim();
  return COUNTRY_DEST_RE.test(head) || COUNTRY_DEST_RE.test(s);
}

/**
 * Unique overnight hubs in day order (collapse Venice×2, Florence×3, …).
 * `day` = first itinerary day in that city — used to fly the map.
 */
export function collectRoadTripHubStops(plan: AiTripPlan): GroundJourneyStop[] {
  const stops: GroundJourneyStop[] = [];
  let lastKey = "";

  for (const day of [...plan.days].sort((a, b) => a.day - b.day)) {
    if (day.inFlightDay) continue;
    const city = (day.city ?? day.focusName ?? "").trim();
    if (!city) continue;
    const key = city.toLowerCase();
    if (key === lastKey) continue;
    lastKey = key;
    stops.push({
      name: city,
      note: day.title,
      day: day.day,
    });
  }

  return stops;
}

function collectJourneyStops(plan: AiTripPlan): GroundJourneyStop[] {
  // Full motorhome / country-level road loops: one chip per city stay, not per day.
  if (
    plan.groundTransportMode === "motorhome" ||
    plan.accommodationMode === "motorhome" ||
    isCountryOnlyDestination(plan.destinationPlace ?? plan.destinationName ?? "")
  ) {
    return collectRoadTripHubStops(plan);
  }

  const destCity = (plan.destinationPlace ?? plan.destinationName ?? "").trim().toLowerCase();
  const stops: GroundJourneyStop[] = [];
  let seenDest = false;

  for (const day of plan.days) {
    const city = (day.city ?? day.focusName ?? "").trim();
    if (!city) continue;
    const destHead = destCity.split(",")[0]!.trim().toLowerCase();
    const isDest = destHead.length >= 3 && city.toLowerCase().includes(destHead);
    if (isDest) {
      seenDest = true;
      break;
    }
    if (
      day.journeyPhase === "outbound" ||
      day.category === "transport" ||
      (day.drivingDistanceKm ?? 0) > 80 ||
      /pot do|potovanje|vlak|postanek|transfer/i.test(`${day.title} ${day.morning}`)
    ) {
      // Skip "vožnja" alone — motorhome day copy matches almost every day.
      stops.push({
        name: city,
        note: day.title,
        day: day.day,
      });
    }
  }

  if (!seenDest && plan.days.length > 0) {
    const lastJourney = plan.days.find((d) => d.journeyPhase === "outbound");
    if (lastJourney && !stops.some((s) => s.day === lastJourney.day)) {
      stops.push({
        name: lastJourney.city ?? lastJourney.focusName,
        day: lastJourney.day,
      });
    }
  }

  // Collapse accidental same-city runs (e.g. 2 nights Venice).
  const deduped: GroundJourneyStop[] = [];
  for (const stop of stops) {
    const key = (stop.name ?? "").trim().toLowerCase();
    if (!key) continue;
    if (deduped[deduped.length - 1]?.name.trim().toLowerCase() === key) continue;
    deduped.push(stop);
  }
  return deduped;
}

export function enrichGroundTransportPlan(
  plan: AiTripPlan,
  opts: {
    mode?: GroundTransportMode;
    originPlace?: string;
    destinationPlace?: string;
  },
): void {
  if (!opts.mode || !opts.originPlace?.trim()) return;

  plan.groundTransportMode = opts.mode;
  plan.originPlace = opts.originPlace.trim();
  plan.destinationPlace = opts.destinationPlace?.trim() || plan.destinationName;

  if (opts.mode === "motorhome") {
    plan.accommodationMode = "motorhome";
  } else if (opts.mode === "car") {
    plan.accommodationMode = "hotel";
    delete plan.hotelRestEveryNDays;
  }

  let journeyDayCount = 0;
  const maxJourneyDays = opts.mode === "train" ? 3 : 4;

  for (const day of plan.days) {
    if (journeyDayCount >= maxJourneyDays) break;
    const text = `${day.title} ${day.city} ${day.morning} ${day.afternoon}`.toLowerCase();
    const isTravel =
      (day.drivingDistanceKm ?? 0) > 50 ||
      day.category === "transport" ||
      /pot do|vožnja|vlak|postanek|transfer|journey|travel day/i.test(text);

    if (isTravel || journeyDayCount > 0) {
      day.journeyPhase = "outbound";
      journeyDayCount++;
    }
  }

  if (journeyDayCount === 0 && plan.days[0]) {
    plan.days[0].journeyPhase = "outbound";
  }

  const fullRoadLoop = opts.mode === "motorhome";
  const distanceDays = fullRoadLoop
    ? plan.days
    : plan.days.filter((d) => d.journeyPhase === "outbound");

  const totalKm = distanceDays.reduce((sum, d) => sum + (d.drivingDistanceKm ?? 0), 0);

  const durationParts = distanceDays
    .map((d) => d.drivingDurationHours)
    .filter((v): v is string => Boolean(v));

  plan.groundJourney = {
    mode: opts.mode,
    originLabel: plan.originPlace,
    destinationLabel: plan.destinationPlace ?? plan.destinationName,
    totalDistanceKm: totalKm > 0 ? Math.round(totalKm) : undefined,
    // Motorhome: one total figure — avoid "2h + 2h + 0h + …" noise for every leg.
    totalDuration: fullRoadLoop
      ? durationParts.length
        ? `${durationParts.length} etap`
        : undefined
      : durationParts.length
        ? durationParts.join(" + ")
        : undefined,
    stops: collectJourneyStops(plan),
  };
}
