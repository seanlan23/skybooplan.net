import { lookupDestination } from "@/lib/destinationCoords";
import type { PlannerInterestKey } from "@/lib/plannerInterests";
import { parsePlannerInterestKeys } from "@/lib/plannerInterests";

/** Curated regions + highlights when user picks an interest — keyed by country, not every POI on Earth. */
export type InterestAnchorConfig = {
  /** Cities/islands to weave into regionBlueprint (linear route). */
  routeTemplate: Array<[city: string, fixedDays: number]>;
  /** Named sights AI must plan as highlights (day trips OK). */
  mustIncludeHighlights: string[];
  /** Short steer line for the model. */
  steer: string;
};

const BEACH_ANCHORS: Record<string, InterestAnchorConfig> = {
  TH: {
    routeTemplate: [
      ["Bangkok", 3],
      ["Chiang Mai", 2],
      ["Krabi", 3],
      ["Koh Lipe", 5],
      ["Bangkok", 2],
    ],
    mustIncludeHighlights: [
      "Grand Palace",
      "Wat Pho",
      "Wat Arun",
      "Asiatique",
      "Ayutthaya",
      "Koh Phi Phi",
      "Maya Bay",
      "Koh Lipe",
      "Railay Beach",
      "Sunrise Beach (Koh Lipe)",
    ],
    steer:
      "Dream beaches selected — allocate ≥40% of trip to Andaman coast. Bangkok 3 nights (Kwai day trip; Ayutthaya = day trip only). Chiang Mai 2 nights. Krabi/Ao Nang 3 nights for Railay/Phra Nang/Phi Phi — never 1 night. Koh Lipe 5 nights if included (≥4). Final Bangkok: 1 hotel night + international departure day. Name real beaches in highlights.",
  },
  PH: {
    routeTemplate: [
      ["Manila", 1],
      ["El Nido", 0],
      ["Bohol", 0],
      ["Boracay", 0],
      ["Manila", 2],
    ],
    mustIncludeHighlights: [
      "El Nido",
      "Big Lagoon",
      "Nacpan Beach",
      "Bohol",
      "Chocolate Hills",
      "Panglao Beach",
      "Boracay",
      "White Beach",
      "Island hopping",
    ],
    steer:
      "Dream beaches — Palawan (El Nido), Bohol (Chocolate Hills, Panglao), then Boracay. First Manila: arrival hub only (1 day). Final Manila: max 2–3 leisure days + international flight buffer — not 5 hub days.",
  },
  ID: {
    routeTemplate: [
      ["Ubud", 2],
      ["Uluwatu", 0],
      ["Nusa Penida", 0],
      ["Gili Islands", 0],
      ["Seminyak", 1],
    ],
    mustIncludeHighlights: [
      "Nusa Penida",
      "Kelingking Beach",
      "Gili Trawangan",
      "Padang Padang",
      "Uluwatu beaches",
    ],
    steer: "Dream beaches — Bali/Nusa Penida/Gili: name iconic beaches and island day trips.",
  },
  VN: {
    routeTemplate: [
      ["Ho Chi Minh City", 2],
      ["Phu Quoc", 0],
      ["Hoi An", 2],
      ["Ha Long Bay", 0],
      ["Hanoi", 0],
    ],
    mustIncludeHighlights: [
      "Phu Quoc",
      "Sao Beach",
      "An Bang Beach",
      "Ha Long Bay cruise",
    ],
    steer: "Dream beaches — Phu Quoc + central coast (An Bang) or Ha Long karst beaches.",
  },
  MY: {
    routeTemplate: [
      ["Kuala Lumpur", 2],
      ["Langkawi", 0],
      ["Perhentian Islands", 0],
      ["Kuala Lumpur", 0],
    ],
    mustIncludeHighlights: ["Langkawi", "Pantai Cenang", "Perhentian Islands", "Redang"],
    steer: "Dream beaches — Langkawi and/or Perhentian with named beaches.",
  },
  GR: {
    routeTemplate: [
      ["Athens", 2],
      ["Santorini", 0],
      ["Milos", 0],
      ["Athens", 0],
    ],
    mustIncludeHighlights: ["Santorini", "Red Beach", "Milos", "Sarakiniko Beach"],
    steer: "Dream beaches — Cyclades islands with named coves and caldera views.",
  },
  MX: {
    routeTemplate: [
      ["Cancún", 0],
      ["Tulum", 0],
      ["Isla Holbox", 0],
    ],
    mustIncludeHighlights: ["Tulum beach", "Playa del Carmen", "Isla Holbox"],
    steer: "Dream beaches — Riviera Maya + optional Holbox.",
  },
  HR: {
    routeTemplate: [
      ["Dubrovnik", 0],
      ["Hvar", 0],
      ["Split", 0],
    ],
    mustIncludeHighlights: ["Hvar", "Pakleni Islands", "Banje Beach Dubrovnik"],
    steer: "Dream beaches — Dalmatian coast islands.",
  },
};

const INTEREST_ANCHORS: Partial<
  Record<PlannerInterestKey, Record<string, InterestAnchorConfig>>
> = {
  beaches: BEACH_ANCHORS,
};

export function countryForDestinationIata(iata: string): string | null {
  return lookupDestination(iata)?.country ?? null;
}

export function getInterestAnchor(
  country: string,
  interest: PlannerInterestKey,
): InterestAnchorConfig | null {
  return INTEREST_ANCHORS[interest]?.[country.toUpperCase()] ?? null;
}

export function buildInterestAnchorPayload(
  destinationIata: string,
  priorityKeys: string[],
): Record<string, InterestAnchorConfig & { country: string }> | undefined {
  const country = countryForDestinationIata(destinationIata);
  if (!country) return undefined;

  const keys = parsePlannerInterestKeys(priorityKeys);
  const out: Record<string, InterestAnchorConfig & { country: string }> = {};

  for (const key of keys) {
    const anchor = getInterestAnchor(country, key);
    if (anchor) out[key] = { ...anchor, country };
  }

  return Object.keys(out).length ? out : undefined;
}

export function enrichPrioritiesPayload(
  payload: Record<string, unknown>,
  destinationIata: string,
  priorityKeys: string[],
  langCode = "sl",
): Record<string, unknown> {
  const anchors = buildInterestAnchorPayload(destinationIata, priorityKeys);
  if (!anchors) return payload;
  const slo = langCode === "sl" || langCode.startsWith("sl");
  return {
    ...payload,
    anchors,
    anchorRule: slo
      ? "Če je anchors v JSON-u: regije in highlights MORAJO vključevati mustIncludeHighlights in routeTemplate za to državo — ne zamenjaj z generičnimi mesti."
      : "If anchors present: regions and highlights MUST include mustIncludeHighlights and follow routeTemplate for that country.",
  };
}

/** Adjust region blueprint when a curated interest route exists for this country. */
export function resolveInterestBlueprint(
  nDays: number,
  destinationIata: string,
  priorityKeys: string[] | undefined,
  templateToBlocks: (
    template: Array<[string, number]>,
    days: number,
  ) => Array<{ city: string; startDay: number; endDay: number }>,
): Array<{ city: string; startDay: number; endDay: number }> | undefined {
  const country = countryForDestinationIata(destinationIata);
  if (!country || !priorityKeys?.length) return undefined;

  const keys = parsePlannerInterestKeys(priorityKeys);
  if (!keys.includes("beaches")) return undefined;

  const anchor = getInterestAnchor(country, "beaches");
  if (!anchor || nDays < 7) return undefined;

  return templateToBlocks(anchor.routeTemplate, nDays);
}
