import { Navigation } from "lucide-react";
import { toast } from "sonner";
import {
  isValidNavCoord,
  NAV_ERROR_MESSAGES,
  openInGoogleMaps,
} from "@/lib/navigationService";

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
  const canNavigate = isValidNavCoord(lat, lng);

  const handleClick = () => {
    if (!canNavigate) {
      toast.error(NAV_ERROR_MESSAGES.invalid_coords);
      return;
    }
    const result = openInGoogleMaps(lat!, lng!, label);
    if (!result.ok) {
      toast.error(NAV_ERROR_MESSAGES[result.reason]);
    }
  };

  const sizeClasses =
    size === "compact"
      ? "px-3 py-1.5 text-xs"
      : "w-full px-4 py-2.5 text-sm";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canNavigate}
      title={canNavigate ? "Odpri Google Maps navigacijo" : NAV_ERROR_MESSAGES.invalid_coords}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors ${sizeClasses} ${
        canNavigate
          ? "bg-sky-600 text-white hover:bg-sky-700 shadow-sm"
          : "bg-slate-100 text-slate-400 cursor-not-allowed"
      } ${className}`}
    >
      <Navigation className={size === "compact" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
      Navigiraj
    </button>
  );
}
