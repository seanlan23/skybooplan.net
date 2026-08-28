import type { Activity, AiTripPlan, DayPlan, DayTransportLeg } from "@/lib/aiPlan.functions";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { planLangCopy } from "@/lib/planLangCopy";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { hasExplicitStayPlan } from "@/lib/userStayPlan";

type Slot = "morning" | "afternoon" | "evening";
const SLOTS: Slot[] = ["morning", "afternoon", "evening"];

type StayPlace = {
  city: string;
  key: string;
  specificity: number;
  test: RegExp;
  /** Case-sensitive IATA — never match German "Tag" or Slovenian "eni". */
  iata?: string[];
};

function hasIata(text: string, code: string): boolean {
  return new RegExp(`(?:^|[^A-Za-z])${code}(?:[^A-Za-z]|$)`).test(text);
}

function placeMatches(place: StayPlace, text: string): boolean {
  if (place.test.test(text)) return true;
  return (place.iata ?? []).some((code) => hasIata(text, code));
}

/** More specific island stays beat a leftover "Manila" city label. */
const STAY_PLACES: StayPlace[] = [
  {
    city: "El Nido",
    key: "el nido",
    specificity: 50,
    iata: ["ENI"],
    test: /el nido|lio airport|nacpan|las cabanas|big lagoon|small lagoon|secret lagoon|shimizu|tour a\b/i,
  },
  {
    city: "Coron",
    key: "coron",
    specificity: 50,
    iata: ["USU"],
    test: /coron|busuanga|kayangan|barracuda lake/i,
  },
  {
    city: "Malapascua",
    key: "malapascua",
    specificity: 50,
    test: /malapascua|monad shoal/i,
  },
  {
    city: "Boracay",
    key: "boracay",
    specificity: 50,
    iata: ["MPH"],
    test: /boracay|white beach|puka beach|caticlan/i,
  },
  {
    city: "Bohol",
    key: "bohol",
    specificity: 50,
    iata: ["TAG"],
    test: /bohol|tagbilaran|panglao|chocolate hills|tarsier|alona beach/i,
  },
  {
    city: "Puerto Princesa",
    key: "puerto princesa",
    specificity: 40,
    iata: ["PPS"],
    test: /puerto princesa|underground river/i,
  },
  {
    city: "Cebu",
    key: "cebu",
    specificity: 30,
    iata: ["CEB"],
    test: /\bcebu\b|\bmactan\b/i,
  },
  {
    city: "Manila",
    key: "manila",
    specificity: 10,
    iata: ["MNL"],
    test: /manila|intramuros|binondo|makati/i,
  },
];

const IMPOSSIBLE_DIRECTS: Array<{
  from: RegExp;
  to: RegExp;
  fromIata?: string;
  toIata?: string;
  legs: DayTransportLeg[];
  totalDuration: string;
  note: { sl: string; en: string; de: string };
}> = [
  {
    from: /el nido/i,
    to: /bohol|tagbilaran|panglao/i,
    fromIata: "ENI",
    toIata: "TAG",
    legs: [
      {
        type: "flight",
        from: "El Nido (ENI)",
        to: "Manila (MNL)",
        duration: "1h 20min",
        estimatedPrice: 70,
      },
      {
        type: "flight",
        from: "Manila (MNL)",
        to: "Tagbilaran (TAG)",
        duration: "1h 30min",
        estimatedPrice: 80,
      },
    ],
    totalDuration: "5–6h",
    note: {
      sl: "Ni direktnega leta ENI→TAG. Povezava prek MNL, skupaj 4–6 ur (ne 1h 30min).",
      en: "No direct ENI→TAG. Connect via MNL, 4–6h total (not 1h 30min).",
      de: "Kein Direktflug ENI→TAG. Umsteigen in MNL, insgesamt 4–6 Std.",
    },
  },
  {
    from: /bohol|tagbilaran|panglao/i,
    to: /boracay|caticlan/i,
    fromIata: "TAG",
    toIata: "MPH",
    legs: [
      {
        type: "flight",
        from: "Tagbilaran (TAG)",
        to: "Cebu (CEB)",
        duration: "45min",
        estimatedPrice: 50,
      },
      {
        type: "flight",
        from: "Cebu (CEB)",
        to: "Caticlan (MPH)",
        duration: "1h 10min",
        estimatedPrice: 70,
      },
    ],
    totalDuration: "4–6h",
    note: {
      sl: "Ni direktnega leta TAG→MPH. Povezava prek CEB, skupaj 4–6 ur.",
      en: "No direct TAG→MPH. Connect via CEB, 4–6h total.",
      de: "Kein Direktflug TAG→MPH. Umsteigen in CEB, insgesamt 4–6 Std.",
    },
  },
];

