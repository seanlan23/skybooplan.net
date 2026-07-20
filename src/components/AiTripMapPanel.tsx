import { memo, useRef } from "react";
import { Pause, Play } from "lucide-react";
import { TripMap, type MapFocusTarget } from "@/components/TripMap";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { PoiDetailsData } from "@/lib/poiDetails.types";
import { useI18n } from "@/lib/i18n";

type Props = {
  plan: AiTripPlan;
  activeDay: number;
  hasCoords: boolean;
  focusTarget: MapFocusTarget | null;
  scrollSpyPaused: boolean;
  onDaySelect: (day: number) => void;
  onOpenPoiDetails: (poi: PoiDetailsData) => void;
  streaming: boolean;
  expectedDayCount: number;
  mapHint: string;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  playLabel: string;
  stopLabel: string;
};

/**
 * Stable map column — lives outside the day-card list so day switches never
 * unmount the Mapbox instance. Camera is owned solely by TripMap (active day).
 */
export const AiTripMapPanel = memo(function AiTripMapPanel({
  plan,
  activeDay,
  hasCoords,
  focusTarget,
  scrollSpyPaused,
  onDaySelect,
  onOpenPoiDetails,
  streaming,
  expectedDayCount,
  mapHint,
  isPlaying,
  onTogglePlayback,
  playLabel,
  stopLabel,
}: Props) {
  const { t } = useI18n();
  const everHadCoordsRef = useRef(false);
  if (hasCoords) everHadCoordsRef.current = true;

  if (!everHadCoordsRef.current) return null;

  return (
    <div
      id="ai-trip-map"
      className="order-2 w-full shrink-0 flex flex-col overflow-hidden lg:order-2 lg:sticky lg:top-24 lg:z-20 lg:h-[calc(100vh-120px)] lg:max-h-[calc(100vh-120px)] lg:self-start"
    >
      <div className="flex items-center justify-center gap-2 px-1 pb-2">
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
      <div className="h-[40vh] max-h-[300px] min-h-[260px] w-full lg:h-auto lg:flex-1 lg:min-h-0 lg:max-h-none">
        <TripMap
          plan={plan}
          activeDay={activeDay}
          focusTarget={focusTarget}
          scrollSpyPaused={scrollSpyPaused}
          onDaySelect={onDaySelect}
          onOpenPoiDetails={onOpenPoiDetails}
          streaming={streaming}
          expectedDayCount={expectedDayCount}
          isPlaying={isPlaying}
        />
      </div>
      <div className="mt-2 text-xs text-slate-500 text-center hidden lg:block">{mapHint}</div>
    </div>
  );
});
