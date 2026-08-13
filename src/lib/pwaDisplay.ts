const INSTALLED_KEY = "skybooplan.pwa.installed";

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

export function shouldHideInstallPrompt(): boolean {
  return isRunningAsInstalledApp() || wasMarkedInstalled();
}
