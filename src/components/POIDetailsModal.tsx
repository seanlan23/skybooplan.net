import { useEffect, useState } from "react";
import {
  Check,
  Clock,
  Lightbulb,
  MapPin,
  Sparkles,
  Star,
  Wallet,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  mockPoiRating,
  resolvePoiRating,
  splitDescriptionParagraphs,
  type PoiDetailsData,
} from "@/lib/poiDetails.types";
import { NavigateButton } from "@/components/NavigateButton";
import { useI18n } from "@/lib/i18n";

const TIME_SLOT_KEYS: Record<string, "poi.timeSlot.morning" | "poi.timeSlot.afternoon" | "poi.timeSlot.evening"> = {
  dopoldan: "poi.timeSlot.morning",
  popoldan: "poi.timeSlot.afternoon",
  vecer: "poi.timeSlot.evening",
  morning: "poi.timeSlot.morning",
  afternoon: "poi.timeSlot.afternoon",
  evening: "poi.timeSlot.evening",
};

function StarRow({ score }: { score: number }) {
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < full
              ? "fill-amber-400 text-amber-400"
              : i === full && half
                ? "fill-amber-200 text-amber-400"
                : "fill-slate-200 text-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

export function POIDetailsModal({
  open,
  onOpenChange,
  poi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poi: PoiDetailsData | null;
}) {
  const { t, lang } = useI18n();
  const [displayPoi, setDisplayPoi] = useState<PoiDetailsData | null>(poi);

  useEffect(() => {
    setDisplayPoi(poi);
  }, [poi]);

  if (!poi || !displayPoi) return null;

  const guide = displayPoi.tripAdvisorStyleDetails;
  const score = resolvePoiRating(displayPoi);
  const { reviewCount } = mockPoiRating(displayPoi.name);
  const timeLabel =
    displayPoi.arrivalTime && displayPoi.departureTime
      ? `${displayPoi.arrivalTime} – ${displayPoi.departureTime}`
      : displayPoi.arrivalTime ?? displayPoi.departureTime ?? t("poi.timeByPlan");
  const slotKey = displayPoi.timeSlot ? TIME_SLOT_KEYS[displayPoi.timeSlot.toLowerCase()] : undefined;
  const slotLabel = slotKey ? t(slotKey) : displayPoi.timeSlot ?? null;
  const costLabel =
    displayPoi.estimatedCostEur != null && displayPoi.estimatedCostEur >= 0
      ? t("poi.costApprox").replace("{price}", String(displayPoi.estimatedCostEur))
      : t("poi.costIncluded");
  const paragraphs = splitDescriptionParagraphs(
    displayPoi.fullDescription ?? displayPoi.description,
  );
  const bestTime = guide?.bestTimeOfDay?.trim();
  const proTip = guide?.proTip?.trim();
  const highlights = guide?.highlights?.filter(Boolean) ?? [];
  const reviewSummary = guide?.reviewSummary?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100%-2rem)] max-h-[94vh] overflow-y-auto p-0 gap-0 rounded-2xl border-slate-200 shadow-2xl">
        <DialogTitle className="sr-only">{displayPoi.name}</DialogTitle>

        {displayPoi.imageUrl ? (
          <img
            src={displayPoi.imageUrl}
            alt=""
            loading="lazy"
            className="h-48 w-full object-cover sm:h-56"
          />
        ) : null}

        <div className="relative border-b border-slate-100 bg-gradient-to-br from-sky-50 via-white to-slate-50 px-5 py-5 sm:px-8 sm:py-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-md hover:bg-slate-50 transition-colors z-10"
            aria-label={t("poi.close")}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="pr-12">
            <h2 className="text-2xl sm:text-[1.75rem] font-bold text-slate-900 leading-tight">
              {displayPoi.name}
            </h2>
            {(displayPoi.city || displayPoi.category) && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                {displayPoi.city && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-indigo-500 shrink-0" />
                    {displayPoi.city}
                  </span>
                )}
                {displayPoi.category && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {displayPoi.category}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-7">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 lg:gap-8">
            <div className="space-y-5 min-w-0">
              {paragraphs.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {t("poi.about")}
                  </h3>
                  {paragraphs.map((p, i) => (
                    <p key={i} className="text-[15px] text-slate-700 leading-relaxed">
                      {p}
                    </p>
                  ))}
                </div>
              )}

              {highlights.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                    {t("poi.highlights")}
                  </h3>
                  <ul className="space-y-2.5">
                    {highlights.map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-slate-700 leading-snug">
                        <Check
                          className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reviewSummary && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-5 py-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    {t("poi.reviews")}
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed italic">&ldquo;{reviewSummary}&rdquo;</p>
                </div>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              {displayPoi.imageUrl ? (
                <div className="flex justify-center lg:justify-start">
                  <img
                    src={displayPoi.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-lg transition-transform duration-300 ease-out hover:scale-125"
                  />
                </div>
              ) : null}
              <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50 px-5 py-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <StarRow score={score} />
                  <span className="text-xl font-bold text-slate-900 tabular-nums">{score}</span>
                </div>
                <p className="text-xs font-medium text-amber-900/75">
                  {guide ? t("poi.ratingTravelers") : t("poi.rating")} ·{" "}
                  {t("poi.reviewCount").replace("{n}", reviewCount.toLocaleString(lang === "sl" ? "sl-SI" : "en-US"))}
                </p>
              </div>

              {proTip && (
                <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-indigo-50/80 to-white px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-2 text-violet-800 mb-2">
                    <Lightbulb className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="text-xs font-bold uppercase tracking-wider">{t("poi.proTip")}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 leading-relaxed">{proTip}</p>
                </div>
              )}

              {bestTime && (
                <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-700 mb-1.5">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    {t("poi.bestTime")}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 leading-snug">{bestTime}</p>
                </div>
              )}

              <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <Clock className="h-4 w-4 shrink-0 opacity-80" />
                  {t("poi.visitTime")}
                </div>
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  {[slotLabel, timeLabel].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <Wallet className="h-4 w-4 shrink-0 opacity-80" />
                  {t("poi.estimatedCost")}
                </div>
                <p className="text-sm font-semibold text-slate-900 leading-snug">{costLabel}</p>
              </div>

              <NavigateButton lat={displayPoi.lat} lng={displayPoi.lng} label={displayPoi.name} />
            </aside>
          </div>

          {displayPoi.day != null && (
            <p className="text-center text-xs text-slate-400 pt-6 mt-6 border-t border-slate-100">
              {t("poi.dayFooter").replace("{day}", String(displayPoi.day))}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
