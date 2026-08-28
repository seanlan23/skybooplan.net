/**
 * Required itinerary JSON contract for Gemini.
 * Freeform prose is unreadable for PDF export and gets cut mid-sentence.
 */

import { activityHasRenderableBody } from "@/lib/textSanitize";
import { parseHmClock } from "@/lib/activityTime";
import { stampOvernightCitiesFromHotels, type HotelStayHint, type OvernightDay } from "@/lib/overnightHotelStays";
import { sameTransferBase } from "@/lib/baseTransfer";

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
      "daily_budget_per_person_eur": "number",
      "transportTip": "string",
      "local_tips": "string"
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
- days[].transfer → days[].transportation[0] { type, from, to, duration, estimatedPrice = cost_eur } ONLY when the overnight city changes (new base). from and to MUST be different bases. Omit transfer on same-city days. FORBIDDEN: transfer/transportation[] for same-city day trips (island excursions, bay tours, Phi Phi / Phang Nga / Ang Thong style outings) — those stay as activities only
- TRAVEL DAY: if city changes vs the previous overnight (distant city/island hop), morning = travel/transfer only; sightseeing in the new city only afternoon/evening after hotel check-in
- days[].activities.morning|afternoon|evening are REQUIRED keys — never omit a slot. Each is one complete object: title, description, cost_eur, time. Map to activities[] with timeSlot dopoldan|popoldan|vecer. Evening on a full destination day is a real dinner / night program, not an empty key.
- days[].city is the OVERNIGHT town/area where the traveler sleeps that night (village, beach, island) — NEVER copy the arrival-airport city onto every day. Consecutive nights in the same stay MUST keep the same city string. Forbidden: a one-day flicker to a previous hub with no transfer that day.
- days[].title is a unique day name (what happens that day) — never "Dan 1" / "Day 1".
- hotels[] / accommodations[] = one row per consecutive stay { city, nights } matching days[].city. Forbidden: a single gateway-city row covering the whole trip. If the traveller listed nights per city in wishes, hotels[] and days[].city MUST match those counts exactly — no extra nights on the first base. Forbidden: a boat/flight day trip to an island/town that already has a multi-night stay (use local sights on the current base instead). Without an explicit stay plan: an entry/exit transit metropolis (Bangkok, Kuala Lumpur, Toronto, Tokyo…) gets at most 2–3 nights at the start and 1–2 at the return, and ≤30% of the trip in total; interior cultural/mountain bases and islands/parks get ≥3 nights.
- days[].transportTip (transport notes) is REQUIRED every day — concrete A→B / apps / how to get around for THAT city only
- days[].local_tips is REQUIRED (type: string) every day — practical local tips & safety for THAT day's city/area only. Not a copy of travelHack (one insider shortcut) and not transportTip (how to get around). Concise but rich; must cover:
  1) Water & hydration: is tap water drinkable, ice in drinks, how much to drink in that climate.
  2) Food & hygiene: where street food is safe, seafood freshness, unwritten local eating rules.
  3) Safety & scams: pickpockets in crowds; known tourist tricks for that place (e.g. "the temple is closed", fake taxi meters, unmarked money changers).
  4) Local etiquette & metro/trains: silence, seats for the elderly, no eating on transit; dress code in temples/churches; tipping (expected vs offensive).
  Rotate by city (Tokyo metro ≠ Phuket beach). Forbidden: generic "be careful" / "use common sense" / the same paragraph on two days.
- description = fully completed, minimum 25 words (typically 2–3 complete sentences: what + how + one local tip). Never a wall of text. NEVER '...' or cut off mid-word. On flight days write a complete in-flight/transfer description — do not drop the key
- time = HH:MM for sightseeing when you know a sensible start; OMIT time on international arrival, hotel checkout, airport transfer, and the return flight (the ticket owns those clocks)
- days[].daily_budget_per_person_eur → dailyBudget. REQUIRED every day: a real per-person EUR number (typical sightseeing day 35–70, never 0). Includes food + local transport + activities that day; not the international flight.
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
    const title = str(a.title || a.name).trim();
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
      rec.title = str(rec.title).trim();
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
  const localTips = str(day.local_tips).trim() || str(day.localTips).trim();
  if (localTips) day.local_tips = localTips;
}

