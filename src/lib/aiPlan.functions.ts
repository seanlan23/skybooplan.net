import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  destinationIata: z.string().min(2).max(80),
  originIata: z.string().min(2).max(80),
  departDate: z.string().min(10).max(10),
  returnDate: z.string().min(10).max(10).optional().or(z.literal("")),
  pax: z.number().min(1).max(9),
  language: z.string().min(2).max(5).optional(),
  pace: z.enum(["intensive", "relaxed", "calm"]).optional(),
  wishes: z.string().max(2000).optional(),
  customPrompt: z.string().max(8000).optional(),
  mode: z.enum(["trip", "stays"]).optional(),
});

export type DayCategory = "stay" | "eat" | "activity" | "sight" | "transport" | "beach" | "nature";

export type Activity = {
  name: string;
  type?: string;
  price?: string;
  priceLabel?: string;
  description: string;
};

export type Suggestion = {
  name: string;
  description: string;
  priceLabel: string;
};

export type DayTransport = {
  type: string;
  duration: string;
  cost: string;
  description: string;
};

export type DayPlan = {
  day: number;
  date: string;
  title: string;
  morning: string;
  afternoon: string;
  evening: string;
  activities?: {
    morning?: Activity[];
    afternoon?: Activity[];
    evening?: Activity[];
  };
  suggestions?: Suggestion[];
  transport?: DayTransport;
  travelHack: string;
  transportationTips: string;
  localWarnings: string;
  dailyBudgetEur: number;
  lat: number;
  lng: number;
  focusName: string;
  city: string;
  category: DayCategory;
};

export type AiTripPlan = {
  destinationName: string;
  summary: string;
  totalBudgetEur: number;
  centerLat: number;
  centerLng: number;
  days: DayPlan[];
  originIata?: string;
  destinationIata?: string;
};

export type GenerateAiPlanResult = {
  plan: AiTripPlan | null;
  error: string | null;
  errorCode?:
    | "REGISTER_REQUIRED"
    | "PAYMENT_REQUIRED"
    | "DAILY_LIMIT"
    | "INVALID_ITINERARY"
    | null;
  quota?: { tier: string; remaining: number };
  violations?: { rule: string; message: string; dayNumbers: number[] }[];
  debug?: string[];
};

const OPENAI_BASE = "https://api.openai.com/v1";
const ASSISTANT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const BATCH_THRESHOLD_DAYS = 8;

/** Known city anchors — used to validate/fix AI coordinates after the assistant responds. */
const CITY_ANCHORS: Record<
  string,
  { name: string; lat: number; lng: number; bbox: [number, number, number, number] }
> = {
  BER: { name: "Berlin", lat: 52.52, lng: 13.405, bbox: [13.05, 52.25, 13.75, 52.7] },
  LJU: { name: "Ljubljana", lat: 46.051, lng: 14.505, bbox: [14.35, 45.95, 14.65, 46.15] },
  VIE: { name: "Vienna", lat: 48.208, lng: 16.373, bbox: [16.1, 48.05, 16.65, 48.35] },
  PAR: { name: "Paris", lat: 48.857, lng: 2.352, bbox: [2.1, 48.7, 2.55, 48.95] },
  LON: { name: "London", lat: 51.507, lng: -0.128, bbox: [-0.5, 51.3, 0.3, 51.7] },
  BKK: { name: "Bangkok", lat: 13.756, lng: 100.502, bbox: [100.3, 13.5, 100.9, 14.0] },
  MXP: { name: "Milan", lat: 45.465, lng: 9.19, bbox: [8.8, 45.3, 9.5, 45.6] },
};

const CLOSED_AIRPORTS = [
  { pattern: /tegel|txl|flughafen berlin-tegel/gi, replacement: "Berlin Brandenburg Airport (BER)" },
  { pattern: /donaldson|berlin schönefeld(?!\s*\(ber\))/gi, replacement: "Berlin Brandenburg Airport (BER)" },
];

