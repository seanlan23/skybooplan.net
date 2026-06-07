import { CloudSun, Moon, Plane, Thermometer } from "lucide-react";
import type { DestinationContext } from "@/lib/tripContext.functions";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { useI18n } from "@/lib/i18n";

export function DestinationInsightBanner({
  context,
  flights,
  loading,
}: {
  context: DestinationContext | null;
  flights?: TripFlightContext | null;
  loading?: boolean;
}) {
  const { t } = useI18n();

  if (loading && !context) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 animate-pulse">
        {t("context.loading")}
      </div>
    );
  }

  if (!context && !flights) return null;

  const hasHints = (context?.seasonalHints.length ?? 0) > 0;
  const hasRegionHints = (context?.regionClimate?.length ?? 0) > 0;
  const hasAstroHints = (context?.astronomyHints?.length ?? 0) > 0;
  const hasTemp = context?.tempC != null;

  if (!hasHints && !hasRegionHints && !hasAstroHints && !hasTemp && !flights) return null;

  return (
    <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/80 to-sky-50/60 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {hasTemp && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
            <Thermometer className="h-4 w-4 text-orange-500" />
            {context!.destinationName}: {context!.tempC}°C
            {context!.weatherLabel && (
              <span className="font-normal text-slate-600">· {context!.weatherLabel}</span>
            )}
          </span>
        )}
        {flights && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
            <Plane className="h-3.5 w-3.5 text-sky-600" />
            {t("context.flightLand")} {flights.outboundArrive}
            {flights.outboundArriveDayOffset > 0 && ` (+${flights.outboundArriveDayOffset}d)`}
            {flights.inboundDepart && (
              <>
                {" "}
                · {t("context.flightDepart")} {flights.inboundDepart}
              </>
            )}
          </span>
        )}
      </div>

      {(hasHints || hasRegionHints || hasAstroHints) && (
        <ul className="space-y-1">
          {context!.seasonalHints.map((hint) => (
            <li key={hint} className="flex items-start gap-2 text-xs text-slate-700 leading-snug">
              <CloudSun className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              {hint}
            </li>
          ))}
          {context!.regionClimate?.flatMap((block) =>
            block.hints.map((hint) => (
              <li
                key={`${block.city}-${hint}`}
                className="flex items-start gap-2 text-xs text-slate-700 leading-snug"
              >
                <CloudSun className="h-3.5 w-3.5 text-sky-600 mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold text-slate-800">{block.city}:</span> {hint}
                </span>
              </li>
            )),
          )}
          {context!.astronomyHints?.map((hint) => (
            <li key={hint} className="flex items-start gap-2 text-xs text-slate-700 leading-snug">
              <Moon className="h-3.5 w-3.5 text-indigo-600 mt-0.5 shrink-0" />
              {hint}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
