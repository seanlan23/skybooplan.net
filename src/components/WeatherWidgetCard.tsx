import { CloudSun, Shirt, Thermometer } from "lucide-react";
import type { WeatherWidget } from "@/lib/aiPlan.functions";
import { useI18n } from "@/lib/i18n";

export function WeatherWidgetCard({
  widget,
  className = "",
}: {
  widget: WeatherWidget;
  className?: string;
}) {
  const { t } = useI18n();

  const items = [
    {
      key: "season",
      label: t("weather.widgetSeason" as never),
      value: widget.season,
      icon: CloudSun,
      iconClass: "text-sky-600",
      bgClass: "bg-sky-50/90",
    },
    {
      key: "temperature",
      label: t("weather.widgetTemperature" as never),
      value: widget.avgTemp,
      icon: Thermometer,
      iconClass: "text-sky-600",
      bgClass: "bg-sky-50/90",
    },
    {
      key: "clothing",
      label: t("weather.widgetClothing" as never),
      value: widget.clothing,
      icon: Shirt,
      iconClass: "text-teal-600",
      bgClass: "bg-teal-50/90",
    },
  ] as const;

  return (
    <div
      className={`rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-slate-50/80 p-3 sm:p-4 shadow-sm ${className}`}
      aria-label={t("weather.widgetAria" as never)}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
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
