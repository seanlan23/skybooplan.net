import { AlertTriangle } from "lucide-react";
import type { SafetyWarning } from "@/lib/aiPlan.functions";
import { useI18n } from "@/lib/i18n";

export function SafetyWarningCard({
  warning,
  className = "",
}: {
  warning: SafetyWarning;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div
      role="alert"
      className={`rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3.5 shadow-sm ${className}`}
      aria-label={t("safety.criticalAria" as never)}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow"
          aria-hidden="true"
        >
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-red-800">
            {warning.title ?? t("safety.criticalTitle" as never)}
          </p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-red-950">
            {warning.message}
          </p>
        </div>
      </div>
    </div>
  );
}
