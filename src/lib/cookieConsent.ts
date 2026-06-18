export const COOKIE_CONSENT_KEY = "cookieConsent";

export type CookieConsentChoice = "all" | "essential";

export function getCookieConsent(): CookieConsentChoice | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(COOKIE_CONSENT_KEY);
  if (value === "all" || value === "essential") return value;
  return null;
}

export function setCookieConsent(choice: CookieConsentChoice): void {
  window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
}
