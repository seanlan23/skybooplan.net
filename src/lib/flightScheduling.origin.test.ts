import { describe, expect, it } from "vitest";
import { buildSkeletonDayPlans, type TripSkeleton } from "@/lib/aiPlan.functions";
import {
  buildOriginDepartureHint,
  buildOriginDepartureLogistics,
} from "@/lib/flightScheduling";

describe("origin airport departure hints", () => {
  it("mentions Parkvia for EU origin (LJU)", () => {
    const hint = buildOriginDepartureHint("LJU", {
      outboundDepart: "08:15",
      outboundArrive: "14:30",
      outboundArriveDayOffset: 0,
    });
    expect(hint).toMatch(/LJU|Ljubljana/i);
    expect(hint).toMatch(/08:15/);
    expect(hint).toMatch(/Parkvia/i);
    expect(hint).toMatch(/vsaj 3 ure pred odletom|2–3 ure pred odletom/i);
    expect(hint).not.toMatch(/3–3|2\.5–3|uri pred/i);
  });

  it("builds origin logistics activities with correct hour grammar", () => {
    const acts = buildOriginDepartureLogistics("MXP", {
      outboundDepart: "11:00",
      outboundArrive: "23:30",
      outboundArriveDayOffset: 1,
    });
    expect(acts[0]!.name).toMatch(/MXP|Milan/i);
    expect(acts[1]!.description).toMatch(/check-in|varnostni/i);
    expect(acts[1]!.description).toMatch(/2–3 ure pred odletom/i);
    expect(acts[1]!.description).not.toMatch(/uri pred|2\. 5|3–3/i);
  });

  it("sets structured origin clocks from boarding-pass (not LLM)", () => {
    // 11:00 depart → lead 2.5h → at airport 08:30, security 09:00
    const acts = buildOriginDepartureLogistics("MXP", {
      outboundDepart: "11:00",
      outboundArrive: "23:30",
      outboundArriveDayOffset: 1,
    });
    expect(acts[0]!.arrivalTime).toBe("08:30");
    expect(acts[1]!.arrivalTime).toBe("09:00");
  });

  it("prepends origin departure on day 1 of skeleton plan", () => {
    const skeleton: TripSkeleton = {
      destinationName: "Tajska",
      destinationIata: "BKK",
      originIata: "LJU",
      departDate: "2026-08-01",
      summary: "",
      regions: [
        {
          city: "Bangkok",
          startDay: 1,
          endDay: 3,
          summary: "Bangkok",
          lat: 13.75,
          lng: 100.5,
          highlights: [
            {
              day: 1,
              name: "Grand Palace",
              description: "Tempelj.",
              lat: 13.75,
              lng: 100.49,
            },
          ],
        },
      ],
    };
    const days = buildSkeletonDayPlans(skeleton, {
      originIata: "LJU",
      flights: {
        outboundDepart: "06:30",
        outboundArrive: "19:00",
        outboundArriveDayOffset: 0,
      },
      lang: "sl",
    });
    const day1 = days.find((d) => d.day === 1);
    expect(day1?.travelHack).toMatch(/Parkvia|LJU/i);
    expect(day1?.travelHack).toMatch(/vsaj 3 ure|2–3 ure/i);
  });
});
