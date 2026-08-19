import type { Activity, AiTripPlan, DayPlan, DayTransportLeg, IslandAccessRoute } from "@/lib/aiPlan.functions";
import { haversineKm } from "@/lib/geoMath";
import { planLangCopy } from "@/lib/planLangCopy";
import { lookupRegionCoords } from "@/lib/regionCoords";

export type IslandAirportAccessDef = {
  id: string;
  /** Matches island city name in itinerary. */
  matchIsland: RegExp;
  /** Optional IATA of mainland gateway airport (e.g. MPH for Boracay). */
  gatewayIata?: string;
  airport: { label: string; lat: number; lng: number };
  port: { label: string; lat: number; lng: number };
  island: { name: string; lat: number; lng: number };
  flightDuration?: string;
  vanDuration?: string;
  ferryDuration?: string;
  flightPrice?: number;
  vanPrice?: number;
  ferryPrice?: number;
};

export type { IslandAccessRoute };

const ISLAND_AIRPORT_ACCESS: IslandAirportAccessDef[] = [
  {
    id: "boracay",
    matchIsland: /boracay/i,
    gatewayIata: "MPH",
    airport: {
      label: "Caticlan (MPH)",
      lat: 11.9244,
      lng: 121.9542,
    },
    port: {
      label: "Caticlan Jetty Port",
      lat: 11.9275,
      lng: 121.949,
    },
    island: {
      name: "Boracay",
      lat: 11.9674,
      lng: 121.9248,
    },
    flightDuration: "1h–1h 20m",
    vanDuration: "10–15 min",
    ferryDuration: "15–20 min",
    flightPrice: 45,
    vanPrice: 4,
    ferryPrice: 6,
  },
  {
    id: "koh-lipe",
    matchIsland: /koh\s*lipe|\blipe\b/i,
    gatewayIata: "HDY",
    airport: {
      label: "Hat Yai (HDY)",
      lat: 6.9332,
      lng: 100.393,
    },
    port: {
      label: "Pak Bara Pier",
      lat: 6.860,
      lng: 99.723,
    },
    island: {
      name: "Koh Lipe",
      lat: 6.487,
      lng: 99.310,
    },
    flightDuration: "1h–1h 20m",
    vanDuration: "1.5–2h",
    ferryDuration: "1.5–2h",
    flightPrice: 55,
    vanPrice: 12,
    ferryPrice: 30,
  },
];

export function getIslandAirportAccessDef(
  city: string,
  destinationIata?: string,
): IslandAirportAccessDef | null {
  const trimmed = city.trim();
  for (const def of ISLAND_AIRPORT_ACCESS) {
    if (trimmed && def.matchIsland.test(trimmed)) return def;
  }
  // Gateway IATA applies when the itinerary names the airport hub, not every mainland day.
  const iata = destinationIata?.trim().toUpperCase();
  if (iata && !trimmed) {
    for (const def of ISLAND_AIRPORT_ACCESS) {
      if (def.gatewayIata === iata) return def;
    }
  }
  return null;
}

export function getIslandAirportAccessById(id: string): IslandAirportAccessDef | null {
  return ISLAND_AIRPORT_ACCESS.find((d) => d.id === id) ?? null;
}

function isIslandCity(city: string, def: IslandAirportAccessDef): boolean {
  return def.matchIsland.test(city.trim());
}

function hasCompleteAirAccessLegs(legs: DayTransportLeg[]): boolean {
  if (legs.length < 3) return false;
  const types = legs.map((l) => l.type);
  return types.includes("flight") && types.includes("van") && types.includes("ferry");
}

function isOutingTransportLeg(leg: DayTransportLeg): boolean {
  const blob = `${leg.from} ${leg.to}`;
  if (/pak bara|hat yai|\bhdy\b|caticlan|\bmph\b|airport|letališč/i.test(blob)) return false;
  return /izlet|excursion|snorkel|adang|rawi|okoli otokov|island hop|maya bay|phi phi|railay/i.test(
    blob,
  );
}

function isIslandExitLeg(leg: DayTransportLeg, def: IslandAirportAccessDef): boolean {
  const blob = `${leg.from} ${leg.to}`;
  if (def.matchIsland.test(leg.from) && (leg.type === "ferry" || leg.type === "flight" || leg.type === "van")) {
    return true;
  }
  if (def.gatewayIata && new RegExp(`\\b${def.gatewayIata}\\b`, "i").test(blob)) return true;
  const portKey = def.port.label.split(" ")[0] ?? "";
  if (portKey.length >= 3 && new RegExp(portKey, "i").test(blob)) return true;
  return false;
}

