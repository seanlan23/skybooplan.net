import { describe, expect, it } from "vitest";
import {
  estimateCampNightlyEur,
  estimateHotelRoomNightlyEur,
  estimateOvernightStay,
  overnightPlaceHint,
  tripOvernightNights,
} from "@/lib/overnightEstimate";

describe("overnightEstimate", () => {
  it("uses Asia / Adriatic hotel bands", () => {
    expect(estimateHotelRoomNightlyEur("TH")).toBe(55);
    expect(estimateHotelRoomNightlyEur("VN")).toBe(55);
    expect(estimateHotelRoomNightlyEur("HR")).toBe(100);
    expect(estimateHotelRoomNightlyEur("SI")).toBe(100);
    expect(estimateHotelRoomNightlyEur("AT")).toBe(100);
  });

  it("prices NYC as a premium city, not generic US", () => {
    expect(estimateHotelRoomNightlyEur("US")).toBe(140);
    expect(estimateHotelRoomNightlyEur("US", { place: "New York" })).toBe(270);
    expect(estimateHotelRoomNightlyEur("US", { iata: "JFK" })).toBe(270);
    expect(estimateHotelRoomNightlyEur("XX", { place: "Manhattan" })).toBe(270);
  });

  it("still prices NYC when day 1 city is the origin hub", () => {
    expect(
      estimateHotelRoomNightlyEur("XX", {
        place: overnightPlaceHint({
          destinationName: "Združene države Amerike",
          destinationIata: "JFK",
          dayCities: ["München", "New York"],
        }),
        iata: "JFK",
      }),
    ).toBe(270);
  });

  it("NYC 5-day trip for 2 is one mid room × 4 nights", () => {
    const est = estimateOvernightStay({
      dayCount: 5,
      pax: 2,
      countryCode: "US",
      place: "New York",
      iata: "JFK",
      mode: "hotel",
    });
    expect(est.rooms).toBe(1);
    expect(est.nights).toBe(4);
    expect(est.totalEur).toBe(270 * 4);
  });

  it("nights = days - 1", () => {
    expect(tripOvernightNights(14)).toBe(13);
    expect(tripOvernightNights(1)).toBe(0);
  });

  it("hotel trip: room × rooms × nights for 2 pax", () => {
    const est = estimateOvernightStay({
      dayCount: 8,
      pax: 2,
      countryCode: "TH",
      mode: "hotel",
    });
    expect(est.kind).toBe("hotel");
    expect(est.nights).toBe(7);
    expect(est.rooms).toBe(1);
    expect(est.totalEur).toBe(55 * 7);
  });

  it("motorhome: no separate overnight row (camp in daily total)", () => {
    const est = estimateOvernightStay({
      dayCount: 10,
      pax: 2,
      countryCode: "HR",
      mode: "motorhome",
    });
    expect(est.kind).toBe("none");
    expect(est.totalEur).toBe(0);
  });

  it("subtracts unpaid home nights on a car loop", () => {
    const est = estimateOvernightStay({
      dayCount: 19,
      pax: 2,
      countryCode: "SK",
      mode: "car",
      unpaidNights: 2,
    });
    expect(est.nights).toBe(16);
  });

  it("camp nightly scales with pax", () => {
    expect(estimateCampNightlyEur("HR", 2)).toBeGreaterThanOrEqual(40);
    expect(estimateCampNightlyEur("HR", 4)).toBeGreaterThan(estimateCampNightlyEur("HR", 2));
  });
});
