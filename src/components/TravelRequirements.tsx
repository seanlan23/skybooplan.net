import { FileText, Globe2, Pill, Wallet } from "lucide-react";
import type { TravelRequirements } from "@/lib/travelRequirements";
import { previewTravelRequirements } from "@/lib/travelRequirements";
import { useI18n } from "@/lib/i18n";

type TravelRequirementsProps = {
  /** Full AI-generated requirements from plan JSON. */
  requirements?: TravelRequirements | null;
  /** Departure hub — used for pre-plan resident preview. */
  originIata?: string;
  destinationIata?: string;
  /** When true, only resident countries are shown until plan is generated. */
  preview?: boolean;
};

export function TravelRequirements({
  requirements,
  originIata,
  destinationIata,
  preview = false,
}: TravelRequirementsProps) {
  const { t } = useI18n();

  const previewData =
    preview && !requirements?.visaInfo?.length
      ? previewTravelRequirements(originIata, destinationIata)
      : null;

  const targetResidents =
    requirements?.targetResidents ?? previewData?.targetResidents ?? [];

  if (targetResidents.length === 0) return null;

  const visaCards = requirements?.visaInfo ?? [];
  const showDetails = !preview && visaCards.length > 0;
  const hasVaccinations = Boolean(requirements?.vaccinations?.trim());
  const hasCosts = Boolean(requirements?.estimatedCosts?.trim());

  return (
    <section
      className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 px-4 py-4 space-y-3"
      aria-label={t("travelReq.title")}
    >
      <div className="flex items-start gap-2">
        <Globe2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-emerald-950">{t("travelReq.title")}</h3>
          <p className="text-xs text-emerald-800/90 mt-0.5">{t("travelReq.subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {targetResidents.map((country) => (
          <span
            key={country}
            className="inline-flex items-center rounded-full bg-white/80 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-900"
          >
            {country}
          </span>
        ))}
      </div>

      {preview && !showDetails && (
        <p className="text-xs text-emerald-800/80 leading-snug">{t("travelReq.previewHint")}</p>
      )}

      {showDetails && (
        <div className="grid gap-2 sm:grid-cols-2">
          {visaCards.map((visa) => (
            <article
              key={visa.country}
              className="rounded-lg border border-white/70 bg-white/90 p-3 shadow-sm"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1.5">
                <FileText className="h-3.5 w-3.5 text-emerald-600" />
                {visa.country}
              </div>
              <p className="text-xs text-slate-700 leading-snug">{visa.requirement}</p>
              <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                <span className="font-semibold text-slate-600">{t("travelReq.howToApply")}: </span>
                {visa.howToApply}
              </p>
            </article>
          ))}
        </div>
      )}

      {(hasVaccinations || hasCosts) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {hasVaccinations && (
            <div className="rounded-lg border border-white/70 bg-white/90 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1">
                <Pill className="h-3.5 w-3.5 text-teal-600" />
                {t("travelReq.vaccinations")}
              </div>
              <p className="text-xs text-slate-700 leading-snug">{requirements!.vaccinations}</p>
            </div>
          )}
          {hasCosts && (
            <div className="rounded-lg border border-white/70 bg-white/90 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1">
                <Wallet className="h-3.5 w-3.5 text-amber-600" />
                {t("travelReq.costs")}
              </div>
              <p className="text-xs text-slate-700 leading-snug">{requirements!.estimatedCosts}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