function singleFlightToIsland(legs: DayTransportLeg[], def: IslandAirportAccessDef): boolean {
  if (legs.length !== 1 || legs[0]?.type !== "flight") return false;
  const to = legs[0].to.toLowerCase();
  return def.matchIsland.test(to) || new RegExp(def.gatewayIata ?? "____", "i").test(to);
}

/** Already on the same coast as the pier — van, not a made-up hop to the gateway airport. */
const COASTAL_VAN_MAX_KM = 250;

export function kmFromCityToIslandPort(city: string, def: IslandAirportAccessDef): number | null {
  const from = lookupRegionCoords(city);
  if (!from) return null;
  return haversineKm([from.lng, from.lat], [def.port.lng, def.port.lat]);
}

export function isCoastalIslandApproach(fromCity: string, def: IslandAirportAccessDef): boolean {
  const km = kmFromCityToIslandPort(fromCity, def);
  return km != null && km > 8 && km <= COASTAL_VAN_MAX_KM;
}

function vanHoursLabel(km: number): string {
  const hours = Math.max(1.5, km / 45);
  if (hours < 2.4) return "1.5–2h";
  if (hours < 3.2) return "2.5–3h";
  if (hours < 4.6) return "3.5–4h";
  if (hours < 6) return "5–6h";
  return "6–8h";
}

function buildCoastalArrivalLegs(def: IslandAirportAccessDef, fromCity: string, km: number): DayTransportLeg[] {
  return [
    {
      type: "van",
      from: fromCity,
      to: def.port.label,
      duration: vanHoursLabel(km),
      estimatedPrice: 18,
    },
    {
      type: "ferry",
      from: def.port.label,
      to: def.island.name,
      duration: def.ferryDuration ?? "1.5–2h",
      estimatedPrice: def.ferryPrice ?? 30,
    },
  ];
}

function buildCoastalDepartureLegs(def: IslandAirportAccessDef, toCity: string, km: number): DayTransportLeg[] {
  return [
    {
      type: "ferry",
      from: def.island.name,
      to: def.port.label,
      duration: def.ferryDuration ?? "1.5–2h",
      estimatedPrice: def.ferryPrice ?? 30,
    },
    {
      type: "van",
      from: def.port.label,
      to: toCity,
      duration: vanHoursLabel(km),
      estimatedPrice: 18,
    },
  ];
}

function buildArrivalLegs(def: IslandAirportAccessDef, hubCity: string): DayTransportLeg[] {
  return [
    {
      type: "flight",
      from: hubCity,
      to: def.airport.label,
      duration: def.flightDuration ?? "1h–1h 20m",
      estimatedPrice: def.flightPrice ?? 45,
    },
    {
      type: "van",
      from: def.airport.label,
      to: def.port.label,
      duration: def.vanDuration ?? "10–15 min",
      estimatedPrice: def.vanPrice ?? 4,
    },
    {
      type: "ferry",
      from: def.port.label,
      to: def.island.name,
      duration: def.ferryDuration ?? "15–20 min",
      estimatedPrice: def.ferryPrice ?? 6,
    },
  ];
}

function buildDepartureLegs(def: IslandAirportAccessDef, hubCity: string): DayTransportLeg[] {
  return [
    {
      type: "ferry",
      from: def.island.name,
      to: def.port.label,
      duration: def.ferryDuration ?? "15–20 min",
      estimatedPrice: def.ferryPrice ?? 6,
    },
    {
      type: "van",
      from: def.port.label,
      to: def.airport.label,
      duration: def.vanDuration ?? "10–15 min",
      estimatedPrice: def.vanPrice ?? 4,
    },
    {
      type: "flight",
      from: def.airport.label,
      to: hubCity,
      duration: def.flightDuration ?? "1h–1h 20m",
      estimatedPrice: def.flightPrice ?? 45,
    },
  ];
}

function arrivalTransportTip(
  def: IslandAirportAccessDef,
  lang: string | undefined,
  fromCity: string,
  coastal: boolean,
): string {
  if (coastal) {
    return planLangCopy(lang, {
      sl: `Si že na obali ob ${def.port.label}: kombi ${fromCity} → pomol, nato speedboat/ferry na ${def.island.name}. Ni leta na ${def.airport.label}.`,
      en: `Already on the coast near ${def.port.label}: van ${fromCity} → pier, then speedboat/ferry to ${def.island.name}. No flight to ${def.airport.label}.`,
      de: `Du bist schon an der Küste bei ${def.port.label}: Van ${fromCity} → Pier, dann Speedboat/Fähre nach ${def.island.name}. Kein Flug nach ${def.airport.label}.`,
    });
  }
  return planLangCopy(lang, {
    sl: `${def.island.name} nima letališča na otoku — let do ${def.airport.label}, nato kombi do ${def.port.label} in speedboat/ferry. Rezerviraj čoln vnaprej (sezonski urniki).`,
    en: `${def.island.name} has no island airport — fly to ${def.airport.label}, van to ${def.port.label}, then speedboat/ferry. Book the boat ahead (seasonal schedules).`,
    de: `${def.island.name} hat keinen Insel-Flughafen — Flug nach ${def.airport.label}, Van nach ${def.port.label}, dann Speedboat/Fähre. Boot rechtzeitig buchen.`,
  });
}

