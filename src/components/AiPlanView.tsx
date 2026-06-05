import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  CloudSun,
  Moon,
  Lightbulb,
  MapPin,
  Wallet,
  Sparkles,
} from "lucide-react";
import type { Activity, AiTripPlan, DayPlan, Suggestion } from "@/lib/aiPlan.functions";
import { TripMap } from "@/components/TripMap";
import { DayScrollDebug } from "@/components/DayScrollDebug";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import { parseLocalDate, formatLocalDate } from "@/lib/dateUtils";
import { HotelsSection, type StayInfo } from "@/components/HotelsSection";
import { usePlacePhotos } from "@/hooks/usePlacePhotos";

/* ------------------------------- helpers -------------------------------- */

/** Render text with preserved paragraphs, bullets, and inline **bold**. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const renderInline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{p}</span>
      )
    );
  };
  return (
    <div className="text-slate-700 space-y-2 inline-block align-top">
      {blocks.map((block, bi) => {
        const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
        const isBulleted = lines.length > 1 && lines.every((l) => /^[-•*]\s+/.test(l));
        if (isBulleted) {
          return (
            <ul key={bi} className="list-disc pl-5 space-y-1">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^[-•*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-line">
            {renderInline(block)}
          </p>
        );
      })}
    </div>
  );
}


const PRICE_REGEX = /\(([^)]*(?:€|EUR|THB|USD|\$|£|JPY|¥|brezplačno|free|varies)[^)]*)\)/i;
const BOLD_REGEX = /\*\*([^*]+)\*\*/;

