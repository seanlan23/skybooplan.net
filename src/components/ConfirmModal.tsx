import { useState } from "react";
import { Plane, Clock, ArrowRight, MapPin, CalendarDays, X, Sparkles, AlertTriangle, ChevronLeft } from "lucide-react";
import type { DuffelFlight } from "@/lib/flights.functions";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { formatLocalDate } from "@/lib/dateUtils";

export function ConfirmModal({
  flight,
  open,
  onConfirm,
  onCancel,
  searchDepartDate,
  searchReturnDate,
}: {
  flight: DuffelFlight | null;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  searchDepartDate?: string;
  searchReturnDate?: string;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const t = useT();

  if (!open || !flight) return null;

  // Trust the user's calendar selection and the outbound route as the source
  // of truth. Duffel occasionally returns inbound legs with swapped or
  // duplicated origin/destination codes; for a round trip the return leg is
  // logically guaranteed to be outbound.to → outbound.from.
  const outboundDate = searchDepartDate || flight.outbound.date;
  const inboundDate = searchReturnDate || flight.inbound?.date;
  const inboundFrom = flight.inbound ? flight.outbound.to : undefined;
  const inboundTo = flight.inbound ? flight.outbound.from : undefined;



  const handleClose = () => {
    setStep(1);
    onCancel();
  };

  const stopsText =
    flight.stops === 0
      ? t("confirm.direct" as any)
      : `${flight.stops} ${flight.stops === 1 ? t("confirm.stop" as any) : t("confirm.stops" as any)}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={handleClose}
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal card */}
      <div
        className="relative z-10 w-full max-w-lg rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={t("confirm.close" as any)}
        >
          <X className="h-5 w-5" />
        </button>

        {step === 1 && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-brand/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-brand" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">{t("confirm.title" as any)}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("confirm.subtitle" as any)}
                </p>
              </div>
            </div>

            {/* Flight summary */}
            <div className="rounded-2xl border border-border bg-muted/40 p-4 sm:p-5 space-y-4">
              {/* Airline & route */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-background border border-border flex items-center justify-center font-bold text-xs text-foreground shrink-0">
                  {flight.airlineCode}
                </div>
                <div>
                  <div className="font-semibold text-foreground">{flight.airline}</div>
                  <div className="text-xs text-muted-foreground">{stopsText} · {flight.duration}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-xl font-bold text-foreground">€{flight.price}</div>
                  <div className="text-xs text-muted-foreground">{t("confirm.perPerson" as any)}</div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Outbound */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Plane className="h-3.5 w-3.5" />
                  {t("confirm.outbound" as any)}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-foreground font-semibold text-base">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {flight.outbound.from}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      {flight.outbound.to}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {flight.outbound.depart} – {flight.outbound.arrive}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatLocalDate(outboundDate)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Inbound */}
              {flight.inbound && (
                <div className="space-y-2">
                  <div className="h-px bg-border" />
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <Plane className="h-3.5 w-3.5 rotate-180" />
                    {t("confirm.return" as any)}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-foreground font-semibold text-base">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {inboundFrom}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        {inboundTo}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {flight.inbound.depart} – {flight.inbound.arrive}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatLocalDate(inboundDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions step 1 */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleClose}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-sm border border-border bg-background text-foreground hover:bg-muted transition-all"
              >
                <X className="h-4 w-4" /> {t("confirm.cancel" as any)}
              </button>
              <button
                onClick={() => setStep(2)}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-sm text-brand-foreground shadow-lg hover:scale-[1.02] active:scale-[0.99] transition-all flex-1"
                )}
                style={{ background: "var(--gradient-brand)" }}
              >
                <Sparkles className="h-4 w-4" /> {t("confirm.next" as any)}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">{t("confirm.finalTitle" as any)}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("confirm.finalSubtitle" as any)}
                </p>
              </div>
            </div>

            {/* Warning card */}
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">
                    {t("confirm.warning" as any)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("confirm.warningSub" as any)}
                  </p>
                </div>
              </div>

              <div className="h-px bg-amber-500/15" />

              {/* Compact flight reminder */}
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-background border border-border flex items-center justify-center font-bold text-xs text-foreground shrink-0">
                  {flight.airlineCode}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground text-sm truncate">
                    {flight.outbound.from} → {flight.outbound.to}
                    {flight.inbound && ` → ${inboundTo}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {flight.airline} · €{flight.price}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions step 2 */}
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={onConfirm}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 font-bold text-sm text-brand-foreground shadow-lg hover:scale-[1.02] active:scale-[0.99] transition-all"
                )}
                style={{ background: "var(--gradient-brand)" }}
              >
                <Sparkles className="h-4 w-4" /> {t("confirm.cta" as any)}
              </button>
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-sm border border-border bg-background text-foreground hover:bg-muted transition-all"
              >
                <ChevronLeft className="h-4 w-4" /> {t("confirm.back" as any)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
