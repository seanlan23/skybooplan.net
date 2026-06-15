import { useMemo } from "react";
import {
  AlarmClock,
  CloudSun,
  Moon,
  MapPin,
  Hotel,
  Tent,
  Wallet,
  Clock,
  Car,
  Route,
  Plane,
  Ship,
  Bus,
  TrainFront,
} from "lucide-react";
import type { Activity, ActivityTransportType, DayPlan, Suggestion } from "@/lib/aiPlan.functions";
import { HotelsSection, type StayInfo } from "@/components/HotelsSection";
import { TransportCard } from "@/components/TransportCard";
import { IslandAccessTransferCard } from "@/components/IslandAccessTransferCard";
import { useI18n } from "@/lib/i18n";
import { parseLocalDate } from "@/lib/dateUtils";
import { isHotelRestDay, motorhomeCampingHint, resolveTripAccommodation } from "@/lib/tripMode";
import { formatDayCardTitle, sortActivitiesByTime } from "@/lib/dayPlanUi";
import { formatStayDateRange } from "@/lib/islandStays";
import { sanitizeLegacyTemplateLeak } from "@/lib/textSanitize";
import type { ActivityMapFocus } from "@/components/TripMap";
import {
  activityToPoiDetails,
  findActivityPin,
  type PoiDetailsData,
} from "@/lib/poiDetails.types";
import { normalizeImageUrl } from "@/lib/unsplashPhotos";
import { resolveActivityCoordinates } from "@/lib/mapPoiResolver";

const PRICE_REGEX = /\(([^)]*(?:€|EUR|THB|USD|\$|£|JPY|¥|brezplačno|free|varies)[^)]*)\)/i;
const BOLD_REGEX = /\*\*([^*]+)\*\*/;

function parseActivities(text?: string): Activity[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/\n\s*(?:[•\-*])\s+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments = parts.length > 0 ? parts : [trimmed];

  return segments.map((seg) => {
    const boldMatch = seg.match(BOLD_REGEX);
    const priceMatch = seg.match(PRICE_REGEX);

    let name = boldMatch?.[1]?.trim() ?? "";
    let description = seg
      .replace(BOLD_REGEX, "")
      .replace(PRICE_REGEX, "")
      .replace(/^[:·\-\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!name) {
      const colonIdx = description.indexOf(":");
      if (colonIdx > 0 && colonIdx < 60) {
        name = description.slice(0, colonIdx).trim();
        description = description.slice(colonIdx + 1).trim();
      } else {
        name = description;
        description = "";
      }
    }

    return {
      name,
      priceLabel: priceMatch?.[1]?.trim(),
      description,
    };
  });
}

export function getSlotActivities(d: DayPlan, slot: "morning" | "afternoon" | "evening"): Activity[] {
  const fromStruct = d.activities?.[slot];
  if (fromStruct && fromStruct.length > 0) return sortActivitiesByTime(fromStruct);
  return parseActivities(d[slot]);
}

const VARIANT_CONF = {
  morning: {
    border: "border-blue-500",
    bg: "bg-slate-50",
    emoji: "⏰",
    icon: AlarmClock,
  },
  afternoon: {
    border: "border-amber-500",
    bg: "bg-slate-50",
    emoji: "🌤",
    icon: CloudSun,
  },
  evening: {
    border: "border-indigo-500",
    bg: "bg-slate-50",
    emoji: "🌙",
    icon: Moon,
  },
  island: {
    border: "border-teal-500",
    bg: "bg-teal-50/60",
    emoji: "🏝",
    icon: CloudSun,
  },
} as const;

function activityDescriptionBullets(text?: string): string[] {
  if (!text?.trim()) return [];
  const trimmed = text.trim();

  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*▸]\s+/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 4);

  const sentences = trimmed.match(/[^.!?…]+[.!?…]+/g)?.map((s) => s.trim()).filter(Boolean);
  if (sentences && sentences.length > 1) return sentences.slice(0, 3);

  if (trimmed.length > 160) {
    const chunk = trimmed.slice(0, 157).trim();
    const breakAt = Math.max(chunk.lastIndexOf(". "), chunk.lastIndexOf(", "));
    const cut = breakAt > 80 ? chunk.slice(0, breakAt + 1) : `${chunk}…`;
    return [cut];
  }
  return [trimmed];
}

