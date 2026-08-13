const INSTALLED_KEY = "skybooplan.pwa.installed";
const SNOOZE_KEY = "skybooplan.pwa.installSnoozeUntil";

export const INSTALL_SNOOZE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function snoozeUntilTimestamp(now: number, days = INSTALL_SNOOZE_DAYS): number {
  return now + days * DAY_MS;
}

export function isSnoozeActive(untilRaw: string | null, now: number): boolean {
  if (!untilRaw) return false;
  const until = Number(untilRaw);
  return Number.isFinite(until) && now < until;
}

/** Manifest start_url / shortcuts stamp this so we know the icon launched us. */
export function isPwaLaunchSource(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const source = new URLSearchParams(raw).get("source");
  return source === "pwa" || source === "pwa-plan";
}

export function wasMarkedInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPwaInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function isRunningAsInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (document.referrer.startsWith("android-app://")) return true;
  if (isPwaLaunchSource(window.location.search)) return true;
  for (const mode of ["standalone", "fullscreen", "minimal-ui"] as const) {
    if (window.matchMedia(`(display-mode: ${mode})`).matches) return true;
  }
  return false;
}

export function isInstallPromptSnoozed(now = Date.now()): boolean {
  try {
    return isSnoozeActive(localStorage.getItem(SNOOZE_KEY), now);
  } catch {
    return false;
  }
}

export function snoozeInstallPrompt(now = Date.now(), days = INSTALL_SNOOZE_DAYS) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(snoozeUntilTimestamp(now, days)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function shouldHideInstallPrompt(): boolean {
  return isRunningAsInstalledApp() || wasMarkedInstalled();
}
