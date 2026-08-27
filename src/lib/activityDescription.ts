/**
 * Activity copy helpers. Do not clip titles or descriptions — PDF wraps long lines.
 */
export const MAX_ACTIVITY_BULLETS = 8;

function cleanBulletLine(line: string): string {
  return line.replace(/^[-•*▸–—]\s+/, "").replace(/\s+/g, " ").trim();
}

/**
 * Prefer explicit bullets[]; else split description on newlines.
 * Never slice mid-word or cap character length.
 */
export function normalizeActivityBullets(input: {
  description?: string | null;
  bullets?: string[] | null;
}): string[] {
  const fromArray = (input.bullets ?? [])
    .filter((s): s is string => typeof s === "string")
    .map(cleanBulletLine)
    .filter(Boolean);
  if (fromArray.length > 0) return fromArray;

  const text = (input.description ?? "").trim();
  if (!text) return [];

  const lines = text
    .split(/\n+/)
    .map(cleanBulletLine)
    .filter(Boolean);
  return lines.length > 0 ? lines : [text];
}

/** Canonical description stored on Activity / Gemini payload. */
export function formatActivityDescription(bullets: string[]): string {
  if (bullets.length === 0) return "";
  if (bullets.length === 1) return bullets[0]!;
  return bullets.map((b) => `- ${b}`).join("\n");
}

/** Keep the model description as-is. Optional bullets from existing newlines only. */
export function coerceActivityDescriptionFields(a: Record<string, unknown>): void {
  const desc = typeof a.description === "string" ? a.description : "";
  if (Array.isArray(a.bullets) && a.bullets.some((x) => typeof x === "string" && x.trim())) {
    return;
  }
  const lines = desc
    .split(/\n+/)
    .map(cleanBulletLine)
    .filter(Boolean);
  if (lines.length > 1) a.bullets = lines;
}

/** Same helper for UI day cards + PDF. */
export function activityDescriptionBullets(text?: string | null, bullets?: string[] | null): string[] {
  return normalizeActivityBullets({ description: text, bullets });
}
