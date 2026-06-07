import type { PlannerInterestKey } from "@/lib/plannerInterests";

export type CuratedTransportLeg = {
  type: string;
  duration: string;
  costLabel: string;
  howTo: string;
  heavyTravel: boolean;
};

export type CuratedRoute = {
  id: string;
  country: string;
  routeCountries?: string[];
  minDays: number;
  maxDays: number;
  segments: Array<[city: string, fixedDays: number]>;
  mustIncludeHighlights: string[];
  steer: string;
  priority: number;
  wishTest?: RegExp;
  interests?: PlannerInterestKey[];
  /** When set, route applies when destinationIata matches (hub default). */
  hubIata?: string;
};
