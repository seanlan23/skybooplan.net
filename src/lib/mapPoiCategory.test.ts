import { describe, expect, it } from "vitest";
import { inferMapPoiCategoryFromText, resolveMapPoiCategory } from "@/lib/mapPoiCategory";

describe("mapPoiCategory", () => {
  it("prefers train over airport when activity is a rail leg", () => {
    expect(
      resolveMapPoiCategory({
        name: "Vožnja z vlakom iz Bangkoka v Ayutthayo",
        description: "Po prihodu na postajo raziskuj staro mesto.",
        type: "AIRPORT",
        transportType: "train",
      }),
    ).toBe("train");
  });

  it("uses airport for explicit internal flights", () => {
    expect(
      inferMapPoiCategoryFromText("Notranji let Bangkok (DMK) -> Surat Thani (URT)"),
    ).toBe("airport");
  });

  it("classifies temples as sightseeing not airport", () => {
    expect(inferMapPoiCategoryFromText("Obisk veličastne kraljeve palače Grand Palace")).toBe(
      "sightseeing",
    );
  });
});
