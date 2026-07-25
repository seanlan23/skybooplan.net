import { describe, expect, it } from "vitest";
import { repairTransportLegs } from "@/lib/transportLegRepair";

describe("repairTransportLegs", () => {
  it("fixes Bangkok → Bangkok arrival van to airport → city center", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "van",
          from: "Bangkok",
          to: "Bangkok",
          duration: "1h 30min",
          estimatedPrice: 15,
        },
      ],
      {
        dayNumber: 1,
        city: "Bangkok",
        destinationIata: "BKK",
        activities: {
          morning: [
            {
              name: "Pristanek na letališču Suvarnabhumi",
              type: "TRANSPORT",
            },
          ],
          afternoon: [],
          evening: [],
        },
      },
    );

    expect(legs).toHaveLength(1);
    expect(legs![0]!.from).toContain("Suvarnabhumi");
    expect(legs![0]!.to).toContain("Bangkok");
    expect(legs![0]!.from).not.toBe(legs![0]!.to);
  });

  it("keeps valid inter-city flight legs unchanged", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "flight",
          from: "Bangkok",
          to: "Koh Samui",
          duration: "1h 15min",
          estimatedPrice: 220,
        },
      ],
      {
        dayNumber: 5,
        city: "Koh Samui",
        previousCity: "Bangkok",
      },
    );

    expect(legs).toHaveLength(1);
    expect(legs![0]!.from).toBe("Bangkok");
    expect(legs![0]!.to).toBe("Koh Samui");
  });

  it("does not invent a direct flight from Koh Lipe to Phuket", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "flight",
          from: "Koh Lipe",
          to: "Koh Lipe",
          duration: "1h",
          estimatedPrice: 80,
        },
      ],
      {
        dayNumber: 12,
        city: "Koh Lipe",
        previousCity: "Phuket",
        destinationIata: "HKT",
      },
    );

    expect(legs).toBeUndefined();
  });

  it("drops same-IATA airport-to-airport flight nonsense", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "flight",
          from: "Phuket (HKT)",
          to: "Phuket (HKT)",
          duration: "45min",
          estimatedPrice: 40,
        },
      ],
      {
        dayNumber: 3,
        city: "Phuket",
        destinationIata: "HKT",
      },
    );

    expect(legs).toBeUndefined();
  });

  it("drops impossible long van hops (Las Vegas → Los Angeles)", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "van",
          from: "Las Vegas",
          to: "Los Angeles",
          duration: "4h",
          estimatedPrice: 50,
        },
      ],
      {
        dayNumber: 15,
        city: "Los Angeles",
        previousCity: "Las Vegas",
        destinationIata: "JFK",
      },
    );
    expect(legs).toBeUndefined();
  });

  it("drops fake flight titles that are hotel/airport logistics", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "flight",
          from: "Hotel Check out & Transfer to LAX",
          to: "New York",
          duration: "1h",
          estimatedPrice: 0,
        },
      ],
      {
        dayNumber: 18,
        city: "Los Angeles",
        destinationIata: "JFK",
      },
    );
    expect(legs).toBeUndefined();
  });
});