const LANG_MAP: Record<string, string> = {
  sl: "slovenščini", en: "English", de: "Deutsch", it: "italiano", fr: "français", es: "español",
};

function daysBetween(a: string, b?: string) {
  if (!b) return 5;
  const d1 = new Date(`${a}T00:00:00Z`).getTime();
  const d2 = new Date(`${b}T00:00:00Z`).getTime();
  return Math.max(1, Math.min(21, Math.round((d2 - d1) / 86_400_000)));
}

function isoDateAtOffset(base: string, offset: number) {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type BatchHandoff = {
  visitedCities: string[];
  lastCity: string;
  lastFocusName: string;
  remainingBudgetEur: number;
};

/** Minimal trip context — all instructions live in the OpenAI Assistant. */
function buildTripRequestMessage(opts: {
  originIata: string;
  destinationIata: string;
  departDate: string;
  returnDate?: string;
  nDays: number;
  startDay: number;
  endDay: number;
  pax: number;
  lang: string;
  paceLabel: string;
  isStays: boolean;
  wishes?: string;
  customPrompt?: string;
  handoff?: BatchHandoff;
  routingRepair?: string;
}) {
  const batchDays = opts.endDay - opts.startDay + 1;
  const lines = [
    opts.startDay === 1
      ? `Generate days ${opts.startDay}-${opts.endDay} of a ${opts.nDays}-day itinerary.`
      : `Continue the existing ${opts.nDays}-day itinerary — generate ONLY days ${opts.startDay}-${opts.endDay}.`,
    "",
    `Origin: ${opts.originIata}`,
    `Destination: ${opts.destinationIata}`,
    `Depart date: ${opts.departDate}`,
    opts.returnDate ? `Return date: ${opts.returnDate}` : `Trip length: ${opts.nDays} days`,
    `Travelers: ${opts.pax}`,
    `Pace: ${opts.paceLabel}`,
    `Language (all text): ${opts.lang}`,
    `Mode: ${opts.isStays ? "stays" : "trip"}`,
  ];
  if (opts.wishes?.trim()) lines.push(`User wishes: ${opts.wishes.trim()}`);
  if (opts.customPrompt?.trim()) lines.push(`Extra instructions: ${opts.customPrompt.trim()}`);

  if (opts.startDay === 1 || opts.handoff) {
    lines.push(
      "",
      "GEOGRAPHIC ROUTING (CRITICAL — ping-pong plans are rejected):",
      "- Cluster by region: finish ALL days in one area before moving forward.",
      "- Linear flow ONLY: A → B → C. NEVER revisit a city after leaving it.",
      "- Exception: final 1–2 days may return to the departure city ONLY for the outbound flight.",
      "- WRONG: Bangkok → Chiang Mai → Bangkok → Chiang Mai → Koh Samui → Chiang Mai (ping-pong).",
      "- RIGHT: Bangkok → Chiang Mai → Krabi → Koh Samui → Phi Phi → Phuket → Bangkok (departure).",
    );
  }

  if (opts.handoff) {
    lines.push(
      "",
      "STATE HANDOFF — continue from previous batch (do NOT restart the trip):",
      `- Cities visited in order: ${opts.handoff.visitedCities.join(" → ")}.`,
      `- Traveler is currently in "${opts.handoff.lastCity}" (base: "${opts.handoff.lastFocusName}").`,
      `- Day ${opts.startDay} must start in "${opts.handoff.lastCity}".`,
      `- Remaining budget ~${Math.max(0, Math.round(opts.handoff.remainingBudgetEur))} EUR.`,
      `- FORBIDDEN to return to: ${opts.handoff.visitedCities.join(", ")} (except departure city on last day for flight home).`,
    );
  }

  if (opts.routingRepair?.trim()) {
    lines.push("", opts.routingRepair.trim());
  }

  lines.push(
    "",
    `Cover exactly ${batchDays} day object(s): days ${opts.startDay}-${opts.endDay}.`,
    `Dates: ${isoDateAtOffset(opts.departDate, opts.startDay - 1)} → ${isoDateAtOffset(opts.departDate, opts.endDay - 1)}.`,
    "Return ONE JSON object (destinationName, summary, totalBudgetEur, centerLat, centerLng, days[]).",
  );

  if (opts.startDay === 1) {
    lines.push(
      "",
      "SUMMARY REQUIREMENT (shown prominently at top of the plan):",
      "Write `destinationName` as the country or region name (e.g. 'Tajska', 'Berlin').",
      "Write `summary` as a rich 4–8 sentence narrative in the requested language — NOT a bullet list.",
      "Describe the full route city by city in order, what the traveler does in each place, and how the trip ends.",
      "Example style (Slovenian): 'Potovanje se začne v Bangkoku, kjer raziskujete znamenitosti, kot so Velika palača in Wat Pho. Sledi pot v Ayutthayo... Potovanje se konča na Phuketu... Vrnitev v Bangkok za odhod.'",
    );
  }

  return lines.join("\n");
}

function sanitizeOutdatedText(text: string): string {
  let out = text;
  for (const { pattern, replacement } of CLOSED_AIRPORTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function isValidCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function inBbox(lng: number, lat: number, bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

async function geocodeMapbox(query: string, token: string): Promise<[number, number] | null> {
  try {
    const q = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?types=place,locality,neighborhood,poi,address&limit=1&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
    const c = data.features?.[0]?.center;
    if (!c || c.length !== 2) return null;
    const [lng, lat] = c;
    return isValidCoord(lat, lng) ? [lng, lat] : null;
  } catch {
    return null;
  }
}

function normalizeActivity(a: unknown): Activity {
  const o = (a ?? {}) as Record<string, unknown>;
  return {
    name: sanitizeOutdatedText(textValue(o.name, textValue(o.type, "Aktivnost"))),
    type: textValue(o.type, "activity"),
    price: textValue(o.price, "Free"),
    priceLabel: textValue(o.priceLabel, textValue(o.price, "")),
    description: sanitizeOutdatedText(textValue(o.description)),
  };
}

function activitiesToMarkdown(activities: Activity[] | undefined) {
  if (!activities?.length) return "";
  return activities
    .map((a) => {
      const badges = [a.type, a.price || a.priceLabel].filter(Boolean).join(" · ");
      return `- **${a.name}**${badges ? ` (${badges})` : ""}${a.description ? `: ${a.description}` : ""}`;
    })
    .join("\n\n");
}

function normalizeDay(dayRaw: unknown, fallbackDay: number, departDate: string): DayPlan {
  const raw = (dayRaw ?? {}) as Record<string, unknown>;
  const slotSource = (raw.activities ?? {}) as Record<string, unknown>;
  const activities = {
    morning: Array.isArray(slotSource.morning) ? slotSource.morning.slice(0, 2).map((a) => normalizeActivity(a)) : [],
    afternoon: Array.isArray(slotSource.afternoon) ? slotSource.afternoon.slice(0, 1).map((a) => normalizeActivity(a)) : [],
    evening: Array.isArray(slotSource.evening) ? slotSource.evening.slice(0, 1).map((a) => normalizeActivity(a)) : [],
  };
  const day = numberValue(raw.day, fallbackDay);
  const allowed: DayCategory[] = ["stay", "eat", "activity", "sight", "transport", "beach", "nature"];
  const category = allowed.includes(raw.category as DayCategory) ? (raw.category as DayCategory) : "activity";
  const city = sanitizeOutdatedText(textValue(raw.city));
  const focusName = sanitizeOutdatedText(textValue(raw.focusName, city));
  const title = sanitizeOutdatedText(textValue(raw.title, `Dan ${day}`));

  return {
    day,
    date: textValue(raw.date, isoDateAtOffset(departDate, day - 1)),
    title,
    morning: activitiesToMarkdown(activities.morning),
    afternoon: activitiesToMarkdown(activities.afternoon),
    evening: activitiesToMarkdown(activities.evening),
    activities,
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.slice(0, 1).map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return {
            name: sanitizeOutdatedText(textValue(o.name, "Predlog")),
            description: sanitizeOutdatedText(textValue(o.description)),
            priceLabel: textValue(o.priceLabel, "moderate"),
          };
        })
      : [],
    transport: undefined,
    travelHack: sanitizeOutdatedText(textValue(raw.travelHack)),
    transportationTips: sanitizeOutdatedText(textValue(raw.transportationTips)),
    localWarnings: sanitizeOutdatedText(textValue(raw.localWarnings)),
    dailyBudgetEur: numberValue(raw.dailyBudgetEur, 0),
    lat: numberValue(raw.lat, 0),
    lng: numberValue(raw.lng, 0),
    focusName: focusName || city || title,
    city: city || focusName,
    category,
  };
}

async function enrichCoordinates(
  plan: AiTripPlan,
  destinationIata: string,
  trace: (msg: string) => void,
): Promise<AiTripPlan> {
  const token = process.env.MAPBOX_PUBLIC_TOKEN;
  const anchor = CITY_ANCHORS[destinationIata.toUpperCase()];
  const cache = new Map<string, [number, number]>();

  for (const day of plan.days) {
    const aiValid =
      isValidCoord(day.lat, day.lng) &&
      (!anchor || inBbox(day.lng, day.lat, anchor.bbox));

    if (aiValid) continue;

    const queries = [
      day.focusName && day.city ? `${day.focusName}, ${day.city}` : "",
      day.city && anchor ? `${day.city}, ${anchor.name}` : day.city,
      anchor?.name ?? "",
    ].filter(Boolean);

    let resolved: [number, number] | null = null;
    for (const query of queries) {
      if (cache.has(query)) {
        resolved = cache.get(query)!;
        break;
      }
      if (token) {
        const hit = await geocodeMapbox(query, token);
        if (hit && (!anchor || inBbox(hit[0], hit[1], anchor.bbox))) {
          cache.set(query, hit);
          resolved = hit;
          break;
        }
      }
    }

    if (!resolved && anchor) resolved = [anchor.lng, anchor.lat];

    if (resolved) {
      day.lng = Math.round(resolved[0] * 10000) / 10000;
      day.lat = Math.round(resolved[1] * 10000) / 10000;
      trace(`geocoded day ${day.day} "${day.focusName}" → [${day.lat}, ${day.lng}]`);
    }
  }

  if (anchor) {
    plan.centerLat = anchor.lat;
    plan.centerLng = anchor.lng;
  } else if (plan.days[0]) {
    plan.centerLat = plan.days[0].lat;
    plan.centerLng = plan.days[0].lng;
  }

  return plan;
}

function parseJson<T>(raw: string): T | null {
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

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "object" && record.text) {
        const textObj = record.text as Record<string, unknown>;
        return typeof textObj.value === "string" ? textObj.value : "";
      }
      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function openaiRequest(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; body: string }> {
  const res = await fetch(`${OPENAI_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "OpenAI-Beta": "assistants=v2",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }
  return { ok: true, data: await res.json() };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the configured OpenAI Assistant (Skybooplan) — all prompt logic lives
 * in the assistant's system instructions on the OpenAI platform.
 */
async function runAssistant(
  key: string,
  assistantId: string,
  userMessage: string,
  trace: (msg: string) => void,
): Promise<
  | { ok: true; text: string }
  | { ok: false; status: number; body: string }
> {
  const startedAt = Date.now();
  trace(`→ assistant ${assistantId}`);

  const threadRes = await openaiRequest(key, "/threads", { method: "POST", body: "{}" });
  if (!threadRes.ok) {
    trace(`← thread create error ${threadRes.status}`);
    return threadRes;
  }
  const threadId = (threadRes.data as { id?: string }).id;
  if (!threadId) return { ok: false, status: 500, body: "no thread id" };

  const msgRes = await openaiRequest(key, `/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ role: "user", content: userMessage }),
  });
  if (!msgRes.ok) {
    trace(`← message error ${msgRes.status}`);
    return msgRes;
  }

  const runRes = await openaiRequest(key, `/threads/${threadId}/runs`, {
    method: "POST",
    body: JSON.stringify({ assistant_id: assistantId }),
  });
  if (!runRes.ok) {
    trace(`← run create error ${runRes.status}`);
    return runRes;
  }
  const runId = (runRes.data as { id?: string }).id;
  if (!runId) return { ok: false, status: 500, body: "no run id" };

  let lastLoggedStatus = "";
  let lastLoggedElapsed = -1;
  while (Date.now() - startedAt < ASSISTANT_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const statusRes = await openaiRequest(key, `/threads/${threadId}/runs/${runId}`, { method: "GET" });
    if (!statusRes.ok) {
      trace(`← run poll error ${statusRes.status}`);
      return statusRes;
    }
    const run = statusRes.data as { status?: string; last_error?: { message?: string } };
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    if (run.status !== lastLoggedStatus || elapsedSec - lastLoggedElapsed >= 10) {
      trace(`run status: ${run.status} (${elapsedSec}s)`);
      lastLoggedStatus = run.status ?? "";
      lastLoggedElapsed = elapsedSec;
    }

    if (run.status === "completed") {
      const messagesRes = await openaiRequest(key, `/threads/${threadId}/messages?order=desc&limit=10`, {
        method: "GET",
      });
      if (!messagesRes.ok) return messagesRes;

      const messages = (messagesRes.data as { data?: Array<{ role?: string; content?: unknown }> }).data ?? [];
      const assistantMsg = messages.find((m) => m.role === "assistant");
      const text = extractMessageText(assistantMsg?.content);
      const elapsed = Date.now() - startedAt;
      trace(`← assistant ok in ${elapsed}ms, ${text.length} chars`);

      // Best-effort cleanup — don't fail the request if delete fails.
      void openaiRequest(key, `/threads/${threadId}`, { method: "DELETE" });

      if (!text) return { ok: false, status: 500, body: "empty assistant response" };
      return { ok: true, text };
    }

    if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
      const errMsg = run.last_error?.message ?? run.status ?? "run failed";
      trace(`← assistant run ${run.status}: ${errMsg}`);
      return { ok: false, status: 500, body: errMsg };
    }
  }

  trace(`← assistant timeout after ${ASSISTANT_TIMEOUT_MS}ms`);
  return { ok: false, status: 408, body: "timeout" };
}

