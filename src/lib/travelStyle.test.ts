import { describe, expect, it } from "vitest";
import { DEFAULT_TRAVEL_STYLE, normalizeTravelStyle, skipsPaceQuestion } from "@/lib/travelStyle";
import {
  generateGeminiProTripInputSchema,
  generateTripInputSchema,
} from "@/lib/geminiPro.functions";
import { heroChatToPlannerPayload } from "@/lib/heroChatPlanner";
import {
  DEFAULT_TRIP_STYLE,
  isSingleBasePlan,
  resolveTripStyle,
  travelStyleToTripStyle,
} from "@/lib/tripStyle";

describe("normalizeTravelStyle", () => {
  it("keeps official ids and defaults to resort", () => {
    expect(normalizeTravelStyle("resort")).toBe("resort");
    expect(normalizeTravelStyle("explore")).toBe("explore");
    expect(normalizeTravelStyle("roadtrip")).toBe("roadtrip");
    expect(normalizeTravelStyle("")).toBe(DEFAULT_TRAVEL_STYLE);
    expect(normalizeTravelStyle("Aktivni roadtrip")).toBe("roadtrip");
    expect(normalizeTravelStyle("Sproščeno raziskovanje")).toBe("explore");
  });

  it("skips the pace question only for Resort / Mir", () => {
    expect(skipsPaceQuestion("resort")).toBe(true);
    expect(skipsPaceQuestion("explore")).toBe(false);
    expect(skipsPaceQuestion("roadtrip")).toBe(false);
  });
});

describe("isSingleBasePlan", () => {
  it("treats tripStyle or resortStay as a resort plan", () => {
    expect(isSingleBasePlan({ tripStyle: "single_base" })).toBe(true);
    expect(isSingleBasePlan({ resortStay: { arrivalProtocol: {} } })).toBe(true);
    expect(isSingleBasePlan({ tripStyle: "explorer" })).toBe(false);
    expect(isSingleBasePlan(null)).toBe(false);
  });
});

describe("travelStyle API + planner mapping", () => {
  it("maps hero chat collected style onto the planner form", () => {
    const { form } = heroChatToPlannerPayload({
      destination: "New York",
      dates: "Julij 2027",
      nights: "7 noči",
      origin: "Ljubljana",
      passengers: "2 odrasla",
      travelStyle: "explore",
      pace: "Sproščen",
      budget: "500–1000€",
    });
    expect(form.travelStyle).toBe("explore");
  });

  it("defaults missing chat style to resort", () => {
    const { form } = heroChatToPlannerPayload({
      destination: "New York",
      dates: "Julij 2027",
      nights: "7 noči",
      origin: "Ljubljana",
      passengers: "2 odrasla",
      pace: "Sproščen",
      budget: "500–1000€",
    });
    expect(form.travelStyle).toBe("resort");
  });

  it("accepts travelStyle on the generate-itinerary payload", () => {
    const parsed = generateGeminiProTripInputSchema.safeParse({
      originIata: "LJU",
      destinationIata: "JFK",
      departDate: "2026-09-19",
      returnDate: "2026-09-26",
      pax: { adults: 2 },
      budget: "standard",
      travelStyle: "resort",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.travelStyle).toBe("resort");
  });

  it("maps UI travelStyle onto official tripStyle", () => {
    expect(travelStyleToTripStyle("resort")).toBe("single_base");
    expect(travelStyleToTripStyle("explore")).toBe("explorer");
    expect(travelStyleToTripStyle("roadtrip")).toBe("roadtrip");
  });

  it("defaults missing tripStyle to single_base on the generate-itinerary body", () => {
    expect(DEFAULT_TRIP_STYLE).toBe("single_base");
    const parsed = generateTripInputSchema.safeParse({
      originIata: "LJU",
      destinationIata: "MLE",
      departDate: "2026-09-19",
      returnDate: "2026-09-26",
      pax: { adults: 2 },
      budget: "standard",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tripStyle).toBe("single_base");
      expect(parsed.data.travelStyle).toBe("resort");
    }
  });

  it("accepts tripStyle on the request body and maps travelStyle explore → explorer", () => {
    const parsed = generateTripInputSchema.safeParse({
      originIata: "LJU",
      destinationIata: "JFK",
      departDate: "2026-09-19",
      returnDate: "2026-09-26",
      pax: { adults: 2 },
      budget: "standard",
      travelStyle: "explore",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tripStyle).toBe("explorer");

    const official = generateTripInputSchema.safeParse({
      originIata: "LJU",
      destinationIata: "JFK",
      departDate: "2026-09-19",
      returnDate: "2026-09-26",
      pax: { adults: 2 },
      tripStyle: "roadtrip",
    });
    expect(official.success).toBe(true);
    if (official.success) expect(official.data.tripStyle).toBe("roadtrip");
  });

  it("defaults car/motorhome without a style to roadtrip", () => {
    expect(
      resolveTripStyle({ groundTransportMode: "motorhome" }),
    ).toBe("roadtrip");
  });
});
