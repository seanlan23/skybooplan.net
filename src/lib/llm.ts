/**
 * Unified LLM JSON generator. Default provider: Google Gemini (free tier).
 *
 *   GEMINI_API_KEY=...              (required — AQ. keys via X-goog-api-key header)
 *   SKELETON_PROVIDER=google        SKELETON_MODEL=gemini-flash-latest
 *   FULL_PLAN_PROVIDER=google       FULL_PLAN_MODEL=gemini-flash-latest
 */

export type LlmProvider = "openai" | "anthropic" | "google";
export type LlmRole = "skeleton" | "full_plan";

export type LlmImagePart = {
  mimeType: string;
  base64: string;
};

export type GenerateJsonOptions = {
  role: LlmRole;
  system: string;
  user: string;
  trace?: (msg: string) => void;
  label?: string;
  maxTokens?: number;
  timeoutMs?: number;
  provider?: LlmProvider;
  model?: string;
  images?: LlmImagePart[];
};

const OPENAI_BASE = "https://api.openai.com/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";

const DEFAULT_MODELS: Record<LlmRole, Record<LlmProvider, string>> = {
  skeleton: {
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-haiku-latest",
    google: "gemini-2.0-flash",
  },
  full_plan: {
    openai: "gpt-4o",
    anthropic: "claude-sonnet-4-20250514",
    google: "gemini-2.0-flash",
  },
};

/** Separate free-tier quotas per model — try 2.0 before flash-latest (3.5). */
const GEMINI_MODEL_FALLBACKS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

export type JsonGenerateOutcome<T> = {
  data: T | null;
  httpStatus?: number;
  detail?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitDetail(detail: string): boolean {
  return /429|RESOURCE_EXHAUSTED|RATE_LIMIT|quota exceeded|Too Many Requests/i.test(detail);
}

function parseRetryDelayMs(detail: string): number {
  const sec =
    detail.match(/retry in ([\d.]+)s/i)?.[1] ??
    detail.match(/"retryDelay":\s*"(\d+)s"/i)?.[1];
  if (sec) return Math.ceil(parseFloat(sec) * 1000) + 800;
  return 7_000;
}

export function geminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? null;
}

export function resolveProvider(role: LlmRole): LlmProvider {
  const key = role === "skeleton" ? "SKELETON_PROVIDER" : "FULL_PLAN_PROVIDER";
  const v = (process.env[key] ?? "google").toLowerCase();
  if (v === "anthropic" || v === "google" || v === "openai") return v;
  return "google";
}

export function resolveModel(role: LlmRole, provider: LlmProvider): string {
  const envKey = role === "skeleton" ? "SKELETON_MODEL" : "FULL_PLAN_MODEL";
  const override = process.env[envKey]?.trim();
  if (provider === "google") {
    if (override && /^gemini/i.test(override)) return override;
    return DEFAULT_MODELS[role].google;
  }
  if (override) return override;
  return DEFAULT_MODELS[role][provider];
}

function parseLlmJson<T>(raw: string): T | null {
  const cleaned = raw.trim().replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    if (start === -1) return null;
    const end = cleaned.lastIndexOf("}");
    if (end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

function apiKeyFor(provider: LlmProvider): string | null {
  if (provider === "openai") return process.env.OPENAI_API_KEY ?? null;
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY ?? null;
  return geminiApiKey();
}

type LlmCallResult =
  | { ok: true; text: string }
  | { ok: false; status: number; detail?: string };

async function callOpenAi(
  key: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  signal: AbortSignal,
  images?: LlmImagePart[],
): Promise<LlmCallResult> {
  const userContent =
    images && images.length > 0
      ? [
          { type: "text", text: user },
          ...images.map((img) => ({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })),
        ]
      : user;

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail: body.slice(0, 300) };
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return text ? { ok: true, text } : { ok: false, status: 500, detail: "empty response" };
}

async function callAnthropic(
  key: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  signal: AbortSignal,
): Promise<LlmCallResult> {
  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: `${system}\n\nRespond with ONE raw JSON object only. No markdown.`,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail: body.slice(0, 300) };
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  return text ? { ok: true, text } : { ok: false, status: 500, detail: "empty response" };
}

/** Combine abort signals — aborts when any source signal aborts. */
function mergeAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

type StallWatchdog = { signal: AbortSignal; bump: () => void };

/** Stall watchdog — aborts only when the upstream stream goes silent. */
function createStallWatchdog(stallMs: number, parent: AbortSignal): StallWatchdog {
  const stall = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const bump = () => {
    clearTimeout(timer);
    timer = setTimeout(() => stall.abort(), stallMs);
  };

  const onParentAbort = () => {
    clearTimeout(timer);
    stall.abort();
  };
  parent.addEventListener("abort", onParentAbort, { once: true });
  if (parent.aborted) onParentAbort();

  bump();
  return { signal: stall.signal, bump };
}

