import { useMemo } from "react";
import { ArrowRight, Hotel, Plane } from "lucide-react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  buildItineraryRouteOverview,
  type RouteOverviewSegment,
} from "@/lib/itineraryRouteOverview";
import { useI18n } from "@/lib/i18n";

function SegmentIcon({ segment }: { segment: RouteOverviewSegment }) {
  if (segment.kind === "flight") {
    return (
      <Plane
        className="h-3.5 w-3.5 shrink-0 text-sky-600"
        aria-hidden="true"
        strokeWidth={2.25}
      />
    );
  }
  if (segment.kind === "transfer") {
    return (
      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 text-slate-400"
        aria-hidden="true"
        strokeWidth={2.25}
      />
    );
  }
  if (segment.kind === "stay") {
    return (
      <Hotel
        className="h-3.5 w-3.5 shrink-0 text-amber-600"
        aria-hidden="true"
        strokeWidth={2.25}
      />
    );
  }
  return null;
}

export function ItineraryRouteOverview({
  plan,
  className = "",
}: {
  plan: AiTripPlan;
  className?: string;
}) {
  const { t } = useI18n();
  const segments = useMemo(() => buildItineraryRouteOverview(plan), [plan]);

  if (segments.length === 0) return null;

  return (
    <div
      className={`mt-2 -mx-1 overflow-x-auto pb-0.5 ${className}`}
      aria-label={t("routeOverview.aria" as never)}
    >
      <div className="flex min-w-max items-center gap-1.5 px-1 text-xs font-medium text-slate-700">
        {segments.map((segment, index) => {
          if (segment.kind === "place" || segment.kind === "stay") {
            const withIcon = segment.kind === "stay";
            return (
              <span
                key={`${segment.kind}-${segment.label}-${index}`}
                className="inline-flex items-center gap-1 shrink-0"
              >
                {withIcon ? <SegmentIcon segment={segment} /> : null}
                <span className={withIcon ? "font-semibold text-slate-900" : "text-slate-800"}>
                  {segment.label}
                </span>
              </span>
            );
          }

          return (
            <span
              key={`${segment.kind}-${index}`}
              className="inline-flex shrink-0 items-center px-0.5"
              aria-hidden="true"
            >
              <SegmentIcon segment={segment} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
