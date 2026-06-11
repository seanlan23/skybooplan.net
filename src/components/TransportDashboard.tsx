import { ArrowRight, Bus, Car, MapPin, Route, TrainFront } from "lucide-react";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { groundTransportLabel } from "@/lib/groundTransport";
import { useI18n } from "@/lib/i18n";

const MODE_ICON = {
  car: Car,
  motorhome: Bus,
  train: TrainFront,
} as const;

function JourneyDaySummary({ day }: { day: DayPlan }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-slate-900">Dan {day.day}</span>
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
    </div>
  );
}

export function TransportDashboard({ plan }: { plan: AiTripPlan }) {
  const { lang } = useI18n();
  const slo = lang === "sl" || lang.startsWith("sl");
  const mode = plan.groundTransportMode;
  const journey = plan.groundJourney;

  if (!mode || !journey) return null;

  const Icon = MODE_ICON[mode];
  const tripDays = [...plan.days].sort((a, b) => a.day - b.day);

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            {slo ? "Pot do tja" : "Getting there"}
          </p>
          <h3 className="mt-0.5 text-lg font-bold text-slate-900">
            {groundTransportLabel(mode, slo)} · {journey.originLabel}
            <ArrowRight className="mx-1.5 inline h-4 w-4 text-slate-400" aria-hidden="true" />
            {journey.destinationLabel}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            {journey.totalDistanceKm != null && journey.totalDistanceKm > 0 && (
              <span className="inline-flex items-center gap-1">
                <Route className="h-4 w-4" />
                {journey.totalDistanceKm} km
              </span>
            )}
            {journey.totalDuration && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {journey.totalDuration}
              </span>
            )}
          </div>
        </div>
      </div>

      {journey.stops.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            {slo ? "Postanki na poti" : "Stops along the way"}
          </p>
          <ol className="flex flex-wrap gap-2">
            {journey.stops.map((stop, i) => (
              <li
                key={`${stop.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                  {i + 1}
                </span>
                {stop.name}
              </li>
            ))}
          </ol>
        </div>
      )}

      {tripDays.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {slo ? "Dnevi poti" : "Travel days"}
          </p>
          {tripDays.map((day) => (
            <JourneyDaySummary key={day.day} day={day} />
          ))}
        </div>
      )}
    </section>
  );
}
