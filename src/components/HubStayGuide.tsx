import { ArrowRight, Clock3, Lightbulb, MapPin, Sparkles } from "lucide-react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { HotelsSection, type StayInfo } from "@/components/HotelsSection";
import { ReturnHomeCard } from "@/components/ReturnHomeCard";
import { GoldenRulesNote } from "@/components/GoldenRulesNote";
import {
  buildHubStayModules,
  hubGuideCopy,
  type HubStayModule,
} from "@/lib/hubStayModules";
import { useI18n } from "@/lib/i18n";
import { formatLocalDate } from "@/lib/dateUtils";

export function HubStayGuide({
  plan,
  stayInfo,
  lang,
  activeDay,
  onSelectHub,
  onHighlight,
  registerRef,
}: {
  plan: AiTripPlan;
  stayInfo?: StayInfo;
  lang: string;
  activeDay?: number;
  onSelectHub?: (hub: HubStayModule) => void;
  onHighlight?: (hub: HubStayModule, title: string, lat?: number, lng?: number) => void;
  registerRef?: (day: number, el: HTMLElement | null) => void;
}) {
  const { t } = useI18n();
  const copy = hubGuideCopy(lang);
  const hubs = buildHubStayModules(plan, lang);

  if (!hubs.length) return null;

  return (
    <div className="space-y-4 sm:space-y-5">
      {hubs.map((hub, index) => {
        const dates = [hub.checkIn, hub.checkOut]
          .filter(Boolean)
          .map((d) => formatLocalDate(d!, lang))
          .join(" – ");
        const isActive =
          activeDay != null && activeDay >= hub.firstDay && activeDay <= hub.lastDay;
        return (
          <article
            key={`${hub.cityName}-${hub.checkIn}-${index}`}
            ref={(el) => registerRef?.(hub.firstDay, el)}
            onClick={() => onSelectHub?.(hub)}
            className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
              isActive ? "border-sky-400 ring-2 ring-sky-100" : "border-slate-200"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
              {copy.kicker} · {index + 1}/{hubs.length}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xl font-bold text-slate-900">{hub.cityName}</h3>
              <p className="text-sm font-semibold text-sky-800">{copy.nights(hub.nights)}</p>
            </div>
            {dates ? <p className="mt-0.5 text-xs text-slate-500">{dates}</p> : null}

            {hub.transferIn.summary ? (
              <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                  {copy.transfer}
                </p>
                <p className="mt-1 flex items-start gap-2 text-sm text-slate-700">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                  <span>{hub.transferIn.summary}</span>
                </p>
              </div>
            ) : null}

            {hub.highlights.length ? (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {copy.highlights}
                </p>
                <ul className="mt-2 space-y-2.5">
                  {hub.highlights.map((item) => (
                    <li key={item.title}>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left transition hover:border-sky-200 hover:bg-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          onHighlight?.(hub, item.title, item.lat, item.lng);
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {item.kind === "daytrip" ? (
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                          ) : (
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            {item.kind === "daytrip" ? (
                              <p className="text-[11px] font-medium text-amber-700">{copy.daytrip}</p>
                            ) : null}
                            {item.description ? (
                              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                                {item.description}
                              </p>
                            ) : null}
                            <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                              {item.duration ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock3 className="h-3 w-3" aria-hidden />
                                  {item.duration}
                                </span>
                              ) : null}
                              {item.estimatedCostEur != null ? (
                                <span>≈ €{Math.round(item.estimatedCostEur)}</span>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hub.localTips ? (
              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                  {copy.tips}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-amber-950">{hub.localTips}</p>
              </div>
            ) : null}

            {hub.checkIn && hub.checkOut ? (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {copy.hotels}
                </p>
                <HotelsSection
                  city={hub.cityName}
                  checkIn={hub.checkIn}
                  checkOut={hub.checkOut}
                  stayInfo={stayInfo}
                  regionFallback={plan.destinationName}
                  initialFilters={{ hotel: true }}
                  guestScoreFloor={8}
                />
              </div>
            ) : null}
          </article>
        );
      })}
      <ReturnHomeCard plan={plan} />
      <GoldenRulesNote lang={lang} />
      <p className="text-center text-xs text-slate-500">{t("aiplan.cityHotels.subtitle" as never)}</p>
    </div>
  );
}
