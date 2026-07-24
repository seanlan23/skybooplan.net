import { Map as MapIcon } from "lucide-react";
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