/** @google/genai streaming — keeps upstream alive; aggregate JSON chunks server-side. */
async function callGoogle(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  signal: AbortSignal,
  trace?: (msg: string) => void,
  allowModelFallback = false,
  stallTimeoutMs = 45_000,
): Promise<LlmCallResult> {
  const key = geminiApiKey();
  if (!key) return { ok: false, status: 401, detail: "GEMINI_API_KEY missing" };

  const modelsToTry = [...new Set([model, ...GEMINI_MODEL_FALLBACKS])];
  let lastDetail = "unknown error";
  let lastStatus = 500;

  let GoogleGenAI: typeof import("@google/genai").GoogleGenAI;
  try {
    ({ GoogleGenAI } = await import("@google/genai"));
  } catch (err) {
    return {
      ok: false,
      status: 500,
      detail: `failed to load @google/genai: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const ai = new GoogleGenAI({ apiKey: key });

  for (const tryModel of modelsToTry) {
    for (let rateAttempt = 0; rateAttempt < 3; rateAttempt++) {
      const stallWatchdog = createStallWatchdog(stallTimeoutMs, signal);
      const requestSignal = mergeAbortSignals(signal, stallWatchdog.signal);

      try {
        console.time("GeminiCall");
        trace?.(`gemini ${tryModel}: streaming…`);

        const responseStream = await ai.models.generateContentStream({
          model: tryModel,
          contents: user,
          config: {
            systemInstruction: system,
            temperature: 0.35,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
            abortSignal: requestSignal,
          },
        });

        let accumulated = "";
        let chunks = 0;

        try {
          for await (const chunk of responseStream) {
            if (requestSignal.aborted) break;
            stallWatchdog.bump();
            const piece = chunk.text ?? "";
            if (piece) {
              accumulated += piece;
              chunks += 1;
            }
          }
        } catch (streamErr) {
          if (accumulated.trim()) {
            trace?.(
              `gemini ${tryModel}: stream ended early after ${chunks} chunks (${accumulated.length} chars)`,
            );
          } else {
            throw streamErr;
          }
        }

        console.timeEnd("GeminiCall");
        const text = accumulated.trim();
        if (text) {
          trace?.(`gemini ${tryModel}: ${chunks} chunks, ${text.length} chars`);
          return { ok: true, text };
        }
        lastDetail = `${tryModel}: empty stream`;
        lastStatus = 500;
        trace?.(`gemini ${tryModel}: empty stream`);
        break;
      } catch (err) {
        console.timeEnd("GeminiCall");
        console.error("GEMINI_ERROR_DEBUG:", err);
        if (err instanceof Error && (err.name === "AbortError" || requestSignal.aborted)) {
          return { ok: false, status: 408, detail: "timeout" };
        }

        const status = (err as { status?: number }).status ?? 500;
        const detail = err instanceof Error ? err.message : String(err);
        lastDetail = `${tryModel}: ${detail}`;
        lastStatus = isRateLimitDetail(detail) ? 429 : status;

        if (lastStatus === 429 && rateAttempt < 2) {
          const waitMs = parseRetryDelayMs(detail);
          trace?.(`gemini ${tryModel}: rate limit — retry in ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }

        trace?.(`gemini ${tryModel} failed: ${lastDetail.slice(0, 200)}`);
        break;
      }
    }
  }

  return { ok: false, status: lastStatus, detail: lastDetail };
}

export async function generateJson<T>(opts: GenerateJsonOptions): Promise<JsonGenerateOutcome<T>> {
  const trace = opts.trace ?? (() => {});
  const provider = opts.provider ?? resolveProvider(opts.role);
  const model = opts.model ?? resolveModel(opts.role, provider);
  const label = opts.label ?? `${provider}/${model}`;
  const maxTokens = opts.maxTokens ?? (opts.role === "skeleton" ? 14_000 : 16_000);
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const envModelKey = opts.role === "skeleton" ? "SKELETON_MODEL" : "FULL_PLAN_MODEL";
  const explicitModel = opts.model ?? process.env[envModelKey]?.trim();
  const allowModelFallback = provider === "google" && !explicitModel;

  const key = apiKeyFor(provider);
  if (!key && provider !== "google") {
    trace(`${provider} API key missing`);
    return { data: null, httpStatus: 401, detail: `${provider} API key missing` };
  }
  if (provider === "google" && !geminiApiKey()) {
    trace("GEMINI_API_KEY missing");
    return { data: null, httpStatus: 401, detail: "GEMINI_API_KEY missing" };
  }

  const startedAt = Date.now();
  trace(`→ ${label}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const actualModel = opts.model ?? resolveModel(opts.role, provider);

    let result: LlmCallResult;

    if (provider === "anthropic") {
      result = await callAnthropic(key!, actualModel, opts.system, opts.user, maxTokens, controller.signal);
    } else if (provider === "google") {
      result = await callGoogle(
        actualModel,
        opts.system,
        opts.user,
        maxTokens,
        controller.signal,
        trace,
        allowModelFallback,
      );
    } else {
      result = await callOpenAi(key!, actualModel, opts.system, opts.user, maxTokens, controller.signal, opts.images);
    }

    if (!result.ok) {
      trace(`← ${label} error ${result.status}${result.detail ? ` — ${result.detail.slice(0, 200)}` : ""}`);
      return { data: null, httpStatus: result.status, detail: result.detail };
    }

    trace(`← ${label} ok in ${Date.now() - startedAt}ms, ${result.text.length} chars`);
    console.time("GeminiJsonParse");
    const parsed = parseLlmJson<T>(result.text);
    console.timeEnd("GeminiJsonParse");
    if (!parsed) {
      trace(`← ${label} JSON parse failed (${result.text.length} chars)`);
    }
    return { data: parsed, httpStatus: 200 };
  } catch (err) {
    console.error("GEMINI_ERROR_DEBUG:", err);
    trace(`← ${label} fatal: ${err instanceof Error ? err.message : String(err)}`);
    return {
      data: null,
      httpStatus: 500,
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
