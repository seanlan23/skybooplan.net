import type { AiTripPlan, DayPlan, DayTransportLeg, IslandAccessRoute } from "@/lib/aiPlan.functions";
import { planLangCopy } from "@/lib/planLangCopy";

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

function hasCompleteIslandAccessLegs(legs: DayTransportLeg[]): boolean {
  if (legs.length < 3) return false;
  const types = legs.map((l) => l.type);
  return types.includes("flight") && types.includes("van") && types.includes("ferry");
}

function singleFlightToIsland(legs: DayTransportLeg[], def: IslandAirportAccessDef): boolean {
  if (legs.length !== 1 || legs[0]?.type !== "flight") return false;
  const to = legs[0].to.toLowerCase();
  return def.matchIsland.test(to) || new RegExp(def.gatewayIata ?? "____", "i").test(to);
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

function arrivalTransportTip(def: IslandAirportAccessDef, lang?: string): string {
  if (def.id === "koh-lipe") {
    return planLangCopy(lang, {
      sl: `Koh Lipe nima letališča — let do ${def.airport.label}, nato kombi do ${def.port.label} in speedboat/ferry na otok. Rezerviraj čoln vnaprej (sezonski urniki).`,
      en: `Koh Lipe has no airport — fly to ${def.airport.label}, van to ${def.port.label}, then speedboat/ferry to the island. Book the boat ahead (seasonal schedules).`,
      it: `Koh Lipe non ha aeroporto — volo a ${def.airport.label}, van a ${def.port.label}, poi speedboat/ferry per l'isola. Prenota il traghetto in anticipo (orari stagionali).`,
      es: `Koh Lipe no tiene aeropuerto — vuelo a ${def.airport.label}, van a ${def.port.label} y speedboat/ferry a la isla. Reserva el barco con antelación (horarios de temporada).`,
      fr: `Koh Lipe n'a pas d'aéroport — vol vers ${def.airport.label}, van jusqu'à ${def.port.label}, puis speedboat/ferry vers l'île. Réservez le bateau à l'avance (horaires saisonniers).`,
      de: `Koh Lipe hat keinen Flughafen — Flug nach ${def.airport.label}, Van nach ${def.port.label}, dann Speedboat/Fähre zur Insel. Boot rechtzeitig buchen (saisonale Fahrpläne).`,
    });
  }
  return planLangCopy(lang, {
    sl: `Boracay ni neposredno na letališču — let do ${def.airport.label}, nato kombi do ${def.port.label} in trajekt na otok (${def.island.name}). Rezerviraj trajekt vnaprej v sezoni.`,
    en: `Boracay is not at the airport — fly to ${def.airport.label}, van to ${def.port.label}, then ferry to ${def.island.name}. Book the ferry ahead in season.`,
    it: `Boracay non è sull'aeroporto — volo a ${def.airport.label}, van a ${def.port.label}, poi traghetto per ${def.island.name}. Prenota il traghetto in alta stagione.`,
    es: `Boracay no está en el aeropuerto — vuelo a ${def.airport.label}, van a ${def.port.label} y ferry a ${def.island.name}. Reserva el ferry con antelación en temporada.`,
    fr: `Boracay n'est pas à l'aéroport — vol vers ${def.airport.label}, van jusqu'à ${def.port.label}, puis ferry vers ${def.island.name}. Réservez le ferry à l'avance en saison.`,
    de: `Boracay liegt nicht am Flughafen — Flug nach ${def.airport.label}, Van nach ${def.port.label}, dann Fähre nach ${def.island.name}. Fähre in der Saison vorab buchen.`,
  });
}

function departureTransportTip(def: IslandAirportAccessDef, lang?: string): string {
  if (def.id === "koh-lipe") {
    return planLangCopy(lang, {
      sl: `Odhod z otoka: speedboat/ferry ${def.island.name} → ${def.port.label}, kombi do ${def.airport.label} (${def.gatewayIata ?? "HDY"}), nato notranji let (npr. proti Phuketu/HKT). Ni neposrednega leta z Lipe.`,
      en: `Leaving the island: speedboat/ferry ${def.island.name} → ${def.port.label}, van to ${def.airport.label} (${def.gatewayIata ?? "HDY"}), then a domestic flight (e.g. toward Phuket/HKT). No direct flight from Lipe.`,
      it: `Partenza dall'isola: speedboat/ferry ${def.island.name} → ${def.port.label}, van a ${def.airport.label} (${def.gatewayIata ?? "HDY"}), poi volo interno (es. verso Phuket/HKT). Nessun volo diretto da Lipe.`,
      es: `Salida de la isla: speedboat/ferry ${def.island.name} → ${def.port.label}, van a ${def.airport.label} (${def.gatewayIata ?? "HDY"}), luego vuelo doméstico (p. ej. hacia Phuket/HKT). No hay vuelo directo desde Lipe.`,
      fr: `Départ de l'île : speedboat/ferry ${def.island.name} → ${def.port.label}, van vers ${def.airport.label} (${def.gatewayIata ?? "HDY"}), puis vol intérieur (ex. vers Phuket/HKT). Pas de vol direct depuis Lipe.`,
      de: `Abreise von der Insel: Speedboat/Fähre ${def.island.name} → ${def.port.label}, Van zum ${def.airport.label} (${def.gatewayIata ?? "HDY"}), dann Inlandsflug (z. B. nach Phuket/HKT). Kein Direktflug von Lipe.`,
    });
  }
  return planLangCopy(lang, {
    sl: `Odhod z otoka: trajekt ${def.island.name} → ${def.port.label}, kombi do ${def.airport.label} (${def.gatewayIata ?? "MPH"}), nato notranji let.`,
    en: `Leaving the island: ferry ${def.island.name} → ${def.port.label}, van to ${def.airport.label} (${def.gatewayIata ?? "MPH"}), then a domestic flight.`,
    it: `Partenza dall'isola: traghetto ${def.island.name} → ${def.port.label}, van a ${def.airport.label} (${def.gatewayIata ?? "MPH"}), poi volo interno.`,
    es: `Salida de la isla: ferry ${def.island.name} → ${def.port.label}, van a ${def.airport.label} (${def.gatewayIata ?? "MPH"}), luego vuelo doméstico.`,
    fr: `Départ de l'île : ferry ${def.island.name} → ${def.port.label}, van vers ${def.airport.label} (${def.gatewayIata ?? "MPH"}), puis vol intérieur.`,
    de: `Abreise von der Insel: Fähre ${def.island.name} → ${def.port.label}, Van zum ${def.airport.label} (${def.gatewayIata ?? "MPH"}), dann Inlandsflug.`,
  });
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
  const days = plan.days;
  if (!days.length) return;
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
    const nextCity = (next?.city ?? "").trim();
    const isArrivalDay = Boolean(prev && prevCity && !isIslandCity(prevCity, def));
    const isDepartureDay = Boolean(next && nextCity && !isIslandCity(nextCity, def));

    const legs = day.transportation ?? [];

    if (isArrivalDay) {
      const hubCity = prevCity || (def.id === "koh-lipe" ? "Phuket" : "Manila");
      if (!hasCompleteIslandAccessLegs(legs) || singleFlightToIsland(legs, def)) {
        day.transportation = buildArrivalLegs(def, hubCity);
      }
      day.islandAccessRoute = { defId: def.id, direction: "arrival" };
      if (!day.transportationTips?.includes(def.airport.label)) {
        day.transportationTips = arrivalTransportTip(def, lang);
      }
    }

    if (isDepartureDay) {
      const hubCity = nextCity || (def.id === "koh-lipe" ? "Phuket" : "Manila");
      const depLegs = buildDepartureLegs(def, hubCity);
      const hasDepartureLegs =
        legs.length >= 3 &&
        legs.some((l) => l.type === "ferry" && def.matchIsland.test(l.from));
      if (!hasDepartureLegs) {
        day.transportation = depLegs;
      }
      day.islandAccessRoute = { defId: def.id, direction: "departure" };
      if (!isArrivalDay) {
        day.transportationTips = departureTransportTip(def, lang);
      }
    }
  }
}
