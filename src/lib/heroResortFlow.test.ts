import { describe, expect, it } from "vitest";
import {
  isResortPackageSearch,
  pickResortBaseFlight,
  plannerContextFromHeroFlight,
  stayDatesFromSelectedFlight,
} from "@/lib/heroResortFlow";
import type { AiPlannerContext } from "@/components/AiPlannerPreview";
import type { MakeSearchFlight } from "@/lib/makeSearch";

function flight(over: Partial<MakeSearchFlight> & Pick<MakeSearchFlight, "id" | "cena_eur">): MakeSearchFlight {
  return {
    destinacija: "MLE",
    odhod: "2026-09-19 10:00",
    prevoznik: "EK",
    postanki: "0/0",
    ai_povzetek: "",
    origin_iata: "LJU",
    destination_iata: "MLE",
    depart_date: "2026-09-19",
    return_date: "2026-09-26",
    inbound_depart: "10:00",
    outbound_depart: "10:00",
    outbound_arrive: "22:00",
    duration_minutes: 800,
    ...over,
  };
}

describe("isResortPackageSearch", () => {
  it("is true only for Full plan + resort", () => {
    expect(isResortPackageSearch({ travelStyle: "resort" }, "all")).toBe(true);
    expect(isResortPackageSearch({ travelStyle: "explore" }, "all")).toBe(false);
    expect(isResortPackageSearch({ travelStyle: "resort" }, "flights")).toBe(false);
  });
});

describe("pickResortBaseFlight", () => {
  it("prefers the ranked return flight over a cheaper one-way", () => {
    const picked = pickResortBaseFlight([
      flight({
        id: "oneway",
        cena_eur: 200,
        inbound_depart: undefined,
        return_date: undefined,
        povratek: undefined,
        duration_minutes: 400,
      }),
      flight({ id: "return", cena_eur: 480, duration_minutes: 820 }),
    ]);
    expect(picked?.id).toBe("return");
  });

  it("picks the best-value return among several", () => {
    const picked = pickResortBaseFlight([
      flight({ id: "slow", cena_eur: 400, duration_minutes: 2200 }),
      flight({ id: "fast", cena_eur: 520, duration_minutes: 700 }),
      flight({ id: "mid", cena_eur: 450, duration_minutes: 900 }),
    ]);
    expect(picked?.id).toBeTruthy();
    expect(picked?.id).not.toBe("slow");
  });
});

describe("stayDatesFromSelectedFlight", () => {
  it("uses the offer ISO dates and ignores a flexible planner window", () => {
    expect(
      stayDatesFromSelectedFlight(
        {
          depart_date: "2026-10-01",
          return_date: "2026-10-08",
          outbound_depart: "10:00",
        } as MakeSearchFlight,
        { departDate: "2026-10-20", returnDate: "2026-10-31" },
      ),
    ).toEqual({ departDate: "2026-10-01", returnDate: "2026-10-08" });
  });

  it("does not treat HH:mm flight times as stay dates", () => {
    expect(
      stayDatesFromSelectedFlight({
        outbound_depart: "10:00",
        inbound_depart: "22:30",
        odhod: "2026-10-01 10:00",
        povratek: "2026-10-08 22:30",
      } as MakeSearchFlight),
    ).toEqual({ departDate: "2026-10-01", returnDate: "2026-10-08" });
  });
});

describe("plannerContextFromHeroFlight", () => {
  it("overwrites the chat date window with the selected flight dates", () => {
    const base: AiPlannerContext = {
      from: "LJU",
      to: "PUJ",
      departDate: "2026-10-20",
      returnDate: "2026-10-31",
      pax: 2,
      adults: 2,
      childrenAges: [],
    };
    const ctx = plannerContextFromHeroFlight(
      flight({
        id: "puj",
        cena_eur: 900,
        destinacija: "PUJ",
        destination_iata: "PUJ",
        depart_date: "2026-10-01",
        return_date: "2026-10-08",
        outbound_depart: "10:00",
      }),
      base,
    );
    expect(ctx.departDate).toBe("2026-10-01");
    expect(ctx.returnDate).toBe("2026-10-08");
  });

  it("stamps hotel stay on destination arrival, not home depart", () => {
    const ctx = plannerContextFromHeroFlight(
      flight({
        id: "hkt",
        cena_eur: 720,
        destinacija: "HKT",
        destination_iata: "HKT",
        depart_date: "2026-10-26",
        return_date: "2026-11-06",
        outbound_depart: "19:40",
        outbound_arrive: "10:10",
        outbound_arrive_day_offset: 1,
        outbound_arrive_iso: "2026-10-27T10:10:00+07:00",
        inbound_depart_iso: "2026-11-06T09:25:00+07:00",
      }),
      {
        from: "LJU",
        to: "HKT",
        departDate: "2026-10-20",
        returnDate: "2026-11-10",
        pax: 2,
        adults: 2,
        childrenAges: [],
      },
    );
    expect(ctx.departDate).toBe("2026-10-26");
    expect(ctx.returnDate).toBe("2026-11-06");
    expect(ctx.flights?.outboundArriveDate).toBe("2026-10-27");
    expect(ctx.flights?.inboundDepartDate).toBe("2026-11-06");
  });

  it("carries layover airport and wait into planner flight context", () => {
    const ctx = plannerContextFromHeroFlight(
      flight({
        id: "pek",
        cena_eur: 640,
        destinacija: "BKK",
        destination_iata: "BKK",
        postanki: "1|PEK/0",
        outbound_layovers: [{ iata: "PEK", minutes: 90 }],
      }),
      {
        from: "VIE",
        to: "BKK",
        departDate: "2026-11-20",
        returnDate: "2026-11-30",
        pax: 2,
        adults: 2,
        childrenAges: [],
      },
    );
    expect(ctx.flights?.outboundVia).toBe("PEK");
    expect(ctx.flights?.outboundStops).toBe(1);
    expect(ctx.flights?.outboundLayovers).toEqual([{ iata: "PEK", minutes: 90 }]);
  });
});
