/**
 * Session persistence for the home page so the user's last search, generated
 * AI plan, and selected flight survive a browser back-navigation or a tab
 * reload. Stored in localStorage under a single namespaced key.
 */

import type { SearchValues } from "@/components/SearchPanel";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { DuffelFlight } from "@/lib/flights.functions";

const KEY = "skybooplan:lastSession:v1";

export type AiPlannerCtx = {
  from: string;
  to: string;
  departDate: string;
  returnDate?: string;
  pax: number;
  language?: string;
};

export type SavedSession = {
  lastSearch: SearchValues | null;
  aiPlan: AiTripPlan | null;
  aiContext: AiPlannerCtx | null;
  plannerMode: "trip" | "stays";
  selected: DuffelFlight | null;
  flights: DuffelFlight[];
  savedPlanId: string | null;
  ts: number;
};

export function loadSession(): SavedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    // Expire after 24h to avoid stale plans on next visit
    if (!parsed.ts || Date.now() - parsed.ts > 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(partial: Partial<SavedSession>) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadSession() ?? {
      lastSearch: null,
      aiPlan: null,
      aiContext: null,
      plannerMode: "trip" as const,
      selected: null,
      flights: [],
      savedPlanId: null,
      ts: Date.now(),
    };
    const next: SavedSession = { ...prev, ...partial, ts: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
