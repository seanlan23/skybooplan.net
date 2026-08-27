/**
 * Destination-agnostic planner quality rules.
 * Slow borders are a lookup table — not a “Balkans product mode”.
 */

import type { AiTripPlan } from "@/lib/aiPlan.functions";

/** Pure driving target (no long stops). */
export const TARGET_DRIVE_HOURS = 5;
/** Hard cap including rest stops — never a single JSON day beyond this. */
export const HARD_DRIVE_HOURS = 7;
/** Comfortable daily road distance; stay near this, never invent 1500 km days. */
export const TARGET_DRIVE_KM = 500;
/** Absolute daily road distance cap (with stops). */
export const HARD_DRIVE_KM = 700;
/** Last calendar day is only the final hop home. */
export const LAST_DAY_HOME_MAX_HOURS = 5;
/** Strip museums/walks when a road stage is still over this. */
export const STRIP_SIGHTS_DRIVE_HOURS = 6;
export const TWO_NIGHT_MIN_TRIP_DAYS = 7;

export type SlowLandBorder = {
  a: string;
  b: string;
  offPeakH: number;
  peakH: number;
  noteSl: string;
  noteEn: string;
};

/** Known slow land borders. Unlisted pairs (incl. internal Schengen) = 0 extra hours. */
export const SLOW_LAND_BORDERS: SlowLandBorder[] = [
  {
    a: "HR",
    b: "BA",
    offPeakH: 1,
    peakH: 2,
    noteSl: "Meja HR–BA: poleti +2 h nad Google časom.",
    noteEn: "HR–BA border: add ~2 h in summer on top of Google Maps.",
  },
  {
    a: "BA",
    b: "ME",
    offPeakH: 1,
    peakH: 2,
    noteSl: "Meja BA–ME: poleti +2 h nad Google časom.",
    noteEn: "BA–ME border: add ~2 h in summer on top of Google Maps.",
  },
  {
    a: "ME",
    b: "AL",
    offPeakH: 1,
    peakH: 2.5,
    noteSl: "Meja ME–AL (Sukobin/Božaj): poleti +2–3 h nad Google časom.",
    noteEn: "ME–AL border (Sukobin/Božaj): add 2–3 h in summer.",
  },
  {
    a: "HR",
    b: "ME",
    offPeakH: 1.5,
    peakH: 3,
    noteSl: "Meja HR–ME (Debeli Brijeg): poleti večurne kolone, +3 h.",
    noteEn: "HR–ME (Debeli Brijeg): summer queues, add ~3 h.",
  },
  {
    a: "AL",
    b: "HR",
    offPeakH: 3,
    peakH: 4,
    noteSl: "AL→HR v enem dnevu = dve meji. To ni etapa — nočitev vmes.",
    noteEn: "AL→HR in one day = two borders. Split with an overnight.",
  },
  {
    a: "BA",
    b: "AL",
    offPeakH: 3,
    peakH: 4,
    noteSl: "BA→AL v enem dnevu = dve meji. Nočitev v Črni gori.",
    noteEn: "BA→AL in one day = two borders. Overnight in Montenegro.",
  },
  {
    a: "US",
    b: "MX",
    offPeakH: 1,
    peakH: 2.5,
    noteSl: "Meja US–MX: v špicah +2–3 h (ne samo Google).",
    noteEn: "US–MX land border: add 2–3 h at peak times.",
  },
  {
    a: "TH",
    b: "KH",
    offPeakH: 1,
    peakH: 2,
    noteSl: "Kopenska meja TH–KH: računaj +1–2 h (kontrola, čakalne vrste).",
    noteEn: "TH–KH land border: add 1–2 h for checks and queues.",
  },
  {
    a: "TH",
    b: "LA",
    offPeakH: 1,
    peakH: 2,
    noteSl: "Kopenska meja TH–LA: računaj +1–2 h.",
    noteEn: "TH–LA land border: add 1–2 h.",
  },
  {
    a: "TH",
    b: "MY",
    offPeakH: 0.5,
    peakH: 1.5,
    noteSl: "Meja TH–MY: v špicah +1–2 h.",
    noteEn: "TH–MY border: add 1–2 h at peak times.",
  },
];

