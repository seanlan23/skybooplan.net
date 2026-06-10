import {
  Building2,
  FerrisWheel,
  Hotel,
  Landmark,
  MapPin,
  Plane,
  TreePine,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { mapPoiVisual, type MapPoiCategory } from "@/lib/mapPoiCategory";

const POI_ICONS: Record<MapPoiCategory, LucideIcon> = {
  sightseeing: Landmark,
  nature: TreePine,
  beach: Waves,
  food: UtensilsCrossed,
  entertainment: FerrisWheel,
  hotel: Hotel,
  airport: Plane,
};

type Props = {
  category: MapPoiCategory;
  isActive?: boolean;
  name?: string;
};

export function MapPoiMarker({ category, isActive = false, name }: Props) {
  const visual = mapPoiVisual(category);
  const Icon = POI_ICONS[category] ?? MapPin;

  return (
    <div
      className={`flex items-center justify-center cursor-pointer transition-transform duration-300 ease-out ${
        isActive ? "z-[6]" : "opacity-80"
      }`}
      title={name}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow-md transition-all duration-300 ease-out ${
          isActive ? "scale-110 shadow-lg ring-2 ring-offset-1" : ""
        }`}
        style={{
          backgroundColor: visual.bg,
          ...(isActive ? { borderColor: visual.ring, boxShadow: `0 4px 14px ${visual.ring}55` } : {}),
        }}
      >
        <Icon
          className="pointer-events-none h-4 w-4 text-white"
          strokeWidth={2.25}
          aria-hidden
        />
      </div>
    </div>
  );
}

/** City / day stop marker — circular pin with map icon. */
export function MapCityMarker({
  isActive = false,
  dayCount,
}: {
  isActive?: boolean;
  dayCount?: number;
}) {
  return (
    <div
      className={`relative flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-slate-100 shadow-md transition-all duration-300 ease-out ${
        isActive ? "scale-110 shadow-lg ring-2 ring-sky-400/60 ring-offset-1" : "opacity-90"
      }`}
    >
      <MapPin className="h-5 w-5 text-slate-500" strokeWidth={2.25} aria-hidden />
      {dayCount != null && dayCount > 0 ? (
        <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
          {dayCount}
        </span>
      ) : null}
    </div>
  );
}

/** Origin / home marker. */
export function MapOriginMarker() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-white shadow-md">
      <Building2 className="h-5 w-5 text-slate-800" strokeWidth={2.25} aria-hidden />
    </div>
  );
}
