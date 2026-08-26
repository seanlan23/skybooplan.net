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

describe("buildDepartureLogistics hotel clocks", () => {
  it("keeps real flight time in transfer prose (not transfer slot)", () => {
    const locale = resolveTripLocale("CDG", "Paris", "en");
    const acts = buildDepartureLogistics(
      "Paris",
      {
        outboundDepart: "08:00",
        outboundArrive: "09:30",
        outboundArriveDayOffset: 0,
        inboundDepart: "08:30",
        inboundArrive: "10:00",
      },
      locale,
      { accommodationMode: "hotel" },
    );
    const transfer = acts.find((a) => /airport transfer/i.test(a.name));
    expect(transfer?.arrivalTime).toBe("04:00");
    expect(transfer?.description).toMatch(/Flight departs at 08:30/);
    expect(transfer?.description).not.toMatch(/departs at 04:00/);
    const flight = acts.find((a) => /international return flight/i.test(a.name));
    expect(flight?.arrivalTime).toBe("08:30");
    expect(flight?.departureTime).toBe("10:00");
  });

  it("does not say 'Zjutraj' for a 23:30 departure checkout", () => {
    const locale = resolveTripLocale("BKK", "Bangkok", "sl");
    const acts = buildDepartureLogistics(
      "Bangkok",
      {
        outboundDepart: "15:15",
        outboundArrive: "10:45",
        outboundArriveDayOffset: 1,
        inboundDepart: "23:30",
        inboundArrive: "10:05",
      },
      locale,
      { accommodationMode: "hotel" },
    );
    const checkout = acts.find((a) => /check-out|odjava|odhod iz hotela/i.test(a.name));
    expect(checkout?.description).not.toMatch(/Zjutraj/i);
    expect(checkout?.description).toMatch(/Odjava pred odhodom/i);
  });

  it("does not call a 01:30 red-eye a morning checkout", () => {
    const locale = resolveTripLocale("DPS", "Canggu", "sl");
    const acts = buildDepartureLogistics(
      "Canggu",
      {
        outboundDepart: "11:55",
        outboundArrive: "11:25",
        outboundArriveDayOffset: 1,
        inboundDepart: "01:30",
        inboundArrive: "06:40",
      },
      locale,
      { accommodationMode: "hotel" },
    );
    const checkout = acts.find((a) => /check-out|odjava|odhod iz hotela/i.test(a.name));
    expect(checkout?.arrivalTime).toBe("21:30");
    expect(checkout?.description).not.toMatch(/Zjutraj/i);
    expect(checkout?.description).toMatch(/zvečer|nočn/i);
    const airport = acts.find((a) => /prihod na letališče/i.test(a.name));
    expect(airport?.description).not.toMatch(/Zgodnji\/popoldanski/i);
    expect(airport?.description).toMatch(/Nočni let ob 01:30/i);
  });
});
