import { AIRPORT_HUBS } from "@/lib/airportCatalog";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { overnightPlacesMatch } from "@/lib/overnightHotelStays";

export type TransferLegLike = { type?: string; from?: string; to?: string };

export type BaseTransferOpts = {
  dayCity?: string;
  prevCity?: string;
  dayNumber?: number;
  originIata?: string;
  destinationIata?: string;
  originPlace?: string;
  destinationPlace?: string;
  isLastDay?: boolean;
};

/** Airport names that are not the DESTINATION_BY_IATA city label. */
const AIRPORT_NAME_IATA: Array<[RegExp, string]> = [
  [/suvarnabhumi/i, "BKK"],
  [/don\s*mueang/i, "DMK"],
];

function extractIataToken(label: string): string | null {
  const m = label.toUpperCase().match(/\b([A-Z]{3})\b/);
  return m?.[1] ?? null;
}

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hub IATA for a transfer endpoint (token, city, localized origin, airport name). */
export function resolveTransferHub(label: string | undefined): string | null {
  const raw = (label ?? "").trim();
  if (!raw) return null;
  const token = extractIataToken(raw);
  if (token && DESTINATION_BY_IATA[token]) return token;
  if (token && AIRPORT_HUBS.some((h) => h.iata === token)) return token;
  if (token && token !== "THE" && token !== "AND" && token !== "FOR") return token;

  for (const [re, iata] of AIRPORT_NAME_IATA) {
    if (re.test(raw)) return iata;
  }

  const alias = normalizeAlias(raw);
  if (alias) {
    for (const hub of AIRPORT_HUBS) {
      const keys = [hub.city, hub.name, hub.iata, ...hub.aliases].map(normalizeAlias);
      if (keys.some((k) => k && (k === alias || k.includes(alias) || alias.includes(k)))) {
        return hub.iata;
      }
    }
  }

  for (const [iata, meta] of Object.entries(DESTINATION_BY_IATA)) {
    if (overnightPlacesMatch(meta.name, raw)) return iata;
  }
  return null;
}

export function sameTransferBase(a: string, b: string): boolean {
  const na = a.trim();
  const nb = b.trim();
  if (!na || !nb) return true;
  if (overnightPlacesMatch(na, nb)) return true;
  const ia = resolveTransferHub(na);
  const ib = resolveTransferHub(nb);
  if (ia && ib && ia === ib) return true;
  if (ia && DESTINATION_BY_IATA[ia] && overnightPlacesMatch(DESTINATION_BY_IATA[ia]!.name, nb)) {
    return true;
  }
  if (ib && DESTINATION_BY_IATA[ib] && overnightPlacesMatch(DESTINATION_BY_IATA[ib]!.name, na)) {
    return true;
  }
  return false;
}

function isIntlOriginDestHop(
  fromHub: string | null,
  toHub: string | null,
  origin?: string,
  dest?: string,
): boolean {
  if (!origin || !dest || origin === dest) return false;
  return (
    (fromHub === origin && toHub === dest) || (fromHub === dest && toHub === origin)
  );
}

/**
 * Gray transfer banner / TransportCard: only a real overnight-base hop
 * (or day-1 / last-day international origin ↔ destination). Never day trips.
 */
export function isBaseTransferLeg(leg: TransferLegLike, opts?: BaseTransferOpts): boolean {
  const from = (leg.from ?? "").trim();
  const to = (leg.to ?? "").trim();
  if (!from || !to) return false;
  if (sameTransferBase(from, to)) return false;

  const origin = opts?.originIata?.trim().toUpperCase();
  const dest = opts?.destinationIata?.trim().toUpperCase();
  const fromHub = resolveTransferHub(from);
  const toHub = resolveTransferHub(to);
  const intl = isIntlOriginDestHop(fromHub, toHub, origin, dest);

  const dayNumber = opts?.dayNumber ?? 0;
  const dayCity = opts?.dayCity?.trim();
  const prevCity = opts?.prevCity?.trim();
  const stayedPut = Boolean(dayCity && prevCity && sameTransferBase(prevCity, dayCity));
  if (stayedPut) {
    if (opts?.isLastDay && origin && toHub === origin && fromHub && fromHub !== origin) {
      return true;
    }
    return Boolean(intl && (opts?.isLastDay || dayNumber === 1));
  }

  if (dayNumber === 1) {
    if (intl) return true;
    if (fromHub && toHub && fromHub !== toHub) return true;
    return false;
  }
  if (!prevCity) {
    if (fromHub && toHub && fromHub !== toHub) return true;
    return intl;
  }
  if (opts?.isLastDay) {
    if (intl) return true;
    if (origin && toHub === origin && fromHub && fromHub !== toHub) return true;
    return false;
  }

  if (dayCity && prevCity && !sameTransferBase(prevCity, dayCity)) {
    if (fromHub && toHub && fromHub !== toHub) return true;
    const fromPrev = sameTransferBase(from, prevCity);
    const toDay = sameTransferBase(to, dayCity);
    const fromDay = sameTransferBase(from, dayCity);
    const toPrev = sameTransferBase(to, prevCity);
    if ((fromPrev && toDay) || (fromDay && toPrev)) return true;
    return intl;
  }

  return intl;
}

/** Day-1 dest → origin (Suvarnabhumi → München) must read origin → destination. */
export function orientArrivalTransferLeg<T extends { type: string; from: string; to: string }>(
  leg: T,
  opts: { dayNumber: number; originIata?: string; destinationIata?: string },
): T {
  if (opts.dayNumber !== 1) return leg;
  const origin = opts.originIata?.trim().toUpperCase();
  const dest = opts.destinationIata?.trim().toUpperCase();
  if (!origin || !dest || origin === dest) return leg;
  const fromHub = resolveTransferHub(leg.from);
  const toHub = resolveTransferHub(leg.to);
  if (fromHub === dest && toHub === origin) {
    return { ...leg, type: "flight", from: leg.to, to: leg.from };
  }
  return leg;
}