/** Cities that should get 2 nights on trips of 7+ days (not hit-and-run). */
const TWO_NIGHT_CITY_KEYS = new Set(
  [
    "mostar",
    "kotor",
    "berat",
    "gjirokaster",
    "gjirokastër",
    "split",
    "dubrovnik",
    "sarajevo",
    "shkoder",
    "shkodër",
    "nice",
    "lyon",
    "avignon",
    "athens",
    "atene",
    "madrid",
    "meteora",
    "paris",
    "rome",
    "roma",
    "rim",
    "barcelona",
    "lisbon",
    "lisboa",
    "prague",
    "praha",
    "budapest",
    "vienna",
    "wien",
    "dunaj",
    "krakow",
    "kraków",
    "tokyo",
    "kyoto",
    "osaka",
    "bangkok",
    "chiang mai",
    "hanoi",
    "ho chi minh",
    "saigon",
    "marrakech",
    "fes",
    "cape town",
    "new york",
    "nyc",
    "london",
    "amsterdam",
    "berlin",
    "munich",
    "münchen",
    "florence",
    "firenze",
    "venice",
    "venezia",
    "seville",
    "sevilla",
    "granada",
    "porto",
    "edinburgh",
    "istanbul",
    "cairo",
    "cusco",
    "cartagena",
    "kyoto",
    "seoul",
    "taipei",
    "manila",
    "cebu",
    "ubud",
    "siem reap",
  ].map((k) => k.normalize("NFD").replace(/\p{M}/gu, "")),
);

function cityKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .split(",")[0]
    ?.trim()
    .replace(/\s+/g, " ") ?? "";
}

export function isPeakSlowBorderSeason(isoDate?: string, fromCc?: string | null, toCc?: string | null): boolean {
  if (!isoDate) return true;
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(m)) return true;
  const pair = new Set([fromCc ?? "", toCc ?? ""]);
  if (pair.has("US") && pair.has("MX")) {
    if (m === 12 && d >= 20) return true;
    if (m === 1 && d <= 5) return true;
    return m === 7 || m === 8;
  }
  if (m === 7 || m === 8) return true;
  if (m === 6 && d >= 15) return true;
  if (m === 9 && d <= 15) return true;
  return false;
}

function lookupSlowBorder(fromCc: string, toCc: string): SlowLandBorder | null {
  return (
    SLOW_LAND_BORDERS.find(
      (row) =>
        (row.a === fromCc && row.b === toCc) || (row.a === toCc && row.b === fromCc),
    ) ?? null
  );
}

export function borderPenaltyHours(
  fromCc: string | null,
  toCc: string | null,
  isoDate?: string,
): number {
  if (!fromCc || !toCc || fromCc === toCc) return 0;
  const row = lookupSlowBorder(fromCc, toCc);
  if (!row) return 0;
  const peak = isPeakSlowBorderSeason(isoDate, fromCc, toCc);
  return peak ? row.peakH : row.offPeakH;
}

export function slowBorderNote(
  fromCc: string | null,
  toCc: string | null,
  sl: boolean,
): string | null {
  if (!fromCc || !toCc || fromCc === toCc) return null;
  const row = lookupSlowBorder(fromCc, toCc);
  if (!row) return null;
  return sl ? row.noteSl : row.noteEn;
}

export function prefersTwoNights(city: string, totalDays: number): boolean {
  if (totalDays < TWO_NIGHT_MIN_TRIP_DAYS) return false;
  const key = cityKey(city);
  if (!key) return false;
  if (TWO_NIGHT_CITY_KEYS.has(key)) return true;
  for (const stay of TWO_NIGHT_CITY_KEYS) {
    if (key.includes(stay) || stay.includes(key)) return true;
  }
  return false;
}

function appendUnique(existing: string | undefined, note: string): string {
  const prev = (existing ?? "").trim();
  if (!note.trim()) return prev;
  if (prev.toLowerCase().includes(note.slice(0, 32).toLowerCase())) return prev;
  return prev ? `${prev} ${note}` : note;
}

