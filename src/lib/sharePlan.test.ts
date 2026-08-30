import { describe, expect, it } from "vitest";
import {
  absoluteShareUrl,
  asShareStyle,
  buildShareOgDescription,
  buildShareOgMeta,
  buildShareOgTitle,
  buildSharePlanPath,
  parseSharePlanSearch,
  resolveSharePlanSearch,
  slimPlanForShare,
  tripDayCount,
} from "@/lib/sharePlan";

describe("share plan URL", () => {
  it("builds the parameterized /plan link", () => {
    expect(
      buildSharePlanPath({
        from: "MUC",
        to: "HKT",
        depart: "2026-10-16",
        return: "2026-10-27",
        style: "single_base",
        hotelId: "hotel-42",
        guests: 2,
        s: "abc123",
      }),
    ).toBe(
      "/plan?from=MUC&to=HKT&depart=2026-10-16&return=2026-10-27&style=single_base&hotelId=hotel-42&guests=2&s=abc123",
    );
  });

  it("parses and sanitizes search params", () => {
    const parsed = parseSharePlanSearch({
      from: "muc",
      to: "hkt",
      depart: "2026-10-16T10:00:00",
      return: "2026-10-27",
      style: "resort",
      hotelId: "  stay-1  ",
      guests: "2",
      s: "tok",
    });
    expect(parsed).toEqual({
      from: "MUC",
      to: "HKT",
      depart: "2026-10-16",
      return: "2026-10-27",
      style: "single_base",
      hotelId: "stay-1",
      guests: 2,
      s: "tok",
    });
    expect(asShareStyle("explore")).toBe("explorer");
    expect(parseSharePlanSearch(undefined)).toEqual({
      from: undefined,
      to: undefined,
      depart: undefined,
      return: undefined,
      style: undefined,
      hotelId: undefined,
      guests: undefined,
      s: undefined,
    });
    expect(
      resolveSharePlanSearch(
        {},
        "https://www.skybooplan.com/plan?from=MUC&to=MLE&s=tok123&guests=2",
      ),
    ).toMatchObject({ from: "MUC", to: "MLE", s: "tok123", guests: 2 });
    expect(resolveSharePlanSearch({ to: "HKT" }, "/plan?to=MLE")).toMatchObject({ to: "HKT" });
  });
});

describe("share OG copy", () => {
  it("uses destination, trip span and per-person price", () => {
    expect(tripDayCount("2026-10-16", "2026-10-27")).toBe(11);
    expect(
      buildShareOgTitle({
        city: "Phuket",
        country: "Tajska",
        days: 11,
        pricePerPerson: 638,
        lang: "sl",
      }),
    ).toBe("Phuket, Tajska – 11 dni oddiha z letom in hotelom že od 638 € / osebo");
    expect(buildShareOgDescription("sl")).toMatch(/oceno 8\+/);

    const og = buildShareOgMeta({
      destinationIata: "HKT",
      destinationName: "Phuket",
      depart: "2026-10-16",
      return: "2026-10-27",
      pricePerPerson: 638,
      imageUrl: "https://cf.bstatic.com/xdata/images/hotel/max300x200/abc.jpg",
      lang: "sl",
    });
    expect(og.title).toMatch(/Phuket, Tajska/);
    expect(og.title).toMatch(/638 €/);
    expect(og.image).toContain("max1280x900");
    expect(absoluteShareUrl("/plan?s=x")).toMatch(/\/plan\?s=x$/);
  });
});

describe("slimPlanForShare", () => {
  it("keeps resort offers and stay blocks", () => {
    const slim = slimPlanForShare({
      destinationName: "Phuket",
      summary: "Beach week",
      totalBudgetEur: 400,
      centerLat: 8,
      centerLng: 98,
      days: [],
      tripStyle: "single_base",
      resortStay: {
        arrivalProtocol: {
          visa_and_entry: "visa",
          immigration: "imm",
          baggage: "bags",
          transfer_pickup: "van",
          cash_and_esim: "cash",
        },
        resortGuide: {
          check_in_out: "in",
          all_inclusive_etiquette: "bb",
          tipping: "tip",
          relaxing_at_resort: "bazen",
        },
        optionalExcursions: [],
        departureProtocol: {
          return_transfer: "van",
          airport_lead_time: "3h",
          flight_alignment: "ok",
        },
      },
      resortOffers: [
        {
          id: "h1",
          tier: "value",
          name: "Palm Hotel",
          hotelEur: 600,
          mealPlan: "breakfast",
          guestScore: 8.4,
          images: ["https://img/1.jpg", "https://img/2.jpg"],
        },
      ],
    });
    expect(slim.tripStyle).toBe("single_base");
    expect(slim.resortOffers?.[0]?.name).toBe("Palm Hotel");
    expect(slim.resortStay?.resortGuide.relaxing_at_resort).toMatch(/bazen/);
  });
});