const EL_NIDO_TO_PPS_VAN_H = 6;
const DOMESTIC_CHECKIN_H = 1;
const GROUND_BUFFER_PER_6H = 1;

function stayKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ");
}

function dayBlob(day: DayPlan): string {
  const acts = SLOTS.flatMap((s) => day.activities?.[s] ?? []);
  const actText = acts.map((a) => `${a.name} ${a.description ?? ""}`).join(" ");
  const legs = (day.transportation ?? []).map((l) => `${l.from} ${l.to}`).join(" ");
  return `${day.city ?? ""} ${day.focusName ?? ""} ${day.title ?? ""} ${actText} ${legs}`;
}

function matchStay(text: string): StayPlace | null {
  let best: StayPlace | null = null;
  for (const place of STAY_PLACES) {
    if (!placeMatches(place, text)) continue;
    if (!best || place.specificity > best.specificity) best = place;
  }
  return best;
}

function lastInboundStay(day: DayPlan): StayPlace | null {
  const legs = [...(day.transportation ?? [])].reverse();
  for (const leg of legs) {
    if (leg.type !== "flight" && leg.type !== "ferry" && leg.type !== "van") continue;
    const hit = matchStay(leg.to ?? "");
    if (hit) return hit;
  }
  return null;
}

export function inferStayCity(day: DayPlan): string | null {
  const inbound = lastInboundStay(day);
  if (inbound) return inbound.city;
  const fromContent = matchStay(dayBlob(day));
  if (fromContent && fromContent.specificity >= 40) return fromContent.city;
  return fromContent?.city ?? null;
}

function applyCity(day: DayPlan, city: string): boolean {
  const prev = (day.city ?? "").trim();
  if (stayKey(prev) === stayKey(city)) return false;
  day.city = city;
  if (!day.focusName || stayKey(day.focusName) === stayKey(prev)) {
    day.focusName = city;
  }
  const coords = lookupRegionCoords(city);
  if (coords) {
    day.lat = coords.lat;
    day.lng = coords.lng;
  }
  return true;
}

/** Gemini often keeps city=Manila while Tour A / Nacpan are El Nido — map follows city. */
export function repairStayCitiesFromContent(plan: AiTripPlan): number {
  let n = 0;
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  for (const day of days) {
    if (day.day === 1) continue;
    const inferred = inferStayCity(day);
    if (!inferred) continue;
    if (applyCity(day, inferred)) n += 1;
  }
  return n;
}

function hopMatch(text: string, re: RegExp, iata?: string): boolean {
  return re.test(text) || (iata ? hasIata(text, iata) : false);
}

function isArrivalFlightTo(leg: DayTransportLeg, dest: StayPlace): boolean {
  if (leg.type !== "flight") return false;
  return placeMatches(dest, leg.to ?? "") && !placeMatches(dest, leg.from ?? "");
}

function isArrivalActivityTo(a: Activity, dest: StayPlace): boolean {
  const blob = `${a.name} ${a.description ?? ""}`;
  if (!placeMatches(dest, blob)) return false;
  return /let|flight|flug|volo|vuelo/i.test(blob) && /manila|\bmnl\b|cebu|\bceb\b/i.test(blob);
}

/**
 * Second MNL→ENI after already staying in El Nido is a Gemini loop.
 * Drop the fake flight only — keep Tour A / beach content (never empty the day).
 */