function hasDayHop(day: Record<string, unknown>): boolean {
  if (Array.isArray(day.transportation) && day.transportation.length > 0) return true;
  return Boolean(asRecord(day.transfer));
}

/** Same overnight city on both neighbors + no hop → keep the stay city (no one-day hub flicker). */
function stabilizeOvernightCities(plan: Record<string, unknown>): void {
  const days: Record<string, unknown>[] = [];
  const itinerar = plan.itinerar;
  if (!Array.isArray(itinerar)) return;
  for (const phase of itinerar) {
    const p = asRecord(phase);
    if (!p || !Array.isArray(p.days)) continue;
    for (const day of p.days) {
      const d = asRecord(day);
      if (d) days.push(d);
    }
  }
  days.sort((a, b) => (num(a.day_number) ?? 0) - (num(b.day_number) ?? 0));
  for (let i = 1; i < days.length - 1; i++) {
    const prev = str(days[i - 1]!.city).trim();
    const next = str(days[i + 1]!.city).trim();
    const cur = str(days[i]!.city).trim();
    if (!prev || prev !== next || cur === prev) continue;
    if (hasDayHop(days[i]!)) continue;
    days[i]!.city = prev;
  }
}

function applyTransfer(day: Record<string, unknown>): void {
  const transfer = asRecord(day.transfer);
  if (!transfer) return;
  if (Array.isArray(day.transportation) && day.transportation.length > 0) return;
  const from = str(transfer.from).trim();
  const to = str(transfer.to).trim();
  if (!from || !to || sameTransferBase(from, to)) return;
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

function hotelHintsOf(plan: Record<string, unknown>): HotelStayHint[] {
  if (!Array.isArray(plan.hotels)) return [];
  return plan.hotels
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      city: str(row.city).trim() || undefined,
      name: str(row.name).trim() || undefined,
      nights: num(row.nights) ?? undefined,
      from_date: str(row.from_date).trim() || undefined,
      to_date: str(row.to_date).trim() || undefined,
    }));
}

function applyOvernightBases(plan: Record<string, unknown>): void {
  const itinerar = plan.itinerar;
  if (!Array.isArray(itinerar)) return;
  stabilizeOvernightCities(plan);
  const allDays: OvernightDay[] = [];
  for (const phase of itinerar) {
    const p = asRecord(phase);
    if (!p || !Array.isArray(p.days)) continue;
    for (const day of p.days) {
      const d = asRecord(day);
      if (d) allDays.push(d as OvernightDay);
    }
  }
  stampOvernightCitiesFromHotels(allDays, hotelHintsOf(plan));
  for (const phase of itinerar) {
    const p = asRecord(phase);
    if (!p || !Array.isArray(p.days)) continue;
    for (const day of p.days) {
      const d = asRecord(day);
      if (!d) continue;
      if (!str(d.city).trim() && str(p.city).trim()) d.city = str(p.city);
      if (!str(d.title).trim()) d.title = str(d.city) || "Day";
    }
  }
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

  if (!Array.isArray(plan.itinerar) && Array.isArray(plan.days)) {
    plan.itinerar = groupDaysIntoPhases(plan.days);
  }

  if (Array.isArray(plan.itinerar)) {
    for (const phase of plan.itinerar) {
      const p = asRecord(phase);
      if (!p || !Array.isArray(p.days)) continue;
      for (const day of p.days) {
        const d = asRecord(day);
        if (!d) continue;
        fillDayDefaults(d);
      }
    }
    applyOvernightBases(plan);
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
