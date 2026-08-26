/**
 * Required itinerary JSON contract for Gemini.
 * Freeform prose is unreadable for PDF export and gets cut mid-sentence.
 */

import { activityHasRenderableBody, sanitizeActivityTitle } from "@/lib/textSanitize";
import { parseHmClock } from "@/lib/activityTime";

export const ITINERARY_JSON_SCHEMA_EXAMPLE = `{
  "trip_title": "string",
  "overview": "string",
  "total_budget_eur": "number",
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD",
      "city": "string",
      "title": "string",
      "transfer": { "type": "string", "from": "string", "to": "string", "duration": "string", "cost_eur": "number" },
      "activities": {
        "morning": { "title": "string", "description": "string", "cost_eur": "number", "time": "HH:MM" },
        "afternoon": { "title": "string", "description": "string", "cost_eur": "number", "time": "HH:MM" },
        "evening": { "title": "string", "description": "string", "cost_eur": "number", "time": "HH:MM" }
      },
      "daily_budget_per_person_eur": "number"
    }
  ],
  "accommodations": [
    { "city": "string", "nights": "number", "from_date": "YYYY-MM-DD", "to_date": "YYYY-MM-DD" }
  ]
}`;

export const ITINERARY_JSON_SCHEMA_RULE = `JSON SCHEMA (mandatory — never a freeform itinerary essay):
The PDF exporter reads JSON fields. If you write prose / markdown / a letter, the app cannot parse it and will cut titles mid-word.

Every human-readable string MUST be complete. Forbidden: placeholders, unfinished titles, "Top of.", "Walk of.", "Canal.", "→ St.", trailing "proti.", sentences ending with "..." / "…", cut off mid-word.

Required itinerary fields (map onto itinerar[].days[] + hotels[] in the same response):
${ITINERARY_JSON_SCHEMA_EXAMPLE}

Field mapping (same payload, do not emit a second itinerary):
- trip_title → trip_metadata.destination (complete trip name)
- overview → trip_metadata.season_warning (2–4 complete sentences)
- total_budget_eur → root number (optional; app may recompute)
- days[] length / day_number 1…N = EXACTLY the inclusive calendar days from START_DATE through END_DATE. Day N is ALWAYS the departure day
- days[].day_number, date, title, city — title is a complete phrase
- days[].transfer → days[].transportation[0] { type, from, to, duration, estimatedPrice = cost_eur } when that day has a hop; omit transfer if the day stays in the same city
- TRAVEL DAY: if city changes vs the previous overnight (distant city/island hop), morning = travel/transfer only; sightseeing in the new city only afternoon/evening after hotel check-in
- days[].activities.morning|afternoon|evening are REQUIRED keys — never omit a slot. Each is one complete object: title, description, cost_eur, time. Map to activities[] with timeSlot dopoldan|popoldan|vecer
- days[].transportTip (transport notes) is REQUIRED every day — concrete A→B / apps / warnings for THAT city only
- description = fully completed, minimum 25 words (typically 2–3 complete sentences: what + how + one local tip). Never a wall of text. NEVER '...' or cut off mid-word. On flight days write a complete in-flight/transfer description — do not drop the key
- time = HH:MM for sightseeing when you know a sensible start; OMIT time on international arrival, hotel checkout, airport transfer, and the return flight (the ticket owns those clocks)
- days[].daily_budget_per_person_eur → dailyBudget
- accommodations[] → hotels[] { name = city, city, nights, from_date, to_date } — city + nights only, NEVER invent hotel names
- Keep weatherWidget + safetyWarning on the root as already required

Return strictly valid, parseable JSON matching this schema, with no markdown code fences or conversational intro/outro text. No itinerary outside these fields.`;

