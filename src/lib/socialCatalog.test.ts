import { describe, expect, it } from "vitest";
import { formatFacebookCaption, pickSocialCatalogItem } from "@/lib/socialCatalog";
import { pickTravelFact, TRAVEL_FACTS } from "@/lib/travelFacts";

describe("travel facts", () => {
  it("has at least 100 unique evergreen facts", () => {
    const ids = TRAVEL_FACTS.map((f) => f.id);
    expect(ids.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rotates a different fact by day index", () => {
    expect(pickTravelFact(new Date(), 0).id).not.toBe(pickTravelFact(new Date(), 1).id);
    expect(pickTravelFact(new Date(), TRAVEL_FACTS.length).id).toBe(
      pickTravelFact(new Date(), 0).id,
    );
  });

  it("writes a bilingual Facebook caption with the site link", () => {
    const item = pickSocialCatalogItem(new Date(), 0);
    const caption = formatFacebookCaption(item, "Photo: Test / Unsplash");
    expect(caption).toContain("Fact dneva");
    expect(caption).toContain(item.blurbSl);
    expect(caption).toContain(item.blurbEn);
    expect(caption).toContain("https://www.skybooplan.com/");
    expect(caption).toContain("#skybooplan");
    expect(caption).toContain("Unsplash");
  });
});
