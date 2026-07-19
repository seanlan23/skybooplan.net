import { describe, expect, it } from "vitest";
import { parseMakeSearchDestination, parseMakeSearchUserMessage } from "@/lib/makeSearch";
import { buildHeroMakeSearchQuery } from "@/lib/heroChatFlow";

describe("Manila hero search regression", () => {
  it("does not let origin Milano steal destination Manila", () => {
    const query = buildHeroMakeSearchQuery(
      {
        destination: "Manila (MNL)",
        dates: "22. okt → 19. nov 2026",
        nights: "",
        origin: "Milano (MXP) · Dunaj (VIE) · Benetke (VCE)",
        passengers: "2 odrasla",
        pace: "Sproščen",
        budget: "1000–2000€ / osebo",
      },
      "all",
    );
    expect(parseMakeSearchDestination(query)).toBe("MNL");
    const parsed = parseMakeSearchUserMessage(query);
    expect(parsed.destination_airport).toBe("MNL");
    expect(parsed.origin_airports).toContain("MXP");
    expect(parsed.origin_airports).not.toContain("MNL");
  });

  it("still resolves bare Manila chip", () => {
    expect(parseMakeSearchDestination("Manila (MNL)")).toBe("MNL");
    expect(parseMakeSearchDestination("Manila")).toBe("MNL");
  });
});
