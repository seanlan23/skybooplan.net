import { Sparkles, Pencil, ArrowRight, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { AttractionPicker } from "@/components/AttractionPicker";
import {
  catalogSupportedForIata,
  defaultPicksForCities,
  MIN_CATALOG_PICKS,
  resolvePickerBlueprint,
} from "@/lib/attractionCatalog";
import {
  MIN_PLANNER_INTERESTS,
  PLANNER_INTEREST_KEYS,
  type PlannerInterestKey,
} from "@/lib/plannerInterests";
import { TRIP_WISH_TAGS, type TripBudgetTier, type TripWishTag } from "@/lib/geminiPro.shared";
import { formatTravellersSummary } from "@/lib/travellersFormat";
import { groundTransportLabel } from "@/lib/groundTransport";

export type AiPlannerContext = {
  from: string;
  to: string;
  departDate: string;
  returnDate?: string;
  /** Open-jaw / multi-city: airport for the return flight (e.g. LAX on Route 66). */
  returnFromIata?: string;
  pax: number;
  adults: number;
  childrenAges: number[];
  flights?: TripFlightContext;
  /** Ground transport planner — city/place labels */
  originPlace?: string;
  destinationPlace?: string;
  groundTransportMode?: import("@/lib/aiPlan.functions").GroundTransportMode;
};

export type AiPlannerSubmit = {
  pace: "intensive" | "relaxed" | "calm";
  wishes: string;
  tags: string[];
  customPrompt: string;
  budget: TripBudgetTier;
  wishTags: (typeof TRIP_WISH_TAGS)[number][];
  /** Catalog pick mode — attraction IDs chosen by user. */
  pickedAttractionIds?: string[];
  plannerStyle?: "ai" | "catalog";
};

const BUDGET_KEYS: TripBudgetTier[] = ["budget", "standard", "premium"];

const WISH_TAG_I18N: Record<TripWishTag, "ai.wish.vegetarian" | "ai.wish.accessible" | "ai.wish.carRental" | "ai.wish.noNightDrives"> = {
  "Vegetarijansko/Vegansko": "ai.wish.vegetarian",
  "Dostopno z vozičkom": "ai.wish.accessible",
  "Najem avtomobila": "ai.wish.carRental",
  "Brez nočnih voženj": "ai.wish.noNightDrives",
};

function tripDays(departDate: string, returnDate?: string): number {
  if (!returnDate) return 7;
  const start = new Date(`${departDate}T12:00:00`);
  const end = new Date(`${returnDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 7;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function AiPlannerPreview({
  context,
  onGenerate,
  loading,
  initialWishes,
}: {
  context?: AiPlannerContext | null;
  onGenerate?: (v: AiPlannerSubmit) => void;
  loading?: boolean;
  /** Pre-fill from hero conversational input */
  initialWishes?: string;
} = {}) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [pace, setPace] = useState<"intensive" | "relaxed" | "calm">("relaxed");
  const [wishes, setWishes] = useState(initialWishes?.trim() ?? "");
  const [customPrompt] = useState("");
  const [budget, setBudget] = useState<TripBudgetTier>("standard");
  const [wishTags, setWishTags] = useState<(typeof TRIP_WISH_TAGS)[number][]>([]);
  const [selectedInterests, setSelectedInterests] = useState<PlannerInterestKey[]>([]);
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const catalogAvailable = context ? catalogSupportedForIata(context.to) : false;

  const routeCities = useMemo(() => {
    if (!context || !catalogAvailable) return [];
    const nDays = tripDays(context.departDate, context.returnDate);
    const blueprint = resolvePickerBlueprint({
      nDays,
      destinationIata: context.to,
      priorities: selectedInterests,
      wishes: wishes.trim() || undefined,
      returnFromIata: context.returnFromIata,
    });
    return blueprint?.map((b) => b.city) ?? [];
  }, [
    context,
    catalogAvailable,
    selectedInterests,
    wishes,
  ]);

  useEffect(() => {
    if (initialWishes?.trim()) setWishes(initialWishes.trim());
  }, [initialWishes]);

  useEffect(() => {
    if (mode !== "manual" || !routeCities.length) return;
    setPickedIds(defaultPicksForCities(routeCities));
  }, [mode, routeCities.join("|")]);

  const paces = [
    { key: "intensive" as const, label: t("ai.paceIntensive") },
    { key: "relaxed" as const, label: t("ai.paceRelaxed") },
    { key: "calm" as const, label: t("ai.paceCalm") },
  ];

  const budgetOptions = useMemo(
    () =>
      BUDGET_KEYS.map((key) => ({
        key,
        label: t(`ai.budget.${key}` as never),
        hint: t(`ai.budget.${key}Hint` as never),
      })),
    [lang, t],
  );

  const hasContext = !!context;
  const interestsOk = selectedInterests.length >= MIN_PLANNER_INTERESTS;
  const picksOk = pickedIds.length >= MIN_CATALOG_PICKS;
  const isCatalogMode = mode === "manual" && catalogAvailable;

  const canSubmit =
    hasContext &&
    !loading &&
    (isCatalogMode ? picksOk && interestsOk : interestsOk);

  function toggleInterest(key: PlannerInterestKey) {
    setSelectedInterests((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  }

  function toggleWishTag(tag: (typeof TRIP_WISH_TAGS)[number]) {
    setWishTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function submit() {
    if (!canSubmit || !onGenerate) return;
    onGenerate({
      pace,
      wishes: wishes.trim(),
      tags: selectedInterests,
      customPrompt: customPrompt.trim(),
      budget,
      wishTags,
      pickedAttractionIds: isCatalogMode ? pickedIds : undefined,
      plannerStyle: isCatalogMode ? "catalog" : "ai",
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-20" id="ai-planner">
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 items-start">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" /> {t("ai.badge")}
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground">
            {t("ai.titleA")}
            <br />
            {t("ai.titleB")}
          </h2>
          <p className="text-lg text-muted-foreground max-w-md">{t("ai.subtitle")}</p>
        </div>

        <div className="rounded-3xl bg-card border border-border shadow-[var(--shadow-card)] overflow-hidden">
          <div className="grid grid-cols-2 p-2 gap-2 bg-muted/40">
            <ModeBtn active={mode === "ai"} onClick={() => setMode("ai")} variant="primary">
              <Sparkles className="h-4 w-4" /> {t("ai.modeAi")}
            </ModeBtn>
            <ModeBtn active={mode === "manual"} onClick={() => setMode("manual")}>
              <Pencil className="h-4 w-4" /> {t("ai.modeManual")}
            </ModeBtn>
          </div>

          <div className="p-6 space-y-6">
            {hasContext ? (
              <div className="rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand sm:mt-0" />
                    <div className="min-w-0 leading-snug">
                      <p className="font-semibold text-foreground">
                        {context!.originPlace && context!.destinationPlace
                          ? `${context!.originPlace} → ${context!.destinationPlace}`
                          : `${context!.from} → ${context!.to}`}
                        {context!.returnFromIata && context!.returnFromIata !== context!.from
                          ? ` · ${context!.returnFromIata} → ${context!.from}`
                          : context!.returnDate
                            ? ` · ${context!.to} → ${context!.from}`
                            : ""}
                      </p>
                      {context!.groundTransportMode && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {groundTransportLabel(context!.groundTransportMode, lang)}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="shrink-0 pl-6 text-xs leading-snug text-muted-foreground sm:pl-0 sm:text-right sm:text-sm">
                    {context!.departDate}
                    {context!.returnDate ? ` → ${context!.returnDate}` : ""}
                    <span className="mx-1.5 text-border">·</span>
                    {formatTravellersSummary(
                      lang,
                      context!.adults ?? context!.pax,
                      (context!.childrenAges ?? []).length,
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                {t("ai.contextHint")}
              </div>
            )}

            <div>
              <label className="text-sm font-semibold text-foreground">
                {t("ai.pace")} <span className="text-destructive">*</span>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {paces.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPace(p.key)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium border transition-all",
                      pace === p.key
                        ? "bg-brand text-brand-foreground border-brand shadow-sm"
                        : "bg-card text-foreground/80 border-border hover:border-brand/50",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground">
                {t("ai.interests")} <span className="text-destructive">*</span>
              </label>
              <p className="mt-1 text-xs text-muted-foreground">{t("ai.interestsSubtitle")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {PLANNER_INTEREST_KEYS.map((key) => {
                  const active = selectedInterests.includes(key);
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => toggleInterest(key)}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-sm font-medium border transition-all",
                        active
                          ? "bg-brand text-brand-foreground border-brand shadow-sm"
                          : "bg-card text-foreground/80 border-border hover:border-brand/50",
                      )}
                    >
                      {t(`ai.interest.${key}` as never)}
                    </button>
                  );
                })}
              </div>
              <p
                className={cn(
                  "mt-2 text-xs",
                  !interestsOk ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {t("ai.interestsHint").replace("{min}", String(MIN_PLANNER_INTERESTS))} (
                {selectedInterests.length}/{MIN_PLANNER_INTERESTS}).
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground">{t("ai.budget")}</label>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {budgetOptions.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setBudget(b.key)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left transition-colors",
                      budget === b.key
                        ? "bg-brand text-brand-foreground border-brand shadow-sm"
                        : "bg-card text-foreground border-border hover:border-brand/40",
                    )}
                  >
                    <div className="text-sm font-semibold">{b.label}</div>
                    <div
                      className={cn(
                        "text-xs mt-0.5",
                        budget === b.key ? "text-brand-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {b.hint}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-foreground">{t("ai.specialWishes")}</label>
              <div className="mt-3 flex flex-wrap gap-2">
                {TRIP_WISH_TAGS.map((tag) => {
                  const active = wishTags.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => toggleWishTag(tag)}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-sm font-medium border transition-all",
                        active
                          ? "bg-brand text-brand-foreground border-brand shadow-sm"
                          : "bg-card text-foreground/80 border-border hover:border-brand/50",
                      )}
                    >
                      {t(WISH_TAG_I18N[tag])}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "manual" ? (
              catalogAvailable ? (
                <AttractionPicker
                  cities={routeCities}
                  selectedIds={pickedIds}
                  onChange={setPickedIds}
                  lang={lang}
                  pax={context?.pax ?? 1}
                  labels={{
                    title: t("ai.catalogTitle"),
                    subtitle: t("ai.catalogSubtitle"),
                    hint: t("ai.catalogPickHint"),
                    budgetLabel: t("ai.catalogBudget"),
                    budgetNote: t("ai.catalogBudgetNote"),
                    perPerson: t("ai.catalogPerPerson"),
                    group: t("ai.catalogGroup"),
                    emptyRoute: t("ai.catalogEmptyRoute"),
                  }}
                />
              ) : (
                <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                  {t("ai.catalogComingSoon")}
                </p>
              )
            ) : null}

            <div>
              <label className="text-sm font-semibold text-foreground">
                {t("ai.wishes")}{" "}
                <span className="text-xs font-normal text-muted-foreground">(neobvezno)</span>
              </label>
              <textarea
                value={wishes}
                onChange={(e) => setWishes(e.target.value)}
                placeholder={t("ai.wishesPlaceholder")}
                rows={2}
                className="mt-3 w-full resize-none rounded-2xl border border-border bg-background/60 p-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-brand transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-primary-foreground shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: "var(--gradient-warm)" }}
            >
              {loading ? t("cta.generating") : isCatalogMode ? t("ai.catalogGenerate") : t("ai.generate")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeBtn({
  children,
  active,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  variant?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-semibold transition-all",
        active &&
          variant === "primary" &&
          "text-primary-foreground shadow-sm [background:var(--gradient-warm)]",
        active && variant === "default" && "bg-card text-foreground shadow-sm",
        !active && "text-foreground/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
