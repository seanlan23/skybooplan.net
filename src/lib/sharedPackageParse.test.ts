import { describe, expect, it } from "vitest";
import { shareLookupFromInput, sharePackageIdFromInput, unwrapServerFnInput } from "@/lib/sharedPackageParse";

describe("unwrapServerFnInput", () => {
  it("reads id from both the inner payload and a { data } wrapper", () => {
    expect(sharePackageIdFromInput({ id: "tok123" })).toBe("tok123");
    expect(sharePackageIdFromInput({ data: { id: "tok123" } })).toBe("tok123");
    expect(sharePackageIdFromInput({ data: { data: { id: "4c5f0x4j2442" } } })).toBe("4c5f0x4j2442");
    expect(sharePackageIdFromInput({ id: '"4c5f0x4j2442"' })).toBe("4c5f0x4j2442");
    expect(
      (unwrapServerFnInput({ data: { plan: { destinationName: "X" } } }) as { plan: { destinationName: string } })
        .plan.destinationName,
    ).toBe("X");
    expect(
      shareLookupFromInput({
        data: { id: "4c5f0x4j2442", hotelId: '"1286043"', to: "HKT", depart: "2026-11-14" },
      }),
    ).toEqual({
      id: "4c5f0x4j2442",
      hotelId: "1286043",
      to: "HKT",
      depart: "2026-11-14",
    });
  });
});
