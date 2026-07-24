/** Max wait for external HTTP APIs (Google Places, Unsplash). */
export const HTTP_API_TIMEOUT_MS = 30_000;

/** Max wait for Gemini structured generation (single LLM call). */
export const GEMINI_GENERATION_TIMEOUT_MS = 180_000;

/** Abort itinerary stream if Gemini goes silent between partials. */
export const GEMINI_STREAM_STALL_MS = 120_000;

/** Absolute max for one itinerary stream (stall may fire earlier). Keep under Vercel 300s. */
export const GEMINI_STREAM_HARD_MS = 280_000;

/** Combine abort signals — aborts when any source signal aborts. */
export function mergeAbortSignals(...signals: AbortSignal[]): AbortSignal {
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

export type StallWatchdog = { signal: AbortSignal; bump: () => void; clear: () => void };

/** Stall watchdog — aborts only when the upstream stream goes silent. */
export function createStallWatchdog(stallMs: number, parent: AbortSignal): StallWatchdog {
  const stall = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const bump = () => {
    clear();
    timer = setTimeout(() => stall.abort(), stallMs);
  };

  const onParentAbort = () => {
    clear();
    stall.abort();
  };
  parent.addEventListener("abort", onParentAbort, { once: true });
  if (parent.aborted) onParentAbort();
  else bump();

  return { signal: stall.signal, bump, clear };
}

export class OperationTimeoutError extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`[timeout] ${label} exceeded ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

/** Race a promise against a deadline — rejects with OperationTimeoutError. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new OperationTimeoutError(label, timeoutMs)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** fetch() with AbortController deadline. */
export async function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit & { timeoutMs?: number; label?: string },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? HTTP_API_TIMEOUT_MS;
  const label = init?.label ?? String(url).slice(0, 96);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _t, label: _l, ...rest } = init ?? {};

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new OperationTimeoutError(label, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded parallel pool — avoids unbounded Promise.all stampedes. */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await fn(items[i]!, i);
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}

export function pipelineLog(step: string, detail?: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[GeminiProPipeline ${ts}] ${step}${detail ? ` — ${detail}` : ""}`);
}

/** Logged pipeline step with optional timeout wrapper. */
export async function pipelineStep<T>(
  step: string,
  fn: () => Promise<T>,
  timeoutMs?: number,
): Promise<T> {
  pipelineLog(`▶ START ${step}`);
  const start = performance.now();
  try {
    const work = fn();
    const result =
      timeoutMs != null ? await withTimeout(work, timeoutMs, step) : await work;
    pipelineLog(`✓ DONE ${step}`, `${Math.round(performance.now() - start)}ms`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pipelineLog(`✗ FAIL ${step}`, `${Math.round(performance.now() - start)}ms — ${msg}`);
    throw err;
  }
}

/** Safe JSON.parse with typed error — for raw LLM string payloads. */
export function safeJsonParse<T = unknown>(
  raw: string,
  label: string,
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const value = JSON.parse(raw) as T;
    return { ok: true, value };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GeminiProPipeline] JSON.parse failed (${label}):`, msg);
    return { ok: false, error: msg };
  }
}
