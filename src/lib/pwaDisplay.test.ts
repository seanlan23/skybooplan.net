import { describe, expect, it } from "vitest";
import { isPwaLaunchSource, isSnoozeActive, snoozeUntilTimestamp } from "./pwaDisplay";

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

describe("install prompt snooze", () => {
  const now = Date.parse("2026-08-13T20:00:00Z");

  it("hides the sheet for 3 days after a show", () => {
    const until = snoozeUntilTimestamp(now, 3);
    expect(isSnoozeActive(String(until), now)).toBe(true);
    expect(isSnoozeActive(String(until), now + 2 * 24 * 60 * 60 * 1000)).toBe(true);
    expect(isSnoozeActive(String(until), until)).toBe(false);
  });

  it("shows again after the snooze expires", () => {
    expect(isSnoozeActive(null, now)).toBe(false);
    expect(isSnoozeActive("nope", now)).toBe(false);
  });
});
