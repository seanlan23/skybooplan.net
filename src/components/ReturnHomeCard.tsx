import { Plane, Clock, MapPin } from "lucide-react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { useI18n } from "@/lib/i18n";

export function ReturnHomeCard({ plan }: { plan: AiTripPlan }) {
  const { t } = useI18n();
  const rf = plan.returnFlightEu;
  const lastDay = plan.days[plan.days.length - 1];

  if (!rf && !lastDay?.inFlightDay) return null;

  const departure = rf?.departureTime;
  const arrival = rf?.arrivalTimeEu;
  const from = rf?.fromAirport ?? lastDay?.city;
  const to = rf?.toAirport ?? plan.originIata ?? t("returnHome.europeFallback");
  const summary = rf?.summary;

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 shadow-md">
      <div className="border-b border-indigo-100 bg-indigo-600/95 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3 text-white">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Plane className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold leading-tight">{t("returnHome.title")}</h3>
            <p className="text-sm text-indigo-100">{t("returnHome.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {departure && (
            <div className="rounded-xl bg-white border border-indigo-100 px-4 py-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">
                {t("returnHome.departure")}
              </div>
              <div className="flex items-center gap-2 text-xl font-bold text-slate-900 tabular-nums">
                <Clock className="h-5 w-5 text-indigo-500 shrink-0" />
                {departure}
              </div>
              {from && (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {from}
                </div>
              )}
            </div>
          )}

          {arrival && (
            <div className="rounded-xl bg-white border border-emerald-100 px-4 py-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                {t("returnHome.arrivalEu")}
              </div>
              <div className="flex items-center gap-2 text-xl font-bold text-slate-900 tabular-nums">
                <Clock className="h-5 w-5 text-emerald-600 shrink-0" />
                {arrival}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {to}
              </div>
            </div>
          )}
        </div>

        {summary && (
          <p className="text-sm text-slate-700 leading-relaxed rounded-xl bg-white/80 border border-slate-100 px-4 py-3">
            {summary}
          </p>
        )}

        {!departure && !arrival && lastDay && (
          <p className="text-sm text-slate-600">
            {t("returnHome.checkSchedule").replace("{title}", lastDay.title)}
          </p>
        )}
      </div>
    </div>
  );
}
