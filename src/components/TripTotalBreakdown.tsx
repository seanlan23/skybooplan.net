import { useI18n } from "@/lib/i18n";

export function TripTotalBreakdown({
  pax = 1,
  motorhome = false,
  car = false,
}: {
  pax?: number;
  motorhome?: boolean;
  /** Car road-trip — fuel + toll/vignette share in the total. */
  car?: boolean;
}) {
  const { t } = useI18n();
  const travelers = Math.max(1, pax);
  const includesKey = motorhome
    ? "aiplan.totalIncludesMotorhome"
    : car
      ? "aiplan.totalIncludesCar"
      : "aiplan.totalIncludes";
  const excludesKey = motorhome
    ? "aiplan.totalExcludesMotorhome"
    : car
      ? "aiplan.totalExcludesCar"
      : "aiplan.totalExcludes";

  return (
    <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 leading-snug max-w-[220px] text-right">
      <p>{t(includesKey as never)}</p>
      <p>{t(excludesKey as never)}</p>
      <p className="text-slate-400">
        {travelers > 1
          ? t("aiplan.totalForTravelers").replace("{n}", String(travelers))
          : t("aiplan.totalForOne")}
      </p>
    </div>
  );
}