function ActivityTimePill({ activity }: { activity: Activity }) {
  if (!activity.arrivalTime && !activity.departureTime) return null;
  const label =
    activity.arrivalTime && activity.departureTime
      ? `${activity.arrivalTime} – ${activity.departureTime}`
      : activity.arrivalTime ?? activity.departureTime;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-600 px-3 py-1 text-sm font-medium tabular-nums">
      <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" />
      {label}
    </span>
  );
}

function ActivityCostPill({ activity }: { activity: Activity }) {
  const label = activity.priceLabel ?? activity.price;
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-sm font-medium">
      {label}
    </span>
  );
}

function ActivityTypePill({ type, activity }: { type?: string; activity?: Activity }) {
  if (!type || activity?.transportType) return null;
  const labels: Record<string, string> = {
    SIGHT: "Znamenitost",
    SIGHTSEEING: "Ogled",
    ACTIVITY: "Aktivnost",
    EAT: "Hrana",
    FOOD: "Hrana",
    TRANSPORT: "Prevoz",
    AIRPORT: "Let",
    NATURE: "Narava",
    BEACH: "Plaža",
    ENTERTAINMENT: "Zabava",
  };
  const label = labels[type.toUpperCase()] ?? type;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
      {label}
    </span>
  );
}

const TRANSPORT_PILL_META: Record<
  ActivityTransportType,
  { label: string; icon: typeof Plane; className: string }
> = {
  flight: {
    label: "Let",
    icon: Plane,
    className: "bg-indigo-50 text-indigo-700",
  },
  ferry: {
    label: "Trajekt",
    icon: Ship,
    className: "bg-cyan-50 text-cyan-800",
  },
  train: {
    label: "Vlak",
    icon: TrainFront,
    className: "bg-slate-100 text-slate-700",
  },
  van: {
    label: "Kombi",
    icon: Bus,
    className: "bg-amber-50 text-amber-800",
  },
  bus: {
    label: "Avtobus",
    icon: Bus,
    className: "bg-amber-50 text-amber-800",
  },
  taxi: {
    label: "Taxi",
    icon: Car,
    className: "bg-yellow-50 text-yellow-800",
  },
};

function ActivityTransportPill({ activity }: { activity: Activity }) {
  if (!activity.transportType || !activity.transportDuration) return null;
  const meta = TRANSPORT_PILL_META[activity.transportType];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{meta.label}</span>
      <span className="font-medium tabular-nums">{activity.transportDuration}</span>
    </span>
  );
}

