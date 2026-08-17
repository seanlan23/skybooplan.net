import { useCallback, useEffect, useRef, useState } from "react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  hasAcceptablePlanDayCoverage,
  incompletePlanDayCoverageMessage,
  tripDayCount,
  type GenerateGeminiProTripInput,
} from "@/lib/geminiPro.functions";
import { applyFlightContextIfPresent } from "@/lib/geminiProCatalog";
import { supabaseAuthHeaders } from "@/lib/supabaseAuthHeaders";
import {
  consumeNdjsonBuffer,
  flushNdjsonBuffer,
  isStreamEvent,
} from "@/lib/parseStreamNdjson";
import { patchSessionAiPlan } from "@/lib/sessionStore";
import { classifyStreamAbort, waitUntilDocumentVisible } from "@/lib/streamAbort";

function sanitizeStreamPlan(
  plan: AiTripPlan,
  input: GenerateGeminiProTripInput,
): AiTripPlan {
  if (!input.flightContext || input.groundTransportMode) return plan;
  const next = structuredClone(plan);
  applyFlightContextIfPresent(next, input);
  return next;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof Error && err.name === "AbortError";
}

function isTransientDisconnect(err: unknown): boolean {
  if (isAbortError(err)) return true;
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    err.name === "TypeError" ||
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("networkerror")
  );
}

/**
 * Must exceed Gemini pauses between new days. Server pings every 20s once the
 * stream starts; this is a backstop if the proxy drops keepalive bytes.
 */
const CLIENT_STREAM_IDLE_MS = 240_000;
const MAX_CONNECTION_RETRIES = 1;

export type StreamItineraryStatus = "idle" | "streaming" | "done" | "error";

type StreamEvent =
  | { type: "partial"; plan: AiTripPlan; dayCount: number; expectedDays: number }
  | { type: "ping"; dayCount: number; expectedDays: number }
  | { type: "done"; plan: AiTripPlan }
  | { type: "error"; error: string };

function asStreamEvent(raw: unknown): StreamEvent | null {
  if (!isStreamEvent(raw)) return null;
  if (
    raw.type === "partial" ||
    raw.type === "ping" ||
    raw.type === "done" ||
    raw.type === "error"
  ) {
    return raw as StreamEvent;
  }
  return null;
}

export type StreamItineraryResult = {
  plan: AiTripPlan | null;
  error: string | null;
  cancelled?: boolean;
};

/**
 * Read NDJSON itinerary stream.
 *
 * Gemini JSON is assembled server-side via AI SDK `streamObject`; the client only
 * receives complete JSON objects, one per line. We append raw chunks to a buffer
 * and parse only when a full line is present AND structurally complete
 * (`parsePartialJson` — never JSON.parse on a raw chunk).
 *
 * Screen lock / iOS Safari abort the fetch. We persist the preview immediately,
 * wait until the tab is visible, then retry the stream once.
 */
