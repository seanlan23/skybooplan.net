import { Navigation } from "lucide-react";
import { toast } from "sonner";
import {
  isValidNavCoord,
  openInGoogleMaps,
} from "@/lib/navigationService";
import { useI18n } from "@/lib/i18n";

export function NavigateButton({
  lat,
  lng,
  label,
  className = "",
  size = "default",
}: {
  lat?: number;
  lng?: number;
  label?: string;
  className?: string;
  size?: "default" | "compact";
}) {
  const { t } = useI18n();
  const canNavigate = isValidNavCoord(lat, lng);

  const navError = (reason: "invalid_coords" | "no_window") =>
    reason === "invalid_coords" ? t("navigate.error.invalidCoords") : t("navigate.error.noWindow");

  const handleClick = () => {
    if (!canNavigate) {
      toast.error(navError("invalid_coords"));
      return;
    }
    const result = openInGoogleMaps(lat!, lng!, label);
    if (!result.ok) {
      toast.error(navError(result.reason));
    }
  };

  const sizeClasses =
    size === "compact"
      ? "px-3 py-1.5 text-xs"
      : "w-full min-w-0 px-3 py-2.5 text-xs sm:px-4 sm:text-sm";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canNavigate}
      title={canNavigate ? t("navigate.openMapsTitle") : t("navigate.error.invalidCoords")}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors ${sizeClasses} ${
        canNavigate
          ? "bg-sky-600 text-white hover:bg-sky-700 shadow-sm"
          : "bg-slate-100 text-slate-400 cursor-not-allowed"
      } ${className}`}
    >
      <Navigation className={size === "compact" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
      {t("navigate.button")}
    </button>
  );
}