function departureTransportTip(
  def: IslandAirportAccessDef,
  lang: string | undefined,
  hubCity: string,
  coastal: boolean,
): string {
  const hub = hubCity.trim() || "hub";
  if (coastal) {
    return planLangCopy(lang, {
      sl: `Odhod z otoka: speedboat/ferry ${def.island.name} → ${def.port.label}, nato kombi do ${hub}. Si že na isti obali — ni leta na ${def.airport.label}.`,
      en: `Leaving the island: speedboat/ferry ${def.island.name} → ${def.port.label}, then van to ${hub}. Same coast — no flight to ${def.airport.label}.`,
      de: `Abreise: Speedboat/Fähre ${def.island.name} → ${def.port.label}, dann Van nach ${hub}. Gleiche Küste — kein Flug nach ${def.airport.label}.`,
    });
  }
  return planLangCopy(lang, {
    sl: `Odhod z otoka: speedboat/ferry ${def.island.name} → ${def.port.label}, kombi do ${def.airport.label}, nato notranji let proti ${hub}. Ni neposrednega leta z otoka.`,
    en: `Leaving the island: speedboat/ferry ${def.island.name} → ${def.port.label}, van to ${def.airport.label}, then a domestic flight to ${hub}. No direct flight from the island.`,
    de: `Abreise: Speedboat/Fähre ${def.island.name} → ${def.port.label}, Van zum ${def.airport.label}, dann Inlandsflug nach ${hub}. Kein Direktflug von der Insel.`,
  });
}

const SLOTS = ["morning", "afternoon", "evening"] as const;

function activityBlob(a: { name?: string; description?: string }): string {
  return `${a.name ?? ""} ${a.description ?? ""}`;
}

function modeLabel(type: DayTransportLeg["type"], lang?: string): string {
  if (type === "flight") return planLangCopy(lang, { sl: "let", en: "flight", de: "Flug" });
  if (type === "van") return planLangCopy(lang, { sl: "kombi", en: "van", de: "Van" });
  if (type === "ferry") return planLangCopy(lang, { sl: "čoln/ferry", en: "boat/ferry", de: "Boot/Fähre" });
  return type;
}

function summarizeAccessLegs(legs: DayTransportLeg[], lang?: string): { name: string; description: string } {
  const name = legs.map((l) => `${modeLabel(l.type, lang)} ${l.from} → ${l.to} (${l.duration})`).join(", ");
  const description = planLangCopy(lang, {
    sl: `${name}. To so dejanski koraki — ne izmišljaj kratkega leta, če si že na obali ob pomolu.`,
    en: `${name}. These are the real steps — do not invent a short-hop flight when you are already on the coast by the pier.`,
    de: `${name}. Das sind die echten Etappen — keinen Kurzstreckenflug erfinden, wenn du schon an der Küste bist.`,
  });
  return { name, description };
}

function rewriteAccessActivitiesFromLegs(day: DayPlan, lang?: string): void {
  const legs = day.transportation ?? [];
  if (!day.activities || !legs.length) return;
  const summary = summarizeAccessLegs(legs, lang);
  const firstType = legs[0]?.type;
  for (const slot of SLOTS) {
    day.activities[slot] = (day.activities[slot] ?? []).map((a: Activity) => {
      const blob = activityBlob(a);
      const isMove = /prevoz|transfer|let |flight|ferry|trajekt|van|kombi|speedboat|čoln|klong jilad/i.test(blob);
      if (!isMove) return a;
      return {
        ...a,
        name: summary.name,
        description: summary.description,
        type: "TRANSPORT",
        transportType: firstType === "bus" || firstType === "taxi" ? "van" : firstType,
      };
    });
  }
}

