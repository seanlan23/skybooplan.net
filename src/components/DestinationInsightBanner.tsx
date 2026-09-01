import { CloudRain, CloudSun, Moon, Plane, Snowflake, Sun, Thermometer } from "lucide-react";
import type { DestinationContext } from "@/lib/tripContext.functions";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { useI18n } from "@/lib/i18n";
import { displayWeatherLabel, weatherCaptionTone } from "@/lib/weatherCaptionVisual";

function HintIcon({ text }: { text: string }) {
  const tone = weatherCaptionTone(text);
  if (tone === "dry" || tone === "clear") return <Sun className="h-3.5 w-3.5 text-amber-500" />;
  if (tone === "wet") return <CloudRain className="h-3.5 w-3.5 text-sky-600" />;
  if (tone === "cold") return <Snowflake className="h-3.5 w-3.5 text-sky-600" />;
  return <CloudSun className="h-3.5 w-3.5 text-sky-600" />;
}

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
  const liveWeather = displayWeatherLabel(context?.weatherLabel, [
    ...(context?.seasonalHints ?? []),
    ...(context?.regionClimate?.flatMap((block) => block.hints) ?? []),
  ]);

  if (!hasHints && !hasRegionHints && !hasAstroHints && !hasTemp && !flights) return null;

  return (
    <div className="space-y-2 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50/90 to-white px-3 py-2.5 sm:px-4 sm:py-3">
      {(hasTemp || flights) && (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
          {hasTemp && (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                <Thermometer className="h-4 w-4 text-sky-600" />
              </span>
              {context!.destinationName}: {context!.tempC}°C
              {liveWeather && (
                <span className="font-normal text-slate-600">· {liveWeather}</span>
              )}
            </span>
          )}
          {flights && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-700 sm:ml-auto">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                <Plane className="h-3.5 w-3.5 text-sky-600" />
              </span>
              {t("context.flightLand")} {flights.outboundArrive}
              {flights.outboundArriveDayOffset > 0 && ` (+${flights.outboundArriveDayOffset}d)`}
              {flights.inboundDepart && (
                <>
                  <span className="text-slate-400">·</span>
                  {t("context.flightDepart")} {flights.inboundDepart}
                </>
              )}
            </span>
          )}
        </div>
      )}

      {(hasHints || hasRegionHints || hasAstroHints) && (
        <ul className="space-y-1 border-t border-sky-200/60 pt-2">
          {context!.seasonalHints.map((hint) => (
            <li key={hint} className="flex items-start gap-2 text-xs leading-snug text-slate-700">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                <HintIcon text={hint} />
              </span>
              {hint}
            </li>
          ))}
          {context!.regionClimate?.flatMap((block) =>
            block.hints.map((hint) => (
              <li
                key={`${block.city}-${hint}`}
                className="flex items-start gap-2 text-xs leading-snug text-slate-700"
              >
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                  <HintIcon text={hint} />
                </span>
                <span>
                  <span className="font-semibold text-slate-800">{block.city}:</span> {hint}
                </span>
              </li>
            )),
          )}
          {context!.astronomyHints?.map((hint) => (
            <li key={hint} className="flex items-start gap-2 text-xs leading-snug text-slate-700">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                <Moon className="h-3.5 w-3.5 text-indigo-600" />
              </span>
              {hint}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
