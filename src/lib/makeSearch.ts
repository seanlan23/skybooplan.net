import type { HeroChatAttachmentPayload } from "@/lib/heroChatAttachment";
import { parseHeroChatAttachment } from "@/lib/heroChatAttachment";

export type MakeSearchFlight = {
  id: string;
  destinacija: string;
  cena_eur: number;
  odhod: string;
  prevoznik: string;
  postanki: string;
  ai_povzetek: string;
  booking_url?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/[^\d.,-]/g, "").replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function formatPostanki(record: Record<string, unknown>): string {
  const raw = record.postanki ?? record.stops ?? record.stop_count;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw === 0) return "0";
    return String(raw);
  }
  return "";
}

function extractFlightArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  if (!record) return [];

  for (const key of ["flights", "results", "data", "items", "body", "output"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }

  if (readString(record, "destinacija", "destination")) {
    return [record];
  }

  return [];
}

function parseFlightItem(item: unknown, index: number): MakeSearchFlight | null {
  const record = asRecord(item);
  if (!record) return null;

  const destinacija = readString(record, "destinacija", "destination", "dest");
  const prevoznik = readString(record, "prevoznik", "carrier", "airline");
  const odhod = readString(record, "odhod", "departure", "depart");
  const ai_povzetek = readString(record, "ai_povzetek", "summary", "ai_summary", "povzetek");

  if (!destinacija && !prevoznik && !odhod) return null;

  const booking_url = readString(record, "booking_url", "url", "link", "rezervacija_url") || undefined;

  return {
    id: readString(record, "id") || `flight-${index}`,
    destinacija: destinacija || "—",
    cena_eur: readNumber(record, "cena_eur", "price_eur", "price", "cena"),
    odhod: odhod || "—",
    prevoznik: prevoznik || "—",
    postanki: formatPostanki(record),
    ai_povzetek,
    booking_url,
  };
}

export function parseMakeSearchFlights(data: unknown): MakeSearchFlight[] {
  return extractFlightArray(data)
    .map((item, index) => parseFlightItem(item, index))
    .filter((item): item is MakeSearchFlight => item != null);
}

export type SearchRequestBody = {
  query: string;
  attachment?: HeroChatAttachmentPayload;
};

export function parseSearchRequestBody(body: unknown): SearchRequestBody | null {
  const record = asRecord(body);
  if (!record) return null;
  const query = record.query;
  if (typeof query !== "string" || !query.trim()) return null;

  let attachment: HeroChatAttachmentPayload | undefined;
  if (record.attachment != null) {
    const parsed = parseHeroChatAttachment(record.attachment);
    if (!parsed) return null;
    attachment = parsed;
  }

  return { query: query.trim(), attachment };
}

export type MakeWebhookParseResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; raw: string };

export const MAKE_WEBHOOK_ASYNC_CODE = "MAKE_WEBHOOK_ASYNC";

function isAsyncAckText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === "accepted" || normalized === "ok";
}

/**
 * Make.com instant webhooks often return plain text "Accepted" (HTTP 200/202)
 * when the scenario runs asynchronously instead of returning JSON results.
 * Fix in Make: Webhook → "Immediately as data arrives" + Webhook response module.
 */
export function parseMakeWebhookBody(text: string, httpStatus: number): MakeWebhookParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, data: {} };
  }

  if (httpStatus === 202 || isAsyncAckText(trimmed)) {
    return {
      ok: true,
      data: buildMakeAsyncPayload(trimmed || "Accepted"),
    };
  }

  try {
    return { ok: true, data: JSON.parse(trimmed) as unknown };
  } catch {
    if (httpStatus >= 200 && httpStatus < 300) {
      return {
        ok: true,
        data: buildMakeAsyncPayload(trimmed),
      };
    }
    return {
      ok: false,
      error: "Make webhook je vrnil neveljaven JSON.",
      raw: trimmed.slice(0, 500),
    };
  }
}

export function buildMakeAsyncPayload(message: string): Record<string, unknown> {
  return {
    accepted: true,
    async: true,
    code: MAKE_WEBHOOK_ASYNC_CODE,
    message,
    flights: [],
    hint:
      "Make.com webhook must run synchronously: set trigger to “Immediately as data arrives” and add a Webhook response module that returns JSON.",
  };
}

export function isMakeAsyncAccepted(data: unknown): boolean {
  const record = asRecord(data);
  if (!record) return false;
  if (record.code === MAKE_WEBHOOK_ASYNC_CODE) return true;
  if (record.async === true) return true;
  return record.accepted === true && !Array.isArray(record.flights);
}
