import type { Activity, DayTransportLeg } from "@/lib/aiPlan.functions";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { haversineKm } from "@/lib/geoMath";
import { lookupRegionCoords } from "@/lib/regionCoords";

/** Gemini often prices Las Vegas→LA as a €50 van — drop impossible long “van” hops. */
const MAX_PLAUSIBLE_VAN_HOP_KM = 120;

/** Islands without a commercial runway — never invent direct flights to/from these. */
const NO_AIRPORT_ISLAND =
  /koh\s*lipe|\blipe\b|boracay|phi\s*phi|maya\s*bay|koh\s*lanta|\blanta\b|railay|ao\s*nang/i;

function normalizePlaceLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ");
}

function placesMatch(a: string, b: string): boolean {
  const na = normalizePlaceLabel(a);
  const nb = normalizePlaceLabel(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function activityBlob(activities?: {
  morning: Activity[];
  afternoon: Activity[];
  evening: Activity[];
}): string {
  if (!activities) return "";
  return [...activities.morning, ...activities.afternoon, ...activities.evening]
    .map((a) => `${a.name} ${a.description ?? ""}`)
    .join(" ");
}

function extractIata(label: string): string | null {
  const m = /\b([A-Z]{3})\b/.exec(label.toUpperCase());
  return m?.[1] ?? null;
}

function inferAirportLabel(
  blob: string,
  destinationIata?: string,
  city?: string,
): string {
  if (/suvarnabhumi|\bbkk\b/i.test(blob)) return "Suvarnabhumi (BKK)";
  if (/don\s*muang|\bdmk\b/i.test(blob)) return "Don Mueang (DMK)";
  if (/phuket|\bhkt\b/i.test(blob)) return "Phuket (HKT)";
  if (/chiang\s*mai|\bcnx\b/i.test(blob)) return "Chiang Mai (CNX)";
  if (/samui|\busm\b/i.test(blob)) return "Koh Samui (USM)";
  if (/surat\s*thani|\burt\b/i.test(blob)) return "Surat Thani (URT)";
  if (/krabi|\bkbv\b/i.test(blob)) return "Krabi (KBV)";
  if (/hat\s*yai|\bhdy\b/i.test(blob)) return "Hat Yai (HDY)";
  if (/cebu|\bceb\b/i.test(blob)) return "Cebu (CEB)";
  if (/manila|\bmni\b|\bmnl\b/i.test(blob)) return "Manila (MNL)";
  if (/bali|\bdps\b/i.test(blob)) return "Bali (DPS)";
  if (/hanoi|\bhan\b/i.test(blob)) return "Hanoi (HAN)";
  if (/ho\s*chi\s*minh|\bsgn\b|saigon/i.test(blob)) return "Ho Chi Minh (SGN)";
  if (/da\s*nang|\bdad\b/i.test(blob)) return "Da Nang (DAD)";

  const iata = destinationIata?.trim().toUpperCase();
  if (iata && DESTINATION_BY_IATA[iata]) {
    return `${DESTINATION_BY_IATA[iata]!.name} (${iata})`;
  }
  const cityLabel = city?.trim();
  return cityLabel ? `Letališče ${cityLabel}` : "Letališče";
}

function cityCenterLabel(city: string): string {
  const c = city.trim();
  return c ? `${c} — center` : "Center mesta";
}

/** Activity titles wrongly used as `from` ("Vožnja do Den Helder", "Trajekt do Texel"). */
function isNarrativeRouteLabel(label: string): boolean {
  return /^(vožnja|trajekt|drive|ferry|transfer|prevoz|odhod|prihod)\b/i.test(label.trim());
}

/** Pull real destination out of narrative transport titles. */
export function extractDestinationFromNarrativeRoute(label: string): string | null {
  const s = label.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const port = s.match(
    /(?:trajektn(?:ega|o)\s+pristanišč[a-z]*|ferry\s+port|ferry\s+terminal)\s+(.+)$/i,
  );
  if (port?.[1]) return port[1].trim();
  const island = s.match(/\b(?:do|to|na)\s+(?:otoka\s+|island\s+)?(.+)$/i);
  if (island?.[1]) {
    return island[1]
      .replace(/^trajektnega\s+pristanišč[a-z]*\s+/i, "")
      .trim();
  }
  return null;
}

function repairNarrativeMotorhomeLeg(
  leg: DayTransportLeg,
  ctx: { city: string; previousCity?: string },
): DayTransportLeg {
  const from = (leg.from ?? "").trim();
  const to = (leg.to ?? "").trim();
  if (!from || !to) return leg;
  if (!isNarrativeRouteLabel(from)) return leg;
  // Wrong pattern: "Trajekt do otoka Texel → Amsterdam" (day city stuck as `to`).
  if (!placesMatch(to, ctx.city)) return leg;

  const dest = extractDestinationFromNarrativeRoute(from);
  if (!dest) return leg;

  if (/texel/i.test(dest)) {
    return { ...leg, type: "ferry", from: "Den Helder", to: "Texel" };
  }
  if (/den\s*helder/i.test(dest)) {
    const origin = ctx.previousCity?.trim() || ctx.city;
    return { ...leg, type: leg.type === "ferry" ? "van" : leg.type, from: origin, to: "Den Helder" };
  }

  const origin = ctx.previousCity?.trim() || ctx.city;
  return { ...leg, from: origin, to: dest };
}

export function repairTransportLegs(
  legs: DayTransportLeg[] | undefined,
  ctx: {
    dayNumber: number;
    city: string;
    destinationIata?: string;
    previousCity?: string;
    activities?: {
      morning: Activity[];
      afternoon: Activity[];
      evening: Activity[];
    };
  },
): DayTransportLeg[] | undefined {
  if (!legs?.length) return legs;

  const blob = activityBlob(ctx.activities);
  const airport = inferAirportLabel(blob, ctx.destinationIata, ctx.city);
  const center = cityCenterLabel(ctx.city);
  const isArrival = ctx.dayNumber === 1;
  const prevCity = ctx.previousCity?.trim();

  const repaired = legs.flatMap((leg) => {
    leg = repairNarrativeMotorhomeLeg(leg, { city: ctx.city, previousCity: prevCity });

    const fromIata = extractIata(leg.from);
    const toIata = extractIata(leg.to);
    if (
      leg.type === "flight" &&
      fromIata &&
      toIata &&
      fromIata === toIata
    ) {
      return [];
    }

    // Fake “flight” titles that are really hotel/airport logistics.
    if (
      leg.type === "flight" &&
      /check-?\s*out|transfer to\s+[A-Z]{3}|hotel check/i.test(`${leg.from} ${leg.to}`)
    ) {
      return [];
    }

    if (leg.type === "van" || leg.type === "train") {
      const fromC = lookupRegionCoords(leg.from);
      const toC = lookupRegionCoords(leg.to);
      if (fromC && toC) {
        const km = haversineKm([fromC.lng, fromC.lat], [toC.lng, toC.lat]);
        if (leg.type === "van" && km > MAX_PLAUSIBLE_VAN_HOP_KM) return [];
      }
    }

    if (!placesMatch(leg.from, leg.to)) return [leg];

    if (isArrival && (leg.type === "van" || leg.type === "flight")) {
      if (leg.type === "flight") {
        // Arrival day "flight" with same from/to is almost always a bad Gemini leg —
        // treat as airport → hotel van instead of inventing a city hop.
        return [{ ...leg, type: "van", from: airport, to: center }];
      }
      return [{ ...leg, from: airport, to: center }];
    }

    if (leg.type === "flight" && prevCity && !placesMatch(prevCity, ctx.city)) {
      // Never invent a direct flight onto/off an island without a runway.
      if (NO_AIRPORT_ISLAND.test(prevCity) || NO_AIRPORT_ISLAND.test(ctx.city)) {
        return [];
      }
      return [{ ...leg, from: prevCity, to: ctx.city }];
    }

    if (leg.type === "van" && /letali|airport|pristanek|prevoz na let/i.test(blob)) {
      return [{ ...leg, from: center, to: airport }];
    }

    if (leg.type === "van") {
      return [{ ...leg, from: airport, to: center }];
    }

    return [];
  });

  return repaired.length > 0 ? repaired : undefined;
}
