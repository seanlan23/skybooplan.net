import type { Activity, AiTripPlan, DayPlan, DayTransportLeg } from "@/lib/aiPlan.functions";
import { haversineKm } from "@/lib/geoMath";
import { lookupRegionCoords } from "@/lib/regionCoords";
import {
  STRIP_SIGHTS_DRIVE_HOURS,
  borderPenaltyHours,
  slowBorderNote,
} from "@/lib/plannerQuality";

/** Typical EU motorway km ≈ 1.2× great-circle. */
const ROAD_KM_FACTOR = 1.2;
/** Optimistic average including borders — durations below this are fiction. */
const FAST_KMH = 95;
/** Realistic mixed motorway average for the card. */
const TYPICAL_KMH = 80;
/** Albania / Montenegro: no motorway, coastal/mountain. */
const BALKAN_SLOW_KMH = 62;
/** After this, strip sightseeing — you only drive and check in. */
export const BRUTAL_DRIVE_HOURS = STRIP_SIGHTS_DRIVE_HOURS;
const MIN_REPAIR_ROAD_KM = 60;
/** Last calendar days: skip a hotel if home is an easy same-day drive. */
const HOMEBOUND_TAIL_DAYS = 3;
/** ~2.5–3 h motorway — Graz, Ljubljana, Nuremberg when origin is nearby. */
const HOMEBOUND_DRIVE_HOME_KM = 220;

const CITY_COUNTRY: Record<string, string> = {
  maribor: "SI",
  ljubljana: "SI",
  ptuj: "SI",
  celje: "SI",
  koper: "SI",
  kranj: "SI",
  bled: "SI",
  piran: "SI",
  postojna: "SI",
  "slovenj gradec": "SI",
  mezica: "SI",
  "mežica": "SI",
  zagreb: "HR",
  rijeka: "HR",
  split: "HR",
  zadar: "HR",
  dubrovnik: "HR",
  plitvice: "HR",
  "plitvicka jezera": "HR",
  "plitvice lakes": "HR",
  vienna: "AT",
  wien: "AT",
  dunaj: "AT",
  graz: "AT",
  klagenfurt: "AT",
  salzburg: "AT",
  linz: "AT",
  tirana: "AL",
  berat: "AL",
  saranda: "AL",
  "sarande": "AL",
  gjirokaster: "AL",
  vlore: "AL",
  vlora: "AL",
  ksamil: "AL",
  shkoder: "AL",
  skadar: "AL",
  himare: "AL",
  himara: "AL",
  dhermi: "AL",
  kotor: "ME",
  budva: "ME",
  podgorica: "ME",
  mostar: "BA",
  sarajevo: "BA",
  gyor: "HU",
  "győr": "HU",
  budapest: "HU",
  bratislava: "SK",
  presov: "SK",
  "prešov": "SK",
  kosice: "SK",
  "košice": "SK",
  poprad: "SK",
};

function normalizePlace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/,\s*[a-z]{2}$/i, "")
    .replace(/\s+/g, " ");
}

function cityKey(value: string): string {
  return normalizePlace(value.split(",")[0] ?? value);
}

