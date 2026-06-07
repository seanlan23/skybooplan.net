import { CheckSquare, Gauge, Heart, MessageSquareQuote } from "lucide-react";
import type { AiPlannerSubmit } from "@/components/AiPlannerPreview";
import { useI18n } from "@/lib/i18n";
import { formatPlannerInterests } from "@/lib/plannerInterests";

function paceLabel(pace: AiPlannerSubmit["pace"], t: (k: string) => string): string {
  if (pace === "intensive") return t("ai.paceIntensive");
  if (pace === "calm") return t("ai.paceCalm");
  return t("ai.paceRelaxed");
}

export function PlannerChoicesSummary({ form }: { form?: AiPlannerSubmit | null }) {
  const { t, lang } = useI18n();
  if (!form) return null;

  const wishesText = typeof form.wishes === "string" ? form.wishes.trim() : "";
  const hasWishes = wishesText.length > 0;
  const tags = Array.isArray(form.tags) ? form.tags : [];
  const paceText = t("aiplan.paceChip").replace("{pace}", paceLabel(form.pace, t));

  return (
    <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-sky-600">
        {t("aiplan.yourChoices")}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-sky-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
          <Gauge className="h-3.5 w-3.5 text-sky-600" aria-hidden />
          {paceText}
        </span>
        {form.plannerStyle === "catalog" && (form.pickedAttractionIds?.length ?? 0) > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-emerald-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
            <CheckSquare className="h-3 w-3 text-emerald-600" aria-hidden />
            {t("aiplan.catalogPicksChip").replace(
              "{n}",
              String(form.pickedAttractionIds!.length),
            )}
          </span>
        ) : null}
        {tags.map((key) => (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-orange-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
          >
            <Heart className="h-3 w-3 text-orange-500" aria-hidden />
            {formatPlannerInterests([key], lang)}
          </span>
        ))}
      </div>
      {hasWishes ? (
        <p className="mt-2.5 flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
          <MessageSquareQuote className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" aria-hidden />
          <span>
            <span className="font-semibold text-slate-700">{t("aiplan.wishesLabel")}: </span>
            {wishesText}
          </span>
        </p>
      ) : null}
    </div>
  );
}