function consecutiveNightsByCity(plan: AiTripPlan): Map<string, number> {
  const counts = new Map<string, number>();
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  let runKey = "";
  let run = 0;
  const flush = () => {
    if (!runKey || run <= 0) return;
    counts.set(runKey, Math.max(counts.get(runKey) ?? 0, run));
  };
  for (const day of days) {
    if (day.inFlightDay) continue;
    const key = cityKey(day.city ?? day.focusName ?? "");
    if (!key) continue;
    if (key === runKey) run += 1;
    else {
      flush();
      runKey = key;
      run = 1;
    }
  }
  flush();
  return counts;
}

function keepStayOrEat(a: { type?: string; name?: string; description?: string }): boolean {
  const type = (a.type ?? "").toLowerCase();
  if (type === "eat" || type === "hotel" || type === "stay") return true;
  const blob = `${a.name ?? ""} ${a.description ?? ""}`;
  return /hotel|check-?in|prijava|nočitev|večerja|dinner|lunch|kosilo/i.test(blob);
}

/**
 * 1-night famous city on a 7+ day trip: steal the last night of a 3+ night neighbour.
 * Does not add calendar days.
 */
export function stealNightForHitAndRun(plan: AiTripPlan): number {
  const total = plan.days?.length ?? 0;
  if (total < TWO_NIGHT_MIN_TRIP_DAYS) return 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  const nights = consecutiveNightsByCity(plan);
  let n = 0;
  for (let i = 1; i < days.length; i++) {
    const day = days[i]!;
    if (day.inFlightDay || day.day === total) continue;
    const city = (day.city ?? day.focusName ?? "").trim();
    if (!prefersTwoNights(city, total)) continue;
    const hitKey = cityKey(city);
    if ((nights.get(hitKey) ?? 0) !== 1) continue;
    if ((day.drivingDistanceKm ?? 0) > 400) continue;
    const stealFrom = (donor: (typeof days)[number], donorKey: string) => {
      donor.city = day.city;
      if (day.focusName) donor.focusName = day.focusName;
      if (Number.isFinite(day.lat)) donor.lat = day.lat;
      if (Number.isFinite(day.lng)) donor.lng = day.lng;
      donor.title = city;
      if (donor.activities) {
        for (const slot of ["morning", "afternoon", "evening"] as const) {
          donor.activities[slot] = (donor.activities[slot] ?? []).filter(keepStayOrEat);
        }
      }
      nights.set(donorKey, (nights.get(donorKey) ?? 1) - 1);
      nights.set(hitKey, 2);
    };
    const prev = days[i - 1]!;
    const prevKey = cityKey(prev.city ?? prev.focusName ?? "");
    if (prevKey && prevKey !== hitKey && (nights.get(prevKey) ?? 0) >= 3) {
      stealFrom(prev, prevKey);
      n += 1;
      continue;
    }
    const next = days[i + 1];
    if (!next || next.inFlightDay || next.day === total) continue;
    const nextKey = cityKey(next.city ?? next.focusName ?? "");
    if (!nextKey || nextKey === hitKey) continue;
    if ((nights.get(nextKey) ?? 0) < 3) continue;
    stealFrom(next, nextKey);
    n += 1;
  }
  return n;
}

/** Note 1-night stays in major cities on long trips (does not rewrite the calendar). */
export function annotateHitAndRunStays(plan: AiTripPlan): number {
  const total = plan.days?.length ?? 0;
  if (total < TWO_NIGHT_MIN_TRIP_DAYS) return 0;
  const sl = !(plan.contentLanguage && !plan.contentLanguage.startsWith("sl"));
  const nights = consecutiveNightsByCity(plan);
  let n = 0;
  for (const day of plan.days ?? []) {
    const city = (day.city ?? day.focusName ?? "").trim();
    if (!prefersTwoNights(city, total)) continue;
    if ((nights.get(cityKey(city)) ?? 0) !== 1) continue;
    if ((day.drivingDistanceKm ?? 0) > 400) continue;
    if (day.inFlightDay || day.day === total) continue;
    const note = sl
      ? `Raje 2 noči v ${city} — 1 noč je premalo za ogled (razen čistega tranzita).`
      : `Prefer 2 nights in ${city} — one night is a hit-and-run unless this is pure transit.`;
    const before = day.localWarnings ?? "";
    day.localWarnings = appendUnique(day.localWarnings, note);
    if (day.localWarnings !== before) n += 1;
  }
  return n;
}

