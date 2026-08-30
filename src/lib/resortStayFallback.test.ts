import { describe, expect, it } from "vitest";
import {
  fallbackResortStay,
  matchResortPackageId,
  resolveStayForPackageDetails,
} from "@/lib/resortStayFallback";

describe("resort stay fallback", () => {
  it("fills transfer copy so shared cards can still open details", () => {
    const stay = fallbackResortStay({ destinationIata: "HKT" }, "sl");
    expect(stay.arrivalProtocol.transfer_pickup).toMatch(/Grab|Bolt|hotel/i);
  });

  it("matches a quoted share hotelId to a live card", () => {
    expect(
      matchResortPackageId([{ id: "1286043" }, { id: "99" }], '"1286043"')?.id,
    ).toBe("1286043");
    expect(matchResortPackageId([{ id: "1286043" }], "999")).toBeUndefined();
  });

  it("keeps a saved protocol and only synthesizes when the stay is empty", () => {
    const saved = fallbackResortStay({ destinationIata: "MLE" }, "sl");
    saved.arrivalProtocol.visa_and_entry = "Visa on arrival";
    expect(resolveStayForPackageDetails(saved, { destinationIata: "MLE" }, "sl").arrivalProtocol.visa_and_entry).toBe(
      "Visa on arrival",
    );
    expect(resolveStayForPackageDetails(undefined, { destinationIata: "HKT" }, "sl").arrivalProtocol.transfer_pickup).toBeTruthy();
  });
});
