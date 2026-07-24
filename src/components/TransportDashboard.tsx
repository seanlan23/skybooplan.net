import { useMemo } from "react";
import { ArrowRight, Bus, Car, MapPin, Route, TrainFront } from "lucide-react";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { collectRoadTripHubStops, groundTransportLabel } from "@/lib/groundTransport";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MODE_ICON = {
  car: Car,
  motorhome: Bus,
  train: TrainFront,
} as const;

function JourneyDaySummary({
  day,
  isActive,
  onSelect,
}: {
  day: DayPlan;
  isActive?: boolean;
  onSelect?: () => void;
}) {
  const { t } = useI18n();
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-slate-900">
          {t("aiplan.day")} {day.day}
        </span>
        {day.city && (
          <>
            <span className="text-slate-300">·</span>
            <span className="font-semibold text-slate-700">{day.city}</span>
          </>
        )}
      </div>
      {day.title && <p className="mt-1 text-sm text-slate-600">{day.title}</p>}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        {day.drivingDistanceKm != null && day.drivingDistanceKm > 0 && (
          <span>{Math.round(day.drivingDistanceKm)} km</span>
        )}
        {day.drivingDurationHours && <span>{day.drivingDurationHours}</span>}
      </div>
      {day.transportation && day.transportation.length > 0 && (
        <div className="mt-2 space-y-1">
          {day.transportation.map((leg, i) => (
            <div key={i} className="text-xs text-slate-600">
              {leg.from} → {leg.to} · {leg.duration}
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full rounded-xl border px-4 py-3 text-left transition-colors",
          isActive
            ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200"
            : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50",
        )}
      >
        {body}
      </button>
    );
  }

  return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">{body}</div>;
}

type Props = {
  plan: AiTripPlan;
  activeDay?: number;
  /** Focus Mapbox + scroll itinerary to this stop's first day. */
  onStopSelect?: (day: number) => void;
};

export function TransportDashboard({ plan, activeDay, onStopSelect }: Props) {
  const { t, lang } = useI18n();
  const mode = plan.groundTransportMode;
  const journey = plan.groundJourney;

  if (!mode || !journey) return null;

  const Icon = MODE_ICON[mode];
  const isMotorhome = mode === "motorhome";
  // Recompute hubs client-side so older plans (day×city duplicates) fix without regenerate.
  const stops = useMemo(
    () => (isMotorhome ? collectRoadTripHubStops(plan) : journey.stops),
    [isMotorhome, plan, journey.stops],
  );
  const totalDistanceKm = useMemo(() => {
    if (!isMotorhome) return journey.totalDistanceKm;
    const sum = plan.days.reduce((acc, d) => acc + (d.drivingDistanceKm ?? 0), 0);
    return sum > 0 ? Math.round(sum) : journey.totalDistanceKm;
  }, [isMotorhome, plan.days, journey.totalDistanceKm]);
  // Motorhome: hubs only in the chips — full day list lives in the itinerary below.
  const tripDays = isMotorhome
    ? []
    : [...plan.days]
        .filter((d) => d.journeyPhase === "outbound")
        .sort((a, b) => a.day - b.day);

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            {t("transportDashboard.gettingThere")}
          </p>
          <h3 className="mt-0.5 text-lg font-bold text-slate-900">
            {groundTransportLabel(mode, lang)} · {journey.originLabel}
            <ArrowRight className="mx-1.5 inline h-4 w-4 text-slate-400" aria-hidden="true" />
            {journey.destinationLabel}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            {totalDistanceKm != null && totalDistanceKm > 0 && (
              <span className="inline-flex items-center gap-1">
                <Route className="h-4 w-4" />
                {totalDistanceKm} km
              </span>
            )}
            {!isMotorhome && journey.totalDuration && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {journey.totalDuration}
              </span>
            )}
            {isMotorhome && stops.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {stops.length} {t("transportDashboard.stops").toLowerCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      {stops.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            {t("transportDashboard.stops")}
          </p>
          <ol className="flex flex-wrap gap-2">
            {stops.map((stop, i) => {
              const dayNum = stop.day;
              const isActive =
                dayNum != null &&
                activeDay != null &&
                (activeDay === dayNum ||
                  // Highlight while scrolled through a multi-night stay in this hub.
                  plan.days.find((d) => d.day === activeDay)?.city?.trim().toLowerCase() ===
                    stop.name.trim().toLowerCase());
              const clickable = Boolean(onStopSelect && dayNum != null);

              return (
                <li key={`${stop.name}-${dayNum ?? i}`}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => onStopSelect!(dayNum!)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                        isActive
                          ? "border-indigo-400 bg-indigo-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                          isActive ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700",
                        )}
                      >
                        {i + 1}
                      </span>
                      {stop.name}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                        {i + 1}
                      </span>
                      {stop.name}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {tripDays.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {t("transportDashboard.travelDays")}
          </p>
          {tripDays.map((day) => (
            <JourneyDaySummary
              key={day.day}
              day={day}
              isActive={activeDay === day.day}
              onSelect={onStopSelect ? () => onStopSelect(day.day) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
