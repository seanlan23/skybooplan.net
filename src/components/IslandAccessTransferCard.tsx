import { ArrowDown, Bus, Plane, Ship, TrainFront } from "lucide-react";
import type { DayTransportLeg } from "@/lib/aiPlan.functions";
import { useI18n } from "@/lib/i18n";

const STEP_META: Record<
  DayTransportLeg["type"],
  { label: string; icon: typeof Plane; accent: string; badge: string }
> = {
  flight: {
    label: "Let",
    icon: Plane,
    accent: "border-indigo-200 bg-gradient-to-br from-indigo-50 to-white",
    badge: "bg-indigo-600",
  },
  van: {
    label: "Kombi",
    icon: Bus,
    accent: "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
    badge: "bg-amber-600",
  },
  ferry: {
    label: "Trajekt",
    icon: Ship,
    accent: "border-cyan-200 bg-gradient-to-br from-cyan-50 to-white",
    badge: "bg-cyan-700",
  },
  train: {
    label: "Vlak",
    icon: TrainFront,
    accent: "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
    badge: "bg-slate-700",
  },
};

function StepCard({
  step,
  leg,
  showConnector,
}: {
  step: number;
  leg: DayTransportLeg;
  showConnector: boolean;
}) {
  const { formatMoney } = useI18n();
  const meta = STEP_META[leg.type];
  const Icon = meta.icon;

  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white shadow-sm">
          {step}
        </div>
        {showConnector && (
          <div className="mt-1 flex flex-1 flex-col items-center py-1 text-slate-300" aria-hidden="true">
            <ArrowDown className="h-4 w-4" />
            <div className="w-px flex-1 min-h-[12px] bg-slate-200" />
          </div>
        )}
      </div>
      <div
        className={`mb-3 flex-1 rounded-xl border overflow-hidden shadow-sm ${meta.accent}`}
      >
        <div className="flex items-stretch min-h-[80px]">
          <div className={`flex w-12 shrink-0 items-center justify-center ${meta.badge} text-white`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex flex-1 flex-col justify-center px-3 py-2.5 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {meta.label}
            </div>
            <div className="mt-0.5 text-sm font-bold text-slate-900 leading-snug">
              <span>{leg.from}</span>
              <span className="mx-1.5 text-slate-400">→</span>
              <span>{leg.to}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold">{leg.duration}</span>
              <span className="text-slate-300">·</span>
              <span className="font-bold text-slate-900">cca. {formatMoney(Math.round(leg.estimatedPrice))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IslandAccessTransferCard({ legs }: { legs: DayTransportLeg[] }) {
  if (legs.length < 2) return null;

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
      <div className="mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-sky-700">
          Let + transfer do otoka
        </p>
        <p className="mt-0.5 text-sm text-slate-600">
          Pot v 3 korakih — otok ni neposredno na letališču.
        </p>
      </div>
      <div>
        {legs.map((leg, i) => (
          <StepCard
            key={`${leg.type}-${leg.from}-${i}`}
            step={i + 1}
            leg={leg}
            showConnector={i < legs.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
