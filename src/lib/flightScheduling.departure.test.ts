import { describe, expect, it } from "vitest";
import { buildDepartureLogistics } from "@/lib/flightScheduling";
import { resolveTripLocale } from "@/lib/tripLocale";

describe("buildDepartureLogistics motorhome", () => {
  const locale = resolveTripLocale("LAX", "Los Angeles", "sl");
  const flights = {
    outboundDepart: "10:00",
    outboundArrive: "14:00",
    outboundArriveDayOffset: 0,
    inboundDepart: "18:59",
  };

  it("uses RV return wording, not hotel check-out", () => {
    const acts = buildDepartureLogistics("Los Angeles", flights, locale, {
      accommodationMode: "motorhome",
    });
    expect(acts[0]!.name).toMatch(/avtodom|najemnico/i);
    expect(acts[0]!.name).not.toMatch(/hotel/i);
    expect(acts[0]!.description).not.toMatch(/recepcij/i);
    expect(acts[0]!.description).toMatch(/najemnico/i);
  });
});
