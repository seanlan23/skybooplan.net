import { buildGoldenRules } from "@/lib/travelGoldenRules";
import { cn } from "@/lib/utils";

export function GoldenRulesNote({
  lang,
  className,
}: {
  lang?: string;
  className?: string;
}) {
  const rules = buildGoldenRules(lang);

  return (
    <details
      className={cn(
        "rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <summary className="cursor-pointer list-outside text-sm font-semibold text-amber-950 marker:text-amber-700">
        {rules.title}
      </summary>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-slate-700">
        {rules.groups.map((group) => (
          <div key={group.heading}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
              {group.heading}
            </p>
            <ul className="mt-1.5 space-y-2">
              {group.items.map((item) => (
                <li key={item.title}>
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-0.5">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