export function dropDuplicateIslandArrivals(plan: AiTripPlan): number {
  let n = 0;
  let lastStay = "";
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  for (const day of days) {
    const dest =
      lastInboundStay(day) ??
      matchStay(
        (day.transportation ?? [])
          .map((l) => l.to)
          .join(" "),
      );
    if (dest && dest.specificity >= 40 && stayKey(lastStay) === dest.key) {
      if (day.transportation?.length) {
        const nextLegs = day.transportation.filter((leg) => !isArrivalFlightTo(leg, dest));
        if (nextLegs.length !== day.transportation.length) {
          day.transportation = nextLegs.length ? nextLegs : undefined;
          n += 1;
        }
      }
      if (day.activities) {
        for (const slot of SLOTS) {
          const list = day.activities[slot] ?? [];
          const next = list.filter((a) => !isArrivalActivityTo(a, dest));
          if (next.length !== list.length) {
            day.activities[slot] = next;
            n += 1;
          }
        }
      }
    }
    const stay = inferStayCity(day) ?? day.city ?? "";
    const stayPlace = matchStay(stay);
    if (stayPlace) lastStay = stayPlace.city;
  }
  return n;
}

function parseHoursLabel(raw: string | undefined): number | null {
  if (!raw) return null;
  const compact = raw.replace(/,/g, ".");
  const hm = compact.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s*(\d+)\s*m)?/i);
  if (hm) return Number(hm[1]) + Number(hm[2] ?? 0) / 60;
  const range = compact.match(/(\d+)\s*[–-]\s*(\d+)\s*h/i);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  return null;
}

function alreadyConnecting(legs: DayTransportLeg[], rule: (typeof IMPOSSIBLE_DIRECTS)[number]): boolean {
  const flights = legs.filter((l) => l.type === "flight");
  if (flights.length < 2) return false;
  const blob = flights.map((l) => `${l.from} ${l.to}`).join(" ");
  return rule.from.test(blob) && rule.to.test(blob) && (parseHoursLabel(rule.totalDuration) ?? 5) >= 4;
}

function isImpossibleDirect(leg: DayTransportLeg, rule: (typeof IMPOSSIBLE_DIRECTS)[number]): boolean {
  if (leg.type !== "flight") return false;
  return hopMatch(leg.from ?? "", rule.from, rule.fromIata) && hopMatch(leg.to ?? "", rule.to, rule.toIata);
}

function replaceDirectFlightActivities(day: DayPlan, rule: (typeof IMPOSSIBLE_DIRECTS)[number], lang: string): void {
  if (!day.activities) return;
  const hopLabel = planLangCopy(lang, {
    sl: `Notranji let ${rule.legs[0]!.from} → ${rule.legs[1]!.to} prek povezave (${rule.totalDuration})`,
    en: `Domestic flight ${rule.legs[0]!.from} → ${rule.legs[1]!.to} via connection (${rule.totalDuration})`,
    de: `Inlandsflug ${rule.legs[0]!.from} → ${rule.legs[1]!.to} mit Umstieg (${rule.totalDuration})`,
  });
  const hopDesc = planLangCopy(lang, rule.note);
  for (const slot of SLOTS) {
    const list = day.activities[slot] ?? [];
    day.activities[slot] = list.map((a) => {
      const blob = `${a.name} ${a.description ?? ""}`;
      if (!hopMatch(blob, rule.from, rule.fromIata) || !hopMatch(blob, rule.to, rule.toIata)) return a;
      if (!/let|flight|flug/i.test(blob)) return a;
      return {
        ...a,
        name: hopLabel,
        description: hopDesc,
        type: "TRANSPORT",
        transportType: "flight",
        transportDuration: rule.totalDuration,
      };
    });
  }
}

