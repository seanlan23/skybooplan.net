import { ChevronDown, Clock, Euro } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  catalogAttractionDescription,
  catalogAttractionLabel,
  estimateCatalogBudget,
  formatDuration,
  formatPriceRange,
  getCatalogForCities,
  MIN_CATALOG_PICKS,
  type CatalogAttraction,
} from "@/lib/attractionCatalog";

type Props = {
  cities: string[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  lang: string;
  pax: number;
  labels: {
    title: string;
    subtitle: string;
    hint: string;
    budgetLabel: string;
    budgetNote: string;
    perPerson: string;
    group: string;
    emptyRoute: string;
  };
};

export function AttractionPicker({
  cities,
  selectedIds,
  onChange,
  lang,
  pax,
  labels,
}: Props) {
  const grouped = useMemo(() => {
    const items = getCatalogForCities(cities);
    const map = new Map<string, CatalogAttraction[]>();
    for (const city of cities) {
      const list = items.filter((a) => a.city.toLowerCase() === city.toLowerCase());
      if (list.length) map.set(city, list);
    }
    return map;
  }, [cities]);

  const budget = useMemo(
    () => estimateCatalogBudget(selectedIds, pax),
    [selectedIds, pax],
  );

  const [openCities, setOpenCities] = useState<Set<string>>(() => new Set(cities.slice(0, 2)));

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  if (grouped.size === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        {labels.emptyRoute}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{labels.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div className="space-y-3 max-h-[min(52vh,520px)] overflow-y-auto pr-1">
        {[...grouped.entries()].map(([city, attractions]) => {
          const open = openCities.has(city);
          const pickedHere = attractions.filter((a) => selectedIds.includes(a.id)).length;
          return (
            <div
              key={city}
              className="rounded-2xl border border-border bg-background/60 overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenCities((prev) => {
                    const next = new Set(prev);
                    if (next.has(city)) next.delete(city);
                    else next.add(city);
                    return next;
                  })
                }
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <span className="font-semibold text-sm text-foreground">
                  {city}
                  {pickedHere > 0 && (
                    <span className="ml-2 text-xs font-medium text-brand">
                      ({pickedHere})
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
                />
              </button>

              {open && (
                <div className="border-t border-border divide-y divide-border">
                  {attractions.map((a) => {
                    const checked = selectedIds.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        className={cn(
                          "flex gap-3 px-4 py-3 cursor-pointer transition-colors",
                          checked ? "bg-brand-soft/60" : "hover:bg-muted/30",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(a.id)}
                          className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium text-sm text-foreground">
                              {catalogAttractionLabel(a, lang)}
                            </span>
                            {a.recommended && (
                              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                                ★
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                            {catalogAttractionDescription(a, lang)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(a.durationMin, lang)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Euro className="h-3 w-3" />
                              {formatPriceRange(a.priceEurMin, a.priceEurMax, lang)}
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p
        className={cn(
          "text-xs",
          selectedIds.length < MIN_CATALOG_PICKS ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {labels.hint} ({selectedIds.length}/{MIN_CATALOG_PICKS}).
      </p>

      {selectedIds.length > 0 && (
        <div className="rounded-2xl border border-brand/25 bg-brand-soft/40 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">{labels.budgetLabel}</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            €{budget.groupMin}
            {budget.groupMax > budget.groupMin ? `–${budget.groupMax}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {labels.perPerson}: €{budget.perPersonMin}
            {budget.perPersonMax > budget.perPersonMin ? `–${budget.perPersonMax}` : ""} ·{" "}
            {labels.group.replace("{n}", String(Math.max(1, pax)))}: €{budget.groupMin}
            {budget.groupMax > budget.groupMin ? `–${budget.groupMax}` : ""}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">{labels.budgetNote}</p>
        </div>
      )}
    </div>
  );
}
