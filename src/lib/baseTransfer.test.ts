import { describe, expect, it } from "vitest";
import {
  isBaseTransferLeg,
  orientArrivalTransferLeg,
  resolveTransferHub,
  sameTransferBase,
} from "@/lib/baseTransfer";

describe("resolveTransferHub", () => {
  it("maps Suvarnabhumi and München to IATA codes", () => {
    expect(resolveTransferHub("Suvarnabhumi")).toBe("BKK");
    expect(resolveTransferHub("München")).toBe("MUC");
    expect(resolveTransferHub("Dunaj (VIE)")).toBe("VIE");
  });
});

describe("sameTransferBase", () => {
  it("treats the destination airport and city as one base", () => {
    expect(sameTransferBase("Suvarnabhumi", "Bangkok")).toBe(true);
    expect(sameTransferBase("München", "Munich")).toBe(true);
  });
});

describe("orientArrivalTransferLeg", () => {
  it("flips day-1 Suvarnabhumi → München to origin → destination", () => {
    const next = orientArrivalTransferLeg(
      { type: "van", from: "Suvarnabhumi", to: "München" },
      { dayNumber: 1, originIata: "MUC", destinationIata: "BKK" },
    );
    expect(next.type).toBe("flight");
    expect(next.from).toBe("München");
    expect(next.to).toBe("Suvarnabhumi");
  });
});

describe("isBaseTransferLeg", () => {
  it("hides same-city day trips and airport–hotel vans", () => {
    expect(
      isBaseTransferLeg(
        { type: "ferry", from: "Phuket", to: "Koh Phi Phi" },
        { dayCity: "Phuket", prevCity: "Phuket", dayNumber: 6 },
      ),
    ).toBe(false);
    expect(
      isBaseTransferLeg(
        { type: "van", from: "Suvarnabhumi", to: "Bangkok" },
        { dayNumber: 1, originIata: "MUC", destinationIata: "BKK", dayCity: "Bangkok" },
      ),
    ).toBe(false);
  });

  it("keeps a real overnight-base hop and day-1 international after orientation", () => {
    expect(
      isBaseTransferLeg(
        { type: "flight", from: "BKK", to: "CNX" },
        { dayCity: "Chiang Mai", prevCity: "Bangkok", dayNumber: 4 },
      ),
    ).toBe(true);
    const oriented = orientArrivalTransferLeg(
      { type: "van", from: "Suvarnabhumi", to: "München" },
      { dayNumber: 1, originIata: "MUC", destinationIata: "BKK" },
    );
    expect(
      isBaseTransferLeg(oriented, {
        dayNumber: 1,
        originIata: "MUC",
        destinationIata: "BKK",
        dayCity: "Bangkok",
      }),
    ).toBe(true);
  });
});
