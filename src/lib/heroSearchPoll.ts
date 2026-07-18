import {
  MAKE_SEARCH_POLL_INITIAL_DELAY_MS,
  MAKE_SEARCH_POLL_INTERVAL_MS,
  MAKE_SEARCH_POLL_MAX_ATTEMPTS,
  mergeAndRankMakeSearchFlights,
  parseMakeSearchFlights,
  type MakeSearchFlight,
} from "@/lib/makeSearch";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isTransientMakeStatusError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === "accepted" || normalized === "ok";
}

function readSearchIds(record: Record<string, unknown> | null): string[] {
  if (!record) return [];
  if (Array.isArray(record.searchIds)) {
    return record.searchIds
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim());
  }
  if (typeof record.searchId === "string" && record.searchId.trim()) {
    return [record.searchId.trim()];
  }
  return [];
}

function readOrigins(record: Record<string, unknown> | null): string[] {
  if (!record || !Array.isArray(record.origins)) return [];
  return record.origins
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim().toUpperCase())
    .filter((o) => /^[A-Z]{3}$/.test(o));
}

function readSeedFlights(record: Record<string, unknown> | null): MakeSearchFlight[] {
  if (!record || !Array.isArray(record.seedFlights)) return [];
  return record.seedFlights as MakeSearchFlight[];
}

function buildStatusUrl(searchIds: string[], origins: string[]): string {
  const params = new URLSearchParams();
  if (searchIds.length === 1 && origins.length === 0) {
    params.set("searchId", searchIds[0]!);
  } else {
    params.set("searchIds", searchIds.join(","));
    if (origins.length > 0) params.set("origins", origins.join(","));
  }
  return `/api/search/status?${params.toString()}`;
}

/** Resolve sync offers or poll /api/search/status until Make async search completes. */
export async function resolveHeroSearchData(data: unknown): Promise<{
  flights: MakeSearchFlight[];
  error?: string;
}> {
  const directFlights = parseMakeSearchFlights(data);
  if (directFlights.length > 0) {
    return { flights: directFlights };
  }

  const record = asRecord(data);
  if (record?.status !== "pending") {
    return { flights: directFlights };
  }

  const searchIds = readSearchIds(record);
  const origins = readOrigins(record);
  const seedFlights = readSeedFlights(record);

  // All origins already returned sync offers in the pending payload.
  if (searchIds.length === 0) {
    if (seedFlights.length > 0) {
      return {
        flights: mergeAndRankMakeSearchFlights(seedFlights, { showOriginBadge: true }),
      };
    }
    return { flights: directFlights };
  }

  await sleep(MAKE_SEARCH_POLL_INITIAL_DELAY_MS);

  const statusUrl = buildStatusUrl(searchIds, origins);

  for (let attempt = 0; attempt < MAKE_SEARCH_POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(MAKE_SEARCH_POLL_INTERVAL_MS);
    }

    const statusRes = await fetch(statusUrl);
    const statusRaw = await statusRes.text();
    let statusData: unknown = null;
    try {
      statusData = statusRaw.trim() ? JSON.parse(statusRaw) : null;
    } catch {
      return { flights: [], error: "heroSearch.error" };
    }

    if (!statusRes.ok) {
      const errRecord = asRecord(statusData);
      const message =
        errRecord && typeof errRecord.error === "string"
          ? errRecord.error
          : "heroSearch.error";
      if (isTransientMakeStatusError(message)) {
        continue;
      }
      return { flights: [], error: message };
    }

    const statusRecord = asRecord(statusData);
    const polledFlights = parseMakeSearchFlights(statusData, { rank: false });
    // Flights win even if Make's `status: "done"` overwrote our API's `ready`.
    if (polledFlights.length > 0 || statusRecord?.status === "ready") {
      const merged = mergeAndRankMakeSearchFlights([...seedFlights, ...polledFlights], {
        showOriginBadge: seedFlights.length > 0 || origins.length > 1,
      });
      return { flights: merged };
    }

    if (statusRecord?.status === "error") {
      if (seedFlights.length > 0) {
        return {
          flights: mergeAndRankMakeSearchFlights(seedFlights, { showOriginBadge: true }),
        };
      }
      const message =
        typeof statusRecord.error === "string" ? statusRecord.error : "heroSearch.error";
      return { flights: [], error: message };
    }
  }

  if (seedFlights.length > 0) {
    return {
      flights: mergeAndRankMakeSearchFlights(seedFlights, { showOriginBadge: true }),
    };
  }

  return { flights: [], error: "heroSearch.timeout" };
}
