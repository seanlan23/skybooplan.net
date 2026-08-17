import { describe, expect, it } from "vitest";
import { classifyStreamAbort, waitUntilDocumentVisible } from "@/lib/streamAbort";

describe("classifyStreamAbort", () => {
  it("treats explicit cancel as user abort", () => {
    expect(
      classifyStreamAbort({ aborted: true, userAborted: true, idleTimedOut: false }),
    ).toBe("user");
  });

  it("treats watchdog timeout as idle", () => {
    expect(
      classifyStreamAbort({ aborted: true, userAborted: false, idleTimedOut: true }),
    ).toBe("idle");
  });

  it("treats screen-lock / iOS fetch kill as a connection drop", () => {
    expect(
      classifyStreamAbort({ aborted: true, userAborted: false, idleTimedOut: false }),
    ).toBe("connection");
  });

  it("returns null when the stream was not aborted", () => {
    expect(
      classifyStreamAbort({ aborted: false, userAborted: false, idleTimedOut: false }),
    ).toBeNull();
  });
});

describe("waitUntilDocumentVisible", () => {
  it("resolves immediately when the tab is already visible", async () => {
    await expect(waitUntilDocumentVisible()).resolves.toBeUndefined();
  });

  it("rejects when the wait is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(waitUntilDocumentVisible(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
