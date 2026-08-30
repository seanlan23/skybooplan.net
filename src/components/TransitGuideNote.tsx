import type { TransitGuide } from "@/lib/flightTransitGuide";
import { cn } from "@/lib/utils";

function GuideBody({ guide }: { guide: TransitGuide }) {
  return (
    <div className="space-y-2 text-[12px] leading-relaxed text-slate-700">
      <p>
        <span className="font-semibold text-slate-800">{guide.baggageLabel}: </span>
        {guide.baggage}
      </p>
      <p>
        <span className="font-semibold text-slate-800">{guide.protocolLabel}: </span>
        {guide.protocol}
      </p>
      {guide.connections.some((c) => c.timing) ? (
        <div className="space-y-1.5">
          {guide.connections.map((c, i) =>
            c.timing ? (
              <p key={`${c.leg}-${c.airport}-${i}`}>
                {c.airport || c.waitLabel ? (
                  <span className="font-semibold text-slate-800">
                    {[c.airport, c.waitLabel].filter(Boolean).join(" · ")}
                    {": "}
                  </span>
                ) : null}
                {c.timing}
              </p>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}

export function TransitGuideNote({
  guide,
  collapsible = false,
  className,
}: {
  guide: TransitGuide;
  collapsible?: boolean;
  className?: string;
}) {
  if (collapsible) {
    return (
      <details
        className={cn(
          "border-t border-sky-100 bg-sky-50/70 px-3 py-2 text-left",
          className,
        )}
      >
        <summary className="cursor-pointer list-outside text-[11px] font-semibold text-sky-800 marker:text-sky-600">
          {guide.title}
        </summary>
        <div className="mt-2">
          <GuideBody guide={guide} />
        </div>
      </details>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2.5",
        className,
      )}
    >
      <p className="text-xs font-semibold text-sky-900">{guide.title}</p>
      <div className="mt-1.5">
        <GuideBody guide={guide} />
      </div>
    </div>
  );
}
