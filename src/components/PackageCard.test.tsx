import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PackageCard } from "@/components/PackageCard";
import type { ResortPackage } from "@/lib/resortPackage";

function pkg(over?: Partial<ResortPackage>): ResortPackage {
  return {
    id: "h1",
    title: "Occidental Costa Cancun",
    destinationLabel: "PHUKET",
    coverImageUrl: "https://images.example/1.jpg",
    images: ["https://images.example/1.jpg"],
    guestScore: 8.1,
    guestScoreLabel: "Very Good",
    mealPlan: "breakfast",
    transferKind: "van",
    includesCheckedBag: true,
    pricePerPersonEur: 900,
    totalEur: 1800,
    flightEur: 800,
    hotelEur: 1000,
    nights: 11,
    pax: 2,
    adults: 2,
    rooms: 1,
    ...over,
  };
}

describe("PackageCard gallery", () => {
  it("shows arrows and dots only when the hotel has more than one photo", () => {
    const multi = renderToStaticMarkup(
      <PackageCard
        pkg={pkg({
          images: [
            "https://images.example/1.jpg",
            "https://images.example/2.jpg",
            "https://images.example/3.jpg",
            "https://images.example/4.jpg",
          ],
        })}
        onOpen={vi.fn()}
      />,
    );
    expect(multi).toContain("PHUKET");
    expect(multi).toContain("8.1");
    expect(multi).toContain("Very Good");
    expect(multi).toMatch(/Previous photo|Prejšnja slika/);
    expect(multi).toMatch(/Next photo|Naslednja slika/);
    expect(multi).toContain("1/4");

    const single = renderToStaticMarkup(<PackageCard pkg={pkg()} onOpen={vi.fn()} />);
    expect(single).toContain("PHUKET");
    expect(single).not.toMatch(/Previous photo|Prejšnja slika/);
    expect(single).not.toContain("1/1");
  });

  it("prints per-person and stay total with flight + nights", () => {
    const html = renderToStaticMarkup(<PackageCard pkg={pkg()} onOpen={vi.fn()} />);
    expect(html).toMatch(/€?900|900/);
    expect(html).toMatch(/person|osebo/);
    expect(html).toMatch(/flight \+ 11 nights|let \+ 11 nočitev/i);
  });
});
