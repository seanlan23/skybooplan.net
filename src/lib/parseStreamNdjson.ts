/**
 * NDJSON stream parsing for itinerary API responses.
 *
 * Server-side generation uses Vercel AI SDK `streamObject` (Gemini) — that handles
 * incomplete model JSON on the server. The client receives complete NDJSON *lines*
 * (`{ type, plan, ... }\n`). We must never JSON.parse a raw network chunk; only
 * fully buffered lines that look structurally complete.
 */

/** True when braces/brackets are balanced and the payload looks closed. */
export function isCompleteJsonString(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  if (!(trimmed.endsWith("}") || trimmed.endsWith("]"))) return false;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
  }

  return depth === 0 && !inString;
}

/**
 * Parse one JSON value only when it is structurally complete.
 * Returns null for empty, incomplete, or invalid JSON — caller keeps buffering.
 */
export function parsePartialJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed || !isCompleteJsonString(trimmed)) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** @deprecated alias — prefer parsePartialJson */
export function parseNdjsonLine(line: string): unknown | null {
  return parsePartialJson(line);
}

/**
 * Consume newline-terminated lines from a growing buffer.
 * The trailing fragment (no `\n` yet) stays in `remainder` unparsed.
 */
export function consumeNdjsonBuffer(buffer: string): {
  events: unknown[];
  remainder: string;
} {
  const events: unknown[] = [];
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    const parsed = parsePartialJson(line);
    if (parsed !== null) events.push(parsed);
  }

  return { events, remainder };
}

/** Parse final buffer after stream closes — only if the line looks complete. */
export function flushNdjsonBuffer(remainder: string): unknown | null {
  return parsePartialJson(remainder);
}

export function isStreamEvent(
  value: unknown,
): value is { type: string } & Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
