import { memo, useRef } from "react";
import { Pause, Play } from "lucide-react";
import { TripMap, type MapFocusTarget } from "@/components/TripMap";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { PoiDetailsData } from "@/lib/poiDetails.types";

type Props = {
  plan: AiTripPlan;
  activeDay: number;
  hasCoords: boolean;
  focusTarget: MapFocusTarget | null;
  scrollSpyPaused: boolean;
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
 * unmount the Mapbox instance. TripMap itself is memoized on geo props.
 */
export const AiTripMapPanel = memo(function AiTripMapPanel({
  plan,
  activeDay,
  hasCoords,
  focusTarget,
  scrollSpyPaused,
  onOpenPoiDetails,
  streaming,
  expectedDayCount,
  mapHint,
  isPlaying,
  onTogglePlayback,
  playLabel,
  stopLabel,
}: Props) {
  const everHadCoordsRef = useRef(false);
  if (hasCoords) everHadCoordsRef.current = true;

  if (!everHadCoordsRef.current) return null;

  return (
    <div
      id="ai-trip-map"
      className="order-1 lg:order-2 lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:max-h-screen lg:self-start lg:flex lg:flex-col min-h-[320px] overflow-hidden"
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
            Dan {activeDay}/{plan.days.length}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <TripMap
          plan={plan}
          activeDay={activeDay}
          focusTarget={focusTarget}
          scrollSpyPaused={scrollSpyPaused}
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
