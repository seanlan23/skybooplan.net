import { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Pause, Play } from "lucide-react";
import { TripMap } from "@/components/TripMap";
import { MobileMapCloseBar } from "@/components/MobileMapOverlay";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { PoiDetailsData } from "@/lib/poiDetails.types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  plan: AiTripPlan;
  activeDay: number;
  hasCoords: boolean;
  /** Pin name highlight only — never moves camera. */
  highlightPoiName: string | null;
  highlightPoiLat?: number | null;
  highlightPoiLng?: number | null;
  onDaySelect: (day: number) => void;
  onOpenPoiDetails: (poi: PoiDetailsData) => void;
  streaming: boolean;
  expectedDayCount: number;
  mapHint: string;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  playLabel: string;
  stopLabel: string;
  /**
   * `sidebar` — desktop sticky column (hidden on mobile).
   * `sheet` — fullscreen mobile Mapbox overlay with close control.
   */
  variant?: "sidebar" | "sheet";
  onCloseSheet?: () => void;
};

/**
 * Stable map column — lives outside the day-card list so day switches never
 * unmount the Mapbox instance. Camera follows activeDay only.
 */
export const AiTripMapPanel = memo(function AiTripMapPanel({
  plan,
  activeDay,
  hasCoords,
  highlightPoiName,
  highlightPoiLat = null,
  highlightPoiLng = null,
  onDaySelect,
  onOpenPoiDetails,
  streaming,
  expectedDayCount,
  mapHint,
  isPlaying,
  onTogglePlayback,
  playLabel,
  stopLabel,
  variant = "sidebar",
  onCloseSheet,
}: Props) {
  const { t } = useI18n();
  const everHadCoordsRef = useRef(false);
  if (hasCoords) everHadCoordsRef.current = true;

  const isSheet = variant === "sheet";

  useEffect(() => {
    if (!isSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseSheet?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isSheet, onCloseSheet]);

  if (!everHadCoordsRef.current) return null;

  const panel = (
    <div
      id={isSheet ? "ai-trip-map-sheet" : "ai-trip-map"}
      className={cn(
        "flex flex-col overflow-hidden",
        isSheet
          ? "fixed inset-0 z-[80] bg-background"
          : "hidden lg:flex order-2 w-full shrink-0 lg:order-2 lg:sticky lg:top-24 lg:z-20 lg:h-[calc(100vh-120px)] lg:max-h-[calc(100vh-120px)] lg:self-start",
      )}
      role={isSheet ? "dialog" : undefined}
      aria-modal={isSheet ? true : undefined}
      aria-label={isSheet ? t("aiplan.mapStreets" as never) : undefined}
    >
      {isSheet && onCloseSheet ? (
        <MobileMapCloseBar onClose={onCloseSheet} />
      ) : null}
      <div
        className={cn(
          "flex items-center justify-center gap-2 px-1",
          isSheet ? "shrink-0 py-2" : "pb-2",
        )}
      >
        <button
          type="button"
          onClick={onTogglePlayback}
          disabled={streaming || plan.days.length < 2}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          {isPlaying ? (
            <>
              <Pause className="h-3.5 w-3.5" aria-hidden />
              {stopLabel}
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden />
              {playLabel}
            </>
          )}
        </button>
        {isPlaying && (
          <span className="text-xs text-sky-600 font-medium tabular-nums">
            {t("aiplan.mapDayProgress" as never)
              .replace("{current}", String(activeDay))
              .replace("{total}", String(plan.days.length))}
          </span>
        )}
      </div>
      <div
        className={cn(
          "w-full",
          isSheet
            ? "min-h-0 flex-1"
            : "h-[40vh] max-h-[300px] min-h-[260px] lg:h-auto lg:flex-1 lg:min-h-0 lg:max-h-none",
        )}
      >
        <TripMap
          plan={plan}
          activeDay={activeDay}
          highlightPoiName={highlightPoiName}
          highlightPoiLat={highlightPoiLat}
          highlightPoiLng={highlightPoiLng}
          onDaySelect={onDaySelect}
          onOpenPoiDetails={onOpenPoiDetails}
          streaming={streaming}
          expectedDayCount={expectedDayCount}
          isPlaying={isPlaying}
        />
      </div>
      {!isSheet && (
        <div className="mt-2 text-xs text-slate-500 text-center hidden lg:block">{mapHint}</div>
      )}
    </div>
  );

  if (isSheet) {
    if (typeof document === "undefined") return null;
    return createPortal(panel, document.body);
  }

  return panel;
});
