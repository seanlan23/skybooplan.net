import { describe, expect, it } from "vitest";
import {
  applyRoadTollToDailyBudget,
  estimateDayTollEurPerPerson,
  tollEurPerKm,
} from "@/lib/roadTripCosts";

describe("roadTripCosts tolls", () => {
  it("Italy highway days add meaningful per-person tolls", () => {
    // 300 km × €0.10 = €30 household → €15/pp for 2
    expect(
      estimateDayTollEurPerPerson({
        drivingDistanceKm: 300,
        country: "IT",
        pax: 2,
        mode: "car",
      }),
    ).toBe(15);
  });

  it("motorhome pays a higher toll class than car in Italy", () => {
    const car = estimateDayTollEurPerPerson({
      drivingDistanceKm: 300,
      country: "IT",
      pax: 2,
      mode: "car",
    });
    const mh = estimateDayTollEurPerPerson({
      drivingDistanceKm: 300,
      country: "IT",
      pax: 2,
      mode: "motorhome",
    });
    expect(mh).toBeGreaterThan(car);
    expect(tollEurPerKm("IT", "motorhome")).toBeGreaterThan(tollEurPerKm("IT", "car"));
  });

  it("Germany Autobahn is toll-free for cars", () => {
    expect(
      estimateDayTollEurPerPerson({
        drivingDistanceKm: 400,
        country: "DE",
        pax: 2,
        mode: "car",
      }),
    ).toBe(0);
  });

  it("Austria/Slovenia add vignette day-share when driving", () => {
    const at = estimateDayTollEurPerPerson({
      drivingDistanceKm: 200,
      country: "AT",
      pax: 2,
      mode: "car",
    });
    // 200×0.02 + 4 vignette = 8 → €4/pp
    expect(at).toBeGreaterThanOrEqual(4);
    expect(
      estimateDayTollEurPerPerson({
        drivingDistanceKm: 200,
        country: "SI",
        pax: 2,
        mode: "car",
      }),
    ).toBeGreaterThanOrEqual(3);
  });

  it("skips short local hops under 50 km", () => {
    expect(
      estimateDayTollEurPerPerson({
        drivingDistanceKm: 30,
        country: "IT",
        pax: 2,
        mode: "car",
      }),
    ).toBe(0);
  });

  it("adds tolls on top of ceiled daily budget", () => {
    expect(
      applyRoadTollToDailyBudget(130, {
        drivingDistanceKm: 300,
        country: "IT",
        pax: 2,
        mode: "car",
      }),
    ).toBe(145);
  });

  it("Norway tolls are higher than France", () => {
    const no = estimateDayTollEurPerPerson({
      drivingDistanceKm: 200,
      country: "NO",
      pax: 1,
      mode: "car",
    });
    const fr = estimateDayTollEurPerPerson({
      drivingDistanceKm: 200,
      country: "FR",
      pax: 1,
      mode: "car",
    });
    expect(no).toBeGreaterThan(fr);
  });
});