export const generateAiPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<GenerateAiPlanResult> => {
    const IS_DEV = process.env.NODE_ENV !== "production";
    const debugTrace: string[] = [];
    const trace = (msg: string) => {
      console.log(`[AiPlan] ${msg}`);
      if (IS_DEV) debugTrace.push(msg);
    };
    const withDebug = (result: GenerateAiPlanResult): GenerateAiPlanResult =>
      IS_DEV && debugTrace.length ? { ...result, debug: [...debugTrace] } : result;

    const key = process.env.OPENAI_API_KEY;
    if (!key) return withDebug({ plan: null, error: "OPENAI_API_KEY ni nastavljen" });

    const assistantId = process.env.OPENAI_ASSISTANT_ID;
    if (!assistantId) return withDebug({ plan: null, error: "OPENAI_ASSISTANT_ID ni nastavljen" });

    const nDays = daysBetween(data.departDate, data.returnDate || undefined);
    const lang = LANG_MAP[data.language ?? "sl"] ?? "slovenščini";
    const isStays = data.mode === "stays";
    const paceLabel =
      data.pace === "intensive" ? "intensive" : data.pace === "calm" ? "calm" : "relaxed";

    const mid = Math.ceil(nDays / 2);
    const batchCount =
      nDays <= BATCH_THRESHOLD_DAYS ? 1 : 2;

    trace(
      `start ${data.originIata}→${data.destinationIata}, ${nDays} days ` +
        `(${batchCount} assistant batch${batchCount > 1 ? "es" : ""})`,
    );

    const makeBatches = () =>
      nDays <= BATCH_THRESHOLD_DAYS
        ? [{ start: 1, end: nDays, handoff: undefined as BatchHandoff | undefined }]
        : [
            { start: 1, end: mid, handoff: undefined as BatchHandoff | undefined },
            { start: mid + 1, end: nDays, handoff: undefined as BatchHandoff | undefined },
          ];

    const ROUTING_BLOCK_RULES = new Set(["duplicate_destination_segment", "non_linear_route"]);

    const buildRoutingRepair = (
      violations: { rule: string; message: string }[],
      secondBatchOnly = false,
      startDay = 1,
      endDay = nDays,
    ) =>
      [
        "ROUTING REPAIR — your previous attempt was REJECTED for ping-pong / backtracking:",
        ...violations.map((v) => `- ${v.message}`),
        secondBatchOnly
          ? `Regenerate ONLY days ${startDay}-${endDay} with strict forward-only geographic clustering.`
          : "Regenerate the FULL itinerary with strict forward-only geographic clustering.",
        "Finish each region completely before moving on. Never bounce between distant cities.",
        "You may return to the departure hub ONLY on the final 1–2 days for the outbound flight — never mid-trip.",
      ].join("\n");

    const buildHandoff = (
      days: DayPlan[],
      planMeta: Omit<AiTripPlan, "days">,
      nextStartDay: number,
    ): BatchHandoff => {
      const visitedCities: string[] = [];
      let lastCityName = "";
      for (const d of days) {
        if (d.city && d.city.toLowerCase() !== lastCityName.toLowerCase()) {
          visitedCities.push(d.city);
          lastCityName = d.city;
        }
      }
      const lastDay = days[days.length - 1];
      const spentSoFar = days.reduce((sum, d) => sum + (d.dailyBudgetEur || 0), 0);
      return {
        visitedCities,
        lastCity: lastDay.city,
        lastFocusName: lastDay.focusName,
        remainingBudgetEur: Math.max(0, numberValue(planMeta.totalBudgetEur, 0) - spentSoFar),
      };
    };

    const violationsOnlySecondBatch = (
      violations: { dayNumbers: number[] }[],
      splitDay: number,
    ) =>
      violations.length > 0 &&
      violations.every((v) => v.dayNumbers.every((d) => d > splitDay));

    try {
      const { validateItinerary } = await import("./planValidation");
      let lastBlocking: { rule: string; message: string; dayNumbers: number[] }[] = [];
      let savedFirstBatch: {
        meta: Omit<AiTripPlan, "days">;
        days: DayPlan[];
      } | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        const batches = makeBatches();
        const retrySecondBatchOnly: boolean =
          attempt > 0 &&
          savedFirstBatch !== null &&
          batchCount > 1 &&
          violationsOnlySecondBatch(lastBlocking, mid);

        if (attempt > 0) {
          trace(
            retrySecondBatchOnly
              ? `retrying batch ${mid + 1}-${nDays} only (keeping days 1-${mid})`
              : "retrying with routing repair instructions",
          );
        }

        let meta: Omit<AiTripPlan, "days"> | null = retrySecondBatchOnly
          ? savedFirstBatch!.meta
          : null;
        const allDays: DayPlan[] = retrySecondBatchOnly ? [...savedFirstBatch!.days] : [];
        const routingRepair =
          attempt > 0
            ? buildRoutingRepair(
                lastBlocking,
                retrySecondBatchOnly,
                mid + 1,
                nDays,
              )
            : undefined;

        if (retrySecondBatchOnly) {
          batches[1].handoff = buildHandoff(allDays, meta!, mid + 1);
        }

        const startBatchIdx: number = retrySecondBatchOnly ? 1 : 0;

        for (let i = startBatchIdx; i < batches.length; i++) {
          const batch = batches[i]!;
          const userMessage = buildTripRequestMessage({
            originIata: data.originIata,
            destinationIata: data.destinationIata,
            departDate: data.departDate,
            returnDate: data.returnDate || undefined,
            nDays,
            startDay: batch.start,
            endDay: batch.end,
            pax: data.pax,
            lang,
            paceLabel,
            isStays,
            wishes: data.wishes,
            customPrompt: data.customPrompt,
            handoff: batch.handoff,
            routingRepair:
              routingRepair && (retrySecondBatchOnly ? i === 1 : i === 0)
                ? routingRepair
                : undefined,
          });

          const response = await runAssistant(
            key,
            assistantId,
            userMessage,
            (msg) => trace(`batch ${batch.start}-${batch.end}: ${msg}`),
          );

          if (!response.ok) {
            if (response.status === 401) return withDebug({ plan: null, error: "AI Gateway ključ ni veljaven." });
            if (response.status === 402) return withDebug({ plan: null, error: "AI krediti so porabljeni." });
            if (response.status === 429) return withDebug({ plan: null, error: "Preveč zahtev za AI. Poskusi znova." });
            if (response.status === 408) return withDebug({ plan: null, error: "AI predolgo odgovarja, poskusi znova." });
            return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
          }

          const parsed = parseJson<Partial<AiTripPlan>>(response.text);
          if (!parsed?.days?.length) {
            trace(`batch ${batch.start}-${batch.end}: parse failed — not valid JSON`);
            return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
          }

          if (!meta) {
            meta = {
              destinationName: sanitizeOutdatedText(textValue(parsed.destinationName, data.destinationIata)),
              summary: sanitizeOutdatedText(textValue(parsed.summary, "")),
              totalBudgetEur: numberValue(parsed.totalBudgetEur, 300),
              centerLat: numberValue(parsed.centerLat, 0),
              centerLng: numberValue(parsed.centerLng, 0),
            };
          }

          const batchDays = parsed.days
            .map((d, idx) => normalizeDay(d, batch.start + idx, data.departDate))
            .filter((d) => d.day >= batch.start && d.day <= batch.end);

          allDays.push(...batchDays);
          trace(`batch ${batch.start}-${batch.end}: ${batchDays.length} days parsed`);

          if (i + 1 < batches.length && batchDays.length && meta) {
            batches[i + 1].handoff = buildHandoff(allDays, meta, batches[i + 1].start);
          }

          if (i === 0 && batches.length > 1 && batchDays.length >= mid && meta) {
            savedFirstBatch = { meta: { ...meta }, days: [...batchDays] };
          }
        }

        const normalizedDays = allDays
          .sort((a, b) => a.day - b.day)
          .filter((d, i, arr) => i === arr.findIndex((x) => x.day === d.day))
          .slice(0, nDays);

        if (normalizedDays.length < nDays) {
          trace(`incomplete: got ${normalizedDays.length}/${nDays} days`);
          return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
        }

        let plan: AiTripPlan = {
          destinationName: meta!.destinationName,
          summary: meta!.summary,
          totalBudgetEur: meta!.totalBudgetEur,
          centerLat: meta!.centerLat,
          centerLng: meta!.centerLng,
          days: normalizedDays,
          originIata: data.originIata,
          destinationIata: data.destinationIata,
        };

        plan = await enrichCoordinates(plan, data.destinationIata, trace);

        const violations = validateItinerary(plan);
        const blocking = violations.filter((v) => ROUTING_BLOCK_RULES.has(v.rule));

        if (blocking.length === 0) {
          if (violations.length) console.warn("AI plan soft warnings:", violations);
          trace(`complete: ${plan.days.length} days via assistant (attempt ${attempt + 1})`);
          return withDebug({ plan, error: null, violations: violations.length ? violations : undefined });
        }

        lastBlocking = blocking;
        trace(`routing blocked attempt ${attempt + 1}: ${blocking.map((b) => b.message).join("; ")}`);
        if (attempt === 1) {
          return withDebug({
            plan: null,
            error: "error.invalidItinerary",
            errorCode: "INVALID_ITINERARY",
            violations,
          });
        }
      }

      return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
    } catch (err) {
      trace(`fatal: ${err instanceof Error ? err.message : String(err)}`);
      console.error("AI plan failed:", err);
      return withDebug({ plan: null, error: "AI plan se trenutno ne da generirati." });
    }
  });
