import { useMemo, useState } from "react";
import {
  Bus,
  Ship,
  Loader2,
  MapPin,
  Plane,
  Sparkles,
  Train,
  ChevronRight,
} from "lucide-react";
import type { TripSkeleton } from "@/lib/aiPlan.functions";
import { skeletonToPreviewPlan } from "@/lib/aiPlan.functions";
import { TripMap } from "@/components/TripMap";
import { HotelsSection, type StayInfo } from "@/components/HotelsSection";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import { formatLocalDate } from "@/lib/dateUtils";
import { useRegionPhotos } from "@/hooks/useRegionPhotos";

function transportIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("ferry") || t.includes("boat")) return Ship;
  if (t.includes("train") || t.includes("vlak")) return Train;
  if (t.includes("bus") || t.includes("avtobus")) return Bus;
  return Plane;
}

export function AiPlanSkeletonView({
  skeleton,
  loading,
  expanding,
  error,
  stayInfo,
  onExpandFull,
}: {
  skeleton: TripSkeleton | null;
  loading: boolean;
  expanding: boolean;
  error: string | null;
  stayInfo?: StayInfo;
  onExpandFull: () => void;
}) {
  const { t } = useI18n();
  const [activeDay, setActiveDay] = useState(1);
  const { photoMap } = useRegionPhotos(skeleton?.regions ?? []);

  const previewPlan = useMemo(
    () => (skeleton ? skeletonToPreviewPlan(skeleton) : null),
    [skeleton],
  );

  const regionPhotoEntries = useMemo(() => {
    const entries = new Map<number, string>();
    if (!skeleton) return entries;
    skeleton.regions.forEach((r) => {
      const url = photoMap.get(r.city);
      if (url) entries.set(r.startDay, url);
    });
    return entries;
  }, [skeleton, photoMap]);

  if (loading) return <AiPlanLoader />;

  if (error) {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        {resolveErrorMessage(t, error)}
      </div>
    );
  }

  if (!skeleton || !previewPlan) return null;

  const fmt = (iso: string) => formatLocalDate(iso, undefined, { day: "numeric", month: "short" });

  return (
    <div id="ai-plan" className="mt-8 space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 flex items-center justify-between gap-3 flex-wrap">
        <span>{t("skeleton.previewBadge")}</span>
        <button
          type="button"
          onClick={onExpandFull}
          disabled={expanding}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
        >
          {expanding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("skeleton.expanding")}
            </>
          ) : (
            <>
              {t("skeleton.expandFull")}
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
              <Sparkles className="h-4 w-4" /> {t("skeleton.badge")}
            </div>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
              {skeleton.destinationName}
            </h2>
            <p className="mt-2 text-slate-600 max-w-2xl">{skeleton.summary}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              {t("aiplan.total" as never)}
            </div>
            <div className="text-3xl font-bold text-slate-900">€{skeleton.totalBudgetEur}</div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-center gap-2 min-w-max px-1">
          <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
            {skeleton.originIata}
          </div>
          {skeleton.regions.map((r, i) => {
            const TIcon = i > 0 && skeleton.regions[i - 1].transportToNext
              ? transportIcon(skeleton.regions[i - 1].transportToNext!.type)
              : Plane;
            const dur = skeleton.regions[i - 1]?.transportToNext?.duration;
            return (
              <div key={`${r.city}-${r.startDay}`} className="flex items-center gap-2">
                {i > 0 && (
                  <div className="flex flex-col items-center text-[10px] text-slate-500 px-1">
                    <TIcon className="h-4 w-4 text-sky-600" />
                    {dur && <span>{dur}</span>}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setActiveDay(r.startDay)}
                  className={`shrink-0 rounded-xl border px-4 py-3 text-left transition-colors ${
                    activeDay === r.startDay
                      ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200"
                      : "border-slate-200 bg-white hover:border-sky-300"
                  }`}
                >
                  <div className="font-bold text-slate-900">{r.city}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {fmt(r.startDate)} – {fmt(r.endDate)}
                  </div>
                  <div className="text-[10px] text-sky-600 font-medium mt-1">
                    {t("skeleton.daysCount").replace("{n}", String(r.endDay - r.startDay + 1))}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,440px)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {skeleton.regions.map((r) => {
            const photo = photoMap.get(r.city);
            return (
              <article
                key={`${r.city}-${r.startDay}`}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
              >
                <div className="grid sm:grid-cols-[1fr_200px] gap-0">
                  <div className="p-6">
                    <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase">
                      <MapPin className="h-3.5 w-3.5" />
                      {fmt(r.startDate)} – {fmt(r.endDate)}
                    </div>
                    <h3 className="mt-2 text-2xl font-bold text-slate-900">{r.city}</h3>
                    <p className="mt-3 text-slate-600 leading-relaxed">{r.summary}</p>
                    <HotelsSection
                      city={r.city}
                      checkIn={r.startDate}
                      checkOut={r.endDate}
                      stayInfo={stayInfo}
                      regionFallback={skeleton.destinationName}
                    />
                  </div>
                  <div className="relative min-h-[200px] sm:min-h-full bg-slate-100">
                    {photo ? (
                      <img
                        src={photo}
                        alt={r.city}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                        {r.city}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="lg:sticky lg:top-32">
          <TripMap
            plan={previewPlan}
            activeDay={activeDay}
            photoMap={regionPhotoEntries}
          />
        </div>
      </div>
    </div>
  );
}
