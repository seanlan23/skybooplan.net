import { describe, expect, it } from "vitest";
import { packageGalleryImages, uniqueHotelImageUrls } from "@/lib/hotelImages";

describe("uniqueHotelImageUrls", () => {
  it("keeps https photos, protocol-relative URLs, and caps at 6", () => {
    expect(
      uniqueHotelImageUrls([
        "https://cf.bstatic.com/a.jpg",
        "//cf.bstatic.com/b.jpg",
        "https://cf.bstatic.com/a.jpg",
        "not-a-url",
        "",
        "https://cf.bstatic.com/c.jpg",
        "https://cf.bstatic.com/d.jpg",
        "https://cf.bstatic.com/e.jpg",
        "https://cf.bstatic.com/f.jpg",
        "https://cf.bstatic.com/g.jpg",
        { url: "https://cf.bstatic.com/obj.jpg" },
      ]),
    ).toEqual([
      "https://cf.bstatic.com/a.jpg",
      "https://cf.bstatic.com/b.jpg",
      "https://cf.bstatic.com/c.jpg",
      "https://cf.bstatic.com/d.jpg",
      "https://cf.bstatic.com/e.jpg",
      "https://cf.bstatic.com/f.jpg",
    ]);
    expect(uniqueHotelImageUrls([{ url: "https://cf.bstatic.com/obj.jpg" }])).toEqual([
      "https://cf.bstatic.com/obj.jpg",
    ]);
  });
});

describe("packageGalleryImages", () => {
  it("uses hotel photos and does not pad a single real image with fallbacks", () => {
    expect(
      packageGalleryImages({
        images: ["https://cf.bstatic.com/hotel.jpg"],
        coverImageUrl: "https://cf.bstatic.com/hotel.jpg",
        fallbacks: ["https://images.example/fallback.jpg"],
      }),
    ).toEqual(["https://cf.bstatic.com/hotel.jpg"]);
  });

  it("falls back only when the hotel has no photos", () => {
    expect(
      packageGalleryImages({
        fallbacks: ["https://images.example/fallback.jpg"],
      }),
    ).toEqual(["https://images.example/fallback.jpg"]);
  });
});
