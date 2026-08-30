import { describe, expect, it } from "vitest";
import { sharePackageIdFromInput, unwrapServerFnInput } from "@/lib/sharedPackageParse";

describe("unwrapServerFnInput", () => {
  it("reads id from both the inner payload and a { data } wrapper", () => {
    expect(sharePackageIdFromInput({ id: "tok123" })).toBe("tok123");
    expect(sharePackageIdFromInput({ data: { id: "tok123" } })).toBe("tok123");
    expect(
      (unwrapServerFnInput({ data: { plan: { destinationName: "X" } } }) as { plan: { destinationName: string } })
        .plan.destinationName,
    ).toBe("X");
  });
});
