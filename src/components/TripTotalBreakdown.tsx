import { useI18n } from "@/lib/i18n";

export function TripTotalBreakdown({
  pax = 1,
  motorhome = false,
}: {
  pax?: number;
  motorhome?: boolean;
}) {
  const { t } = useI18n();
  const travelers = Math.max(1, pax);

  return (
    <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 leading-snug max-w-[220px] text-right">
      <p>
        {t(
          (motorhome
            ? "aiplan.totalIncludesMotorhome"
            : "aiplan.totalIncludes") as never,
        )}
      </p>
      <p>
        {t(
          (motorhome
            ? "aiplan.totalExcludesMotorhome"
            : "aiplan.totalExcludes") as never,
        )}
      </p>
      <p className="text-slate-400">
        {travelers > 1
          ? t("aiplan.totalForTravelers").replace("{n}", String(travelers))
          : t("aiplan.totalForOne")}
      </p>
    </div>
  );
}
