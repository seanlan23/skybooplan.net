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

  it("coerces fake FLIGHT day-trips to car on car/motorhome road trips", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "flight",
          from: "Izlet v kanjon reke Osum",
          to: "Berat",
          duration: "1h",
          estimatedPrice: 30,
        },
      ],
      {
        dayNumber: 7,
        city: "Berat",
        previousCity: "Berat",
        groundTransportMode: "car",
      },
    );

    expect(legs).toHaveLength(1);
    expect(legs![0]!.type).toBe("car");
    expect(legs![0]!.type).not.toBe("flight");
  });

  it("coerces Himara→Kotor FLIGHT label to car on road trips", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "flight",
          from: "Himara",
          to: "Kotor",
          duration: "1h",
          estimatedPrice: 25,
        },
      ],
      {
        dayNumber: 14,
        city: "Kotor",
        previousCity: "Himara",
        groundTransportMode: "car",
      },
    );

    expect(legs).toHaveLength(1);
    expect(legs![0]!.type).toBe("car");
    expect(legs![0]!.from).toBe("Himara");
    expect(legs![0]!.to).toBe("Kotor");
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

  it("rewrites Texel ferry legs that wrongly point at Amsterdam", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "van",
          from: "Vožnja do trajektnega pristanišča Den Helder",
          to: "Amsterdam",
          duration: "1h",
          estimatedPrice: 0,
        },
        {
          type: "ferry",
          from: "Trajekt do otoka Texel",
          to: "Amsterdam",
          duration: "1h",
          estimatedPrice: 0,
        },
      ],
      {
        dayNumber: 6,
        city: "Amsterdam",
        previousCity: "Amsterdam",
      },
    );
    expect(legs).toEqual([
      {
        type: "van",
        from: "Amsterdam",
        to: "Den Helder",
        duration: "1h",
        estimatedPrice: 0,
      },
      {
        type: "ferry",
        from: "Den Helder",
        to: "Texel",
        duration: "1h",
        estimatedPrice: 0,
      },
    ]);
  });

  it("relabels self-drive van stages as car on a car road trip", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "van",
          from: "Črna na Koroškem, SI",
          to: "Zadar, HR",
          duration: "4h 15m",
          estimatedPrice: 30,
        },
      ],
      {
        dayNumber: 1,
        city: "Zadar",
        previousCity: "Črna na Koroškem",
        groundTransportMode: "car",
      },
    );
    expect(legs?.[0]?.type).toBe("car");
    expect(legs?.[0]?.from).toMatch(/Črna/i);
    expect(legs?.[0]?.to).toMatch(/Zadar/i);
  });

  it("rebases leftover ferry from yesterday's city onto today's overnight", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "ferry",
          from: "Shkoder",
          to: "Lokrum Island",
          duration: "1h",
          estimatedPrice: 20,
        },
      ],
      {
        dayNumber: 9,
        city: "Dubrovnik",
        previousCity: "Shkoder",
        groundTransportMode: "car",
      },
    );
    expect(legs?.[0]?.from).toMatch(/Dubrovnik/i);
    expect(legs?.[0]?.to).toMatch(/Lokrum/i);
  });

  it("does not turn a CUN domestic-hop day into a Mexico City → MEX airport van", () => {
    const legs = repairTransportLegs(
      [
        {
          type: "van",
          from: "Mexico City",
          to: "Mexico City",
          duration: "2h 15min",
          estimatedPrice: 40,
        },
      ],
      {
        dayNumber: 14,
        city: "Mexico City",
        destinationIata: "MEX",
        previousCity: "Isla Holbox",
        activities: {
          morning: [
            {
              name: "Prevoz iz Chiquilá na letališče Cancun (CUN)",
              type: "TRANSPORT",
              description: "Kombi do CUN.",
            },
          ],
          afternoon: [
            {
              name: "Notranji let Cancun (CUN) → Mexico City (MEX)",
              type: "TRANSPORT",
              transportType: "flight",
            },
          ],
          evening: [],
        },
      },
    );
    expect(legs ?? []).toHaveLength(0);
  });
});
