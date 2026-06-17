import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  HERO_BACKGROUND_FADE_MS,
  HERO_BACKGROUND_ROTATE_MS,
  HERO_ROTATING_BACKGROUNDS,
  heroBackgroundImageUrl,
} from "@/lib/heroBackgrounds";

export function HeroRotatingBackground() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HERO_ROTATING_BACKGROUNDS.length);
    }, HERO_BACKGROUND_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0" aria-hidden>
      {HERO_ROTATING_BACKGROUNDS.map((baseUrl, index) => (
        <img
          key={baseUrl}
          src={heroBackgroundImageUrl(baseUrl)}
          alt=""
          decoding="async"
          fetchPriority={index === 0 ? "high" : "low"}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity ease-in-out",
            index === activeIndex ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDuration: `${HERO_BACKGROUND_FADE_MS}ms` }}
        />
      ))}
    </div>
  );
}
