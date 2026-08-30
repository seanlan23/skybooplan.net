import { useI18n } from "@/lib/i18n";
import type { OvernightEstimate } from "@/lib/overnightEstimate";

export function TripTotalBreakdown({
  pax = 1,
  motorhome = false,
  car = false,
  planEur = 0,
  flightEur = 0,
  stayEur = 0,
  stayNights = 0,
  stayInTotal = false,
  roundTrip = true,
  overnight,
}: {
  pax?: number;
  motorhome?: boolean;
  /** Car road-trip — fuel + toll/vignette share in the total. */
  car?: boolean;
  /** On-destination / on-the-road spend already in the main TOTAL. */
  planEur?: number;
  /** Selected international flights already in the main TOTAL. */
  flightEur?: number;
  /** Stay already in SKUPAJ (resort / selected package). */
  stayEur?: number;
  stayNights?: number;
  stayInTotal?: boolean;
  /** False for one-way tickets. */
  roundTrip?: boolean;
  overnight?: OvernightEstimate | null;
}) {
  const { t, formatMoney } = useI18n();
  const travelers = Math.max(1, pax);
  const hasFlights = flightEur > 0;
  const hasPlan = planEur > 0;

  const destHint = motorhome
    ? ("aiplan.costOnDestinationMotorhomeHint" as const)
    : car
      ? ("aiplan.costOnDestinationCarHint" as const)
      : ("aiplan.costOnDestinationHint" as const);

  const excludesKey = motorhome
    ? ("aiplan.totalExcludesMotorhome" as const)
    : car
      ? ("aiplan.totalExcludesCar" as const)
      : ("aiplan.totalExcludes" as const);

  const stayAmount = stayEur > 0 ? stayEur : overnight?.totalEur ?? 0;
  const nights = stayNights > 0 ? stayNights : overnight?.nights ?? 0;
  const showStayInTotal = stayInTotal && stayAmount > 0;
  const showOvernight = Boolean(
    !showStayInTotal && overnight && overnight.kind !== "none" && overnight.totalEur > 0,
  );

  const fallbackIncludes = motorhome
    ? ("aiplan.totalIncludesMotorhome" as const)
    : car
      ? hasFlights
        ? ("aiplan.totalIncludesCarWithFlights" as const)
        : ("aiplan.totalIncludesCar" as const)
      : hasFlights
        ? ("aiplan.totalIncludesWithFlights" as const)
        : ("aiplan.totalIncludes" as const);

  return (
    <div className="mt-2 w-full space-y-1.5 text-[11px] text-slate-500 leading-snug text-pretty break-words sm:text-right">
      {hasPlan || hasFlights || showStayInTotal ? (
        <>
          {hasPlan ? (
            <p>
              <span className="font-semibold text-slate-700">{formatMoney(planEur)}</span>
              <span> · {t("aiplan.costOnDestinationLabel")}</span>
              <span className="mt-0.5 block text-[10px] text-slate-400">{t(destHint)}</span>
            </p>
          ) : null}
          {hasFlights ? (
            <p>
              <span className="font-semibold text-slate-700">{formatMoney(flightEur)}</span>
              <span> · {t("aiplan.costFlightsLabel")}</span>
              <span className="mt-0.5 block text-[10px] text-slate-400">
                {t(roundTrip ? "aiplan.costFlightsHintRoundtrip" : "aiplan.costFlightsHintOneway")}
              </span>
            </p>
          ) : null}
          {showStayInTotal ? (
            <p>
              <span className="font-semibold text-slate-700">{formatMoney(stayAmount)}</span>
              <span> · {t("aiplan.costStaysLabel")}</span>
              {nights > 0 ? (
                <span className="mt-0.5 block text-[10px] text-slate-400">
                  {t("aiplan.costStaysHint")
                    .replace("{nights}", String(nights))
                    .replace("{night}", String(overnight?.nightlyEur ?? Math.round(stayAmount / nights)))}
                </span>
              ) : null}
            </p>
          ) : null}
        </>
      ) : (
        <p>{t(fallbackIncludes)}</p>
      )}
      {showStayInTotal ? null : (
        <>
          <p className="pt-0.5 text-slate-400">{t("aiplan.notInTotal")}</p>
          <p>{t(excludesKey)}</p>
        </>
      )}
      {showOvernight ? (
        <p className="font-medium text-slate-600">
          {t("aiplan.overnightApprox")
            .replace("{n}", String(overnight!.totalEur))
            .replace("{night}", String(overnight!.nightlyEur))}
        </p>
      ) : null}
      <p className="text-slate-400">
        {travelers > 1
          ? t("aiplan.totalForTravelers").replace("{n}", String(travelers))
          : t("aiplan.totalForOne")}
      </p>
    </div>
  );
}
