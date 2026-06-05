import type { ReactNode } from "react";

/**
 * Replace `{token}` placeholders in a translated string with React nodes
 * (or plain strings). Unknown tokens are left as-is so missing translations
 * don't crash, but tests assert that every supported language renders all
 * expected tokens.
 *
 * Example: interpolate("Hello {name}!", { name: <b>Ada</b> })
 *          → ["Hello ", <b>Ada</b>, "!"]
 */
export function interpolate(
  template: string,
  parts: Record<string, ReactNode>,
): ReactNode[] {
  if (!template) return [];
  const out: ReactNode[] = [];
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) out.push(template.slice(last, m.index));
    const key = m[1];
    if (key in parts) {
      const node = parts[key];
      // Wrap primitive replacements so React array keys stay stable.
      out.push(
        typeof node === "string" || typeof node === "number" ? (
          <span key={`p${i}`}>{node}</span>
        ) : (
          node
        ),
      );
    } else {
      out.push(m[0]);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}
