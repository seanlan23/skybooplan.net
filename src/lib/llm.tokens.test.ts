import { describe, expect, it } from "vitest";
import { openaiOutputTokenFields } from "@/lib/llm";

describe("openaiOutputTokenFields", () => {
  it("uses max_tokens for gpt-4o chat completions", () => {
    expect(openaiOutputTokenFields("gpt-4o", 8192)).toEqual({ max_tokens: 8192 });
    expect(openaiOutputTokenFields("gpt-4o-mini", 16_000)).toEqual({ max_tokens: 16_000 });
  });

  it("uses max_completion_tokens for o-series and gpt-5", () => {
    expect(openaiOutputTokenFields("o3-mini", 8192)).toEqual({
      max_completion_tokens: 8192,
    });
    expect(openaiOutputTokenFields("gpt-5", 8192)).toEqual({
      max_completion_tokens: 8192,
    });
  });
});
