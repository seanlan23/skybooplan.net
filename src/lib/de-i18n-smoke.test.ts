import { describe, expect, it } from "vitest";
import { buildOriginDepartureLogistics, buildArrivalLogistics } from "@/lib/flightScheduling";
import { resolveTripLocale } from "@/lib/tripLocale";
import { translate } from "@/lib/i18n";

describe("de plan language consistency", () => {
  const flights = {
    outboundDepart: "20:30",
    outboundArrive: "16:45",
    outboundArriveDayOffset: 0,
  };

  it("origin departure logistics are German", () => {
    const acts = buildOriginDepartureLogistics("MUC", flights, "de");
    expect(acts[0]!.name).toMatch(/^Abflug:/);
    expect(acts[0]!.description).toMatch(/Heimatflughafen|Abflug/);
    expect(acts[0]!.description).not.toMatch(/Home airport|Odhod z|Prevoz/);
  });

  it("arrival logistics are German", () => {
    const locale = resolveTripLocale("JFK", "New York", "de");
    const arr = buildArrivalLogistics("New York", flights, locale);
    expect(arr[0]!.name).toBe("Ankunft am Flughafen");
    expect(arr[0]!.description).toMatch(/Dein Flug landet/);
    expect(arr[0]!.description).not.toMatch(/Your flight lands|Polet pristane/);
  });

  it("homepage/plan UI keys resolve in German", () => {
    expect(translate("de", "support.title")).toMatch(/Hat Skybooplan/);
    expect(translate("de", "feat.itin.title")).toMatch(/KI-Reiseplan/);
    expect(translate("de", "activity.type.transport")).toBe("Transport");
    expect(translate("de", "transport.mode.drive")).toBe("Fahrt");
    expect(translate("de", "aiplan.perPerson")).toBe("/ Person");
  });
});