function placesMatch(a: string, b: string): boolean {
  const na = cityKey(a);
  const nb = cityKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function countryFromPlaceLabel(place: string): string | null {
  const t = place.trim();
  const iso = /,\s*([A-Z]{2})\b/.exec(t);
  if (iso?.[1]) return iso[1];
  if (/slovenij|slovenia/i.test(t)) return "SI";
  if (/avstrij|austria/i.test(t)) return "AT";
  if (/madžar|magyar|hungary/i.test(t)) return "HU";
  if (/slovašk|slovakia/i.test(t)) return "SK";
  if (/hrvašk|croatia/i.test(t)) return "HR";
  if (/albanij|albania/i.test(t)) return "AL";
  if (/črn[ae]?\s*gor|crn[ae]?\s*gor|montenegro/i.test(t)) return "ME";
  if (/bosn|hercegovin/i.test(t)) return "BA";
  if (/plitvic/i.test(t)) return "HR";
  return CITY_COUNTRY[cityKey(t)] ?? null;
}

function coordsForPlace(place: string, fallback?: { lat?: number; lng?: number } | null) {
  const looked = lookupRegionCoords(place);
  if (looked) return looked;
  if (
    fallback &&
    typeof fallback.lat === "number" &&
    typeof fallback.lng === "number" &&
    Number.isFinite(fallback.lat) &&
    Number.isFinite(fallback.lng)
  ) {
    return { lat: fallback.lat, lng: fallback.lng };
  }
  return null;
}

export function parseDriveHours(raw: string | undefined): number | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/,/g, ".");
  if (!s) return null;
  const slo = /(\d+(?:\.\d+)?)\s*ur[ae]?(?:\s+in\s+(\d+)\s*min(?:ut[ae]?)?)?/i.exec(s);
  if (slo) {
    const h = Number(slo[1]);
    const m = slo[2] ? Number(slo[2]) : 0;
    if (Number.isFinite(h)) return h + (Number.isFinite(m) ? m / 60 : 0);
  }
  const hm = /(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m(?:in)?)?/i.exec(s);
  if (hm) {
    const h = Number(hm[1]);
    const m = hm[2] ? Number(hm[2]) : 0;
    if (Number.isFinite(h)) return h + (Number.isFinite(m) ? m / 60 : 0);
  }
  const minOnly = /^(\d+)\s*m(?:in)?$/.exec(s);
  if (minOnly) return Number(minOnly[1]) / 60;
  const asNum = Number(s);
  return Number.isFinite(asNum) && asNum > 0 && asNum < 48 ? asNum : null;
}

export function formatDriveHours(hours: number): string {
  const totalMins = Math.max(15, Math.round((hours * 60) / 15) * 15);
  const whole = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins <= 0) return `${whole}h`;
  if (whole <= 0) return `${mins}min`;
  return `${whole}h ${mins}min`;
}

function isRoadLoop(plan: AiTripPlan): boolean {
  return plan.groundTransportMode === "car" || plan.groundTransportMode === "motorhome";
}

function originCity(plan: AiTripPlan): string {
  return (plan.originPlace ?? "").split(",")[0]?.trim() ?? "";
}

function isPaidStayActivity(a: Activity): boolean {
  const type = (a.type ?? "").toLowerCase();
  if (type === "hotel" || type === "stay") return true;
  const blob = `${a.name ?? ""} ${a.description ?? ""}`;
  if (!/hotel|nočitev|nocitev|overnight|prenočišč|nastanitev|unterkunft|übernachtung|check-?in/i.test(blob)) {
    return false;
  }
  return (a.estimatedCostEur ?? 0) >= 20 || /€\s*[3-9]\d|\d{2,}\s*€/.test(a.priceLabel ?? a.price ?? "");
}

export function isHomeboundUnpaidNight(plan: AiTripPlan, day: DayPlan, index: number): boolean {
  if (!isRoadLoop(plan)) return false;
  const origin = originCity(plan);
  if (!origin) return false;
  const city = (day.city ?? day.focusName ?? "").trim();
  if (city && placesMatch(city, origin)) return true;

  const total = plan.days?.length ?? 0;
  if (total < 2 || index < total - HOMEBOUND_TAIL_DAYS) return false;

  const originCoord = coordsForPlace(origin);
  const dayCoord = coordsForPlace(city, day);
  if (originCoord && dayCoord) {
    const km = haversineKm(
      [originCoord.lng, originCoord.lat],
      [dayCoord.lng, dayCoord.lat],
    );
    return km <= HOMEBOUND_DRIVE_HOME_KM;
  }

  const originCc = countryFromPlaceLabel(plan.originPlace ?? origin);
  const dayCc = countryFromPlaceLabel(city) ?? CITY_COUNTRY[cityKey(city)] ?? null;
  return Boolean(originCc && dayCc && originCc === dayCc);
}

export function countHomeboundUnpaidNights(plan: AiTripPlan): number {
  if (!isRoadLoop(plan)) return 0;
  return (plan.days ?? []).filter((d, i) => isHomeboundUnpaidNight(plan, d, i)).length;
}

