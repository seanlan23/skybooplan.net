import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  UNSPLASH_REQUEST_TIMEOUT_MS,
  buildUnsplashSearchQueries,
  mergePlanPhotos,
  planNeedsPhotoEnrichment,
} from "@/lib/unsplashPhotos";

describe("buildUnsplashSearchQueries", () => {
  it("orders poi+city before city travel and city alone", () => {
    expect(buildUnsplashSearchQueries("Grand Palace", "Bangkok")).toEqual([
      "Grand Palace Bangkok",
      "Bangkok travel",
      "Bangkok",
    ]);
  });

  it("falls back to city-only when poi is empty", () => {
    expect(buildUnsplashSearchQueries("", "Colombo")).toEqual(["Colombo travel", "Colombo"]);
  });

  it("dedupes identical queries", () => {
    expect(buildUnsplashSearchQueries("Rome", "Rome")).toEqual(["Rome Rome", "Rome travel", "Rome"]);
  });
});

describe("plan photo helpers", () => {
  const basePlan = {
    destinationName: "Thailand",
    days: [
      {
        day: 1,
        title: "Bangkok",
        city: "Bangkok",
        lat: 13.75,
        lng: 100.5,
        mapPins: [{ name: "Grand Palace", lat: 13.75, lng: 100.49, category: "sightseeing" }],
        activities: {
          morning: [{ name: "Grand Palace", description: "Temple" }],
          afternoon: [],
          evening: [],
        },
      },
    ],
  } as AiTripPlan;

  it("detects missing photos", () => {
    expect(planNeedsPhotoEnrichment(basePlan)).toBe(true);
  });

  it("skips enrichment when all photos present", () => {
    const withPhotos = mergePlanPhotos(basePlan, {
      ...basePlan,
      days: [
        {
          ...basePlan.days[0]!,
          imageUrl: "https://images.example/city.jpg",
          mapPins: [
            {
              name: "Grand Palace",
              lat: 13.75,
              lng: 100.49,
              category: "sightseeing",
              imageUrl: "https://images.example/poi.jpg",
            },
          ],
          activities: {
            morning: [
              {
                name: "Grand Palace",
                description: "Temple",
                imageUrl: "https://images.example/poi.jpg",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
      ],
    });
    expect(planNeedsPhotoEnrichment(withPhotos)).toBe(false);
  });

  it("merges imageUrl without replacing unrelated fields", () => {
    const enriched = {
      ...basePlan,
      days: [
        {
          ...basePlan.days[0]!,
          imageUrl: "https://images.example/city.jpg",
          mapPins: [
            {
              name: "Grand Palace",
              lat: 13.75,
              lng: 100.49,
              category: "sightseeing",
              imageUrl: "https://images.example/poi.jpg",
            },
          ],
          activities: {
            morning: [
              {
                name: "Grand Palace",
                description: "Temple",
                imageUrl: "https://images.example/poi.jpg",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
      ],
    } as AiTripPlan;

    const merged = mergePlanPhotos(basePlan, enriched);
    expect(merged.days[0]?.imageUrl).toBe("https://images.example/city.jpg");
    expect(merged.days[0]?.mapPins?.[0]?.imageUrl).toBe("https://images.example/poi.jpg");
    expect(merged.days[0]?.title).toBe("Bangkok");
  });

  it("uses a 2 second Unsplash timeout budget", () => {
    expect(UNSPLASH_REQUEST_TIMEOUT_MS).toBe(2000);
  });
});
