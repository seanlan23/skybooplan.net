import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { HeroChatCollected } from "@/lib/heroChatFlow";
import { parseMakeSearchOriginAirports } from "@/lib/makeSearch";

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
): ChecklistItem[] {
  const origins = collected.destination
    ? parseMakeSearchOriginAirports(collected.destination)
    : [];
  const fromLabel =
    collected.origin?.trim() ||
    (origins.length ? origins.join(", ") : undefined);

  return [
    {
      id: "whereTo",
      labelKey: "heroChat.checklist.whereTo",
      hintKey: "heroChat.checklist.whereToHint",
      done: Boolean(collected.destination?.trim()),
      value: collected.destination?.trim(),
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
      value: collected.dates?.trim(),
    },
    {
      id: "what",
      labelKey: "heroChat.checklist.what",
      hintKey: "heroChat.checklist.whatHint",
      done: Boolean(collected.pace?.trim() && collected.budget?.trim()),
      value: [collected.pace, collected.budget].filter(Boolean).join(" · ") || undefined,
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
}: {
  collected: Partial<HeroChatCollected>;
  className?: string;
}) {
  const { t } = useI18n();
  const items = buildItems(collected, t);
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
          <p className="mt-0.5 text-sm font-medium text-white">
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
    </aside>
  );
}