function homeStayCopy(plan: AiTripPlan, day: DayPlan): { name: string; description: string } {
  const sl = !(plan.contentLanguage && !plan.contentLanguage.startsWith("sl"));
  const origin = originCity(plan) || (sl ? "domov" : "home");
  const city = (day.city ?? "").trim();
  if (city && placesMatch(city, origin)) {
    return sl
      ? { name: "Nočitev doma", description: "Spanje doma — hotel v izhodiščnem mestu ni potreben." }
      : { name: "Night at home", description: "Sleep at home — no hotel needed in your origin city." };
  }
  return sl
    ? {
        name: `Vožnja domov do ${origin}`,
        description: `Zvečer nadaljuj do ${origin} in spi doma. Hotel blizu izhodišča na povratku ni potreben.`,
      }
    : {
        name: `Drive home to ${origin}`,
        description: `Continue to ${origin} in the evening and sleep at home. No hotel on the last nights near origin.`,
      };
}

function zeroStay(a: Activity, copy: { name: string; description: string }): Activity {
  return {
    ...a,
    name: copy.name,
    description: copy.description,
    bullets: [copy.description],
    estimatedCostEur: 0,
    priceLabel: "€0",
    price: "€0",
    type: "STAY",
  };
}

function cruiseKmh(fromCc: string | null, toCc: string | null): number {
  if (fromCc === "AL" || toCc === "AL" || fromCc === "ME" || toCc === "ME") {
    return BALKAN_SLOW_KMH;
  }
  return TYPICAL_KMH;
}

function stageEndpoints(plan: AiTripPlan, day: DayPlan, prev?: DayPlan) {
  const leg = primaryCarLeg(day);
  const from = (leg?.from || prev?.city || plan.originPlace || "").trim();
  const to = (leg?.to || day.city || "").trim();
  return { from, to, leg };
}

export function estimateRoadStageHours(
  from: string,
  to: string,
  opts?: { date?: string; statedKm?: number; fromDay?: { lat?: number; lng?: number }; toDay?: { lat?: number; lng?: number } },
): { roadKm: number; hours: number; borderH: number } | null {
  if (!from || !to || placesMatch(from, to)) return null;
  const fromC = coordsForPlace(from, opts?.fromDay);
  const toC = coordsForPlace(to, opts?.toDay);
  let roadKm = Math.max(0, opts?.statedKm ?? 0);
  if (fromC && toC) {
    const hv = haversineKm([fromC.lng, fromC.lat], [toC.lng, toC.lat]);
    if (hv >= 40) {
      const est = Math.round(hv * ROAD_KM_FACTOR);
      if (roadKm < est * 0.75) roadKm = est;
    }
  }
  if (roadKm < MIN_REPAIR_ROAD_KM) return null;
  const fromCc = countryFromPlaceLabel(from) ?? CITY_COUNTRY[cityKey(from)] ?? null;
  const toCc = countryFromPlaceLabel(to) ?? CITY_COUNTRY[cityKey(to)] ?? null;
  const borderH = borderPenaltyHours(fromCc, toCc, opts?.date);
  const hours = roadKm / cruiseKmh(fromCc, toCc) + borderH;
  return { roadKm, hours, borderH };
}

function applyDurationToDay(day: DayPlan, hoursLabel: string, roadKm: number) {
  day.drivingDistanceKm = roadKm;
  day.drivingDurationHours = hoursLabel;
  if (day.transport) {
    day.transport = {
      ...day.transport,
      duration: hoursLabel,
      description: `${roadKm} km`,
    };
  }
  if (day.transportation?.length) {
    day.transportation = day.transportation.map((leg) =>
      leg.type === "car" || !leg.type
        ? { ...leg, duration: hoursLabel }
        : leg,
    );
  }
}

function statedHoursForDay(day: DayPlan): number | null {
  const fromField = parseDriveHours(day.drivingDurationHours);
  if (fromField != null) return fromField;
  const fromTransport = parseDriveHours(day.transport?.duration);
  if (fromTransport != null) return fromTransport;
  for (const leg of day.transportation ?? []) {
    const h = parseDriveHours(leg.duration);
    if (h != null) return h;
  }
  return null;
}

function primaryCarLeg(day: DayPlan): DayTransportLeg | undefined {
  return (day.transportation ?? []).find((l) => l.type === "car") ?? day.transportation?.[0];
}

/**
 * Replace impossible short drive times (e.g. Győr→Zagreb as 1h 45min).
 */
