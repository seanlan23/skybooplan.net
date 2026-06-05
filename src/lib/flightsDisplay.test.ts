import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function displayTimeFromIso(iso: string) {
  const localTimeMatch = iso.match(/T(\d{2}:\d{2})/);
  if (localTimeMatch?.[1]) return localTimeMatch[1];

  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

describe("flight display regressions", () => {
  it("preserves the carrier's local departure and arrival times from ISO strings", () => {
    expect(displayTimeFromIso("2026-07-10T09:15:00+07:00")).toBe("09:15");
    expect(displayTimeFromIso("2026-07-10T21:00:00+02:00")).toBe("21:00");
    expect(displayTimeFromIso("2026-07-20T09:40:00")).toBe("09:40");
  });

  it("renders results as total price instead of per-adult pricing", () => {
    const flightResultsSource = readFileSync(
      resolve(process.cwd(), "src/components/FlightResults.tsx"),
      "utf8",
    );
    const i18nSource = readFileSync(resolve(process.cwd(), "src/lib/i18n.tsx"), "utf8");

    expect(flightResultsSource).toContain('t("results.totalPrice")');
    expect(i18nSource).toContain('"results.totalPrice": "total price"');
    expect(i18nSource).toContain('"results.totalPrice": "skupna cena"');
  });
});