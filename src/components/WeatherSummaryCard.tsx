import { CloudSun, Shirt, Sun, Thermometer } from "lucide-react";
import type { WeatherSummary } from "@/lib/aiPlan.functions";
import { useI18n } from "@/lib/i18n";

export function WeatherSummaryCard({
  summary,
  className = "",
}: {
  summary: WeatherSummary;
  className?: string;
}) {
  const { t } = useI18n();

  const items = [
    {
      key: "condition",
      label: t("weather.summaryCondition" as never),
      value: summary.currentCondition,
      icon: Sun,
      iconClass: "text-amber-500",
      bgClass: "bg-amber-50/80",
    },
    {
      key: "temperature",
      label: t("weather.summaryTemperature" as never),
      value: summary.avgTemperature,
      icon: Thermometer,
      iconClass: "text-orange-600",
      bgClass: "bg-orange-50/80",
    },
    {
      key: "season",
      label: t("weather.summarySeason" as never),
      value: summary.seasonType,
      icon: CloudSun,
      iconClass: "text-sky-600",
      bgClass: "bg-sky-50/80",
    },
    {
      key: "clothing",
      label: t("weather.summaryClothing" as never),
      value: summary.clothingAdvice,
      icon: Shirt,
      iconClass: "text-violet-600",
      bgClass: "bg-violet-50/80",
    },
  ] as const;

  return (
    <div
      className={`rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-amber-50/60 p-3 sm:p-4 shadow-sm ${className}`}
      aria-label={t("weather.summaryAria" as never)}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 sm:gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className={`flex items-start gap-2.5 rounded-lg border border-white/80 px-3 py-2.5 ${item.bgClass}`}
            >
              <span
                className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ${item.iconClass}`}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {item.label}
                </div>
                <div className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
                  {item.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