const SLOT_TO_TIMESLOT: Record<string, "dopoldan" | "popoldan" | "vecer"> = {
  morning: "dopoldan",
  afternoon: "popoldan",
  evening: "vecer",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function slotActivities(raw: unknown, timeSlot: "dopoldan" | "popoldan" | "vecer"): Record<string, unknown>[] {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: Record<string, unknown>[] = [];
  for (const item of list) {
    const a = asRecord(item);
    if (!a) continue;
    const description = str(a.description).trim();
    const bullets = Array.isArray(a.bullets)
      ? a.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
      : undefined;
    if (!activityHasRenderableBody({ description, bullets })) continue;
    const title = sanitizeActivityTitle(str(a.title || a.name), description);
    if (!title) continue;
    const clock = parseHmClock(str(a.time)) ?? parseHmClock(str(a.arrivalTime));
    out.push({
      ...a,
      title,
      description,
      time: clock ?? str(a.time),
      arrivalTime: str(a.arrivalTime).trim() || clock || undefined,
      estimatedCostEur: num(a.estimatedCostEur) ?? num(a.cost_eur) ?? 0,
      timeSlot: typeof a.timeSlot === "string" ? a.timeSlot : timeSlot,
      category: typeof a.category === "string" ? a.category : "sightseeing",
    });
  }
  return out;
}

function transferType(raw: string): "flight" | "ferry" | "train" | "van" {
  const t = raw.toLowerCase();
  if (/flight|let/.test(t)) return "flight";
  if (/ferry|trajekt/.test(t)) return "ferry";
  if (/train|vlak/.test(t)) return "train";
  return "van";
}

function flattenDayActivities(day: Record<string, unknown>): void {
  const acts = day.activities;
  if (Array.isArray(acts)) {
    const next: Record<string, unknown>[] = [];
    for (const a of acts) {
      const rec = asRecord(a);
      if (!rec) continue;
      if (rec.estimatedCostEur == null && num(rec.cost_eur) != null) {
        rec.estimatedCostEur = num(rec.cost_eur);
      }
      if (!str(rec.title) && str(rec.name)) rec.title = str(rec.name);
      rec.title = sanitizeActivityTitle(str(rec.title), str(rec.description));
      if (!str(rec.title)) continue;
      const clock = parseHmClock(str(rec.time)) ?? parseHmClock(str(rec.arrivalTime));
      if (clock && !str(rec.arrivalTime).trim()) rec.arrivalTime = clock;
      next.push(rec);
    }
    day.activities = next;
    return;
  }
  const slots = asRecord(acts);
  if (!slots) {
    day.activities = [];
    return;
  }
  day.activities = [
    ...slotActivities(slots.morning, SLOT_TO_TIMESLOT.morning),
    ...slotActivities(slots.afternoon, SLOT_TO_TIMESLOT.afternoon),
    ...slotActivities(slots.evening, SLOT_TO_TIMESLOT.evening),
  ];
}

function fillDayDefaults(day: Record<string, unknown>): void {
  flattenDayActivities(day);
  applyTransfer(day);
  if (num(day.dailyBudget) == null && num(day.daily_budget_per_person_eur) != null) {
    day.dailyBudget = num(day.daily_budget_per_person_eur);
  }
  if (num(day.dailyBudget) == null) day.dailyBudget = 0;
  if (num(day.drivingDistanceKm) == null) day.drivingDistanceKm = 0;
  if (!str(day.drivingDurationHours).trim()) day.drivingDurationHours = "0h";
  if (!str(day.day_name).trim()) {
    const n = num(day.day_number) ?? 1;
    day.day_name = `Day ${n}`;
  }
  if (!str(day.date).trim()) day.date = "";
  if (!str(day.title).trim()) day.title = str(day.city) || "Day";
}

function applyTransfer(day: Record<string, unknown>): void {
  const transfer = asRecord(day.transfer);
  if (!transfer) return;
  if (Array.isArray(day.transportation) && day.transportation.length > 0) return;
  const from = str(transfer.from).trim();
  const to = str(transfer.to).trim();
  if (!from && !to) return;
  day.transportation = [
    {
      type: transferType(str(transfer.type)),
      from: from || "—",
      to: to || "—",
      duration: str(transfer.duration).trim() || "1h",
      estimatedPrice: num(transfer.cost_eur) ?? num(transfer.estimatedPrice) ?? 0,
    },
  ];
}

function groupDaysIntoPhases(days: unknown[]): Record<string, unknown>[] {
  const phases: Record<string, unknown>[] = [];
  for (const raw of days) {
    const day = asRecord(raw);
    if (!day) continue;
    fillDayDefaults(day);
    const city = str(day.city).trim() || "City";
    const last = phases[phases.length - 1];
    if (last && str(last.city) === city && Array.isArray(last.days)) {
      (last.days as unknown[]).push(day);
      continue;
    }
    phases.push({
      phase: city,
      city,
      unsplashQuery: city,
      lat: num(day.lat) ?? 0,
      lng: num(day.lng) ?? 0,
      pois: [],
      days: [day],
    });
  }
  return phases;
}

function ensureMeta(plan: Record<string, unknown>): void {
  const title = str(plan.trip_title).trim();
  const overview = str(plan.overview).trim();
  const meta = asRecord(plan.trip_metadata) ?? {};
  if (title && !str(meta.destination).trim()) meta.destination = title;
  if (overview && !str(meta.season_warning).trim()) meta.season_warning = overview;
  if (!str(meta.destination).trim()) meta.destination = title || "Trip";
  if (!str(meta.season_warning).trim()) meta.season_warning = overview || meta.destination;
  if (!str(meta.currency).trim()) meta.currency = "EUR";
  if (typeof meta.visa_required !== "boolean") meta.visa_required = false;
  plan.trip_metadata = meta;
}

function mapAccommodations(plan: Record<string, unknown>): void {
  const stays = plan.accommodations;
  if (!Array.isArray(stays) || stays.length === 0) return;
  const existing = Array.isArray(plan.hotels) ? plan.hotels : [];
  if (existing.length > 0) return;
  plan.hotels = stays
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => {
      const city = str(row.city).trim();
      const from = str(row.from_date).trim();
      const to = str(row.to_date).trim();
      return {
        name: city || "Stay",
        city,
        nights: num(row.nights),
        from_date: from || undefined,
        to_date: to || undefined,
        note: from && to ? `${from} → ${to}` : undefined,
      };
    });
}

/** Lift Rok's flat itinerary schema (and slot objects) into itinerar[] before Zod parse. */
export function liftFlatItineraryToItinerar(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const plan = raw as Record<string, unknown>;
  ensureMeta(plan);
  if (num(plan.totalBudgetEur) == null && num(plan.total_budget_eur) != null) {
    plan.totalBudgetEur = num(plan.total_budget_eur);
  }
  mapAccommodations(plan);

  const itinerar = plan.itinerar;
  if (Array.isArray(itinerar)) {
    for (const phase of itinerar) {
      const p = asRecord(phase);
      if (!p || !Array.isArray(p.days)) continue;
      for (const day of p.days) {
        const d = asRecord(day);
        if (!d) continue;
        fillDayDefaults(d);
        if (!str(d.city).trim() && str(p.city).trim()) d.city = str(p.city);
      }
    }
  } else if (Array.isArray(plan.days)) {
    plan.itinerar = groupDaysIntoPhases(plan.days);
  }

  if (!asRecord(plan.logistics_and_tips)) {
    plan.logistics_and_tips = {
      transport: { flights: "", ferries: "", city_transport: "" },
      finance: "",
      internet: "",
    };
  }
  if (!Array.isArray(plan.hotels)) plan.hotels = [];
  return plan;
}
