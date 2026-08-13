import { describe, expect, it } from "vitest";
import { isPwaLaunchSource } from "./pwaDisplay";

describe("isPwaLaunchSource", () => {
  it("recognizes the home-screen start_url", () => {
    expect(isPwaLaunchSource("?source=pwa")).toBe(true);
    expect(isPwaLaunchSource("source=pwa")).toBe(true);
  });

  it("recognizes the plan shortcut", () => {
    expect(isPwaLaunchSource("?source=pwa-plan")).toBe(true);
  });

  it("ignores a normal browser visit", () => {
    expect(isPwaLaunchSource("")).toBe(false);
    expect(isPwaLaunchSource("?utm_source=pwa")).toBe(false);
    expect(isPwaLaunchSource("?source=safari")).toBe(false);
  });
});
