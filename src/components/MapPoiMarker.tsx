import { useState } from "react";
import {
  Building2,
  Bus,
  FerrisWheel,
  Hotel,
  Landmark,
  MapPin,
  Plane,
  Ship,
  TrainFront,
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
  train: TrainFront,
  ferry: Ship,
  transport: Bus,
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
  train: "text-slate-700",
  ferry: "text-cyan-700",
  transport: "text-amber-700",
};

/** Inner photo only — never scale the Mapbox marker root (it owns transform). */
const MARKER_IMG_CLASS =
  "h-11 w-11 rounded-full border-2 border-white object-cover shadow-md transition-[transform,opacity,box-shadow,border-color] duration-200 ease-out group-hover/poi:scale-[1.35] group-hover/poi:shadow-lg group-hover/poi:z-30";

const MARKER_ICON_SHELL_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-white/75 shadow-md backdrop-blur-sm transition-[transform,opacity,box-shadow,border-color] duration-200 ease-out group-hover/poi:scale-[1.25] group-hover/poi:shadow-lg";

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
  showLabel = true,
  children,
}: MarkerShellProps & { showLabel?: boolean }) {
  // Avoid CSS `scale` + transform transitions here — Mapbox owns transform on the marker root.
  const shellClass = isFocused
    ? "relative z-20"
    : isDimmed
      ? "opacity-35"
      : isActive
        ? "z-[6] opacity-100"
        : "opacity-90 hover:opacity-100";

  const label = showLabel ? name : undefined;

  return (
    <div
      className="group/poi pointer-events-auto flex shrink-0 cursor-pointer flex-col items-center"
      title={name}
    >
      {label ? (
        <span
          className={
            isFocused
              ? "layla-poi-label layla-poi-label--focused"
              : "layla-poi-label layla-poi-label--hover"
          }
        >
          {label}
        </span>
      ) : null}
      <div
        className={`relative transition-[opacity,box-shadow] duration-200 ease-out ${shellClass}`}
      >
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
  /** When false, parent DOM already renders the Layla name label. */
  showLabel?: boolean;
};

export function MapPoiMarker({
  category,
  isActive = false,
  isFocused = false,
  isDimmed = false,
  name,
  imageUrl,
  showLabel = true,
}: MapPoiMarkerProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const hasPhoto = Boolean(imageUrl?.trim()) && !photoFailed;

  const photoRingClass = isFocused
    ? " ring-[3px] ring-amber-400 ring-offset-2 shadow-lg scale-[1.2]"
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
        showLabel={showLabel}
      >
        <img
          src={imageUrl}
          alt={name ?? ""}
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
      name={showLabel ? name : undefined}
    />
  );
}

/** City / day stop marker — Layla-style photo pin + day badge. */
export function MapCityMarker({
  isActive = false,
  dayNumber,
  dayEnd,
  imageUrl,
  city,
}: {
  isActive?: boolean;
  /** Itinerary day number shown on the pin badge. */
  dayNumber?: number;
  dayEnd?: number;
  imageUrl?: string;
  city?: string;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const hasPhoto = Boolean(imageUrl?.trim()) && !photoFailed;
  const badgeText =
    dayNumber != null && dayEnd != null && dayEnd > dayNumber
      ? `${dayNumber}–${dayEnd}`
      : dayNumber != null
        ? String(dayNumber)
        : null;

  return (
    <div
      className={`layla-city-pin${hasPhoto ? "" : " layla-city-pin--fallback"}${isActive ? " layla-city-pin--active" : ""}`}
      style={hasPhoto && imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}
      title={city}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="hidden"
          onError={() => setPhotoFailed(true)}
        />
      ) : null}
      {!hasPhoto ? (
        <MapPin className="pointer-events-none h-[18px] w-[18px] text-slate-500" strokeWidth={2} aria-hidden />
      ) : null}
      {badgeText ? (
        <span className="layla-day-badge">{badgeText}</span>
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
