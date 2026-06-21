import {
  MAKE_SEARCH_POLL_INTERVAL_MS,
  MAKE_SEARCH_POLL_MAX_ATTEMPTS,
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
  if (record?.status !== "pending" || typeof record.searchId !== "string") {
    return { flights: directFlights };
  }

  const searchId = record.searchId;
  for (let attempt = 0; attempt < MAKE_SEARCH_POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(MAKE_SEARCH_POLL_INTERVAL_MS);
    }

    const statusRes = await fetch(
      `/api/search/status?searchId=${encodeURIComponent(searchId)}`,
    );
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
      return { flights: [], error: message };
    }

    const statusRecord = asRecord(statusData);
    if (statusRecord?.status === "ready") {
      return { flights: parseMakeSearchFlights(statusData) };
    }

    if (statusRecord?.status === "error") {
      const message =
        typeof statusRecord.error === "string" ? statusRecord.error : "heroSearch.error";
      return { flights: [], error: message };
    }
  }

  return { flights: [], error: "heroSearch.timeout" };
}
