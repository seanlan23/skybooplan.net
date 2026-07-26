import { Map as MapIcon, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Floating control to open the mobile Mapbox sheet without scrolling. */
export function MobileMapOpenButton({
  onClick,
  visible,
}: {
  onClick: () => void;
  visible: boolean;
}) {
  const { t } = useI18n();
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-5 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-sky-800 shadow-lg lg:hidden"
      aria-label={t("aiplan.openMap" as never)}
    >
      <MapIcon className="h-4 w-4" aria-hidden />
      {t("aiplan.openMap" as never)}
    </button>
  );
}

/**
 * Top chrome for the mobile fullscreen map sheet.
 * Lives above Mapbox (not over NavigationControl) so the X is always tappable.
 */
export function MobileMapCloseBar({
  onClose,
  title,
}: {
  onClose: () => void;
  title?: string;
}) {
  const { t } = useI18n();
  const label = title?.trim() || t("aiplan.mapStreets" as never);

  return (
    <div
      className="relative z-[100] flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <p className="min-w-0 truncate text-sm font-semibold text-foreground">{label}</p>
      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-border transition hover:bg-muted/80 active:scale-95"
        aria-label={t("poi.close" as never)}
      >
        <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