/** ENI→TAG and TAG→MPH are not directs — rewrite as hub connections (4–6h). */
export function rewriteImpossiblePhConnections(plan: AiTripPlan, language?: string): number {
  const lang = language ?? plan.contentLanguage ?? "sl";
  let n = 0;
  for (const day of plan.days ?? []) {
    const legs = day.transportation ?? [];
    if (!legs.length) continue;
    for (const rule of IMPOSSIBLE_DIRECTS) {
      const direct = legs.find((l) => isImpossibleDirect(l, rule));
      if (!direct) continue;
      if (alreadyConnecting(legs, rule)) continue;
      const hours = parseHoursLabel(direct.duration) ?? 0;
      if (hours >= 4 && legs.filter((l) => l.type === "flight").length >= 2) continue;
      day.transportation = [
        ...legs.filter((l) => l !== direct),
        ...rule.legs.map((leg) => ({ ...leg })),
      ];
      if (day.transport) {
        day.transport = {
          ...day.transport,
          type: "flight",
          duration: rule.totalDuration,
        };
      }
      const note = planLangCopy(lang, rule.note);
      const tips = (day.transportationTips ?? "").trim();
      if (!tips.toLowerCase().includes(note.slice(0, 24).toLowerCase())) {
        day.transportationTips = tips ? `${tips} ${note}` : note;
      }
      replaceDirectFlightActivities(day, rule, lang);
      n += 1;
    }
  }
  return n;
}

function parseClockMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatClock(mins: number): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function flightDepartMinutes(day: DayPlan): number | null {
  for (const slot of SLOTS) {
    for (const a of day.activities?.[slot] ?? []) {
      if ((a.transportType === "flight" || /let|flight|flug/i.test(a.name)) && a.departureTime) {
        const t = parseClockMinutes(a.departureTime);
        if (t != null) return t;
      }
      const t = parseClockMinutes(`${a.name} ${a.description ?? ""}`);
      if (t != null && /let|flight|odlet|depart/i.test(`${a.name} ${a.description ?? ""}`)) {
        return t;
      }
    }
  }
  return null;
}

function isVanToAirport(leg: DayTransportLeg): boolean {
  if (leg.type !== "van" && leg.type !== "car") return false;
  return /puerto princesa|\bpps\b|tagbilaran|\btag\b|caticlan|\bmph\b|manila|\bmnl\b/i.test(
    leg.to ?? "",
  );
}

function shiftClockInText(text: string, next: string): string {
  return text.replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/, next);
}

/**
 * 6h El Nido→PPS van + 14:00 domestic = leave 05:00–06:00, plus 1h airport buffer.
 * Also stamps a 1h domestic check-in card on island hops (international already has 3h).
 */
