import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { SafetyWarningCard } from "@/components/SafetyWarningCard";
import { WeatherWidgetCard } from "@/components/WeatherWidgetCard";

/** Safety + weather intro cards below planner settings, above trip narrative. */
export function PlanIntroInsightBlocks({
  plan,
  className = "",
}: {
  plan: Pick<AiTripPlan, "safetyWarning" | "weatherWidget">;
  className?: string;
}) {
  const hasSafety = Boolean(plan.safetyWarning?.message?.trim());
  const hasWeather = Boolean(
    plan.weatherWidget?.season && plan.weatherWidget?.avgTemp && plan.weatherWidget?.clothing,
  );

  if (!hasSafety && !hasWeather) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {hasSafety ? <SafetyWarningCard warning={plan.safetyWarning!} /> : null}
      {hasWeather ? <WeatherWidgetCard widget={plan.weatherWidget!} /> : null}
    </div>
  );
}
