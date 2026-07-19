import { useCallback, useRef, useState } from "react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import { supabaseAuthHeaders } from "@/lib/supabaseAuthHeaders";
import {
  consumeNdjsonBuffer,
  flushNdjsonBuffer,
  isStreamEvent,
} from "@/lib/parseStreamNdjson";

/** Client safety net if the server stream stalls without closing. */
const CLIENT_STREAM_IDLE_MS = 100_000;

export type StreamItineraryStatus = "idle" | "streaming" | "done" | "error";

type StreamEvent =
  | { type: "partial"; plan: AiTripPlan; dayCount: number; expectedDays: number }
  | { type: "done"; plan: AiTripPlan }
  | { type: "error"; error: string };

function asStreamEvent(raw: unknown): StreamEvent | null {
  if (!isStreamEvent(raw)) return null;
  if (raw.type === "partial" || raw.type === "done" || raw.type === "error") {
    return raw as StreamEvent;
  }
  return null;
}

/**
 * Read NDJSON itinerary stream.
 *
 * Gemini JSON is assembled server-side via AI SDK `streamObject`; the client only
 * receives complete JSON objects, one per line. We append raw chunks to a buffer
 * and parse only when a full line is present AND structurally complete
 * (`parsePartialJson` — never JSON.parse on a raw chunk).
 */
export function useStreamItinerary() {
  const [previewPlan, setPreviewPlan] = useState<AiTripPlan | null>(null);
  const [finalPlan, setFinalPlan] = useState<AiTripPlan | null>(null);
  const [status, setStatus] = useState<StreamItineraryStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [expectedDays, setExpectedDays] = useState(0);
  const [streamedDayCount, setStreamedDayCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback(
    async (
      input: GenerateGeminiProTripInput,
    ): Promise<{ plan: AiTripPlan | null; error: string | null }> => {
      abort();
      const controller = new AbortController();
      abortRef.current = controller;
      let idleTimedOut = false;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;

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

      setStatus("streaming");
      setPreviewPlan(null);
      setFinalPlan(null);
      setError(null);
      setExpectedDays(0);
      setStreamedDayCount(0);

      let resolvedPlan: AiTripPlan | null = null;
      let lastPartialPlan: AiTripPlan | null = null;
      let streamError: string | null = null;
      /** Accumulator — only this string is parsed, never individual chunks. */
      let ndjsonBuffer = "";

      const finishWithPartial = (warn: string) => {
        if (!lastPartialPlan?.days?.length) return null;
        setFinalPlan(lastPartialPlan);
        setPreviewPlan(lastPartialPlan);
        setStatus("done");
        setError(warn);
        return { plan: lastPartialPlan, error: warn };
      };

      const handleEvent = (event: StreamEvent): "stop" | "continue" => {
        if (event.type === "partial") {
          lastPartialPlan = event.plan;
          setPreviewPlan(event.plan);
          setStreamedDayCount(event.dayCount);
          setExpectedDays(event.expectedDays);
          return "continue";
        }
        if (event.type === "done") {
          resolvedPlan = event.plan;
          lastPartialPlan = event.plan;
          setFinalPlan(event.plan);
          setPreviewPlan(event.plan);
          setStreamedDayCount(event.plan.days.length);
          setExpectedDays(event.plan.days.length);
          return "continue";
        }
        streamError = event.error;
        const partial = finishWithPartial(
          `${event.error} — prikazan je delni načrt.`,
        );
        if (partial) return "stop";
        setError(event.error);
        setStatus("error");
        return "stop";
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

      const stopResult = (): { plan: AiTripPlan | null; error: string | null } => {
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

          // Append only — parse happens in drainBuffer after full lines arrive.
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
        if (controller.signal.aborted) {
          if (idleTimedOut) {
            const warn =
              "Generiranje se je predolgo ustavilo brez napredka. Poskusi znova.";
            const partial = finishWithPartial(`${warn} — prikazan je delni načrt.`);
            if (partial) return partial;
            setError(warn);
            setStatus("error");
            return { plan: null, error: warn };
          }
          setStatus("idle");
          return { plan: null, error: null };
        }

        if (lastPartialPlan?.days?.length) {
          const warn =
            err instanceof Error
              ? `Povezava prekinjena (${err.message}) — prikazan je delni načrt.`
              : "Povezava prekinjena — prikazan je delni načrt.";
          return finishWithPartial(warn) ?? { plan: null, error: warn };
        }

        const message =
          err instanceof Error ? err.message : "Napaka pri stream generiranju načrta.";
        setError(message);
        setStatus("error");
        return { plan: null, error: message };
      } finally {
        clearIdle();
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [abort],
  );

  const reset = useCallback(() => {
    abort();
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
