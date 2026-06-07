import { describe, expect, it } from "vitest";
import {
  consumeNdjsonBuffer,
  flushNdjsonBuffer,
  isCompleteJsonString,
  parsePartialJson,
} from "@/lib/parseStreamNdjson";

describe("parsePartialJson", () => {
  it("returns null for incomplete JSON instead of throwing", () => {
    expect(parsePartialJson('{"type":"partial","plan":')).toBeNull();
    expect(parsePartialJson('{"type":"partial","plan":{"days":[')).toBeNull();
    expect(parsePartialJson("")).toBeNull();
  });

  it("parses when object is structurally complete", () => {
    const value = parsePartialJson('{"type":"done","plan":{"days":[]}}');
    expect(value).toEqual({ type: "done", plan: { days: [] } });
  });

  it("isCompleteJsonString requires closing brace", () => {
    expect(isCompleteJsonString('{"a":1')).toBe(false);
    expect(isCompleteJsonString('{"a":1}')).toBe(true);
  });

  it("buffers incomplete lines until newline and closing brace arrive", () => {
    let buffer = '{"type":"partial","dayCount":1}\n{"type":"done","plan":';
    const first = consumeNdjsonBuffer(buffer);
    expect(first.events).toHaveLength(1);
    expect(first.remainder).toContain('"plan":');
    expect(parsePartialJson(first.remainder)).toBeNull();

    buffer = first.remainder + '{"days":[]}}\n';
    const second = consumeNdjsonBuffer(buffer);
    expect(second.events).toHaveLength(1);
    expect((second.events[0] as { type: string }).type).toBe("done");
  });

  it("flushNdjsonBuffer skips incomplete trailing fragment", () => {
    expect(flushNdjsonBuffer('{"type":"done","plan":')).toBeNull();
    expect(flushNdjsonBuffer('{"type":"done","plan":{"days":[]}}')).toEqual({
      type: "done",
      plan: { days: [] },
    });
  });
});
