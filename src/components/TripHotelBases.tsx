import { Hotel } from "lucide-react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { HotelsSection, type StayInfo } from "@/components/HotelsSection";
import { collectOvernightHotelStays } from "@/lib/overnightHotelStays";
import { useI18n } from "@/lib/i18n";

const MAX_CITY_BASES = 6;

export function TripHotelBases({
  plan,
  stayInfo,
}: {
  plan: AiTripPlan;
  stayInfo?: StayInfo;
}) {
  const { t } = useI18n();
  const stays = collectOvernightHotelStays({
    days: plan.days,
    originPlace: plan.originPlace,
    groundTransportMode: plan.groundTransportMode,
    accommodationMode: plan.accommodationMode,
  }).slice(0, MAX_CITY_BASES);

  if (!stays.length) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <Hotel className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {t("aiplan.cityHotels.title" as never)}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {t("aiplan.cityHotels.subtitle" as never)}
          </p>
        </div>
      </div>
      <div className="space-y-6">
        {stays.map((stay) => (
          <div key={`${stay.city}-${stay.checkIn}-${stay.checkOut}`}>
            <HotelsSection
              city={stay.city}
              checkIn={stay.checkIn}
              checkOut={stay.checkOut}
              stayInfo={stayInfo}
              regionFallback={plan.destinationName}
              initialFilters={{ hotel: true }}
              guestScoreFloor={8}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
