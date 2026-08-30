import type { ReactNode } from "react";
import type { ResortStay } from "@/lib/aiPlan.functions";
import {
  resolveResortDiningModel,
  type ResortDiningHint,
} from "@/lib/resortDiningModel";
import { ensureTransferPickupCopy } from "@/lib/resortTransferModel";
import { useI18n } from "@/lib/i18n";
import type { TripFlightContext } from "@/lib/flightScheduling";
import {
  buildTransitGuide,
  connectionsFromFlightContext,
} from "@/lib/flightTransitGuide";
import { TransitGuideNote } from "@/components/TransitGuideNote";
import { GoldenRulesNote } from "@/components/GoldenRulesNote";

function SectionCard({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">{kicker}</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </article>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function diningFieldLabel(
  destination: ResortDiningHint | undefined,
  t: (key: never) => string,
): string {
  const model = resolveResortDiningModel(destination ?? {});
  if (model === "breakfast_first") return t("aiplan.singleBase.diningBreakfast" as never);
  if (model === "all_inclusive_standard") return t("aiplan.singleBase.allInclusive" as never);
  return t("aiplan.singleBase.diningGeneric" as never);
}

export function SingleBaseStayView({
  stay,
  destination,
  flights,
}: {
  stay: ResortStay;
  destination?: ResortDiningHint;
  flights?: TripFlightContext | null;
}) {
  const { t, lang } = useI18n();
  const arrival = stay.arrivalProtocol;
  const guide = stay.resortGuide;
  const departure = stay.departureProtocol;
  const transitGuide = buildTransitGuide(connectionsFromFlightContext(flights), lang);

  return (
    <div className="space-y-4 sm:space-y-5">
      <GoldenRulesNote lang={lang} />
      <SectionCard
        kicker={t("aiplan.singleBase.kicker" as never)}
        title={t("aiplan.singleBase.arrival" as never)}
      >
        {transitGuide ? <TransitGuideNote guide={transitGuide} /> : null}
        <Field label={t("aiplan.singleBase.visa" as never)} text={arrival?.visa_and_entry ?? ""} />
        <Field label={t("aiplan.singleBase.immigration" as never)} text={arrival?.immigration ?? ""} />
        <Field label={t("aiplan.singleBase.baggage" as never)} text={arrival?.baggage ?? ""} />
        <Field
          label={t("aiplan.singleBase.transfer" as never)}
          text={ensureTransferPickupCopy(arrival?.transfer_pickup ?? "", destination ?? {}, lang)}
        />
        <Field label={t("aiplan.singleBase.cashEsim" as never)} text={arrival?.cash_and_esim ?? ""} />
      </SectionCard>

      <SectionCard
        kicker={t("aiplan.singleBase.kicker" as never)}
        title={t("aiplan.singleBase.resort" as never)}
      >
        <Field label={t("aiplan.singleBase.checkInOut" as never)} text={guide?.check_in_out ?? ""} />
        <Field
          label={diningFieldLabel(destination, t)}
          text={guide?.all_inclusive_etiquette ?? ""}
        />
        <Field label={t("aiplan.singleBase.tipping" as never)} text={guide?.tipping ?? ""} />
        <Field label={t("aiplan.singleBase.relax" as never)} text={guide?.relaxing_at_resort ?? ""} />
      </SectionCard>

      {(stay.optionalExcursions ?? []).length > 0 ? (
        <SectionCard
          kicker={t("aiplan.singleBase.kicker" as never)}
          title={t("aiplan.singleBase.excursions" as never)}
        >
          <ul className="space-y-3">
            {(stay.optionalExcursions ?? []).map((ex) => (
              <li key={ex.title} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-slate-900">{ex.title}</p>
                  {ex.estimated_cost_eur > 0 ? (
                    <p className="shrink-0 text-sm font-semibold text-sky-800">
                      ≈ {ex.estimated_cost_eur} €
                    </p>
                  ) : null}
                </div>
                {ex.description ? <p className="mt-1">{ex.description}</p> : null}
                {ex.book_safely_where ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {t("aiplan.singleBase.bookWhere" as never)}: {ex.book_safely_where}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard
        kicker={t("aiplan.singleBase.kicker" as never)}
        title={t("aiplan.singleBase.departure" as never)}
      >
        <Field
          label={t("aiplan.singleBase.returnTransfer" as never)}
          text={departure?.return_transfer ?? ""}
        />
        <Field
          label={t("aiplan.singleBase.airportLead" as never)}
          text={departure?.airport_lead_time ?? ""}
        />
        <Field
          label={t("aiplan.singleBase.flightAlign" as never)}
          text={departure?.flight_alignment ?? ""}
        />
      </SectionCard>
    </div>
  );
}
