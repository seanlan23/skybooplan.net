import { describe, expect, it } from "vitest";
import {
  ensureTransferPickupCopy,
  resolveResortTransferFlavor,
  resortTransferPromptRules,
  transferPickupLooksIncomplete,
} from "@/lib/resortTransferModel";

describe("resolveResortTransferFlavor", () => {
  it("uses country tables, not named-city UI branches", () => {
    expect(resolveResortTransferFlavor({ destinationIata: "MLE", destinationPlace: "Maldivi" })).toBe(
      "island_exclusive",
    );
    expect(resolveResortTransferFlavor({ destinationIata: "HKT", destinationPlace: "Phuket" })).toBe(
      "sea_ride_app",
    );
    expect(resolveResortTransferFlavor({ destinationIata: "CUN", destinationPlace: "Cancún" })).toBe(
      "caribbean_official",
    );
    expect(resolveResortTransferFlavor({ destinationIata: "PUJ" })).toBe("caribbean_official");
    expect(resolveResortTransferFlavor({ destinationIata: "ZNZ" })).toBe("generic");
  });
});

describe("ensureTransferPickupCopy", () => {
  it("replaces a thin driver-with-a-sign line with the three real options", () => {
    const out = ensureTransferPickupCopy(
      "Šofer vas bo pričakal z napisom.",
      { destinationIata: "HKT", destinationPlace: "Phuket" },
      "sl",
    );
    expect(out).toMatch(/Naročilo prek hotela/);
    expect(out).toMatch(/Grab|Bolt/);
    expect(out).toMatch(/Uradni letališki taksi pult/);
    expect(out).toMatch(/minivan|kombij/);
    expect(out).not.toMatch(/^Šofer vas bo pričakal z napisom\.?$/);
  });

  it("adds the exclusive resort + 3-day rule for Maldives", () => {
    const out = ensureTransferPickupCopy("", { destinationIata: "MLE", destinationName: "Maldivi" }, "sl");
    expect(out).toMatch(/izključno resort/i);
    expect(out).toMatch(/3 dni/);
    expect(out).toMatch(/gliser|hidroplan/i);
    expect(out).toMatch(/Naročilo prek hotela/);
  });

  it("keeps a full Gemini write-up that already has the three paths", () => {
    const full = [
      "1. Naročilo prek hotela: po Booking.com pošljite hotelu sporočilo s številko leta.",
      "2. Aplikacija Grab ali Bolt pred terminalom.",
      "3. Uradni pult za taksije v prihodni avli s fiksno ceno.",
    ].join("\n");
    expect(transferPickupLooksIncomplete(full)).toBe(false);
    expect(ensureTransferPickupCopy(full, { destinationIata: "HKT" }, "sl")).toBe(full);
  });
});

describe("resortTransferPromptRules", () => {
  it("forbids the sign-only line and requires three options", () => {
    const rules = resortTransferPromptRules("generic", "Zanzibar");
    expect(rules).toMatch(/Šofer vas bo pričakal z napisom/);
    expect(rules).toMatch(/3 realne poti|VSE 3/);
    expect(rules).toMatch(/Booking\.com/);
  });
});