/** Parse a markdown-ish string into structured activities (legacy fallback). */
function parseActivities(text?: string): Activity[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Split only on line-leading bullet markers, so multi-paragraph descriptions stay intact.
  const parts = trimmed
    .split(/\n\s*(?:[•\-*])\s+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  // If no bullets, treat the entire string as a single activity description.
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

    // If no bold, take the first chunk before colon as the name.
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

function getSlotActivities(d: DayPlan, slot: "morning" | "afternoon" | "evening"): Activity[] {
  const fromStruct = d.activities?.[slot];
  if (fromStruct && fromStruct.length > 0) return fromStruct;
  return parseActivities(d[slot]);
}

/* ------------------------------ component ------------------------------- */

export type { StayInfo };

export function AiPlanView({
  loading,
  plan,
  error,
  stayInfo,
  protect = false,
  onDownloadClick,
}: {
  loading: boolean;
  plan: AiTripPlan | null;
  error: string | null;
  stayInfo?: StayInfo;
  /** When true, disables copy/right-click/text-selection and shows a preview watermark. */
  protect?: boolean;
  /** Called when the user clicks the Download PDF button. Host decides whether to show paywall or generate PDF. */
  onDownloadClick?: () => void;
}) {
  const { t, lang } = useI18n();
  const [activeDay, setActiveDay] = useState<number>(1);
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const { photoMap } = usePlacePhotos(plan);

  useEffect(() => {
    if (plan?.days?.length) setActiveDay(plan.days[0].day);
  }, [plan]);

  useEffect(() => {
    if (!plan) return;
    if (typeof window === "undefined") return;

    // Threshold line: 38% from the top of the viewport.
    // The day whose card straddles that line (or is closest to it) wins.
    const THRESHOLD = 0.38;

    let rafId = 0;
    let lastDay = activeDay;

    const compute = () => {
      rafId = 0;
      const els = Array.from(dayRefs.current.entries());
      if (els.length === 0) return;
      const lineY = window.innerHeight * THRESHOLD;

      let bestDay = lastDay;
      let bestScore = Number.POSITIVE_INFINITY;
      let straddler: number | null = null;

      for (const [day, el] of els) {
        const r = el.getBoundingClientRect();
        // Card fully straddles the line → instant win
        if (r.top <= lineY && r.bottom >= lineY) {
          straddler = day;
          break;
        }
        // Otherwise score by distance from card center to the line
        const center = (r.top + r.bottom) / 2;
        const score = Math.abs(center - lineY);
        if (score < bestScore) {
          bestScore = score;
          bestDay = day;
        }
      }

      const next = straddler ?? bestDay;
      if (next !== lastDay) {
        lastDay = next;
        setActiveDay(next);
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(compute);
    };

    // Initial sync after layout
    rafId = window.requestAnimationFrame(compute);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);


  if (loading) {
    return <AiPlanLoader />;
  }

  if (error) {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        {resolveErrorMessage(t, error)}
      </div>
    );
  }

  if (!plan) return null;

  const hasCoords = plan.days.some(
    (d) =>
      (Number.isFinite(d.lat) && Number.isFinite(d.lng)) ||
      Boolean((d.city ?? "").trim()) ||
      Boolean((d.focusName ?? "").trim())
  );

  return (
    <div
      id="ai-plan"
      className={`mt-8 space-y-5 relative ${protect ? "select-none" : ""}`}
      style={
        protect
          ? {
              userSelect: "none",
              WebkitUserSelect: "none",
              MozUserSelect: "none",
              msUserSelect: "none",
              WebkitTouchCallout: "none",
            }
          : undefined
      }
      onContextMenu={protect ? (e) => e.preventDefault() : undefined}
      onCopy={protect ? (e) => e.preventDefault() : undefined}
      onCut={protect ? (e) => e.preventDefault() : undefined}
      onDragStart={protect ? (e) => e.preventDefault() : undefined}
    >
      <DayScrollDebug activeDay={activeDay} threshold={0.38} />

      {protect && (
        <>
          {/* Diagonal watermark overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(2,132,199,0.07) 0 60px, rgba(2,132,199,0.0) 60px 220px)",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-22deg] text-4xl sm:text-6xl font-black text-sky-900/10 tracking-widest">
                SKYBOOPLAN · PREDOGLED
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            🔒 Predogled — kopiranje, izbira besedila in prenos PDF so onemogočeni. Za odklep se registriraj in plačaj.
          </div>
        </>
      )}
      {/* Download PDF action (paywall is enforced by the host) */}
      {onDownloadClick && (
        <div className="flex flex-col items-end gap-2 relative z-20">
          <button
            type="button"
            onClick={onDownloadClick}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:shadow-lg transition-shadow"
          >
            <span aria-hidden>⬇</span> {t("aiplan.downloadPdf" as never)}
          </button>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 max-w-sm text-right">
            {t("aiplan.pdfNotice" as never)}{" "}
            <a
              href="/#pricing"
              className="font-semibold underline hover:text-amber-900"
            >
              {t("aiplan.viewPrices" as never)} →
            </a>
          </p>
        </div>
      )}
      {/* Summary card */}
      <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
              <Sparkles className="h-4 w-4" /> {t("aiplan.badge" as never)}
            </div>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
              {plan.destinationName}
            </h2>
            <p className="mt-2 text-slate-600 max-w-2xl">{plan.summary}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              {t("aiplan.total" as never)}
            </div>
            <div className="text-3xl font-bold text-slate-900">
              €{plan.totalBudgetEur}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,440px)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {plan.days.map((d, idx) => {
            // Find checkout date for this city block (date of first day with a different city,
            // or last day's date + 1 if it's the final segment)
            let checkOut = d.date;
            if (d.city) {
              let endIdx = idx;
              for (let j = idx + 1; j < plan.days.length; j++) {
                if (plan.days[j].city === d.city) endIdx = j;
                else break;
              }
              const lastDate = plan.days[endIdx].date;
              const parsed = parseLocalDate(lastDate);
              if (parsed) {
                parsed.setDate(parsed.getDate() + 1);
                const y = parsed.getFullYear();
                const m = String(parsed.getMonth() + 1).padStart(2, "0");
                const dd = String(parsed.getDate()).padStart(2, "0");
                checkOut = `${y}-${m}-${dd}`;
              } else {
                checkOut = lastDate;
              }
            }
            return (
              <DayCard
                key={d.day}
                day={d}
                photoUrl={photoMap.get(d.day)}
                isActive={activeDay === d.day}
                isFirstInCity={
                  idx === 0 || plan.days[idx - 1].city !== d.city
                }
                lang={lang}
                stayInfo={stayInfo}
                checkOut={checkOut}
                regionFallback={undefined}
                onSelect={() => {
                  setActiveDay(d.day);
                  if (typeof window !== "undefined" && window.innerWidth < 1024) {
                    document.getElementById("ai-trip-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                registerRef={(el) => {
                  if (el) dayRefs.current.set(d.day, el);
                  else dayRefs.current.delete(d.day);
                }}
              />

            );
          })}
        </div>

        {hasCoords && (
          <div id="ai-trip-map" className="lg:sticky lg:top-24 scroll-mt-24">
            <TripMap plan={plan} activeDay={activeDay} photoMap={photoMap} />
            <div className="mt-2 text-xs text-slate-500 text-center">
              {t("aiplan.mapHint" as never)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- card ---------------------------------- */

function DayCard({
  day,
  photoUrl,
  isActive,
  isFirstInCity,
  lang,
  registerRef,
  onSelect,
  stayInfo,
  checkOut,
  regionFallback,
}: {
  day: DayPlan;
  photoUrl?: string;
  isActive: boolean;
  isFirstInCity: boolean;
  lang: string;
  registerRef: (el: HTMLDivElement | null) => void;
  onSelect?: () => void;
  stayInfo?: StayInfo;
  checkOut?: string;
  regionFallback?: string;
}) {

  const { t } = useI18n();

  const dateLabel = useMemo(() => {
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
  }, [day.date, lang]);

  return (
    <div
      data-day={day.day}
      ref={registerRef}
      onClick={onSelect}
      className={`overflow-hidden rounded-2xl bg-white shadow-sm transition-all animate-fade-in cursor-pointer ${
        isActive
          ? "border-2 border-sky-300 ring-2 ring-sky-100"
          : "border border-slate-100 hover:shadow-md"
      }`}
    >
      {/* Hero photo (Google Places) */}
      {photoUrl && (
        <div className="relative h-40 sm:h-48 w-full overflow-hidden bg-slate-100">
          <img
            src={photoUrl}
            alt={day.focusName || day.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-5 py-3">
            <div className="text-white text-sm font-medium drop-shadow">
              {day.focusName || day.title}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-sky-50 via-slate-50 to-slate-100 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white font-bold text-base shadow-sm">
            {day.day}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
              {t("aiplan.day" as never)} {day.day}: {day.title}
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
      </div>

      {/* Body */}
      <div className="px-5 py-5 sm:px-6 sm:py-6 space-y-4">
        <TimeBlock
          variant="morning"
          label={t("aiplan.morning" as never)}
          activities={getSlotActivities(day, "morning")}
        />
        <TimeBlock
          variant="afternoon"
          label={t("aiplan.afternoon" as never)}
          activities={getSlotActivities(day, "afternoon")}
        />
        <TimeBlock
          variant="evening"
          label={t("aiplan.evening" as never)}
          activities={getSlotActivities(day, "evening")}
        />

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
              {day.travelHack}
            </p>
          </div>
        )}

        {day.transportationTips && (
          <div className="flex items-start gap-3 rounded-r-lg border-l-4 border-sky-500 bg-sky-50 px-4 py-3">
            <span aria-hidden className="text-lg leading-none">🚇</span>
            <p className="text-sm text-sky-900">
              <span className="font-bold">{t("aiplan.transportationTips" as never)}:</span>{" "}
              {day.transportationTips}
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

        {typeof day.dailyBudgetEur === "number" && (
          <p className="text-sm text-slate-800 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-slate-500" />
            <span className="font-bold">{t("aiplan.dailyBudget" as never)}:</span>{" "}
            cca. €{day.dailyBudgetEur}
          </p>
        )}

        {/* Hotels (only first day in city) */}
        {isFirstInCity && day.city && (
          <HotelsSection
            city={day.city}
            checkIn={day.date}
            checkOut={checkOut}
            stayInfo={stayInfo}
            regionFallback={regionFallback}
          />
        )}


        {/* Suggestions */}
        {day.suggestions && day.suggestions.length > 0 && (
          <SuggestionsSection suggestions={day.suggestions} />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- time block ------------------------------- */

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
} as const;

function TimeBlock({
  variant,
  label,
  activities,
}: {
  variant: keyof typeof VARIANT_CONF;
  label: string;
  activities: Activity[];
}) {
  const conf = VARIANT_CONF[variant];
  if (activities.length === 0) return null;

  return (
    <div>
      <div className={`flex items-center gap-2 border-l-[3px] ${conf.border} ${conf.bg} px-3 py-2 rounded-r-md`}>
        <span aria-hidden className="text-base leading-none">{conf.emoji}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {label}
        </span>
      </div>
      <ul className="mt-2 space-y-3 pl-1">
        {activities.map((a, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span aria-hidden className="text-slate-400 mt-1">•</span>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-slate-900">{a.name}</span>
              {(a.type || a.price || a.priceLabel) && (
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  {a.type && (
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {a.type}
                    </span>
                  )}
                  {(a.price || a.priceLabel) && (
                    <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {a.price || a.priceLabel}
                    </span>
                  )}
                </span>
              )}
              {a.description && (
                <>
                  {a.name && <span className="text-slate-700">: </span>}
                  <RichText text={a.description} />
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------- suggestions ------------------------------- */

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
                  € {s.priceLabel}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}



