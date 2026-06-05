import { Sparkles, Pencil, ArrowRight, MapPin } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type AiPlannerContext = {
  from: string;
  to: string;
  departDate: string;
  returnDate?: string;
  pax: number;
};

export type AiPlannerSubmit = {
  pace: "intensive" | "relaxed" | "calm";
  wishes: string;
  tags: string[];
  customPrompt: string;
};

export function AiPlannerPreview({
  context,
  onGenerate,
  loading,
}: {
  context?: AiPlannerContext | null;
  onGenerate?: (v: AiPlannerSubmit) => void;
  loading?: boolean;
} = {}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [pace, setPace] = useState<"intensive" | "relaxed" | "calm">("relaxed");
  const [wishes, setWishes] = useState("");
  const [customPrompt] = useState("");

  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const paces = [
    { key: "intensive" as const, label: t("ai.paceIntensive") },
    { key: "relaxed" as const, label: t("ai.paceRelaxed") },
    { key: "calm" as const, label: t("ai.paceCalm") },
  ];
  const tags = [t("ai.tagFamily"), t("ai.tagHidden"), t("ai.tagFoodie"), t("ai.tagAdventure"), t("ai.tagSlow")];

  const hasContext = !!context;
  const canSubmit = hasContext && wishes.length >= 6 && !loading;

  function toggleTag(tg: string) {
    setSelectedTags((prev) => (prev.includes(tg) ? prev.filter((x) => x !== tg) : [...prev, tg]));
  }

  function submit() {
    if (!canSubmit || !onGenerate) return;
    onGenerate({ pace, wishes: wishes.trim(), tags: selectedTags, customPrompt: customPrompt.trim() });
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-20" id="ai-planner">
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 items-start">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" /> {t("ai.badge")}
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground">
            {t("ai.titleA")}<br />{t("ai.titleB")}
          </h2>
          <p className="text-lg text-muted-foreground max-w-md">
            {t("ai.subtitle")}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {tags.map((tg) => {
              const active = selectedTags.includes(tg);
              return (
                <button
                  type="button"
                  key={tg}
                  onClick={() => toggleTag(tg)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm border transition-colors",
                    active
                      ? "bg-brand text-brand-foreground border-brand"
                      : "bg-muted text-foreground/80 border-border hover:border-brand/50",
                  )}
                >
                  {tg}
                </button>
              );
            })}
          </div>
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
              <div className="flex items-center gap-2 rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-foreground">
                <MapPin className="h-4 w-4 text-brand shrink-0" />
                <span className="font-medium">
                  {context!.from} → {context!.to}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {context!.departDate}
                  {context!.returnDate ? ` → ${context!.returnDate}` : ""} · {context!.pax} pax
                </span>
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
                {t("ai.wishes")} <span className="text-destructive">*</span>
              </label>
              <textarea
                value={wishes}
                onChange={(e) => setWishes(e.target.value)}
                placeholder={t("ai.wishesPlaceholder")}
                rows={4}
                className="mt-3 w-full resize-none rounded-2xl border border-border bg-background/60 p-4 text-[15px] placeholder:text-muted-foreground/60 focus:outline-none focus:border-brand transition-colors"
              />
              <p className={cn("mt-2 text-xs", wishes.length < 6 ? "text-destructive" : "text-muted-foreground")}>
                {t("ai.charsHint")} ({wishes.length}/6).
              </p>
            </div>


            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-primary-foreground shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: "var(--gradient-warm)" }}
            >
              {loading ? t("cta.generating") : t("ai.generate")}
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
        active && variant === "primary" && "text-primary-foreground shadow-sm [background:var(--gradient-warm)]",
        active && variant === "default" && "bg-card text-foreground shadow-sm",
        !active && "text-foreground/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
