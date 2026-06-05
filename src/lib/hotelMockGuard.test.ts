import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static guard: the production hotel rendering path must never reintroduce
 * the deleted mock generators or ship hardcoded (0,0) coordinates. These
 * tests fail loudly if a regression smuggles them back in.
 */

const files = [
  "src/components/AiPlanView.tsx",
  "src/lib/hotelSelection.ts",
];

const readAll = () =>
  files
    .map((f) => `// FILE ${f}\n` + readFileSync(resolve(process.cwd(), f), "utf8"))
    .join("\n\n");

describe("hotel rendering — mock data guard", () => {
  const source = readAll();

  it("does not contain the removed `generateHotels` mock generator", () => {
    expect(source).not.toMatch(/\bgenerateHotels\b/);
  });

  it("does not concatenate a destination name onto a hardcoded list", () => {
    // Patterns from the old "Urban Raziskovanje {city}..." mock prefixing.
    expect(source).not.toMatch(/Urban Raziskovanje/i);
    expect(source).not.toMatch(/Raziskovanje\s*\$\{/);
  });

  it("never references Polish/European mock hotel chains hardcoded in code", () => {
    // The legacy mock list shipped names like "Hotel Polonia" / "Warszawa".
    expect(source).not.toMatch(/Hotel Polonia/i);
    expect(source).not.toMatch(/Warszawa/i);
  });

  it("contains no hardcoded (0, 0) coordinate literals", () => {
    // Matches patterns like `{ lat: 0, lng: 0 }` or `[0, 0]` used as a
    // location. Allows incidental zeros (indices, paddings) by requiring
    // the lat/lng keyword shape.
    expect(source).not.toMatch(/lat:\s*0\s*,\s*lng:\s*0/);
    expect(source).not.toMatch(/latitude:\s*0\s*,\s*longitude:\s*0/);
  });

  it("renders an explicit empty state for sub-locations with no results", () => {
    // The empty-state copy now lives in i18n; the component must reference
    // the translation key so users always see a real message instead of
    // silently rendering nothing (or, worse, mock data).
    expect(source).toMatch(/aiplan\.hotelsEmptyTitle/);
    expect(source).toMatch(/aiplan\.hotelsEmptyCta/);
  });

  it("wires the hub fallback through `regionFallback`", () => {
    expect(source).toMatch(/regionFallback/);
    expect(source).toMatch(/selectHotelSource/);
  });
});
