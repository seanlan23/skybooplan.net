import { useI18n } from "@/lib/i18n";
import type { OvernightEstimate } from "@/lib/overnightEstimate";

export function TripTotalBreakdown({
  pax = 1,
  motorhome = false,
  car = false,
  flightEur = 0,
  overnight,
}: {
  pax?: number;
  motorhome?: boolean;
  /** Car road-trip — fuel + toll/vignette share in the total. */
  car?: boolean;
  /** Selected international flights already in the main TOTAL. */
  flightEur?: number;
  overnight?: OvernightEstimate | null;
}) {
  const { t } = useI18n();
  const travelers = Math.max(1, pax);
  const hasFlights = flightEur > 0;

  const includesKey = motorhome
    ? "aiplan.totalIncludesMotorhome"
    : car
      ? hasFlights
        ? "aiplan.totalIncludesCarWithFlights"
        : "aiplan.totalIncludesCar"
      : hasFlights
        ? "aiplan.totalIncludesWithFlights"
        : "aiplan.totalIncludes";

  const excludesKey = motorhome
    ? "aiplan.totalExcludesMotorhome"
    : car
      ? "aiplan.totalExcludesCar"
      : "aiplan.totalExcludes";

  const showOvernight = Boolean(overnight && overnight.kind !== "none" && overnight.totalEur > 0);

  return (
    <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 leading-snug max-w-[240px] text-right">
      <p>{t(includesKey as never)}</p>
      <p>{t(excludesKey as never)}</p>
      {showOvernight ? (
        <p className="pt-0.5 font-medium text-slate-600">
          {t("aiplan.overnightApprox" as never).replace(
            "{n}",
            String(overnight!.totalEur),
          )}
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