function ActivityItem({
  activity,
  day,
  onFocus,
  onDetails,
}: {
  activity: Activity;
  day: DayPlan;
  onFocus?: (coords: ActivityMapFocus) => void;
  onDetails?: (poi: PoiDetailsData) => void;
}) {
  const { t } = useI18n();
  const bullets = activityDescriptionBullets(activity.description);
  const pin = findActivityPin(day, activity);
  const imageUrl = normalizeImageUrl(activity.imageUrl ?? pin?.imageUrl);
  const resolvedCoords = resolveActivityCoordinates(activity, day);
  const lat = resolvedCoords?.lat;
  const lng = resolvedCoords?.lng;
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat !== 0 &&
    lng !== 0 &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  const handleFocus = () => {
    if (hasCoords && onFocus && lat != null && lng != null) {
      onFocus({ lat, lng, day: day.day, poiName: activity.name });
    }
  };

  return (
    <li
      className={`rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4 sm:py-4 shadow-sm transition-all ${
        hasCoords
          ? "cursor-pointer hover:border-sky-200 hover:bg-sky-50/50 hover:shadow-md active:scale-[0.99]"
          : ""
      }`}
      onClick={(e) => {
        e.stopPropagation();
        handleFocus();
      }}
      onKeyDown={(e) => {
        if (hasCoords && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleFocus();
        }
      }}
      role={hasCoords ? "button" : undefined}
      tabIndex={hasCoords ? 0 : undefined}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="mb-3 h-28 w-full rounded-xl object-cover"
        />
      ) : null}
      <h4 className="font-bold text-slate-900 text-[15px] leading-snug">{activity.name}</h4>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <ActivityTransportPill activity={activity} />
        <ActivityTimePill activity={activity} />
        <ActivityCostPill activity={activity} />
        <ActivityTypePill type={activity.type} activity={activity} />
      </div>
      {bullets.length > 0 && (
        <ul className="mt-3 space-y-2">
          {bullets.map((line, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-600 leading-relaxed">
              <span className="shrink-0 text-sky-400 font-bold mt-0.5" aria-hidden="true">
                ▸
              </span>
              <span className={bullets.length === 1 ? "line-clamp-3" : "line-clamp-2"}>
                {line}
              </span>
            </li>
          ))}
        </ul>
      )}
      {onDetails && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDetails(
              activityToPoiDetails(activity, day),
            );
          }}
          className="mt-3 inline-flex items-center rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition-colors"
        >
          {t("poi.moreInfo")}
        </button>
      )}
    </li>
  );
}

function DayLogisticsBar({ day, pax }: { day: DayPlan; pax: number }) {
  const { t, formatMoney } = useI18n();
  const budget =
    typeof day.dailyBudgetEur === "number" && day.dailyBudgetEur > 0
      ? Math.round(day.dailyBudgetEur)
      : null;
  const hasDriveKm = typeof day.drivingDistanceKm === "number" && day.drivingDistanceKm > 0;
  const hasDriveTime = Boolean(day.drivingDurationHours?.trim() && day.drivingDurationHours !== "0h");
  if (budget == null && !hasDriveKm && !hasDriveTime) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {budget != null && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
          <Wallet className="h-3.5 w-3.5 shrink-0" />
          {formatMoney(budget)}
          {pax > 1 ? t("aiplan.perPerson") : t("aiplan.perDay")}
        </span>
      )}
      {hasDriveKm && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200/80">
          <Route className="h-3.5 w-3.5 shrink-0" />
          {day.drivingDistanceKm} km
        </span>
      )}
      {hasDriveTime && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/80">
          <Car className="h-3.5 w-3.5 shrink-0" />
          {day.drivingDurationHours}
        </span>
      )}
    </div>
  );
}

function IslandStayBlock({
  label,
  hint,
  activities,
  day,
  onActivityFocus,
  onActivityDetails,
}: {
  label: string;
  hint: string;
  activities: Activity[];
  day: DayPlan;
  onActivityFocus?: (coords: ActivityMapFocus) => void;
  onActivityDetails?: (poi: PoiDetailsData) => void;
}) {
  const conf = VARIANT_CONF.island;
  if (activities.length === 0) return null;
  const sortedActivities = sortActivitiesByTime(activities);

  return (
    <div>
      <div className={`flex items-center gap-2 border-l-[3px] ${conf.border} ${conf.bg} px-3 py-2 rounded-r-md`}>
        <span aria-hidden className="text-base leading-none">{conf.emoji}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {label}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed line-clamp-2">{hint}</p>
      <ul className="mt-4 space-y-4">
        {sortedActivities.map((a, i) => (
          <ActivityItem
            key={i}
            activity={a}
            day={day}
            onFocus={onActivityFocus}
            onDetails={onActivityDetails}
          />
        ))}
      </ul>
    </div>
  );
}

