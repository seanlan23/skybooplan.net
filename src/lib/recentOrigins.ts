const STORAGE_KEY = "skybooplan.recentOrigins.v1";
const MAX_RECENT = 6;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readRecentOrigins(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && /^[A-Z]{3}$/i.test(x))
      .map((x) => x.toUpperCase())
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberRecentOrigins(iatas: string[]): void {
  if (!canUseStorage() || iatas.length === 0) return;
  const next = [
    ...iatas.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)),
    ...readRecentOrigins(),
  ];
  const unique: string[] = [];
  for (const code of next) {
    if (!unique.includes(code)) unique.push(code);
    if (unique.length >= MAX_RECENT) break;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  } catch {
    // ignore quota / private mode
  }
}