export function ensureGroundToAirportWindow(plan: AiTripPlan, language?: string): number {
  const lang = language ?? plan.contentLanguage ?? "sl";
  const lastDay = Math.max(0, ...(plan.days ?? []).map((d) => d.day));
  let n = 0;
  for (const day of plan.days ?? []) {
    if (day.day === 1 || day.day === lastDay) continue;
    const legs = day.transportation ?? [];
    const van = legs.find(isVanToAirport);
    const flight = legs.find((l) => l.type === "flight");
    const dep = flightDepartMinutes(day);
    if (van && flight && dep != null) {
      const vanH = parseHoursLabel(van.duration) ?? EL_NIDO_TO_PPS_VAN_H;
      const palawanVan = /el nido/i.test(van.from ?? "") && /pps|puerto/i.test(van.to ?? "");
      const groundH = palawanVan ? Math.max(vanH, EL_NIDO_TO_PPS_VAN_H) : vanH;
      const bufferH = GROUND_BUFFER_PER_6H * Math.max(1, Math.ceil(groundH / 6));
      const leaveBy = dep - Math.round((groundH + bufferH + DOMESTIC_CHECKIN_H) * 60);
      const currentLeave = (() => {
        for (const slot of SLOTS) {
          for (const a of day.activities?.[slot] ?? []) {
            if (!/van|minivan|transfer|prevoz/i.test(`${a.name} ${a.description ?? ""}`)) continue;
            const t = parseClockMinutes(a.departureTime ?? `${a.name} ${a.description ?? ""}`);
            if (t != null) return t;
          }
        }
        return null;
      })();
      if (leaveBy >= 0 && (currentLeave == null || currentLeave > leaveBy + 15)) {
        const clock = formatClock(leaveBy);
        van.duration = vanH >= 5 ? "5–6h" : van.duration;
        if (day.activities) {
          for (const slot of SLOTS) {
            day.activities[slot] = (day.activities[slot] ?? []).map((a) => {
              if (!/van|minivan|transfer|prevoz/i.test(`${a.name} ${a.description ?? ""}`)) return a;
              return {
                ...a,
                departureTime: clock,
                name: shiftClockInText(a.name, clock),
                description: shiftClockInText(a.description ?? "", clock),
              };
            });
          }
        }
        n += 1;
      }
    }

    const domestic = legs.some(
      (l) =>
        l.type === "flight" &&
        /ENI|MNL|PPS|TAG|MPH|CEB|el nido|manila|bohol|boracay|caticlan|panglao|puerto/i.test(
          `${l.from} ${l.to}`,
        ),
    );
    if (!domestic || !day.activities) continue;
    const already = SLOTS.some((slot) =>
      (day.activities?.[slot] ?? []).some((a) =>
        /1\s*(uro|h|hour|std)\s*pred|1 hour before|bodi na letališč/i.test(`${a.name} ${a.description ?? ""}`),
      ),
    );
    if (already) continue;
    const flightClock = dep != null ? formatClock(dep) : null;
    const bufferClock = dep != null ? formatClock(dep - 60) : null;
    const name = planLangCopy(lang, {
      sl: flightClock
        ? `Bodi na letališču 1 uro pred odletom (${flightClock})`
        : "Bodi na letališču 1 uro pred odletom (notranji let)",
      en: flightClock
        ? `Be at the airport 1 hour before departure (${flightClock})`
        : "Be at the airport 1 hour before departure (domestic hop)",
      de: flightClock
        ? `Sei 1 Stunde vor Abflug am Flughafen (${flightClock})`
        : "Sei 1 Stunde vor Abflug am Flughafen (Inlandsflug)",
    });
    const description = planLangCopy(lang, {
      sl: "Notranji let: prijava in varnost ~1 uro pred odletom (ne 3 ure kot na mednarodnem).",
      en: "Domestic hop: check-in and security ~1 hour before departure (not the 3h international buffer).",
      de: "Inlandsflug: Check-in und Sicherheit ~1 Stunde vor Abflug (nicht 3 Std. wie international).",
    });
    const slot: Slot = dep != null && dep >= 14 * 60 ? "afternoon" : "morning";
    day.activities[slot] = [
      {
        name,
        type: "TRANSPORT",
        transportType: "flight",
        description,
        departureTime: bufferClock ?? undefined,
        arrivalTime: flightClock ?? undefined,
      },
      ...(day.activities[slot] ?? []),
    ];
    n += 1;
  }
  return n;
}

type IslandAirport = { match: RegExp; iata: string; label: string };

const ISLAND_LOCAL_AIRPORTS: IslandAirport[] = [
  { match: /el nido/i, iata: "ENI", label: "El Nido (ENI)" },
  { match: /coron|busuanga/i, iata: "USU", label: "Busuanga (USU)" },
  { match: /bohol|panglao|tagbilaran/i, iata: "TAG", label: "Tagbilaran (TAG)" },
  { match: /boracay|caticlan/i, iata: "MPH", label: "Caticlan (MPH)" },
  { match: /puerto princesa/i, iata: "PPS", label: "Puerto Princesa (PPS)" },
  { match: /\bcebu\b|\bmactan\b/i, iata: "CEB", label: "Cebu (CEB)" },
];

const BOAT_SATELLITES: Array<{ island: RegExp; hub: RegExp }> = [
  { island: /malapascua/i, hub: /cebu|\bmactan\b/i },
  { island: /bantayan/i, hub: /cebu|\bmactan\b/i },
  { island: /koh phi phi|phi phi/i, hub: /phuket|krabi|ao nang|aonang/i },
];