export function repairImplausibleDriveTimes(plan: AiTripPlan): number {
  if (!isRoadLoop(plan) && plan.groundTransportMode !== "train") {
    // Still repair car legs on mixed plans.
  }
  let fixed = 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const prev = days[i - 1];
    const { from, to } = stageEndpoints(plan, day, prev);
    const est = estimateRoadStageHours(from, to, {
      date: day.date,
      statedKm: day.drivingDistanceKm,
      fromDay: prev,
      toDay: day,
    });
    if (!est) continue;

    const { roadKm, hours: realistic, borderH } = est;
    const minOk = roadKm / FAST_KMH + borderH * 0.6;
    const stated = statedHoursForDay(day);
    const alreadyHonest =
      stated != null &&
      (stated >= realistic * 0.95 || (borderH === 0 && stated >= minOk));
    if (alreadyHonest) continue;

    applyDurationToDay(day, formatDriveHours(realistic), roadKm);
    if (day.transportationTips) {
      const label = formatDriveHours(roadKm / TYPICAL_KMH);
      day.transportationTips = day.transportationTips
        .replace(/\d+(?:[.,]\d+)?\s*ur[ae]?(?:\s+in\s+\d+\s*min(?:ut[ae]?)?)?/gi, label)
        .replace(/\d+(?:[.,]\d+)?\s*h(?:\s*\d+\s*m(?:in)?)?/gi, label);
    }
    fixed += 1;
  }
  return fixed;
}

function isKeepOnBrutalDriveDay(a: Activity): boolean {
  const type = (a.type ?? "").toLowerCase();
  if (type === "eat" || type === "hotel" || type === "stay" || type === "transport") return true;
  const blob = `${a.name ?? ""} ${a.description ?? ""}`;
  return /hotel|check-?in|prijava|nočitev|vožnj|drive|transfer|meja|border|gorivo|fuel/i.test(blob);
}

/**
 * 8h+ stages are drive days — drop museums/walks that make the day look like a city visit.
 */
export function stripSightseeingOnBrutalDriveDays(plan: AiTripPlan): number {
  if (!isRoadLoop(plan)) return 0;
  const sl = !(plan.contentLanguage && !plan.contentLanguage.startsWith("sl"));
  const note = sl
    ? "Ta dan je samo vožnja in prijava v hotel — ni časa za muzeje ali sprehode."
    : "This day is driving and hotel check-in only — no museums or city walks.";
  let n = 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const prev = days[i - 1];
    const { from, to } = stageEndpoints(plan, day, prev);
    const est = estimateRoadStageHours(from, to, {
      date: day.date,
      statedKm: day.drivingDistanceKm,
      fromDay: prev,
      toDay: day,
    });
    const hours = est?.hours ?? parseDriveHours(day.drivingDurationHours) ?? 0;
    if (hours < BRUTAL_DRIVE_HOURS) continue;
    if (!day.activities) continue;
    for (const slot of ["afternoon", "evening"] as const) {
      const list = day.activities[slot] ?? [];
      const next = list.filter(isKeepOnBrutalDriveDay);
      if (next.length !== list.length) {
        day.activities[slot] = next;
        n += 1;
      }
    }
    const before = day.transportationTips ?? "";
    day.transportationTips = appendUniqueNote(day.transportationTips, note);
    if (day.transportationTips !== before) n += 1;
  }
  return n;
}

/**
 * Car/motorhome loops: no paid hotel in the origin city, and none in the origin
 * country on the last days (Ljubljana + Maribor when home is Maribor).
 */
export function stripHomeboundPaidStays(plan: AiTripPlan): number {
  if (!isRoadLoop(plan) || !originCity(plan)) return 0;
  let fixed = 0;
  const days = plan.days ?? [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    if (!isHomeboundUnpaidNight(plan, day, i)) continue;
    const copy = homeStayCopy(plan, day);
    let dayDelta = 0;
    if (day.activities) {
      for (const slot of ["morning", "afternoon", "evening"] as const) {
        const list = day.activities[slot] ?? [];
        day.activities[slot] = list.map((a) => {
          if (!isPaidStayActivity(a)) return a;
          const cost = a.estimatedCostEur ?? 0;
          dayDelta += cost;
          fixed += 1;
          return zeroStay(a, copy);
        });
      }
    }
    if (dayDelta > 0 && typeof day.dailyBudgetEur === "number") {
      day.dailyBudgetEur = Math.max(0, day.dailyBudgetEur - dayDelta);
    }
  }
  return fixed;
}

