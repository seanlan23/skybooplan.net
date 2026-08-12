import { describe, expect, it } from "vitest";
import {
  estimateCampNightlyEur,
  estimateHotelRoomNightlyEur,
  estimateOvernightStay,
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

  it("camp nightly scales with pax", () => {
    expect(estimateCampNightlyEur("HR", 2)).toBeGreaterThanOrEqual(40);
    expect(estimateCampNightlyEur("HR", 4)).toBeGreaterThan(estimateCampNightlyEur("HR", 2));
  });
});
