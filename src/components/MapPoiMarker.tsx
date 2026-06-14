import { useState } from "react";
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
import { type MapPoiCategory } from "@/lib/mapPoiCategory";

const POI_ICONS: Record<MapPoiCategory, LucideIcon> = {
  sightseeing: Landmark,
  nature: TreePine,
  beach: Waves,
  food: UtensilsCrossed,
  entertainment: FerrisWheel,
  hotel: Hotel,
  airport: Plane,
};

/** Subtle icon tint — no heavy filled badge backgrounds. */
const CATEGORY_ICON_CLASS: Record<MapPoiCategory, string> = {
  sightseeing: "text-slate-600",
  nature: "text-emerald-600",
  beach: "text-cyan-600",
  food: "text-orange-600",
  entertainment: "text-violet-600",
  hotel: "text-amber-700",
  airport: "text-sky-600",
};

const MARKER_IMG_CLASS =
  "h-11 w-11 rounded-full border-2 border-white object-cover shadow-md transition-all duration-300 ease-out";

const MARKER_ICON_SHELL_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-white/75 shadow-md backdrop-blur-sm transition-all duration-300 ease-out";

type MarkerShellProps = {
  isActive?: boolean;
  isFocused?: boolean;
  isDimmed?: boolean;
  name?: string;
  children: React.ReactNode;
};

function MarkerShell({
  isActive = false,
  isFocused = false,
  isDimmed = false,
  name,
  children,
}: MarkerShellProps) {
  const shellClass = isFocused
    ? "relative z-20 scale-[1.14]"
    : isDimmed
      ? "opacity-35 scale-[0.92]"
      : isActive
        ? "z-[6] scale-105 opacity-100"
        : "opacity-90 hover:opacity-100";

  return (
    <div
      className="pointer-events-auto flex shrink-0 cursor-pointer flex-col items-center"
      title={name}
    >
      {isFocused && name ? (
        <span className="mb-1.5 max-w-[148px] truncate rounded-full bg-slate-900/90 px-2.5 py-1 text-[10px] font-semibold leading-tight text-white shadow-lg backdrop-blur-sm">
          {name}
        </span>
      ) : null}
      <div className={`relative transition-all duration-300 ease-out ${shellClass}`}>
        {isFocused ? (
          <span
            className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-amber-400/70"
            aria-hidden
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

type IconMarkerProps = {
  category: MapPoiCategory;
  isActive?: boolean;
  isFocused?: boolean;
  isDimmed?: boolean;
  name?: string;
};

function IconMarker({
  category,
  isActive = false,
  isFocused = false,
  isDimmed = false,
  name,
}: IconMarkerProps) {
  const Icon = POI_ICONS[category] ?? MapPin;
  const ringClass = isFocused
    ? " ring-[3px] ring-amber-400 ring-offset-2 bg-white shadow-lg"
    : isActive
      ? " ring-2 ring-sky-400/40 ring-offset-1 bg-white/90"
      : "";

  return (
    <MarkerShell
      isActive={isActive}
      isFocused={isFocused}
      isDimmed={isDimmed}
      name={name}
    >
      <div className={`${MARKER_ICON_SHELL_CLASS}${ringClass}`}>
        <Icon
          className={`pointer-events-none h-[18px] w-[18px] ${CATEGORY_ICON_CLASS[category]}`}
          strokeWidth={2}
          aria-hidden
        />
      </div>
    </MarkerShell>
  );
}

export type MapPoiMarkerProps = {
  category: MapPoiCategory;
  isActive?: boolean;
  isFocused?: boolean;
  isDimmed?: boolean;
  name?: string;
  imageUrl?: string;
};

export function MapPoiMarker({
  category,
  isActive = false,
  isFocused = false,
  isDimmed = false,
  name,
  imageUrl,
}: MapPoiMarkerProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const hasPhoto = Boolean(imageUrl?.trim()) && !photoFailed;

  const photoRingClass = isFocused
    ? " ring-[3px] ring-amber-400 ring-offset-2 shadow-lg"
    : isActive
      ? " ring-2 ring-sky-400/50 ring-offset-1"
      : "";

  if (hasPhoto && imageUrl) {
    return (
      <MarkerShell
        isActive={isActive}
        isFocused={isFocused}
        isDimmed={isDimmed}
        name={name}
      >
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setPhotoFailed(true)}
          className={`${MARKER_IMG_CLASS}${photoRingClass}`}
        />
      </MarkerShell>
    );
  }

  return (
    <IconMarker
      category={category}
      isActive={isActive}
      isFocused={isFocused}
      isDimmed={isDimmed}
      name={name}
    />
  );
}

/** City / day stop marker — photo thumbnail or minimal pin. */
export function MapCityMarker({
  isActive = false,
  dayCount,
  imageUrl,
  city,
}: {
  isActive?: boolean;
  dayCount?: number;
  imageUrl?: string;
  city?: string;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const hasPhoto = Boolean(imageUrl?.trim()) && !photoFailed;

  return (
    <div className="relative h-11 w-11 shrink-0">
      {hasPhoto && imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setPhotoFailed(true)}
          className={`${MARKER_IMG_CLASS}${isActive ? " ring-2 ring-sky-400/50 ring-offset-1" : ""}`}
        />
      ) : (
        <div
          className={`${MARKER_ICON_SHELL_CLASS}${isActive ? " ring-2 ring-sky-400/40 ring-offset-1 bg-white/90" : ""}`}
          title={city}
        >
          <MapPin className="pointer-events-none h-[18px] w-[18px] text-slate-500" strokeWidth={2} aria-hidden />
        </div>
      )}
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
    <div className={`${MARKER_ICON_SHELL_CLASS} bg-white/90`}>
      <Building2 className="h-[18px] w-[18px] text-slate-700" strokeWidth={2} aria-hidden />
    </div>
  );
}
