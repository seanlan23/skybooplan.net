import type { Activity, DayTransportLeg } from "@/lib/aiPlan.functions";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";

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
    if (!placesMatch(leg.from, leg.to)) return [leg];

    if (isArrival && (leg.type === "van" || leg.type === "flight")) {
      return [{ ...leg, from: airport, to: center }];
    }

    if (leg.type === "flight" && prevCity && !placesMatch(prevCity, ctx.city)) {
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