/** Flag road stages over the 5h target so the PDF does not look like a sightseeing day. */
export function annotateOverlongDriveStages(plan: AiTripPlan): number {
  if (plan.groundTransportMode !== "car" && plan.groundTransportMode !== "motorhome") {
    return 0;
  }
  const sl = !(plan.contentLanguage && !plan.contentLanguage.startsWith("sl"));
  let n = 0;
  for (const day of plan.days ?? []) {
    const hours = Number(
      String(day.drivingDurationHours ?? day.transport?.duration ?? "")
        .replace(",", ".")
        .match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0,
    );
    const km = Number(day.drivingDistanceKm ?? 0);
    if (hours < TARGET_DRIVE_HOURS + 0.25 && km <= HARD_DRIVE_KM) continue;
    const note = sl
      ? `Ta etapa je ~${hours.toFixed(1)} h / ${Math.round(km)} km (cilj ≤${TARGET_DRIVE_HOURS} h in ≤${HARD_DRIVE_KM} km). Naslednjič razdeli z nočitvijo vmes.`
      : `This stage is ~${hours.toFixed(1)} h / ${Math.round(km)} km (target ≤${TARGET_DRIVE_HOURS} h and ≤${HARD_DRIVE_KM} km). Split with an overnight next time.`;
    const before = day.transportationTips ?? "";
    day.transportationTips = appendUnique(day.transportationTips, note);
    if (day.transportationTips !== before) n += 1;
  }
  return n;
}