function isPlitviceDay(day: DayPlan): boolean {
  return /plitvic/i.test(
    `${day.city ?? ""} ${day.title ?? ""} ${day.morning ?? ""} ${day.afternoon ?? ""}`,
  );
}

function isNonEuBalkanDay(day: DayPlan): boolean {
  const cc =
    countryFromPlaceLabel(day.city ?? "") ?? CITY_COUNTRY[cityKey(day.city ?? "")] ?? null;
  return cc === "AL" || cc === "ME" || cc === "BA";
}

function appendUniqueNote(existing: string | undefined, note: string): string {
  const prev = (existing ?? "").trim();
  if (!note.trim()) return prev;
  if (prev && prev.toLowerCase().includes(note.slice(0, 28).toLowerCase())) return prev;
  return prev ? `${prev} ${note}` : note;
}

const PLITVICE_TICKET_NOTE_SL =
  "Vstopnice za Plitvice kupi spletno vnaprej (np-plitvicka-jezera.hr) za točno uro vstopa — konec sezone so termini pogosto razprodani.";
const PLITVICE_TICKET_NOTE_EN =
  "Buy Plitvice tickets online in advance (np-plitvicka-jezera.hr) for a timed entry — late-season slots sell out.";
const BALKAN_ESIM_NOTE_SL =
  "BiH, Črna gora in Albanija niso v EU roamingu — pred odhodom naloži balkanski eSIM ali kupi lokalno kartico na vsaki meji.";
const BALKAN_ESIM_NOTE_EN =
  "Bosnia, Montenegro and Albania are outside EU roaming — install a Balkans eSIM before you leave, or buy a local SIM at each border.";
const BORDER_QUEUE_NOTE_SL =
  "Poletne kolone na mejah (Debeli Brijeg, Sukobin/Božaj): računaj +2–4 h nad Google časom.";
const BORDER_QUEUE_NOTE_EN =
  "Summer border queues (Debeli Brijeg, Sukobin/Božaj): add 2–4 h on top of Google Maps.";

/** Plitvice timed tickets, Balkan eSIM, and August border queues. */
export function annotateBalkanRoadTips(plan: AiTripPlan): number {
  if (!isRoadLoop(plan)) return 0;
  const sl = !(plan.contentLanguage && !plan.contentLanguage.startsWith("sl"));
  let n = 0;
  let esimDone = false;
  const days = plan.days ?? [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const prev = days[i - 1];
    if (isPlitviceDay(day)) {
      const note = sl ? PLITVICE_TICKET_NOTE_SL : PLITVICE_TICKET_NOTE_EN;
      const before = day.localWarnings ?? "";
      day.localWarnings = appendUniqueNote(day.localWarnings, note);
      if (day.localWarnings !== before) n += 1;
    }
    if (!esimDone && isNonEuBalkanDay(day)) {
      const note = sl ? BALKAN_ESIM_NOTE_SL : BALKAN_ESIM_NOTE_EN;
      const before = day.travelHack ?? "";
      day.travelHack = appendUniqueNote(day.travelHack, note);
      if (day.travelHack !== before) n += 1;
      esimDone = true;
    }
    const from = (primaryCarLeg(day)?.from || prev?.city || "").trim();
    const to = (primaryCarLeg(day)?.to || day.city || "").trim();
    const fromCc = countryFromPlaceLabel(from) ?? CITY_COUNTRY[cityKey(from)] ?? null;
    const toCc = countryFromPlaceLabel(to) ?? CITY_COUNTRY[cityKey(to)] ?? null;
    const borderH = borderPenaltyHours(fromCc, toCc, day.date);
    if (borderH >= 2) {
      const note =
        slowBorderNote(fromCc, toCc, sl) ??
        (sl ? BORDER_QUEUE_NOTE_SL : BORDER_QUEUE_NOTE_EN);
      const before = day.transportationTips ?? "";
      day.transportationTips = appendUniqueNote(day.transportationTips, note);
      if (day.transportationTips !== before) n += 1;
    }
  }
  return n;
}

