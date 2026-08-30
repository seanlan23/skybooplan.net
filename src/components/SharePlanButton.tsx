import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { ResortPackage } from "@/lib/resortPackage";
import { copySharedPlanLink } from "@/lib/copySharedPlanLink";
import { copyTextToClipboard } from "@/lib/sharePlan";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function SharePlanButton({
  plan,
  pkg,
  from,
  to,
  depart,
  returnDate,
  guests,
  style,
  variant = "toolbar",
  className,
}: {
  plan: AiTripPlan;
  pkg?: ResortPackage;
  from?: string;
  to?: string;
  depart?: string;
  returnDate?: string;
  guests?: number;
  style?: string;
  variant?: "toolbar" | "card";
  className?: string;
}) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const label =
    variant === "card"
      ? t("aiplan.share.package" as never)
      : t("aiplan.share.copyLink" as never);

  const onClick = async (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const url = await copySharedPlanLink({
        plan,
        pkg,
        from,
        to,
        depart,
        returnDate,
        guests,
        style,
        lang,
      });
      if (!url) {
        toast.error(t("aiplan.share.failed" as never));
        return;
      }
      const copied = await copyTextToClipboard(url);
      if (copied) toast.success(t("aiplan.share.copied" as never));
      else toast.error(t("aiplan.share.failed" as never));
    } catch {
      toast.error(t("aiplan.share.failed" as never));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        variant === "card"
          ? "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 disabled:opacity-60"
          : "inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:opacity-60",
        className,
      )}
    >
      <Link2 className="h-4 w-4" aria-hidden />
      {busy ? t("aiplan.share.working" as never) : label}
    </button>
  );
}