export function plannerQualityPromptBlock(opts: {
  road: boolean;
  totalDays: number;
  /** User listed nights-per-city in wishes — do not steal/pad nights. */
  lockUserStayPlan?: boolean;
}): string {
  const twoNight = opts.lockUserStayPlan
    ? `- NOČITVE: uporabnikov razpored mest/noči je ZAKLENJEN. PREPOVEDANO “ukrasti noč” sosedu, dvigovati 1-nočne baze na 2, ali dodajati noči na prvo bazo. hotels[] = natanko želje.`
    : opts.totalDays >= TWO_NIGHT_MIN_TRIP_DAYS
      ? `- NOČITVE: v pomembnejših mestih (Paris, Rim, Kyoto, Split, Kotor, Berat, Cape Town, NYC…) 2 noči ALI izpusti mesto. PREPOVEDANO 1 noč + sprehod na ${opts.totalDays}-dnevni poti (Rim, Kotor, Pariz…). Aplikacija ukrade noč sosedu z 3+ nočitvami — ti raje že v skeletu daj 2 noči.`
      : `- NOČITVE: na kratki poti je 1 noč v mestu OK — ne siliti 2 noči na račun cilja.`;

  const roadBlock = opts.road
    ? `
VOŽNJE (samo avto/avtodom — NE velja za mednarodni let):
- ENA dnevna etapa: ${TARGET_DRIVE_KM}–${HARD_DRIVE_KM} km, ≤${TARGET_DRIVE_HOURS} h čiste vožnje, z vmesnimi postanki največ ${HARD_DRIVE_HOURS} h. Trdo max ${HARD_DRIVE_KM} km / ${HARD_DRIVE_HOURS} h.
- PREPOVEDANO nerealne enodnevne etape 1500–2200 km ali 8–16 h vožnje brez nočitve. Če etapa ≥${HARD_DRIVE_HOURS} h ALI >${HARD_DRIVE_KM} km: nočitev v vmesnem mestu ŽE V SKELETU — koda bo day.city prestavila, ne samo pripisala opozorilo.
- Lastno vozilo (izhodišče = cilj poti): outbound in inbound tvorita logičen krog ALI povratek vstavi tranzitne baze z 1 nočitvijo (vsak hop v limitu). PREPOVEDANO isto avtocesto 1500 km v enem dnevu nazaj.
- Zadnji dan: day.city = izhodišče; SAMO zadnja zmerna etapa domov (≤${LAST_DAY_HOME_MAX_HOURS} h). Če je predzadnja baza dlje, nočitev vmes na N−1.
- Počasne kopenske meje (tabela, velja povsod): HR–BA, BA–ME, ME–AL, HR–ME, AL–HR, US–MX, TH–KH/LA/MY. Junij–september (in US–MX prazniki): prištej extra ure. Notranji Schengen = 0.
- PREPOVEDANO muzej/sprehod/kosilo v ciljnem mestu isti dan po ≥${STRIP_SIGHTS_DRIVE_HOURS} h vožnje — samo prijava.`
    : `
PREVOZI (leti/trajekti/vlaki):
- Dnevni “5 h vožnje” cap NE velja za mednarodni let.
- TRAVEL DAY: dopoldne = prevoz/transfer; ogledi v novem mestu samo popoldne/zvečer po check-inu.
- Medmesti: najprej zapiši hop (let/trajekt/vlak), šele nato oglede v novem mestu.
- Zadnji dan = samo pravi odhod — ne žigosi vmesnega vračanja na hub kot mednarodni let.
- Zadnji dan: odjava, Grab/taxi in prijava na letališču se vežejo na uro MEDNARODNEGA odhoda. Notranji let prejšnji dan (če je treba spati na hubu pred jutranjim boardom) NE sme dobiti istih ur kot mednarodna vozovnica.`;

  return `
=== KAKOVOST NAČRTA (vse destinacije — obvezno) ===
VRSTNI RED (glej TRAVEL DESIGNER zgoraj — ne preskakuj):
1) Destinacija + točni datumi (sezona, dan svetlobe, prazniki, odpiralni časi).
2) Geografski tok: enosmerni lok, čim manj vračanja.
3) Dnevni ritem in energija (počitek po dolgem premiku; celodnevni izlet redko >10–11 h vrat–vrata).
4) Šele nato aktivnosti, hrana, nasveti.
5) Struktura nočitev = mesto + noči — brez izmišljenih hotelov.

${twoNight}

${roadBlock}

NASTANITVE:
- PREPOVEDANO izmišljati imena hotelov/kampov (“Hotel Splendid”, “Camping X”).
- hotels[] / accommodations[] = samo mesto + število noči. UI/PDF odpre Booking.com z 2+ živimi opcijami.
- V travelHack smeš napisati KRATEK RAZLOG za filter (center / parking / zajtrk / cena) — ne naziv hotela.

HRANA:
- Food aktivnost = konkretno ime lokala. Če ne veš realnega imena, izpusti slot.

PRAKTIČNO (vsak dan kjer sodi):
- Parking, odpiralni čas, sezona, varnost, kje kupiti karto, kateri izhod metroja — konkretno za TO mesto TA dan.
- travelHack = 1 insider nasvet (cena, ura, bližnjica). transportationTips samo če je konkreten A→B.
- local_tips vsak dan: voda/hidracija, hrana/higiena, prevare, bonton na prevozu in v svetiščih, napitnine — za TO mesto.

STIL (človeški planner, ne turistična brošura):
- Piši kot izkušen lokalni kolega: kratko, konkretno, uporabno. Drugačen nasvet vsak dan.
- PREPOVEDANO brošurno: "Uživajte v…", "čudovit razgled", "kulturni/zgodovinski dragulj", "avtentična kuhinja", "fine dining izkušnja", "spoznavanje s prvim okoljem", "lahkoten sprehod v okolici namestitve".
- PREPOVEDANO generični dnevni polnilci: "Popoldanski ogled v mestu…", "Večer v soseski, kjer spiš…", "Središče in trg v mestu…", "Popoldanski lokalni ogled". Vsak slot = konkretno ime kraja v tistem mestu.
- PREPOVEDANO Wikipedia: "zgrajeno v letu…, znana po…, ki služi kot…". Namesto tega: kaj narediš + 1 praktičen detajl (ura, kako priti, kaj vzeti, kaj stane).
- PREPOVEDANO v travelHack echo-ati ta pravila ("Raje 2 noči…", "PREPOVEDANO", "hit and run", "cilj ≤5 h").

SAMOPREGLED PRED JSON:
- Predolge vožnje? Premalo časa v mestu? Generični stavki? Manjkajoči nasveti? Nerealističen tempo? Popravi v ISTEM odgovoru.
- Vsak title in description je CEL stavek (PDF reže prosti tekst). description ≥ 25 besed. PREPOVEDANO placeholderji, nedokončani naslovi, "..." / "…", odrezane besede. transfer in accommodations sta izpolnjena kjer sodi.
===`.trim();
}
