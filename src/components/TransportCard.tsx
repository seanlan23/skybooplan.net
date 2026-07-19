import { ArrowRight, Bus, Plane, Ship, TrainFront } from "lucide-react";
import type { DayTransportLeg } from "@/lib/aiPlan.functions";
import { NavigateButton } from "@/components/NavigateButton";
import { useI18n } from "@/lib/i18n";
import { isValidNavCoord } from "@/lib/navigationService";
import { lookupPlaceNavTarget } from "@/lib/placeNavCoords";
import { lookupRegionCoords } from "@/lib/regionCoords";

const TYPE_META: Record<
  DayTransportLeg["type"],
  { label: string; icon: typeof Plane; accent: string; badge: string }
> = {
  flight: {
    label: "Notranji let",
    icon: Plane,
    accent: "border-indigo-200 bg-gradient-to-br from-indigo-50 to-white",
    badge: "bg-indigo-600",
  },
  ferry: {
    label: "Trajekt",
    icon: Ship,
    accent: "border-cyan-200 bg-gradient-to-br from-cyan-50 to-white",
    badge: "bg-cyan-700",
  },
  van: {
    label: "Kombi",
    icon: Bus,
    accent: "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
    badge: "bg-amber-600",
  },
  train: {
    label: "Vlak",
    icon: TrainFront,
    accent: "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
    badge: "bg-slate-700",
  },
};

function resolveLegNav(leg: DayTransportLeg, fallbackLat?: number, fallbackLng?: number) {
  const ferry = leg.type === "ferry";
  const destPlace = lookupPlaceNavTarget(leg.to, { ferry });
  const originPlace = lookupPlaceNavTarget(leg.from, { ferry });
  const dest =
    destPlace ??
    lookupRegionCoords(leg.to) ??
    (isValidNavCoord(fallbackLat, fallbackLng)
      ? { lat: fallbackLat!, lng: fallbackLng! }
      : null);
  const origin = originPlace ?? lookupRegionCoords(leg.from);
  return {
    destLat: dest?.lat,
    destLng: dest?.lng,
    originLat: origin?.lat,
    originLng: origin?.lng,
    originQuery: originPlace?.query,
    destinationQuery: destPlace?.query,
    label: leg.to,
    // Transit + pier place names → Google Maps can draw the ferry line to Rassada.
    travelMode:
      leg.type === "flight" || ferry ? ("transit" as const) : ("driving" as const),
  };
}

function TransportLegCard({
  leg,
  fallbackLat,
  fallbackLng,
}: {
  leg: DayTransportLeg;
  fallbackLat?: number;
  fallbackLng?: number;
}) {
  const { formatMoney } = useI18n();
  const meta = TYPE_META[leg.type];
  const Icon = meta.icon;
  const nav = resolveLegNav(leg, fallbackLat, fallbackLng);
  const canNavigate = isValidNavCoord(nav.destLat, nav.destLng);

  return (
    <div
      className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow ${meta.accent}`}
    >
      <div className="flex items-stretch min-h-[88px]">
        <div className={`flex w-14 shrink-0 items-center justify-center ${meta.badge} text-white`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col justify-center px-4 py-3 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {meta.label}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-900 leading-snug">
            <span className="truncate">{leg.from}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate">{leg.to}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold">{leg.duration}</span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="font-bold text-slate-900">cca. {formatMoney(Math.round(leg.estimatedPrice))}</span>
          </div>
          {canNavigate && (
            <div className="mt-3">
              <NavigateButton
                lat={nav.destLat}
                lng={nav.destLng}
                originLat={nav.originLat}
                originLng={nav.originLng}
                originQuery={nav.originQuery}
                destinationQuery={nav.destinationQuery}
                label={nav.label}
                travelMode={nav.travelMode}
                size="compact"
                className="!w-auto"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TransportCard({
  legs,
  destinationLat,
  destinationLng,
}: {
  legs: DayTransportLeg[];
  /** Fallback destination coords when leg.to is not in the region lookup. */
  destinationLat?: number;
  destinationLng?: number;
}) {
  if (!legs.length) return null;

  return (
    <div className="space-y-3">
      {legs.length > 1 ? (
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory -mx-1 px-1">
          {legs.map((leg, i) => (
            <div key={`${leg.type}-${leg.from}-${leg.to}-${i}`} className="snap-start shrink-0 w-full min-w-[280px] max-w-[340px]">
              <TransportLegCard
                leg={leg}
                fallbackLat={destinationLat}
                fallbackLng={destinationLng}
              />
            </div>
          ))}
        </div>
      ) : (
        <TransportLegCard
          leg={legs[0]!}
          fallbackLat={destinationLat}
          fallbackLng={destinationLng}
        />
      )}
    </div>
  );
}