function TimeBlock({
  variant,
  label,
  activities,
  day,
  onActivityFocus,
  onActivityDetails,
}: {
  variant: keyof typeof VARIANT_CONF;
  label: string;
  activities: Activity[];
  day: DayPlan;
  onActivityFocus?: (coords: ActivityMapFocus) => void;
  onActivityDetails?: (poi: PoiDetailsData) => void;
}) {
  const conf = VARIANT_CONF[variant];
  if (activities.length === 0) return null;
  const sortedActivities = sortActivitiesByTime(activities);

  return (
    <div>
      <div className={`flex items-center gap-2 border-l-[3px] ${conf.border} ${conf.bg} px-3 py-2 rounded-r-md`}>
        <span aria-hidden className="text-base leading-none">{conf.emoji}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {label}
        </span>
      </div>
      <ul className="mt-4 space-y-4">
        {sortedActivities.map((a, i) => (
          <ActivityItem
            key={i}
            activity={a}
            day={day}
            onFocus={onActivityFocus}
            onDetails={onActivityDetails}
          />
        ))}
      </ul>
    </div>
  );
}

function SuggestionsSection({ suggestions }: { suggestions: Suggestion[] }) {
  const { t } = useI18n();
  return (
    <div className="pt-2 border-t border-slate-100">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 mt-3">
        {t("aiplan.suggestionsForDay" as never)}
      </div>
      <ul className="space-y-2">
        {suggestions.map((s, i) => (
          <li
            key={i}
            className="rounded-xl bg-slate-50 px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900">{s.name}</div>
                {s.description && (
                  <div className="mt-1 text-xs text-slate-500">{s.description}</div>
                )}
              </div>
              {s.priceLabel && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {s.priceLabel}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StreamingDayPlaceholder({
  dayNumber,
  isGenerating = false,
}: {
  dayNumber: number;
  isGenerating?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      data-day={dayNumber}
      className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm animate-fade-in"
    >
      <div className="px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6 space-y-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="h-10 w-10 shrink-0 rounded-full animate-pulse bg-sky-200" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        </div>
        {isGenerating && (
          <p className="text-sm font-medium text-sky-600 animate-pulse">
            {t("aiplan.generatingDay").replace("{n}", String(dayNumber))}
          </p>
        )}
      </div>
    </div>
  );
}

export function AiPlanDayCard({
  day,
  isActive,
  isFirstInCity,
  lang,
  registerRef,
  onSelect,
  stayInfo,
  checkOut,
  regionFallback,
  pax = 1,
  accommodationMode = "hotel",
  hotelRestEveryNDays,
  totalTripDays,
  plannerWishes,
  onActivityFocus,
  onActivityDetails,
}: {
  day: DayPlan;
  isActive: boolean;
  isFirstInCity: boolean;
  lang: string;
  registerRef: (el: HTMLDivElement | null) => void;
  onSelect?: () => void;
  stayInfo?: StayInfo;
  checkOut?: string;
  regionFallback?: string;
  /** Travelers — daily budget is shown per person. */
  pax?: number;
  accommodationMode?: "hotel" | "motorhome";
  hotelRestEveryNDays?: number;
  totalTripDays?: number;
  /** Fallback when skeleton/plan omits hotelRestEveryNDays (e.g. old session). */
  plannerWishes?: string;
  onActivityFocus?: (coords: ActivityMapFocus) => void;
  onActivityDetails?: (poi: PoiDetailsData) => void;
}) {
  const { t, formatMoney } = useI18n();
  const slo = lang === "sl" || lang?.startsWith("sl");
  const tripAcc = resolveTripAccommodation({
    accommodationMode,
    hotelRestEveryNDays,
    wishes: plannerWishes,
  });
  const isHotelRestNight =
    tripAcc.accommodationMode === "motorhome" &&
    tripAcc.hotelRestEveryNDays != null &&
    isHotelRestDay(day.day, tripAcc.hotelRestEveryNDays, { totalDays: totalTripDays });

  const hotelCheckOut = useMemo(() => {
    if (!isHotelRestNight) return checkOut;
    const parsed = parseLocalDate(day.date);
    if (!parsed) return checkOut;
    parsed.setDate(parsed.getDate() + 1);
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }, [isHotelRestNight, day.date, checkOut]);

  const dateLabel = useMemo(() => {
    if (day.dateEnd && day.dayEnd && day.dayEnd > day.day) {
      return formatStayDateRange(day.date, day.dateEnd, lang || "sl");
    }
    const d = parseLocalDate(day.date);
    if (!d) return day.date;
    try {
      return d.toLocaleDateString(lang || "sl", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
    } catch {
      return day.date;
    }
  }, [day.date, day.dateEnd, day.day, day.dayEnd, lang]);

  const dayBadge = day.dayEnd && day.dayEnd > day.day ? `${day.day}–${day.dayEnd}` : String(day.day);

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelect) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button, [role='button'], input, textarea, select, label")) return;
    onSelect();
  };

  return (
    <div
      data-day={day.day}
      ref={registerRef}
      onClick={handleCardClick}
      className={`overflow-hidden rounded-2xl bg-white shadow-sm transition-all animate-fade-in cursor-pointer ${
        isActive
          ? "border-2 border-sky-300 ring-2 ring-sky-100"
          : "border border-slate-100 hover:shadow-md"
      }`}
    >
      <div className="bg-gradient-to-br from-sky-50 via-slate-50 to-slate-100 px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 px-2 text-white font-bold text-sm shadow-sm">
            {dayBadge}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 leading-tight">
              {formatDayCardTitle(day, t("aiplan.day" as never) as string)}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500 capitalize">{dateLabel}</span>
              {day.city && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition-colors"
                >
                  <MapPin className="h-3 w-3" />
                  {day.city}
                </button>
              )}
            </div>
          </div>
        </div>
        <DayLogisticsBar day={day} pax={pax} />
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6 space-y-4 sm:space-y-6">
        {day.transportation && day.transportation.length > 0 && (
          day.islandAccessRoute ? (
            <IslandAccessTransferCard legs={day.transportation} />
          ) : (
            <TransportCard
              legs={day.transportation}
              destinationLat={day.lat}
              destinationLng={day.lng}
            />
          )
        )}
        {day.islandStay ? (
          <IslandStayBlock
            label={
              day.islandStay.stayKind === "bay_cruise"
                ? (t("aiplan.bayStayActivities" as never) as string)
                : (t("aiplan.islandStayActivities" as never) as string)
            }
            hint={
              day.islandStay.stayKind === "bay_cruise"
                ? (t("aiplan.bayStayHint" as never) as string)
                : (t("aiplan.islandStayHint" as never) as string)
            }
            activities={day.islandStay.flexibleActivities}
            day={day}
            onActivityFocus={onActivityFocus}
            onActivityDetails={onActivityDetails}
          />
        ) : (
          <>
            <TimeBlock
              variant="morning"
              label={t("aiplan.morning" as never)}
              activities={getSlotActivities(day, "morning")}
              day={day}
              onActivityFocus={onActivityFocus}
              onActivityDetails={onActivityDetails}
            />
            <TimeBlock
              variant="afternoon"
              label={t("aiplan.afternoon" as never)}
              activities={getSlotActivities(day, "afternoon")}
              day={day}
              onActivityFocus={onActivityFocus}
              onActivityDetails={onActivityDetails}
            />
            <TimeBlock
              variant="evening"
              label={t("aiplan.evening" as never)}
              activities={getSlotActivities(day, "evening")}
              day={day}
              onActivityFocus={onActivityFocus}
              onActivityDetails={onActivityDetails}
            />
          </>
        )}

        {day.transport && (
          <div className="pt-1">
            <p className="text-sm text-slate-700">
              <span className="font-bold text-slate-900">
                {t("aiplan.transport" as never)}:
              </span>{" "}
              {day.transport.type} · {day.transport.duration} · {day.transport.cost}
            </p>
            {day.transport.description && (
              <p className="mt-1 text-sm text-slate-600">{day.transport.description}</p>
            )}
          </div>
        )}

        {day.travelHack && (
          <div className="flex items-start gap-3 rounded-r-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
            <span aria-hidden className="text-lg leading-none">💡</span>
            <p className="text-sm text-amber-900">
              <span className="font-bold">{t("aiplan.travelHack" as never)}:</span>{" "}
              {sanitizeLegacyTemplateLeak(day.travelHack)}
            </p>
          </div>
        )}

        {day.transportationTips && (
          <div className="flex items-start gap-3 rounded-r-lg border-l-4 border-sky-500 bg-sky-50 px-4 py-3">
            <span aria-hidden className="text-lg leading-none">🚇</span>
            <p className="text-sm text-sky-900">
              <span className="font-bold">{t("aiplan.transportationTips" as never)}:</span>{" "}
              {sanitizeLegacyTemplateLeak(day.transportationTips)}
            </p>
          </div>
        )}

        {day.localWarnings && (
          <div className="flex items-start gap-3 rounded-r-lg border-l-4 border-rose-500 bg-rose-50 px-4 py-3">
            <span aria-hidden className="text-lg leading-none">⚠️</span>
            <p className="text-sm text-rose-900">
              <span className="font-bold">{t("aiplan.localWarnings" as never)}:</span>{" "}
              {day.localWarnings}
            </p>
          </div>
        )}

        {typeof day.dailyBudgetEur === "number" && day.dailyBudgetEur > 0 && (
          <p className="text-sm text-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Wallet className="h-4 w-4 text-slate-500 shrink-0" />
            <span>
              <span className="font-bold">
                {day.islandStay
                  ? t("aiplan.islandStayBudget" as never).replace(
                      "{n}",
                      String(day.islandStay.nights),
                    )
                  : t("aiplan.dailyBudgetPerPerson" as never)}
                :
              </span>{" "}
              {formatMoney(Math.round(day.dailyBudgetEur))}
            </span>
            {pax > 1 && (
              <span className="text-slate-600">
                · {t("aiplan.dailyBudgetGroup" as never).replace("{n}", String(pax))}:{" "}
                {formatMoney(Math.round(day.dailyBudgetEur * pax))}
              </span>
            )}
          </p>
        )}

        {isFirstInCity && day.city && tripAcc.accommodationMode === "motorhome" && !isHotelRestNight && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <Tent className="h-4 w-4 shrink-0" />
              {t("aiplan.campingNear" as never)} {day.city}
            </div>
            <p className="mt-1.5 text-xs text-emerald-800/90 leading-relaxed">
              {motorhomeCampingHint(day.city, slo)}
            </p>
          </div>
        )}

        {isHotelRestNight && day.city && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-900">
              <Hotel className="h-4 w-4 shrink-0" />
              {t("aiplan.hotelRestNight" as never)} · {day.city}
            </div>
            <p className="mt-1.5 text-xs text-sky-800/90 leading-relaxed">
              {t("aiplan.hotelRestDay" as never)}
            </p>
          </div>
        )}

        {day.city &&
          !day.inFlightDay &&
          ((tripAcc.accommodationMode !== "motorhome" && isFirstInCity) || isHotelRestNight) && (
          <HotelsSection
            city={day.city}
            checkIn={day.date}
            checkOut={hotelCheckOut}
            stayInfo={stayInfo}
            regionFallback={regionFallback}
          />
        )}

        {day.suggestions && day.suggestions.length > 0 && (
          <SuggestionsSection suggestions={day.suggestions} />
        )}
      </div>
    </div>
  );
}