export function useStreamItinerary() {
  const [previewPlan, setPreviewPlan] = useState<AiTripPlan | null>(null);
  const [finalPlan, setFinalPlan] = useState<AiTripPlan | null>(null);
  const [status, setStatus] = useState<StreamItineraryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [expectedDays, setExpectedDays] = useState(0);
  const [streamedDayCount, setStreamedDayCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const userAbortRef = useRef(false);
  const generationRef = useRef(0);
  const previewRef = useRef<AiTripPlan | null>(null);
  previewRef.current = previewPlan;

  const abort = useCallback((origin: "user" | "replace" = "user") => {
    if (origin === "user") userAbortRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flush = () => {
      const plan = previewRef.current;
      if (plan?.days?.length) patchSessionAiPlan(plan);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const start = useCallback(
    async (input: GenerateGeminiProTripInput): Promise<StreamItineraryResult> => {
      const generation = ++generationRef.current;
      const isCurrent = () => generationRef.current === generation;
      userAbortRef.current = false;
      abort("replace");

      const expectedFromInput = tripDayCount(input.departDate, input.returnDate);

      setStatus("streaming");
      setPreviewPlan(null);
      setFinalPlan(null);
      setError(null);
      setExpectedDays(expectedFromInput);
      setStreamedDayCount(0);

      let resolvedPlan: AiTripPlan | null = null;
      let lastPartialPlan: AiTripPlan | null = null;
      let streamError: string | null = null;

      const persistPreview = (plan: AiTripPlan) => {
        lastPartialPlan = plan;
        previewRef.current = plan;
        patchSessionAiPlan(plan);
      };

      const rejectIncomplete = (plan: AiTripPlan, warn: string) => {
        setPreviewPlan(plan);
        setStreamedDayCount(plan.days.length);
        setExpectedDays(expectedFromInput);
        setFinalPlan(null);
        setError(warn);
        setStatus("error");
        return { plan: null as AiTripPlan | null, error: warn };
      };

      const finishWithPartial = (warn: string) => {
        if (!lastPartialPlan?.days?.length) return null;
        if (
          !hasAcceptablePlanDayCoverage(lastPartialPlan.days.length, expectedFromInput)
        ) {
          return rejectIncomplete(
            lastPartialPlan,
            incompletePlanDayCoverageMessage(
              lastPartialPlan.days.length,
              expectedFromInput,
            ),
          );
        }
        setFinalPlan(lastPartialPlan);
        setPreviewPlan(lastPartialPlan);
        setExpectedDays(expectedFromInput);
        setStatus("done");
        setError(warn);
        return { plan: lastPartialPlan, error: warn };
      };

      const handleEvent = (event: StreamEvent): "stop" | "continue" => {
        if (event.type === "ping") {
          setStreamedDayCount(event.dayCount);
          setExpectedDays(event.expectedDays || expectedFromInput);
          return "continue";
        }
        if (event.type === "partial") {
          const plan = sanitizeStreamPlan(event.plan, input);
          persistPreview(plan);
          setPreviewPlan(plan);
          setStreamedDayCount(event.dayCount);
          setExpectedDays(event.expectedDays || expectedFromInput);
          return "continue";
        }
        if (event.type === "done") {
          const plan = sanitizeStreamPlan(event.plan, input);
          persistPreview(plan);
          setPreviewPlan(plan);
          setStreamedDayCount(plan.days.length);
          setExpectedDays(expectedFromInput);
          if (!hasAcceptablePlanDayCoverage(plan.days.length, expectedFromInput)) {
            streamError = incompletePlanDayCoverageMessage(
              plan.days.length,
              expectedFromInput,
            );
            setFinalPlan(null);
            setError(streamError);
            setStatus("error");
            return "stop";
          }
          resolvedPlan = plan;
          setFinalPlan(plan);
          return "continue";
        }
        streamError = event.error;
        if (
          lastPartialPlan?.days?.length &&
          !hasAcceptablePlanDayCoverage(lastPartialPlan.days.length, expectedFromInput)
        ) {
          rejectIncomplete(
            lastPartialPlan,
            incompletePlanDayCoverageMessage(
              lastPartialPlan.days.length,
              expectedFromInput,
            ),
          );
          return "stop";
        }
        const partial = finishWithPartial(
          `${event.error} — prikazan je delni načrt.`,
        );
        if (partial) return "stop";
        setError(event.error);
        setStatus("error");
        return "stop";
      };

      for (let attempt = 0; attempt <= MAX_CONNECTION_RETRIES; attempt++) {
        if (!isCurrent() || userAbortRef.current) {
          if (isCurrent()) setStatus("idle");
          return { plan: null, error: null, cancelled: true };
        }

        const controller = new AbortController();
        abortRef.current = controller;
        let idleTimedOut = false;
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        let ndjsonBuffer = "";
        resolvedPlan = null;
        streamError = null;

        const clearIdle = () => {
          if (idleTimer !== undefined) clearTimeout(idleTimer);
          idleTimer = undefined;
        };

        const bumpIdle = () => {
          clearIdle();
          idleTimer = setTimeout(() => {
            idleTimedOut = true;
            controller.abort();
          }, CLIENT_STREAM_IDLE_MS);
        };

        const drainBuffer = (): "stop" | "continue" => {
          const { events, remainder } = consumeNdjsonBuffer(ndjsonBuffer);
          ndjsonBuffer = remainder;

          for (const raw of events) {
            const event = asStreamEvent(raw);
            if (!event) continue;
            if (handleEvent(event) === "stop") return "stop";
          }
          return "continue";
        };

        const stopResult = (): StreamItineraryResult => {
          if (resolvedPlan) {
            setStatus("done");
            return { plan: resolvedPlan, error: streamError };
          }
          if (lastPartialPlan?.days?.length) {
            return (
              finishWithPartial(
                streamError
                  ? `${streamError} — prikazan je delni načrt.`
                  : "Stream se je končal pred končnim načrtom — prikazan je delni načrt.",
              ) ?? { plan: null, error: streamError }
            );
          }
          setError(streamError);
          setStatus("error");
          return { plan: null, error: streamError };
        };

        try {
          bumpIdle();
          const res = await fetch("/api/generate-itinerary", {
            method: "POST",
            headers: await supabaseAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(input),
            signal: controller.signal,
          });

          if (!res.ok) {
            let message = `Strežnik vrnil ${res.status}`;
            try {
              const errBody = (await res.json()) as { error?: string };
              if (errBody.error) message = errBody.error;
            } catch {
              /* ignore non-JSON error body */
            }
            throw new Error(message);
          }

          if (!res.body) throw new Error("Prazen odgovor strežnika.");

          const reader = res.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            bumpIdle();
            const { done, value } = await reader.read();
            if (done) break;

            ndjsonBuffer += decoder.decode(value, { stream: true });
            if (drainBuffer() === "stop") {
              return stopResult();
            }
          }

          ndjsonBuffer += decoder.decode();
          if (drainBuffer() === "stop") {
            return stopResult();
          }

          const trailing = flushNdjsonBuffer(ndjsonBuffer);
          ndjsonBuffer = "";
          if (trailing) {
            const event = asStreamEvent(trailing);
            if (event && handleEvent(event) === "stop") {
              return stopResult();
            }
          }

          if (resolvedPlan) {
            setStatus("done");
            return { plan: resolvedPlan, error: null };
          }

          if (lastPartialPlan?.days?.length) {
            return (
              finishWithPartial(
                "Stream se je končal pred končnim načrtom — prikazan je delni načrt.",
              ) ?? { plan: null, error: "Stream se je končal brez končnega načrta." }
            );
          }

          const fallbackError = streamError ?? "Stream se je končal brez končnega načrta.";
          setError(fallbackError);
          setStatus("error");
          return { plan: null, error: fallbackError };
        } catch (err) {
          if (!isCurrent()) {
            return { plan: null, error: null, cancelled: true };
          }

          const aborted = controller.signal.aborted || isAbortError(err);
          const kind = classifyStreamAbort({
            aborted,
            userAborted: userAbortRef.current,
            idleTimedOut,
          });

          if (kind === "user") {
            if (isCurrent()) setStatus("idle");
            return { plan: null, error: null, cancelled: true };
          }

          if (kind === "idle") {
            const warn = "error.planTimeout";
            const partial = finishWithPartial(`${warn} — prikazan je delni načrt.`);
            if (partial) return partial;
            setError(warn);
            setStatus("error");
            return { plan: null, error: warn };
          }

          const canRetry =
            isCurrent() &&
            attempt < MAX_CONNECTION_RETRIES &&
            !userAbortRef.current &&
            (kind === "connection" || isTransientDisconnect(err));

          if (canRetry) {
            const waitController = new AbortController();
            abortRef.current = waitController;
            try {
              await waitUntilDocumentVisible(waitController.signal);
            } catch {
              if (isCurrent()) setStatus("idle");
              return { plan: null, error: null, cancelled: true };
            }
            if (userAbortRef.current || !isCurrent()) {
              if (isCurrent()) setStatus("idle");
              return { plan: null, error: null, cancelled: true };
            }
            continue;
          }

          if (lastPartialPlan?.days?.length) {
            const warn =
              err instanceof Error
                ? `Povezava prekinjena (${err.message}) — prikazan je delni načrt.`
                : "Povezava prekinjena — prikazan je delni načrt.";
            return finishWithPartial(warn) ?? { plan: null, error: warn };
          }

          const message =
            kind === "connection" || isTransientDisconnect(err)
              ? "error.planInterrupted"
              : err instanceof Error
                ? err.message
                : "Napaka pri stream generiranju načrta.";
          setError(message);
          setStatus("error");
          return { plan: null, error: message };
        } finally {
          clearIdle();
          if (abortRef.current === controller) abortRef.current = null;
        }
      }

      setError("error.planInterrupted");
      setStatus("error");
      return { plan: null, error: "error.planInterrupted" };
    },
    [abort],
  );

  const reset = useCallback(() => {
    generationRef.current += 1;
    abort("user");
    setPreviewPlan(null);
    setFinalPlan(null);
    setStatus("idle");
    setError(null);
    setExpectedDays(0);
    setStreamedDayCount(0);
  }, [abort]);

  return {
    previewPlan,
    finalPlan,
    status,
    error,
    expectedDays,
    streamedDayCount,
    isStreaming: status === "streaming",
    start,
    abort,
    reset,
  };
}
