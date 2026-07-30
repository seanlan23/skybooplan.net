/** Emails with unlimited plan generation + product access (no quota / paywall). */
const UNLIMITED_ACCESS_EMAILS = new Set([
  "rokkricej@gmail.com",
  "tomazgorec@gmail.com",
]);

export function hasUnlimitedAccess(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return UNLIMITED_ACCESS_EMAILS.has(email.trim().toLowerCase());
}
