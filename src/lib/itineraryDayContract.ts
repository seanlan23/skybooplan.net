/**
 * Official Gemini JSON day contract (`days[]`).
 * UI/PDF cards still use `DayPlan` from `aiPlan.functions` after `itineraryJsonToPlan`.
 */

export const GEMINI_TIME_SLOTS = ["DOPOLDAN", "POPOLDAN", "VEČER"] as const;

export type TimeSlot = (typeof GEMINI_TIME_SLOTS)[number];

export interface ActivityItem {
  time_slot: TimeSlot;
  start_time: string;
  title: string;
  description: string;
  estimated_cost_eur?: number;
  navigation_available?: boolean;
}

export interface ItineraryDayPlan {
  day_number: number;
  date: string;
  city: string;
  day_title: string;
  daily_budget_per_person_eur: number;
  activities: ActivityItem[];
  local_tips: string;
  transport_tip: string;
}

/** Designer contract name. UI cards stay `DayPlan` in `aiPlan.functions`. */
export type DayPlan = ItineraryDayPlan;
