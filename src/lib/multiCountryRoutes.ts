import { lookupDestination } from "@/lib/destinationCoords";
import { templateToBlueprintBlocks } from "@/lib/curatedRoutes";
import { extractTripIntent, type TripIntent } from "@/lib/tripIntent";

export type RegionBlueprintBlock = { city: string; startDay: number; endDay: number };

/** @deprecated Use parseMinIslandDays from tripIntent.ts */
export function parseMinIslandDaysFromWishes(wishes?: string): number | undefined {
  return extractTripIntent(wishes).minIslandDays;
}

export function wishesMentionVietnamAndThailand(
  wishes?: string,
  destinationIata?: string,
  returnFromIata?: string,
): boolean {
  return (
    extractTripIntent(wishes, { destinationIata, returnFromIata }).routeId === "VN_TH"
  );
}

/** Vietnam leg scales with trip length — dual-country needs ≥11 days. */
function vietnamSegmentsForDuration(nDays: number): Array<[string, number]> {
  if (nDays >= 16) {
    return [
      ["Ho Chi Minh City", 2],
      ["Phu Quoc", 2],
      ["Hoi An", 2],
      ["Hanoi", 2],
      ["Ha Long Bay", 2],
    ];
  }
  if (nDays >= 13) {
    return [
      ["Ho Chi Minh City", 2],
      ["Hoi An", 2],
      ["Hanoi", 2],
      ["Ha Long Bay", 2],
    ];
  }
  return [
    ["Ho Chi Minh City", 2],
    ["Hoi An", 2],
    ["Hanoi", 1],
    ["Ha Long Bay", 1],
  ];
}

/** Open-jaw VN arrival + TH return — steered by TripIntent.routeId === VN_TH. */
export function resolveVietnamThailandBlueprint(
  nDays: number,
  destinationIata: string,
  returnFromIata?: string,
  intent?: TripIntent,
): RegionBlueprintBlock[] | undefined {
  const dest = lookupDestination(destinationIata);
  if (!dest || dest.country !== "VN") return undefined;

  const resolved =
    intent ??
    extractTripIntent(undefined, { destinationIata, returnFromIata });

  if (resolved.routeId !== "VN_TH") return undefined;
  if (nDays < 11) return undefined;

  const bangkokDays = 1;
  const krabiDays = nDays >= 12 ? 1 : 0;
  const vn = vietnamSegmentsForDuration(nDays);
  const vnTotal = vn.reduce((sum, [, d]) => sum + d, 0);

  const requestedIsland = resolved.minIslandDays ?? (nDays >= 16 ? 5 : 4);
  const remaining = nDays - vnTotal - krabiDays - bangkokDays;
  if (remaining < 2) return undefined;

  const thIsland = Math.max(
    2,
    Math.min(requestedIsland, remaining, Math.floor(nDays * 0.4)),
  );

  const template: Array<[string, number]> = [
    ...vn,
    ...(krabiDays ? ([["Krabi", krabiDays]] as Array<[string, number]>) : []),
    ["Koh Lipe", thIsland],
    ["Bangkok", bangkokDays],
  ];

  return templateToBlueprintBlocks(template, nDays);
}

export function resolveMultiCountryBlueprint(
  nDays: number,
  destinationIata: string,
  returnFromIata?: string,
  wishes?: string,
  intent?: TripIntent,
): RegionBlueprintBlock[] | undefined {
  const resolved =
    intent ??
    extractTripIntent(wishes, { destinationIata, returnFromIata });

  const vnTh = resolveVietnamThailandBlueprint(
    nDays,
    destinationIata,
    returnFromIata,
    resolved,
  );
  if (vnTh) return vnTh;

  return undefined;
}

export function returnHubCity(returnFromIata?: string): string | undefined {
  return lookupDestination(returnFromIata ?? "")?.name;
}

export function lastRegionMatchesReturnHub(
  regions: Array<{ city: string; endDay: number }>,
  returnFromIata?: string,
): boolean {
  const hub = returnHubCity(returnFromIata);
  if (!hub) return true;
  const last = [...regions].sort((a, b) => b.endDay - a.endDay)[0];
  if (!last) return false;
  const lc = last.city.toLowerCase();
  const hubLc = hub.toLowerCase();
  return lc.includes(hubLc) || hubLc.includes(lc);
}
