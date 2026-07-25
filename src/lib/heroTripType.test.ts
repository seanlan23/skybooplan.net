import { describe, expect, it } from "vitest";
import { buildHeroMakeSearchQuery, normalizeHeroTripType } from "@/lib/heroChatFlow";
import { resolveMakeFlightLegAirports } from "@/lib/flightCardRoute";
import {
  applyHeroTripHints,
  parseMakeSearchUserMessage,
  type MakeSearchFlight,
} from "@/lib/makeSearch";
import { heroChatToPlannerPayload } from "@/lib/heroChatPlanner";

describe("hero trip type", () => {
  it("normalizeHeroTripType maps aliases", () => {
    expect(normalizeHeroTripType("one-way")).toBe("oneway");
    expect(normalizeHeroTripType("open_jaw")).toBe("openjaw");
    expect(normalizeHeroTripType("multicity")).toBe("openjaw");
    expect(normalizeHeroTripType(undefined)).toBe("return");
  });

  it("buildHeroMakeSearchQuery encodes one-way and open-jaw", () => {
    const oneway = buildHeroMakeSearchQuery(
      {
        destination: "Manila",
        dates: "10. nov 2026",
        nights: "",
        origin: "Munich (MUC)",
        passengers: "2 adults",
        pace: "",
        budget: "",
        tripType: "oneway",
      },
      "flights",
    );
    expect(oneway.toLowerCase()).toMatch(/one-way|enosmerno/);

    const openjaw = buildHeroMakeSearchQuery(
      {
        destination: "Manila",
        dates: "10. nov → 20. nov 2026",
        nights: "",
        origin: "Munich (MUC)",
        passengers: "2 adults",
        pace: "",
        budget: "",
        tripType: "openjaw",
        returnFromIata: "CEB",
      },
      "flights",
    );
    expect(openjaw).toMatch(/open-jaw return from CEB/i);
  });

  it("applyHeroTripHints drops return_date for oneway", () => {
    const base = parseMakeSearchUserMessage(
      "Flights to Manila (MNL), round-trip / povratno, dates 10. nov → 20. nov 2026, from Munich (MUC)",
    );
    const hinted = applyHeroTripHints(base, {
      tripType: "oneway",
      departDate: "2026-11-10",
      originIata: "MUC",
      destinationIata: "MNL",
    });
    expect(hinted.trip_type).toBe("oneway");
    expect(hinted.return_date).toBe("");
    expect(hinted.departure_date).toBe("2026-11-10");
  });

  it("applyHeroTripHints sets open-jaw return_from_airport", () => {
    const base = parseMakeSearchUserMessage(
      "Flights to Manila (MNL), dates 10. nov → 20. nov 2026, from Munich (MUC)",
    );
    const hinted = applyHeroTripHints(base, {
      tripType: "openjaw",
      returnFromIata: "CEB",
      departDate: "2026-11-10",
      returnDate: "2026-11-20",
      originIata: "MUC",
      destinationIata: "MNL",
    });
    expect(hinted.trip_type).toBe("openjaw");
    expect(hinted.return_from_airport).toBe("CEB");
    expect(hinted.return_date).toBe("2026-11-20");
  });

  it("heroChatToPlannerPayload sets returnFromIata for openjaw", () => {
    const { ctx } = heroChatToPlannerPayload(
      {
        destination: "Manila (MNL)",
        dates: "10. nov → 20. nov 2026",
        nights: "",
        origin: "Munich (MUC)",
        passengers: "2 odrasla",
        pace: "Sproščeno",
        budget: "500–1000€",
        tripType: "openjaw",
        returnFromIata: "CEB",
      },
      "en",
    );
    expect(ctx.returnFromIata).toBe("CEB");
    expect(ctx.returnDate).toBeTruthy();
  });

  it("resolveMakeFlightLegAirports keeps open-jaw airports", () => {
    const flight: MakeSearchFlight = {
      id: "1",
      destinacija: "MUC → MNL",
      cena_eur: 900,
      odhod: "10 Nov 11:25",
      povratek: "20 Nov 18:10",
      prevoznik: "Test",
      postanki: "1/1",
      ai_povzetek: "",
      origin_iata: "MUC",
      destination_iata: "MNL",
      inbound_origin_iata: "CEB",
      inbound_destination_iata: "MUC",
      inbound_depart: "18:10",
    };
    const legs = resolveMakeFlightLegAirports(flight);
    expect(legs.hasReturn).toBe(true);
    expect(legs.returnFrom).toBe("CEB");
    expect(legs.returnTo).toBe("MUC");
    expect(legs.from).toBe("MUC");
    expect(legs.to).toBe("MNL");
  });
});
