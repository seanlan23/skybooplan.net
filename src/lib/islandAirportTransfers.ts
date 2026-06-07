import type { AiTripPlan, DayPlan, DayTransportLeg, IslandAccessRoute } from "@/lib/aiPlan.functions";

export type IslandAirportAccessDef = {
  id: string;
  /** Matches island city name in itinerary. */
  matchIsland: RegExp;
  /** Optional IATA of mainland gateway airport (e.g. MPH for Boracay). */
  gatewayIata?: string;
  airport: { label: string; lat: number; lng: number };
  port: { label: string; lat: number; lng: number };
  island: { name: string; lat: number; lng: number };
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
  return def.matchIsland.test(to) || /caticlan|mph/i.test(to);
}

function buildArrivalLegs(def: IslandAirportAccessDef, hubCity: string): DayTransportLeg[] {
  return [
    {
      type: "flight",
      from: hubCity,
      to: def.airport.label,
      duration: "1h–1h 20m",
      estimatedPrice: 45,
    },
    {
      type: "van",
      from: def.airport.label,
      to: def.port.label,
      duration: "10–15 min",
      estimatedPrice: 4,
    },
    {
      type: "ferry",
      from: def.port.label,
      to: def.island.name,
      duration: "15–20 min",
      estimatedPrice: 6,
    },
  ];
}

function buildDepartureLegs(def: IslandAirportAccessDef, hubCity: string): DayTransportLeg[] {
  return [
    {
      type: "ferry",
      from: def.island.name,
      to: def.port.label,
      duration: "15–20 min",
      estimatedPrice: 6,
    },
    {
      type: "van",
      from: def.port.label,
      to: def.airport.label,
      duration: "10–15 min",
      estimatedPrice: 4,
    },
    {
      type: "flight",
      from: def.airport.label,
      to: hubCity,
      duration: "1h–1h 20m",
      estimatedPrice: 45,
    },
  ];
}

function arrivalTransportTip(def: IslandAirportAccessDef): string {
  return `Boracay ni neposredno na letališču — let do ${def.airport.label}, nato kombi do ${def.port.label} in trajekt na otok (${def.island.name}). Rezerviraj trajekt vnaprej v sezoni.`;
}

function departureTransportTip(def: IslandAirportAccessDef): string {
  return `Odhod z otoka: trajekt ${def.island.name} → ${def.port.label}, kombi do ${def.airport.label} (${def.gatewayIata ?? "MPH"}), nato notranji let.`;
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
  opts: { destinationIata?: string } = {},
): void {
  const days = plan.days;
  if (!days.length) return;

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
      const hubCity = prevCity || "Manila";
      if (!hasCompleteIslandAccessLegs(legs) || singleFlightToIsland(legs, def)) {
        day.transportation = buildArrivalLegs(def, hubCity);
      }
      day.islandAccessRoute = { defId: def.id, direction: "arrival" };
      if (!day.transportationTips?.includes(def.airport.label)) {
        day.transportationTips = arrivalTransportTip(def);
      }
    }

    if (isDepartureDay) {
      const hubCity = nextCity || "Manila";
      const depLegs = buildDepartureLegs(def, hubCity);
      const hasDepartureLegs =
        legs.length >= 3 &&
        legs.some((l) => l.type === "ferry" && def.matchIsland.test(l.from));
      if (!hasDepartureLegs) {
        day.transportation = depLegs;
      }
      day.islandAccessRoute = { defId: def.id, direction: "departure" };
      if (!isArrivalDay) {
        day.transportationTips = departureTransportTip(def);
      }
    }
  }
}