function islandAirportFor(text: string): IslandAirport | null {
  const t = text.trim();
  if (!t) return null;
  return ISLAND_LOCAL_AIRPORTS.find((a) => a.match.test(t) || hasIata(t, a.iata)) ?? null;
}

function overnightAirportHistory(days: DayPlan[], beforeIndex: number): IslandAirport[] {
  const seen: IslandAirport[] = [];
  for (let i = 0; i < beforeIndex; i++) {
    const ap = islandAirportFor(days[i]?.city ?? "");
    if (!ap || seen.some((s) => s.iata === ap.iata)) continue;
    seen.push(ap);
  }
  return seen;
}

function departureAirport(days: DayPlan[], index: number): IslandAirport | null {
  const today = islandAirportFor(days[index]?.city ?? "");
  const yest = index > 0 ? islandAirportFor(days[index - 1]?.city ?? "") : null;
  if (yest && today && yest.iata !== today.iata) return yest;
  return today ?? yest;
}

function rewriteBacktrackActivities(
  day: DayPlan,
  dep: IslandAirport,
  abandoned: IslandAirport[],
  lang: string,
): void {
  if (!day.activities) return;
  const abandonedRe = new RegExp(
    abandoned.map((a) => `${a.iata}|${a.match.source}`).join("|"),
    "i",
  );
  for (const slot of SLOTS) {
    day.activities[slot] = (day.activities[slot] ?? []).flatMap((a) => {
      const blob = `${a.name} ${a.description ?? ""}`;
      if (!abandonedRe.test(blob)) return [a];
      const waterOnly =
        /trajekt|ferry|bangka|speedboat|ladj/i.test(blob) && !/let|flight|flug/i.test(blob);
      if (waterOnly) return [];
      if (!/let|flight|flug|odlet|airport|letališč/i.test(blob)) return [a];
      return [
        {
          ...a,
          name: planLangCopy(lang, {
            sl: `Notranji let iz ${dep.label}`,
            en: `Domestic flight from ${dep.label}`,
            de: `Inlandsflug ab ${dep.label}`,
          }),
          description: planLangCopy(lang, {
            sl: `Odlet z ${dep.label} proti naslednji bazi.`,
            en: `Fly from ${dep.label} to the next base.`,
            de: `Flug ab ${dep.label} zur nächsten Basis.`,
          }),
          type: "TRANSPORT" as const,
          transportType: "flight" as const,
        },
      ];
    });
  }
}

/**
 * After a boat hop onto an island with its own airport, fly out from there.
 * Drop a ferry back to a previous overnight island that exists only to catch its flight.
 */
export function rewriteFerryBacktrackToLocalAirport(plan: AiTripPlan, language?: string): number {
  const lang = language ?? plan.contentLanguage ?? "sl";
  const days = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  let n = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const dep = departureAirport(days, i);
    if (!dep) continue;
    const history = overnightAirportHistory(days, i);
    const abandoned = history.filter((a) => a.iata !== dep.iata);
    if (!abandoned.length) continue;
    const legs = day.transportation ?? [];
    if (!legs.length) continue;
    let changed = false;
    const nextLegs: DayTransportLeg[] = [];
    for (const leg of legs) {
      const toAp = islandAirportFor(leg.to ?? "");
      const fromAp = islandAirportFor(leg.from ?? "");
      if (leg.type === "ferry" && toAp && abandoned.some((a) => a.iata === toAp.iata)) {
        changed = true;
        continue;
      }
      if (
        leg.type === "flight" &&
        fromAp &&
        abandoned.some((a) => a.iata === fromAp.iata) &&
        fromAp.iata !== dep.iata
      ) {
        nextLegs.push({ ...leg, from: dep.label });
        changed = true;
        continue;
      }
      nextLegs.push(leg);
    }
    if (!changed) continue;
    day.transportation = nextLegs.length ? nextLegs : undefined;
    rewriteBacktrackActivities(day, dep, abandoned, lang);
    n += 1;
  }
  return n;
}

type CityRun = { city: string; start: number; end: number };

