import { Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { localizeOriginLabel } from "@/lib/airportCatalog";
import {
  localizeDestinationDisplay,
  normalizeHeroTripType,
  type HeroChatCollected,
} from "@/lib/heroChatFlow";
import {
  parseMakeSearchDestination,
  parseMakeSearchOriginAirports,
} from "@/lib/makeSearch";

type ChecklistItem = {
  id: string;
  labelKey: string;
  hintKey: string;
  done: boolean;
  value?: string;
};

function buildItems(
  collected: Partial<HeroChatCollected>,
  t: (key: never) => string,
  lang: string,
): ChecklistItem[] {
  // Never infer "Odkod" from destination text like "Phuket (HKT)".
  const destCode = parseMakeSearchDestination(collected.destination ?? "")?.toUpperCase();
  const originCodes = collected.origin
    ? parseMakeSearchOriginAirports(collected.origin).filter(
        (code) => !destCode || code !== destCode,
      )
    : [];
  const rawOrigin = collected.origin?.trim() || "";
  const fromLabel =
    originCodes.length > 0
      ? localizeOriginLabel(rawOrigin, lang)
      : rawOrigin && destCode && !rawOrigin.toUpperCase().includes(destCode)
        ? localizeOriginLabel(rawOrigin, lang)
        : undefined;
  const destRaw = collected.destination?.trim();

  return [
    {
      id: "whereTo",
      labelKey: "heroChat.checklist.whereTo",
      hintKey: "heroChat.checklist.whereToHint",
      done: Boolean(destRaw),
      value: destRaw ? localizeDestinationDisplay(destRaw, t) : undefined,
    },
    {
      id: "whereFrom",
      labelKey: "heroChat.checklist.whereFrom",
      hintKey: "heroChat.checklist.whereFromHint",
      done: Boolean(fromLabel),
      value: fromLabel,
    },
    {
      id: "who",
      labelKey: "heroChat.checklist.who",
      hintKey: "heroChat.checklist.whoHint",
      done: Boolean(collected.passengers?.trim()),
      value: collected.passengers?.trim(),
    },
    {
      id: "when",
      labelKey: "heroChat.checklist.when",
      hintKey: "heroChat.checklist.whenHint",
      done: Boolean(collected.dates?.trim()),
      value: (() => {
        const dates = collected.dates?.trim();
        if (!dates) return undefined;
        const tripType = collected.tripType
          ? normalizeHeroTripType(collected.tripType)
          : null;
        const tripLabel =
          tripType === "oneway"
            ? t("heroChat.tripType.oneway" as never)
            : tripType === "openjaw"
              ? `${t("heroChat.tripType.openjaw" as never)}${
                  collected.returnFromIata ? ` · ${collected.returnFromIata}` : ""
                }`
              : tripType === "return"
                ? t("heroChat.tripType.return" as never)
                : "";
        return tripLabel ? `${dates} · ${tripLabel}` : dates;
      })(),
    },
    {
      id: "what",
      labelKey: "heroChat.checklist.what",
      hintKey: "heroChat.checklist.whatHint",
      done: Boolean(collected.pace?.trim() && collected.budget?.trim()),
      value:
        [collected.pace, collected.budget, collected.locationWishes]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(" · ") || undefined,
    },
  ].map((item) => ({
    ...item,
    // Resolve labels via t in render; keep keys here.
    labelKey: item.labelKey,
    hintKey: item.hintKey,
  }));
}

/** Layla-style trip checklist — shows what Sky already captured. */
export function HeroTripChecklist({
  collected,
  className,
  onClear,
}: {
  collected: Partial<HeroChatCollected>;
  className?: string;
  onClear?: () => void;
}) {
  const { t, lang } = useI18n();
  const items = buildItems(collected, t, lang);
  const doneCount = items.filter((i) => i.done).length;

  return (
    <aside
      className={cn(
        "rounded-2xl border border-white/20 bg-white/10 p-4 text-left shadow-lg backdrop-blur-md",
        className,
      )}
      aria-label={t("heroChat.checklist.title" as never)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
            {t("heroChat.checklist.title" as never)}
          </p>
          <p className="sr-only">
            {t("heroChat.checklist.progress" as never)
              .replace("{done}", String(doneCount))
              .replace("{total}", String(items.length))}
          </p>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-sm font-bold text-white"
          aria-hidden
        >
          {doneCount}/{items.length}
        </div>
      </div>

      <ol className="space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                item.done
                  ? "border-emerald-300/80 bg-emerald-400/90 text-emerald-950"
                  : "border-white/30 bg-white/5 text-transparent",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {t(item.labelKey as never)}
              </p>
              <p className="truncate text-xs text-white/65">
                {item.done && item.value
                  ? item.value
                  : t(item.hintKey as never)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-medium text-white/85 transition hover:bg-white/15 hover:text-white"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {t("heroChat.checklist.clear" as never)}
        </button>
      ) : null}
    </aside>
  );
}
