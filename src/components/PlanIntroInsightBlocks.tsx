import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { SafetyWarningCard } from "@/components/SafetyWarningCard";
import { WeatherWidgetCard } from "@/components/WeatherWidgetCard";
import type { WeatherWidget } from "@/lib/aiPlan.functions";
import { weatherWidgetNeedsClimateFallback } from "@/lib/weatherWidgetFallback";

/** Safety + weather intro cards below planner settings, above trip narrative. */
export function PlanIntroInsightBlocks({
  plan,
  weatherFallback,
  className = "",
}: {
  plan: Pick<AiTripPlan, "safetyWarning" | "weatherWidget">;
  weatherFallback?: WeatherWidget | null;
  className?: string;
}) {
  const hasSafety = Boolean(plan.safetyWarning?.message?.trim());
  const widget = weatherWidgetNeedsClimateFallback(plan.weatherWidget)
    ? (weatherFallback ?? plan.weatherWidget ?? null)
    : (plan.weatherWidget ?? weatherFallback ?? null);
  const hasWeather = Boolean(widget?.season && widget?.avgTemp && widget?.clothing);

  if (!hasSafety && !hasWeather) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {hasSafety ? <SafetyWarningCard warning={plan.safetyWarning!} /> : null}
      {hasWeather && widget ? <WeatherWidgetCard widget={widget} /> : null}
    </div>
  );
}