/** Detect inter-day island gateway transition for map routing. */
export function detectIslandAccessTransition(
  prevDay: DayPlan,
  currDay: DayPlan,
  destinationIata?: string,
): { def: IslandAirportAccessDef; direction: "arrival" | "departure" } | null {
  const prevDef = getIslandAirportAccessDef(prevDay.city ?? "", destinationIata);
  const currDef = getIslandAirportAccessDef(currDay.city ?? "", destinationIata);

  if (currDef && !prevDef) return { def: currDef, direction: "arrival" };
  if (prevDef && !currDef) return { def: prevDef, direction: "departure" };
  return null;
}

export function enrichIslandAirportTransfers(
  plan: AiTripPlan,
  opts: { destinationIata?: string; language?: string } = {},
): void {
  if (!plan.days?.length) return;
  const days = [...plan.days].sort((a, b) => a.day - b.day);
  plan.days = days;
  const lang = opts.language ?? plan.contentLanguage ?? "en";

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const prev = i > 0 ? days[i - 1] : undefined;
    const next = i < days.length - 1 ? days[i + 1] : undefined;
    const def = getIslandAirportAccessDef(day.city ?? "", opts.destinationIata);
    if (!def) continue;

    // Ensure island coords (not airport) for map pin & activities.
    if (isIslandCity(day.city ?? "", def)) {
      day.lat = def.island.lat;
      day.lng = def.island.lng;
      if (!def.matchIsland.test(day.focusName ?? "")) {
        day.focusName = def.island.name;
      }
    }

    const prevCity = (prev?.city ?? "").trim();
    const isArrivalDay = Boolean(prev && prevCity && !isIslandCity(prevCity, def));
    const legs = day.transportation ?? [];

    // Arrival stays on the first island overnight. Departure does NOT — that would
    // steal the last beach day (Lipe 10 Nov still sleeps on the island; leave 11 Nov).
    if (isArrivalDay) {
      const hubCity = prevCity || "hub";
      const coastal = isCoastalIslandApproach(hubCity, def);
      const km = kmFromCityToIslandPort(hubCity, def);
      if (coastal && km != null) {
        day.transportation = buildCoastalArrivalLegs(def, hubCity, km);
      } else if (!hasCompleteAirAccessLegs(legs) || singleFlightToIsland(legs, def)) {
        day.transportation = buildArrivalLegs(def, hubCity);
      }
      day.islandAccessRoute = { defId: def.id, direction: "arrival" };
      day.transportationTips = arrivalTransportTip(def, lang, hubCity, coastal);
      rewriteAccessActivitiesFromLegs(day, lang);
    }

    const nextCity = (next?.city ?? "").trim();
    const isLastIslandOvernight = Boolean(nextCity && !isIslandCity(nextCity, def));
    if (isLastIslandOvernight && !isArrivalDay) {
      const outbound = day.transportation?.some((l) => isIslandExitLeg(l, def)) ?? false;
      if (outbound) {
        day.transportation = undefined;
        if (day.islandAccessRoute?.direction === "departure") {
          day.islandAccessRoute = undefined;
        }
      }
    }
  }

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const prev = i > 0 ? days[i - 1] : undefined;
    if (!prev) continue;
    const prevDef = getIslandAirportAccessDef(prev.city ?? "", opts.destinationIata);
    if (!prevDef || isIslandCity(day.city ?? "", prevDef)) continue;

    const hubCity = (day.city ?? "").trim() || "hub";
    const coastal = isCoastalIslandApproach(hubCity, prevDef);
    const km = kmFromCityToIslandPort(hubCity, prevDef);
    const legs = day.transportation ?? [];
    const hasAirDeparture =
      legs.length >= 3 &&
      legs.some((l) => l.type === "ferry" && prevDef.matchIsland.test(l.from)) &&
      legs.some((l) => l.type === "flight");
    const hasCoastalDeparture =
      legs.some((l) => l.type === "ferry" && prevDef.matchIsland.test(l.from)) &&
      legs.some((l) => l.type === "van") &&
      !legs.some((l) => l.type === "flight");
    if (coastal && km != null) {
      day.transportation = buildCoastalDepartureLegs(prevDef, hubCity, km);
    } else if (!hasAirDeparture && !hasCoastalDeparture) {
      day.transportation = buildDepartureLegs(prevDef, hubCity);
    }
    day.islandAccessRoute = { defId: prevDef.id, direction: "departure" };
    day.transportationTips = departureTransportTip(prevDef, lang, hubCity, coastal);
    rewriteAccessActivitiesFromLegs(day, lang);
  }

  for (const day of days) {
    if (!day.transportation?.length) continue;
    const next = day.transportation.filter((leg) => !isOutingTransportLeg(leg));
    if (next.length !== day.transportation.length) {
      day.transportation = next.length ? next : undefined;
    }
  }
}
