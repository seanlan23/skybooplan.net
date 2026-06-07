import { Bus, CreditCard, Plane, Ship, Wifi } from "lucide-react";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";

type Logistics = TripPlanResponse["logistics_and_tips"];

function TipCard({
  icon: Icon,
  title,
  body,
  accent,
}: {
  icon: typeof Plane;
  title: string;
  body: string;
  accent: string;
}) {
  if (!body.trim()) return null;
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${accent}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 shadow-sm">
          <Icon className="h-4 w-4 text-slate-700" />
        </span>
        <h4 className="font-bold text-slate-900">{title}</h4>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{body.trim()}</p>
    </div>
  );
}

export function GeminiLogisticsCards({
  logistics,
  currency,
  visaRequired,
}: {
  logistics: Logistics | undefined;
  currency?: string;
  visaRequired?: boolean;
}) {
  if (!logistics) return null;

  const transport = logistics.transport;
  const hasTransport =
    transport?.flights?.trim() ||
    transport?.ferries?.trim() ||
    transport?.city_transport?.trim();
  const hasFinance = logistics.finance?.trim() || logistics.internet?.trim() || currency;

  if (!hasTransport && !hasFinance && visaRequired == null) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 sm:p-6 shadow-sm space-y-4">
      <h3 className="text-lg font-bold text-slate-900">Praktični nasveti in logistika</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TipCard
          icon={Plane}
          title="Leti"
          body={transport?.flights ?? ""}
          accent="border-sky-200 bg-sky-50/40"
        />
        <TipCard
          icon={Ship}
          title="Trajekti in čolni"
          body={transport?.ferries ?? ""}
          accent="border-cyan-200 bg-cyan-50/40"
        />
        <TipCard
          icon={Bus}
          title="Prevoz po mestu"
          body={transport?.city_transport ?? ""}
          accent="border-indigo-200 bg-indigo-50/40"
        />
        <TipCard
          icon={CreditCard}
          title="Finance in plačila"
          body={
            [
              logistics.finance?.trim(),
              currency ? `Lokalna valuta: ${currency}.` : "",
              visaRequired != null
                ? `Viza: ${visaRequired ? "potrebna" : "ni potrebna"}.`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n")
          }
          accent="border-emerald-200 bg-emerald-50/40"
        />
        <TipCard
          icon={Wifi}
          title="Internet in povezljivost"
          body={logistics.internet ?? ""}
          accent="border-violet-200 bg-violet-50/40"
        />
      </div>
    </div>
  );
}
