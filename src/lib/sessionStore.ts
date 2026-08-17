/**
 * Session persistence for the home page so the user's last search, generated
 * AI plan, and selected flight survive a browser back-navigation or a tab
 * reload. Stored in localStorage under a versioned key.
 *
 * Bump PLAN_SCHEMA_VERSION when skeleton/plan pipeline changes so old cached
 * plans are not silently restored (cache leak).
 */

import type { SearchValues } from "@/components/SearchPanel";
import type { AiPlannerSubmit } from "@/components/AiPlannerPreview";
import type { AiTripPlan, TripSkeleton } from "@/lib/aiPlan.functions";
import type { DuffelFlight } from "@/lib/flights.functions";
import type { TripFlightContext } from "@/lib/flightScheduling";

/**
 * Bump when AI plan / budget / map enrichment changes materially so old
 * inflated cached plans are never restored after deploy.
 */
export const PLAN_SCHEMA_VERSION = 4;

const KEY = `skybooplan:lastSession:v${PLAN_SCHEMA_VERSION}`;

/** One-shot flag: logo “home” should wipe persisted session (not a tab refresh). */
const HOME_RESET_KEY = "skybooplan:pendingHomeReset";

/** Older keys — removed on load and clear to prevent stale plan leaks. */
const LEGACY_KEYS = [
  "skybooplan:lastSession:v2",
  "skybooplan:lastSession:v1",
  "skybooplan:lastSession",
] as const;

/** Dispatched when the logo is clicked while already on `/`. */
export const HOME_RESET_EVENT = "skybooplan:home-reset";

export type AiPlannerCtx = {
  from: string;
  to: string;
  departDate: string;
  returnDate?: string;
  returnFromIata?: string;
  pax: number;
  language?: string;
  flights?: TripFlightContext;
  /** Selected flight party total (EUR). */
  flightTotalEur?: number;
};

export type SavedSession = {
  planSchemaVersion: number;
  /** Live search-form draft — persisted on every field change. */
  searchDraft: SearchValues | null;
  lastSearch: SearchValues | null;
  aiPlan: AiTripPlan | null;
  aiSkeleton: TripSkeleton | null;
  aiError: string | null;
  aiContext: AiPlannerCtx | null;
  lastPlannerForm: AiPlannerSubmit | null;
  aiGenStartedAt: number | null;
  plannerMode: "trip" | "stays";
  selected: DuffelFlight | null;
  flights: DuffelFlight[];
  savedPlanId: string | null;
  ts: number;
};

function emptySession(): SavedSession {
  return {
    planSchemaVersion: PLAN_SCHEMA_VERSION,
    searchDraft: null,
    lastSearch: null,
    aiPlan: null,
    aiSkeleton: null,
    aiError: null,
    aiContext: null,
    lastPlannerForm: null,
    aiGenStartedAt: null,
    plannerMode: "trip",
    selected: null,
    flights: [],
    savedPlanId: null,
    ts: Date.now(),
  };
}

/** Drop superseded localStorage entries (v1 plans, pre-version blobs). */
export function purgeLegacySessionCache(): void {
  if (typeof window === "undefined") return;
  try {
    for (const legacy of LEGACY_KEYS) {
      window.localStorage.removeItem(legacy);
    }
  } catch {
    /* noop */
  }
}

function isValidSession(parsed: SavedSession): boolean {
  if (!parsed.ts || Date.now() - parsed.ts > 24 * 60 * 60 * 1000) return false;
  if (parsed.planSchemaVersion !== PLAN_SCHEMA_VERSION) return false;
  return true;
}

export function loadSession(): SavedSession | null {
  if (typeof window === "undefined") return null;
  purgeLegacySessionCache();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (!isValidSession(parsed)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
    return null;
  }
}

export function saveSession(partial: Partial<SavedSession>) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadSession() ?? emptySession();
    const next: SavedSession = {
      ...prev,
      ...partial,
      planSchemaVersion: PLAN_SCHEMA_VERSION,
      ts: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}

/** Flush a streaming preview immediately — React effects may not run before iOS sleeps. */
export function patchSessionAiPlan(aiPlan: AiTripPlan | null) {
  if (typeof window === "undefined") return;
  const prev = loadSession();
  saveSession({
    aiPlan,
    aiGenStartedAt: prev?.aiGenStartedAt ?? Date.now(),
  });
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    purgeLegacySessionCache();
  } catch {
    /* noop */
  }
}

/**
 * Clear only the AI plan fields — keep search draft, hero context, flights.
 * Used by “Počisti načrt” so the user can generate a new plan without a full home reset.
 */
export function clearPlanFromSession() {
  saveSession({
    aiPlan: null,
    aiSkeleton: null,
    aiError: null,
    aiGenStartedAt: null,
    savedPlanId: null,
  });
}

/** Mark the next landing mount (or same-page logo click) as an explicit home reset. */
export function requestHomeReset(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HOME_RESET_KEY, "1");
  } catch {
    /* noop */
  }
}

/** Returns true once when the user navigated home via the logo (not a refresh). */
export function consumeHomeReset(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(HOME_RESET_KEY) !== "1") return false;
    window.sessionStorage.removeItem(HOME_RESET_KEY);
    return true;
  } catch {
    return false;
  }
}
