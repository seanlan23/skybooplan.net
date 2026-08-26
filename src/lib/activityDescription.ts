/**
 * Structured activity copy — bullets owned by coerce/render, not free-form essays.
 * Fixes middle-day walls of text (e.g. Katoomba evening) in UI + PDF.
 */
import {
  isOrdinalPeriod,
  lastSentenceEndIndex,
  looksLikeCutStemSentence,
} from "@/lib/textSanitize";

export const MAX_ACTIVITY_BULLETS = 4;
export const MAX_ACTIVITY_BULLET_CHARS = 140;
/** Above this, a single paragraph is treated as a wall and sentence-split. */
const WALL_OF_TEXT_CHARS = 180;

function clipBullet(line: string): string {
  const t = line.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_ACTIVITY_BULLET_CHARS) return t;
  const chunk = t.slice(0, MAX_ACTIVITY_BULLET_CHARS - 1).trim();
  const ordinalSafeDot = lastSentenceEndIndex(chunk);
  const dotSpace = ordinalSafeDot > 0 && chunk[ordinalSafeDot + 1] === " " ? ordinalSafeDot : -1;
  const breakAt = Math.max(dotSpace, chunk.lastIndexOf(", "), chunk.lastIndexOf(" "));
  const cut = (breakAt > 40 ? chunk.slice(0, breakAt) : chunk).trim();
  const stripped = cut.replace(/\s+\S{1,12}$/u, "").trim();
  const safe =
    stripped && !looksLikeCutStemSentence(`${stripped}.`)
      ? stripped
      : cut.replace(/\s+\S+$/u, "").trim() || cut;
  if (looksLikeCutStemSentence(safe)) return cut;
  return /[.!?…]$/u.test(safe) ? safe : `${safe}…`;
}

function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
    if (ch === "." && isOrdinalPeriod(text, i)) continue;
    const next = text[i + 1];
    if (next && next !== " " && next !== "\n") continue;
    const piece = text.slice(start, i + 1).trim();
    if (piece && !looksLikeCutStemSentence(piece)) out.push(piece);
    start = i + 1;
  }
  const tail = text.slice(start).trim();
  if (tail && !looksLikeCutStemSentence(tail)) out.push(tail);
  return out;
}

function cleanBulletLine(line: string): string {
  return line.replace(/^[-•*▸–—]\s+/, "").replace(/\s+/g, " ").trim();
}

/**
 * Prefer explicit bullets[]; else split description newlines / sentences.
 * Always returns 0–4 short lines (never one 300-char paragraph).
 */
export function normalizeActivityBullets(input: {
  description?: string | null;
  bullets?: string[] | null;
}): string[] {
  const fromArray = (input.bullets ?? [])
    .filter((s): s is string => typeof s === "string")
    .map(cleanBulletLine)
    .filter(Boolean);
  if (fromArray.length > 0) {
    return fromArray.slice(0, MAX_ACTIVITY_BULLETS).map(clipBullet);
  }

  const text = (input.description ?? "").trim();
  if (!text) return [];

  const lines = text
    .split(/\n+/)
    .map(cleanBulletLine)
    .filter(Boolean);
  if (lines.length > 1) {
    return lines.slice(0, MAX_ACTIVITY_BULLETS).map(clipBullet);
  }

  const single = lines[0] ?? text;
  const sentenceHits = splitSentences(single);
  if (
    sentenceHits &&
    sentenceHits.length >= 2 &&
    (single.length > WALL_OF_TEXT_CHARS || sentenceHits.length >= 3)
  ) {
    return sentenceHits.slice(0, MAX_ACTIVITY_BULLETS).map(clipBullet);
  }

  // Run-on wall (few/no sentence ends) — chunk on clause/word boundaries.
  if (single.length > WALL_OF_TEXT_CHARS) {
    const chunks: string[] = [];
    let rest = single;
    while (rest.length > 0 && chunks.length < MAX_ACTIVITY_BULLETS) {
      if (rest.length <= MAX_ACTIVITY_BULLET_CHARS) {
        chunks.push(rest.trim());
        break;
      }
      const window = rest.slice(0, MAX_ACTIVITY_BULLET_CHARS);
      const breakAt = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("; "),
        window.lastIndexOf(", "),
        window.lastIndexOf(" and "),
        window.lastIndexOf(" "),
      );
      const cut = breakAt > 40 ? breakAt : MAX_ACTIVITY_BULLET_CHARS;
      const piece = rest.slice(0, cut).replace(/[,;.\s]+$/u, "").trim();
      if (piece) chunks.push(piece);
      rest = rest.slice(cut).replace(/^[,;.\s]+/u, "").trim();
    }
    if (chunks.length > 0) return chunks.map(clipBullet);
  }

  return [clipBullet(single)];
}

/** Canonical description stored on Activity / Gemini payload. */
export function formatActivityDescription(bullets: string[]): string {
  if (bullets.length === 0) return "";
  if (bullets.length === 1) return bullets[0]!;
  return bullets.map((b) => `- ${b}`).join("\n");
}

/** Mutate Gemini activity object: sync bullets + description. */
export function coerceActivityDescriptionFields(a: Record<string, unknown>): void {
  const bulletsRaw = Array.isArray(a.bullets)
    ? a.bullets.filter((x): x is string => typeof x === "string")
    : [];
  const desc = typeof a.description === "string" ? a.description : "";
  const bullets = normalizeActivityBullets({ description: desc, bullets: bulletsRaw });
  a.bullets = bullets;
  a.description = formatActivityDescription(bullets) || desc.trim();
}

/** Same helper for UI day cards + PDF (already-normalized descriptions still work). */
export function activityDescriptionBullets(text?: string | null, bullets?: string[] | null): string[] {
  return normalizeActivityBullets({ description: text, bullets });
}
