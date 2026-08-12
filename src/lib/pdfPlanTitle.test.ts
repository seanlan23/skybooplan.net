import { describe, expect, it } from "vitest";
import { buildPdfPlanTitle } from "@/lib/pdfPlanTitle";

describe("buildPdfPlanTitle", () => {
  it("uses places for motorhome instead of IATA", () => {
    expect(
      buildPdfPlanTitle({
        groundTransportMode: "motorhome",
        originPlace: "Mežica",
        destinationPlace: "Italija",
        from: "LJU",
        to: "FCO",
      }),
    ).toBe("Mežica → Italija");
  });

  it("keeps IATA for flight plans", () => {
    expect(
      buildPdfPlanTitle({
        from: "LJU",
        to: "FCO",
        originPlace: "Ljubljana",
      }),
    ).toBe("LJU → FCO");
  });

  it("uses places for car trips even when origin IATA is LJU and dest IATA is empty", () => {
    expect(
      buildPdfPlanTitle({
        groundTransportMode: "car",
        originPlace: "Črna na Koroškem",
        destinationPlace: "Balkan",
        from: "LJU",
        to: "",
      }),
    ).toBe("Črna na Koroškem → Balkan");
  });
});
