import { FileText, Globe2, Pill, Shield, Smartphone, Wallet } from "lucide-react";
import type { TravelRequirements } from "@/lib/travelRequirements";
import { resolveTravelRequirements } from "@/lib/travelRequirements";
import { useI18n } from "@/lib/i18n";

const AIRALO_URL = "https://www.airalo.com/";

type TravelRequirementsProps = {
  /** Full AI-generated requirements from plan JSON. */
  requirements?: TravelRequirements | null;
  originIata?: string;
  destinationIata?: string;
  destinationPlace?: string;
  groundTransportMode?: string;
};

export function TravelRequirements({
  requirements,
  originIata,
  destinationIata,
  destinationPlace,
  groundTransportMode,
}: TravelRequirementsProps) {
  const { t, lang } = useI18n();

  const resolved = resolveTravelRequirements(
    requirements,
    originIata,
    destinationIata,
    lang,
    destinationPlace,
  );
  if (!resolved?.targetResidents.length) return null;

  const visaCards = resolved.visaInfo ?? [];
  const insurance = resolved.insurance;
  const hasVaccinations = Boolean(resolved.vaccinations?.trim());
  const hasCosts = Boolean(resolved.estimatedCosts?.trim());
  const subtitleKey = groundTransportMode
    ? ("travelReq.subtitleRoad" as const)
    : ("travelReq.subtitle" as const);

  return (
    <section
      className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 px-4 py-4 space-y-4"
      aria-label={t("travelReq.title")}
    >
      <div className="flex items-start gap-2">
        <Globe2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-emerald-950">{t("travelReq.title")}</h3>
          <p className="text-xs text-emerald-800/90 mt-0.5">{t(subtitleKey)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {resolved.targetResidents.map((country) => (
          <span
            key={country}
            className="inline-flex items-center rounded-full bg-white/80 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-900"
          >
            {country}
          </span>
        ))}
      </div>

      {insurance ? (
        <article className="rounded-lg border border-amber-200/90 bg-white/95 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-800 mb-2">
            <Shield className="h-4 w-4 text-amber-700 shrink-0" />
            <span>{insurance.title}</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
              {t("travelReq.insuranceRequired")}
            </span>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{insurance.body}</p>
          {insurance.insurers.length > 0 ? (
            <p className="mt-2.5 text-sm text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-800">{t("travelReq.insurers")}: </span>
              {insurance.insurers.join(" · ")}
            </p>
          ) : null}
          <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">{t("travelReq.howToApply")}: </span>
            {insurance.howTo}
          </p>
        </article>
      ) : null}

      {visaCards.length > 0 && (
        <div className="space-y-3">
          {visaCards.map((visa) => (
            <article
              key={visa.country}
              className="rounded-lg border border-white/70 bg-white/90 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-800 mb-2">
                <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{visa.country}</span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{visa.requirement}</p>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">{t("travelReq.howToApply")}: </span>
                {visa.howToApply}
              </p>
            </article>
          ))}
        </div>
      )}

      {(hasVaccinations || hasCosts) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {hasVaccinations && (
            <div className="rounded-lg border border-white/70 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800 mb-2">
                <Pill className="h-4 w-4 text-teal-600 shrink-0" />
                {t("travelReq.vaccinations")}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{resolved.vaccinations}</p>
            </div>
          )}
          {hasCosts && (
            <div className="rounded-lg border border-white/70 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800 mb-2">
                <Wallet className="h-4 w-4 text-sky-600 shrink-0" />
                {t("travelReq.costs")}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{resolved.estimatedCosts}</p>
            </div>
          )}
        </div>
      )}

      <article className="rounded-lg border border-sky-200/80 bg-white/95 p-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800 mb-2">
          <Smartphone className="h-4 w-4 text-sky-600 shrink-0" />
          {t("travelReq.esimTitle")}
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{t("travelReq.esimBody")}</p>
        <a
          href={AIRALO_URL}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="mt-3 inline-flex items-center rounded-full bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-sky-700"
        >
          {t("travelReq.esimCta")}
        </a>
      </article>
    </section>
  );
}
