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
  /** Already on this coast → van to the pier, no short-hop to the gateway airport. */
  coastHubMatch?: RegExp;
  coastVanDuration?: string;
  coastVanPrice?: number;
  /** No commercial runway — never invent a flight onto/off this island. */
  coastOnly?: boolean;
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
    coastHubMatch: /krabi|ao nang|aonang|phuket|railay|koh lanta|\blanta\b|khao lak|\bkbv\b|\bhkt\b/i,
    coastVanDuration: "3.5h",
    coastVanPrice: 20,
  },
  {
    id: "holbox",
    matchIsland: /holbox/i,
    airport: {
      label: "Cancún (CUN)",
      lat: 21.0365,
      lng: -86.8771,
    },
    port: {
      label: "Chiquilá",
      lat: 21.428,
      lng: -87.339,
    },
    island: {
      name: "Isla Holbox",
      lat: 21.5236,
      lng: -87.3776,
    },
    ferryDuration: "20–30 min",
    ferryPrice: 12,
    coastHubMatch: /tulum|cancun|cancún|playa del carmen|playa|valladolid|m[eé]rida/i,
    coastVanDuration: "2–2.5h",
    coastVanPrice: 20,
    coastOnly: true,
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

function islandAccessFromCoast(hubCity: string, def: IslandAirportAccessDef): boolean {
  return Boolean(def.coastHubMatch?.test(hubCity.trim()));
}

function hasCompleteCoastalAccessLegs(legs: DayTransportLeg[]): boolean {
  if (legs.some((l) => l.type === "flight")) return false;
  const types = legs.map((l) => l.type);
  return types.includes("van") && types.includes("ferry");
}

function buildCoastalArrivalLegs(def: IslandAirportAccessDef, hubCity: string): DayTransportLeg[] {
  return [
    {
      type: "van",
      from: hubCity,
      to: def.port.label,
      duration: def.coastVanDuration ?? "3.5h",
      estimatedPrice: def.coastVanPrice ?? 20,
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

function buildCoastalDepartureLegs(def: IslandAirportAccessDef, hubCity: string): DayTransportLeg[] {
  return [
    {
      type: "ferry",
      from: def.island.name,
      to: def.port.label,
      duration: def.ferryDuration ?? "20–30 min",
      estimatedPrice: def.ferryPrice ?? 12,
    },
    {
      type: "van",
      from: def.port.label,
      to: hubCity,
      duration: def.coastVanDuration ?? "2–2.5h",
      estimatedPrice: def.coastVanPrice ?? 20,
    },
  ];
}

function usesCoastOnlyAccess(def: IslandAirportAccessDef, hubCity: string): boolean {
  return Boolean(def.coastOnly) || (!def.gatewayIata && islandAccessFromCoast(hubCity, def));
}

function buildArrivalLegs(def: IslandAirportAccessDef, hubCity: string): DayTransportLeg[] {
  if (usesCoastOnlyAccess(def, hubCity) || islandAccessFromCoast(hubCity, def)) {
    return buildCoastalArrivalLegs(def, hubCity);
  }
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
  if (usesCoastOnlyAccess(def, hubCity)) {
    return buildCoastalDepartureLegs(def, hubCity);
  }
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

function arrivalTransportTip(def: IslandAirportAccessDef, lang?: string, hubCity?: string): string {
  if (usesCoastOnlyAccess(def, hubCity ?? "")) {
    const hub = (hubCity ?? "").trim() || "the coast";
    return planLangCopy(lang, {
      sl: `${def.island.name} nima letališča. S celine (${hub}) greš s kombijem/avtobusom do ${def.port.label}, nato trajekt na otok (cca ${def.ferryDuration ?? "20–30 min"}). Ni direktnega trajekta ${hub} → ${def.island.name}.`,
      en: `${def.island.name} has no airport. From the mainland (${hub}) take a van/bus to ${def.port.label}, then the ferry (about ${def.ferryDuration ?? "20–30 min"}). There is no direct ferry ${hub} → ${def.island.name}.`,
      de: `${def.island.name} hat keinen Flughafen. Vom Festland (${hub}) mit Van/Bus nach ${def.port.label}, dann Fähre (ca. ${def.ferryDuration ?? "20–30 Min."}). Keine direkte Fähre ${hub} → ${def.island.name}.`,
    });
  }
  if (def.id === "koh-lipe" && hubCity && islandAccessFromCoast(hubCity, def)) {
    return planLangCopy(lang, {
      sl: `Koh Lipe nima letališča. Z Andamanske obale (${hubCity}) greš s kombijem do ${def.port.label} (cca ${def.coastVanDuration ?? "3,5 h"}), nato speedboat/ferry na otok. Ni leta ${hubCity} → Hat Yai.`,
      en: `Koh Lipe has no airport. From the Andaman coast (${hubCity}) take a van to ${def.port.label} (about ${def.coastVanDuration ?? "3.5h"}), then speedboat/ferry. There is no ${hubCity} → Hat Yai flight.`,
      de: `Koh Lipe hat keinen Flughafen. Von der Andaman-Küste (${hubCity}) mit dem Van nach ${def.port.label} (ca. ${def.coastVanDuration ?? "3,5 Std."}), dann Speedboat/Fähre. Kein Flug ${hubCity} → Hat Yai.`,
    });
  }
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

function departureTransportTip(def: IslandAirportAccessDef, lang?: string, hubCity?: string): string {
  const hub = (hubCity ?? "").trim() || (def.id === "koh-lipe" ? "Bangkok" : "Manila");
  if (usesCoastOnlyAccess(def, hub)) {
    return planLangCopy(lang, {
      sl: `Odhod z otoka: trajekt ${def.island.name} → ${def.port.label}, nato kombi/avtobus do ${hub}. Z otoka zjutraj ne gre na mednarodni let.`,
      en: `Leaving the island: ferry ${def.island.name} → ${def.port.label}, then van/bus to ${hub}. An early international flight from the island is not feasible.`,
      de: `Abreise: Fähre ${def.island.name} → ${def.port.label}, dann Van/Bus nach ${hub}. Ein früher internationaler Flug von der Insel ist nicht machbar.`,
    });
  }
  if (def.id === "koh-lipe") {
    return planLangCopy(lang, {
      sl: `Odhod z otoka: speedboat/ferry ${def.island.name} → ${def.port.label}, kombi do ${def.airport.label} (${def.gatewayIata ?? "HDY"}), nato notranji let proti ${hub}. Ni neposrednega leta z Lipe.`,
      en: `Leaving the island: speedboat/ferry ${def.island.name} → ${def.port.label}, van to ${def.airport.label} (${def.gatewayIata ?? "HDY"}), then a domestic flight to ${hub}. No direct flight from Lipe.`,
      it: `Partenza dall'isola: speedboat/ferry ${def.island.name} → ${def.port.label}, van a ${def.airport.label} (${def.gatewayIata ?? "HDY"}), poi volo interno per ${hub}. Nessun volo diretto da Lipe.`,
      es: `Salida de la isla: speedboat/ferry ${def.island.name} → ${def.port.label}, van a ${def.airport.label} (${def.gatewayIata ?? "HDY"}), luego vuelo doméstico a ${hub}. No hay vuelo directo desde Lipe.`,
      fr: `Départ de l'île : speedboat/ferry ${def.island.name} → ${def.port.label}, van vers ${def.airport.label} (${def.gatewayIata ?? "HDY"}), puis vol intérieur vers ${hub}. Pas de vol direct depuis Lipe.`,
      de: `Abreise von der Insel: Speedboat/Fähre ${def.island.name} → ${def.port.label}, Van zum ${def.airport.label} (${def.gatewayIata ?? "HDY"}), dann Inlandsflug nach ${hub}. Kein Direktflug von Lipe.`,
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

const SLOTS = ["morning", "afternoon", "evening"] as const;

function activityBlob(a: { name?: string; description?: string }): string {
  return `${a.name ?? ""} ${a.description ?? ""}`;
}

function looksLikeWrongLipeFerry(blob: string): boolean {
  if (/hat yai|\bhdy\b|pak bara/i.test(blob)) return false;
  return /klong jilad|klong jiad|pristanišča klong|pier klong|krabi.*(?:trajekt|ferry|speedboat).*lipe|lipe.*(?:trajekt|ferry).*krabi/i.test(
    blob,
  );
}

function rewriteKohLipeAccessActivities(
  day: DayPlan,
  def: IslandAirportAccessDef,
  direction: "arrival" | "departure",
  hubCity: string,
  lang?: string,
): void {
  if (def.id !== "koh-lipe" || !day.activities) return;
  const fromCoast = islandAccessFromCoast(hubCity, def);
  const arrival = fromCoast
    ? planLangCopy(lang, {
        sl: `Kombi ${hubCity} → ${def.port.label}, nato speedboat na Koh Lipe`,
        en: `Van ${hubCity} → ${def.port.label}, then speedboat to Koh Lipe`,
        de: `Van ${hubCity} → ${def.port.label}, dann Speedboat nach Koh Lipe`,
      })
    : planLangCopy(lang, {
        sl: `Let ${hubCity} → ${def.airport.label}, kombi do ${def.port.label}, nato speedboat na Koh Lipe`,
        en: `Fly ${hubCity} → ${def.airport.label}, van to ${def.port.label}, then speedboat to Koh Lipe`,
        de: `Flug ${hubCity} → ${def.airport.label}, Van nach ${def.port.label}, dann Speedboat nach Koh Lipe`,
      });
  const arrivalDesc = fromCoast
    ? planLangCopy(lang, {
        sl: `Koh Lipe nima letališča. S kombijem do Pak Bara (cca 3,5 h), nato 1,5–2 h čoln. Let Krabi → Hat Yai ne obstaja.`,
        en: `Koh Lipe has no airport. Van to Pak Bara (about 3.5h), then 1.5–2h boat. There is no Krabi → Hat Yai flight.`,
        de: `Koh Lipe hat keinen Flughafen. Van nach Pak Bara (ca. 3,5 Std.), dann 1,5–2 Std. Boot. Kein Flug Krabi → Hat Yai.`,
      })
    : planLangCopy(lang, {
        sl: `Koh Lipe nima letališča in ni direktnega trajekta iz Krabija (Klong Jilad). Let na Hat Yai (HDY), 1,5–2 h kombi do Pak Bara, nato 1,5–2 h čoln. Računaj 6–8 ur od vrat do vrat.`,
        en: `Koh Lipe has no airport and no useful direct ferry from Krabi (Klong Jilad). Fly to Hat Yai (HDY), 1.5–2h van to Pak Bara, then 1.5–2h boat. Door-to-door 6–8h.`,
        de: `Koh Lipe hat keinen Flughafen und keine sinnvolle Direktfähre ab Krabi (Klong Jilad). Flug nach Hat Yai (HDY), 1,5–2 Std. Van nach Pak Bara, dann 1,5–2 Std. Boot. Tür-zu-Tür 6–8 Std.`,
      });
  const departureDesc = planLangCopy(lang, {
    sl: `Zjutraj čoln s Koh Lipeja do Pak Bara, kombi do Hat Yai, nato notranji let proti ${hubCity}. Računaj 6–8 ur — danes ni Siam Paragon / mestni program dopoldne.`,
    en: `Morning boat from Koh Lipe to Pak Bara, van to Hat Yai, then a domestic flight to ${hubCity}. Budget 6–8h — no Siam Paragon / city sights this morning.`,
    de: `Morgens Boot von Koh Lipe nach Pak Bara, Van nach Hat Yai, dann Inlandsflug nach ${hubCity}. 6–8 Std. — heute Vormittag kein Siam Paragon.`,
  });
  const departure = planLangCopy(lang, {
    sl: `Speedboat Koh Lipe → ${def.port.label}, kombi do ${def.airport.label}, nato let proti ${hubCity}`,
    en: `Speedboat Koh Lipe → ${def.port.label}, van to ${def.airport.label}, then fly to ${hubCity}`,
    de: `Speedboat Koh Lipe → ${def.port.label}, Van zum ${def.airport.label}, dann Flug nach ${hubCity}`,
  });
  for (const slot of SLOTS) {
    day.activities[slot] = (day.activities[slot] ?? []).map((a) => {
      const blob = activityBlob(a);
      const isMove = /prevoz|transfer|let |flight|ferry|trajekt|van|kombi|speedboat|čoln/i.test(blob);
      if (!isMove) return a;
      if (direction === "arrival" && (looksLikeWrongLipeFerry(blob) || /koh lipe|hat yai|pak bara|krabi/i.test(blob))) {
        return {
          ...a,
          name: arrival,
          description: arrivalDesc,
          type: "TRANSPORT",
          transportType: fromCoast ? "van" : "flight",
        };
      }
      if (direction === "departure" && /koh lipe|pak bara|hat yai|prevoz iz/i.test(blob)) {
        return {
          ...a,
          name: departure,
          description: departureDesc,
          type: "TRANSPORT",
          transportType: "flight",
        };
      }
      return a;
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
    const isArrivalDay = Boolean(prev && prevCity && !isIslandCity(prevCity, def));
    const legs = day.transportation ?? [];

    // Arrival stays on the first island overnight. Departure does NOT — that would
    // steal the last beach day (Lipe 10 Nov still sleeps on the island; leave 11 Nov).
    if (isArrivalDay) {
      const hubCity = prevCity || (def.id === "koh-lipe" ? "Phuket" : "Manila");
      const fromCoast = islandAccessFromCoast(hubCity, def);
      const needsLegs = fromCoast
        ? !hasCompleteCoastalAccessLegs(legs) || legs.some((l) => l.type === "flight")
        : !hasCompleteIslandAccessLegs(legs) || singleFlightToIsland(legs, def);
      if (needsLegs) {
        day.transportation = buildArrivalLegs(def, hubCity);
      }
      day.islandAccessRoute = { defId: def.id, direction: "arrival" };
      const tip = arrivalTransportTip(def, lang, hubCity);
      if (!day.transportationTips?.includes(def.port.label)) {
        day.transportationTips = tip;
      }
      rewriteKohLipeAccessActivities(day, def, "arrival", hubCity, lang);
    }

    const nextCity = (next?.city ?? "").trim();
    const isLastIslandOvernight = Boolean(nextCity && !isIslandCity(nextCity, def));
    if (isLastIslandOvernight && !isArrivalDay) {
      const outbound =
        day.transportation?.some((l) => l.type === "ferry" && def.matchIsland.test(l.from)) ??
        false;
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

    const hubCity = (day.city ?? "").trim() || (prevDef.id === "koh-lipe" ? "Bangkok" : "Manila");
    const legs = day.transportation ?? [];
    const hasDepartureLegs = usesCoastOnlyAccess(prevDef, hubCity)
      ? hasCompleteCoastalAccessLegs(legs) &&
        legs.some((l) => l.type === "ferry" && prevDef.matchIsland.test(l.from))
      : legs.length >= 3 &&
        legs.some((l) => l.type === "ferry" && prevDef.matchIsland.test(l.from));
    if (!hasDepartureLegs) {
      day.transportation = buildDepartureLegs(prevDef, hubCity);
    }
    day.islandAccessRoute = { defId: prevDef.id, direction: "departure" };
    day.transportationTips = departureTransportTip(prevDef, lang, hubCity);
    rewriteKohLipeAccessActivities(day, prevDef, "departure", hubCity, lang);
  }
}
