import { describe, expect, it } from "vitest";
import {
  displayWeatherLabel,
  weatherCaptionTone,
  weatherCaptionsConflict,
} from "@/lib/weatherCaptionVisual";

describe("weatherCaptionTone", () => {
  it("treats dry-season copy as dry even when the text mentions less rain", () => {
    expect(weatherCaptionTone("Suho obdobje")).toBe("dry");
    expect(weatherCaptionTone("Sušna sezona na Filipinih — manj dežja")).toBe("dry");
    expect(weatherCaptionTone("Thailand cool/dry season — pleasant weather")).toBe("dry");
  });

  it("treats live rain and monsoon copy as wet", () => {
    expect(weatherCaptionTone("dež")).toBe("wet");
    expect(weatherCaptionTone("Deževna sezona na Tajskem")).toBe("wet");
  });
});

describe("displayWeatherLabel", () => {
  it("hides current rain next to a dry-season caption", () => {
    expect(weatherCaptionsConflict("dež", "Suho obdobje")).toBe(true);
    expect(displayWeatherLabel("dež", ["Suho obdobje"])).toBeNull();
    expect(displayWeatherLabel("jasno", ["Suho obdobje"])).toBe("jasno");
    expect(displayWeatherLabel("delno oblačno", ["Suho obdobje"])).toBe("delno oblačno");
  });
});