function overnightCityRuns(days: DayPlan[]): CityRun[] {
  const runs: CityRun[] = [];
  for (let i = 0; i < days.length; i++) {
    const city = (days[i]?.city ?? "").trim();
    if (!city) continue;
    const last = runs[runs.length - 1];
    if (last && stayKey(last.city) === stayKey(city) && last.end === i - 1) {
      last.end = i;
    } else {
      runs.push({ city, start: i, end: i });
    }
  }
  return runs;
}

function hotelNightsInRun(days: DayPlan[], run: CityRun): number {
  const lastCal = days.length - 1;
  let nights = run.end - run.start + 1;
  if (run.end === lastCal) nights -= 1;
  return Math.max(0, nights);
}

function boatSatelliteHub(islandCity: string): RegExp | null {
  return BOAT_SATELLITES.find((s) => s.island.test(islandCity))?.hub ?? null;
}

function isPlanIataCity(plan: AiTripPlan, city: string): boolean {
  const code = (plan.destinationIata ?? "").toUpperCase();
  if (!code) return false;
  const hub = DESTINATION_BY_IATA[code]?.name ?? "";
  if (!hub) return false;
  return stayKey(city).includes(stayKey(hub)) || stayKey(hub).includes(stayKey(city));
}

function isArrivalHubRun(days: DayPlan[], run: CityRun): boolean {
  const prev = days[run.start - 1];
  return Boolean(prev?.inFlightDay) || run.start <= 1;
}

function isDepartureHubRun(plan: AiTripPlan, days: DayPlan[], run: CityRun): boolean {
  const lastCal = days.length - 1;
  return run.end >= lastCal - 1 && isPlanIataCity(plan, run.city);
}

function stampRunCity(days: DayPlan[], run: CityRun, city: string): number {
  let n = 0;
  const lastCal = days.length - 1;
  for (let i = run.start; i <= run.end; i++) {
    if (i === lastCal) continue;
    const day = days[i];
    if (!day) continue;
    if (applyCity(day, city)) n += 1;
  }
  return n;
}

/**
 * Hub 1 night → boat island → same hub 1 night: keep only one hub sleep.
 * Arrival-buffer + departure-buffer both 1 night stay as-is (needed for the ticket).
 */
export function consolidateIslandHubSandwiches(plan: AiTripPlan): number {
  if (hasExplicitStayPlan(plan.wishes)) return 0;
  const days = plan.days ?? [];
  if (days.length < 4) return 0;
  const runs = overnightCityRuns(days);
  let n = 0;
  for (let r = 1; r < runs.length - 1; r++) {
    const prev = runs[r - 1]!;
    const island = runs[r]!;
    const next = runs[r + 1]!;
    const hub = boatSatelliteHub(island.city);
    if (!hub) continue;
    if (!hub.test(prev.city) || !hub.test(next.city)) continue;
    if (hotelNightsInRun(days, island) < 2) continue;
    if (hotelNightsInRun(days, prev) !== 1 || hotelNightsInRun(days, next) !== 1) continue;
    const keepArrival = isArrivalHubRun(days, prev);
    const keepDeparture = isDepartureHubRun(plan, days, next);
    if (keepArrival && keepDeparture) continue;
    if (keepDeparture) n += stampRunCity(days, prev, island.city);
    else n += stampRunCity(days, next, island.city);
  }
  return n;
}

export function applyIslandHopLogistics(plan: AiTripPlan, language?: string): {
  cities: number;
  duplicates: number;
  connections: number;
  windows: number;
  backtracks: number;
  sandwiches: number;
} {
  const cities = repairStayCitiesFromContent(plan);
  const sandwiches = consolidateIslandHubSandwiches(plan);
  const duplicates = dropDuplicateIslandArrivals(plan);
  const connections = rewriteImpossiblePhConnections(plan, language);
  const backtracks = rewriteFerryBacktrackToLocalAirport(plan, language);
  const windows = ensureGroundToAirportWindow(plan, language);
  return { cities, duplicates, connections, windows, backtracks, sandwiches };
}
