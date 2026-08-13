import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { ArrowUp, Loader2, Trash2, X } from "lucide-react";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import {
  createHeroAttachmentPreviewUrl,
  fileToHeroAttachmentPayload,
  validateHeroAttachmentFile,
  type HeroChatAttachmentPayload,
  type HeroChatSelectedFile,
} from "@/lib/heroChatAttachment";
import { HeroDateRangeCalendar } from "@/components/HeroDateRangeCalendar";
import { HeroDestinationAutocomplete } from "@/components/HeroDestinationAutocomplete";
import {
  buildHeroMakeSearchQuery,
  buildHeroStaysSearchQuery,
  createChatMessage,
  getDestinationChipDisplay,
  HERO_DESTINATION_CHIPS,
  HERO_MOTORHOME_END_CHIPS,
  HERO_MOTORHOME_START_CHIPS,
  localizeHeroCollectedForUi,
  normalizeHeroTripType,
  type HeroChatCollected,
  type HeroChatMessage,
  type HeroChatMode,
  type HeroChatStep,
  type HeroTripType,
} from "@/lib/heroChatFlow";
import { resolveDestinationIata } from "@/lib/heroChatPlanner";
import { MotorhomeSearchBrowser } from "@/components/MotorhomeSearchBrowser";
import { buildHeroMotorhomeSearchQuery } from "@/lib/heroMotorhome";
import { buildHeroCarSearchQuery } from "@/lib/heroCar";
import { extractHeroChatDates } from "@/lib/heroChatDates";
import {
  extractHeroChatPassengers,
  resolveHeroChatBootstrap,
} from "@/lib/heroChatExtract";
import type { HeroStaySearchParams } from "@/lib/heroStaySearch";
import { FlightCard } from "@/components/FlightCard";
import { HotelsSection } from "@/components/HotelsSection";
import { HeroPassengerBrowser } from "@/components/HeroPassengerBrowser";
import { HeroReturnFromPicker } from "@/components/HeroReturnFromPicker";
import { HeroTripChecklist } from "@/components/HeroTripChecklist";
import { OriginAirportPicker } from "@/components/OriginAirportPicker";
import { formatOriginSelection } from "@/lib/airportCatalog";
import { rememberRecentOrigins } from "@/lib/recentOrigins";
import {
  parseMakeSearchDestination,
  parseMakeSearchOriginAirports,
  type MakeSearchFlight,
} from "@/lib/makeSearch";
import { cn } from "@/lib/utils";

const DATE_CHIP_IDS = ["endOctober", "startNovember", "octNov", "flexible"] as const;
const TRIP_TYPE_IDS = ["return", "oneway", "openjaw"] as const;
const NIGHT_CHIP_IDS = ["3-5", "7", "10-14", "2weeks"] as const;
const PACE_CHIP_IDS = ["intensive", "relaxed", "calm"] as const;
const BUDGET_CHIP_IDS = ["under500", "500-1000", "1000-2000", "2000plus"] as const;

/**
 * Origins from the departure field only — never parse destination text as an origin
 * (that caused LJU→LJU when destination was also Ljubljana).
 */
function originsFromCollected(
  destination: string | undefined,
  origin: string | undefined,
): string[] {
  const destCode = parseMakeSearchDestination(destination ?? "")?.toUpperCase() ?? null;
  const codes = parseMakeSearchOriginAirports(origin?.trim() ?? "");
  return codes.filter((code) => !destCode || code !== destCode);
}

/** Prefer "Paris (CDG)" over bare city so search/UI always have an airport. */
function withDestinationAirport(destination: string): string {
  const trimmed = destination.trim();
  if (!trimmed) return trimmed;
  if (/\([A-Za-z]{3}\)/.test(trimmed)) return trimmed;
  const iata = resolveDestinationIata(trimmed);
  if (!iata || !/^[A-Z]{3}$/.test(iata)) return trimmed;
  // Avoid "CDG (CDG)" if user already typed the code.
  if (trimmed.toUpperCase() === iata) return iata;
  return `${trimmed} (${iata})`;
}

const HERO_FEATURE_BADGE_IDS = ["itinerary", "flights", "pdf", "onePlan"] as const;

type ChipOption = {
  id: string;
  label: string;
};

type HeroChatFlowProps = {
  mode: HeroChatMode;
  onSearch: (query: string, collected: HeroChatCollected, mode: HeroChatMode) => void;
  loading?: boolean;
  flights?: MakeSearchFlight[];
  searchError?: string | null;
  seedDestination?: string | null;
  onSeedConsumed?: () => void;
  selectedFlightId?: string | null;
  onSelectFlightForAiPlan?: (flight: MakeSearchFlight) => void;
  flightSearchMeta?: {
    from?: string;
    to?: string;
    departDate?: string;
    returnDate?: string;
  } | null;
  flightAdults?: number;
  /** When set, show Booking hotel results (Stays mode). */
  staySearch?: HeroStaySearchParams | null;
  /** Clear parent hero search results (flights, stays, selection). */
  onClearSearch?: () => void;
};

function SkyAvatar() {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm shadow-md ring-1 ring-black/5"
      aria-hidden
    >
      ✈️
    </div>
  );
}

function SkyMessage({
  message,
  showHeader,
  agentName,
}: {
  message: HeroChatMessage;
  showHeader: boolean;
  agentName: string;
}) {
  return (
    <div className="hero-sky-enter flex max-w-[88%] flex-col items-start gap-1.5">
      {showHeader ? (
        <div className="flex items-center gap-2">
          <SkyAvatar />
          <span className="text-xs font-semibold tracking-wide text-white/90">{agentName}</span>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        {!showHeader ? <SkyAvatar /> : null}
        <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm leading-relaxed text-gray-800 shadow-md sm:text-[15px] whitespace-pre-line">
          {message.text}
        </div>
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: HeroChatMessage }) {
  return (
    <div className="ml-auto flex max-w-[88%] justify-end">
      <div className="rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-md sm:text-[15px]">
        {message.text}
      </div>
    </div>
  );
}

function FilePreview({
  preview,
  onRemove,
  removeLabel,
}: {
  preview: HeroChatSelectedFile;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-2 pr-3">
      {preview.kind === "image" && preview.previewUrl ? (
        <img
          src={preview.previewUrl}
          alt=""
          className="h-[60px] w-[60px] shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-lg bg-white/10 text-2xl">
          📄
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{preview.file.name}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function QuickReplyChips({
  options,
  onSelect,
  disabled,
  layout = "wrap",
  footer,
}: {
  options: ChipOption[];
  onSelect: (id: string, label: string) => void;
  disabled?: boolean;
  /** `grid` = 2 columns (better for longer date labels). */
  layout?: "wrap" | "grid";
  footer?: ReactNode;
}) {
  return (
    <div className="hero-chips-enter pl-0 pr-1 sm:pl-10">
      <div
        className={cn(
          "gap-2 pb-1",
          layout === "grid"
            ? "grid grid-cols-1 min-[380px]:grid-cols-2"
            : "flex flex-wrap",
        )}
      >
        {options.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(id, label)}
            className={cn(
              "inline-flex items-center justify-center rounded-full border border-white/40 bg-white px-3.5 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-white/90 disabled:opacity-50",
              layout === "grid" ? "w-full text-center" : "shrink-0",
            )}
          >
            <span className="whitespace-normal text-balance leading-snug">{label}</span>
          </button>
        ))}
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

function MotorhomeTypeEndField({
  value,
  onChange,
  onSubmit,
  disabled,
  t,
  typeEndLabel,
  typeEndPlaceholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  t: (key: never) => string;
  typeEndLabel: string;
  typeEndPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-white/35 bg-white/10 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/15 disabled:opacity-50"
      >
        {typeEndLabel}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        disabled={disabled}
        placeholder={typeEndPlaceholder}
        className="min-w-0 flex-1 rounded-xl border border-white/30 bg-white/15 px-3 py-2.5 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/50"
      />
      <button
        type="button"
        disabled={disabled || !value.trim()}
        onClick={onSubmit}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white disabled:opacity-40"
        aria-label={t("heroChat.send" as never)}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  );
}

function HeroFeatureBadges({ featureBadges }: { featureBadges: string[] }) {
  return (
    <div className="relative z-0 mt-5 flex flex-wrap items-center justify-center gap-2">
      {featureBadges.map((label) => (
        <span
          key={label}
          className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm text-white/80 backdrop-blur-sm"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function HeroGuidedStart({
  onPickDestination,
  onTypeSubmit,
  textInput,
  onTextChange,
  canSubmit,
  inputDisabled,
  fileProcessing,
  featureBadges,
  staysOnly = false,
  t,
}: {
  onPickDestination: (destination: string, label: string) => void;
  onTypeSubmit: () => void;
  textInput: string;
  onTextChange: (value: string) => void;
  canSubmit: boolean;
  inputDisabled: boolean;
  fileProcessing: boolean;
  featureBadges: string[];
  staysOnly?: boolean;
  t: (key: never) => string;
}) {
  const [showTypeBox, setShowTypeBox] = useState(false);

  return (
    <div className="relative z-20 w-full">
      <div className="rounded-2xl border border-white/25 bg-white/12 p-5 shadow-lg backdrop-blur-md sm:p-6">
        <p className="text-center text-lg font-semibold text-white sm:text-xl">
          {t((staysOnly ? "heroChat.guided.staysTitle" : "heroChat.guided.whereTitle") as never)}
        </p>
        <p className="mt-1.5 text-center text-sm text-white/70">
          {t((staysOnly ? "heroChat.guided.staysHint" : "heroChat.guided.whereHint") as never)}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {HERO_DESTINATION_CHIPS.map((chip) => {
            const { emoji, name } = getDestinationChipDisplay(chip, t);
            return (
              <button
                key={chip.id}
                type="button"
                disabled={inputDisabled || fileProcessing}
                onClick={() => onPickDestination(chip.destination, `${emoji} ${name}`)}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/25 bg-white/15 px-3 py-4 text-white shadow-sm transition hover:bg-white/25 active:scale-[0.98] disabled:opacity-50"
              >
                <span className="text-2xl" aria-hidden>
                  {emoji}
                </span>
                <span className="text-sm font-semibold sm:text-[15px]">{name}</span>
              </button>
            );
          })}
        </div>

        {!showTypeBox ? (
          <button
            type="button"
            onClick={() => setShowTypeBox(true)}
            className="mt-4 w-full rounded-xl border border-dashed border-white/30 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            {t("heroChat.guided.typeOwn" as never)}
          </button>
        ) : (
          <div className="relative z-30 mt-4 space-y-2">
            <p className="text-sm font-medium text-white/90">
              {t("heroChat.guided.typeTitle" as never)}
            </p>
            <HeroDestinationAutocomplete
              value={textInput}
              onChange={onTextChange}
              onPick={onPickDestination}
              onSubmit={onTypeSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onTypeSubmit();
                }
              }}
              canSubmit={canSubmit}
              disabled={inputDisabled || fileProcessing}
              placeholder={t(
                (staysOnly
                  ? "heroChat.guided.staysPlaceholder"
                  : "heroChat.guided.typePlaceholder") as never,
              )}
              kind={staysOnly ? "place" : "airport"}
            />
          </div>
        )}
      </div>
      {/* Hide badges while typing — they sat on top of the airport dropdown. */}
      {!showTypeBox ? <HeroFeatureBadges featureBadges={featureBadges} /> : null}
    </div>
  );
}

function HeroMotorhomeGuidedStart({
  onPickStart,
  onTypeSubmit,
  textInput,
  onTextChange,
  canSubmit,
  inputDisabled,
  t,
}: {
  onPickStart: (place: string, label: string) => void;
  onTypeSubmit: () => void;
  textInput: string;
  onTextChange: (value: string) => void;
  canSubmit: boolean;
  inputDisabled: boolean;
  t: (key: never) => string;
}) {
  const [showTypeBox, setShowTypeBox] = useState(false);

  return (
    <div className="relative z-20 w-full">
      <div className="rounded-2xl border border-white/25 bg-white/12 p-5 shadow-lg backdrop-blur-md sm:p-6">
        <p className="text-center text-lg font-semibold text-white sm:text-xl">
          {t("heroChat.motorhome.startTitle" as never)}
        </p>
        <p className="mt-1.5 text-center text-sm text-white/70">
          {t("heroChat.motorhome.startHint" as never)}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {HERO_MOTORHOME_START_CHIPS.map((chip) => {
            const name = t(chip.nameKey as never);
            const label = name.startsWith("hero.mhStart.") ? chip.place : name;
            return (
              <button
                key={chip.id}
                type="button"
                disabled={inputDisabled}
                onClick={() => onPickStart(chip.place, `${chip.emoji} ${label}`)}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/25 bg-white/15 px-3 py-4 text-white shadow-sm transition hover:bg-white/25 active:scale-[0.98] disabled:opacity-50"
              >
                <span className="text-2xl" aria-hidden>
                  {chip.emoji}
                </span>
                <span className="text-sm font-semibold sm:text-[15px]">{label}</span>
              </button>
            );
          })}
        </div>

        {!showTypeBox ? (
          <button
            type="button"
            onClick={() => setShowTypeBox(true)}
            className="mt-4 w-full rounded-xl border border-dashed border-white/30 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            {t("heroChat.motorhome.typeStart" as never)}
          </button>
        ) : (
          <div className="relative z-30 mt-4 flex items-center gap-2">
            <input
              value={textInput}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onTypeSubmit();
                }
              }}
              disabled={inputDisabled}
              placeholder="Vienna, Munich…"
              className="min-w-0 flex-1 rounded-xl border border-white/30 bg-white/15 px-3 py-2.5 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/50"
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onTypeSubmit}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white disabled:opacity-40"
              aria-label="OK"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PickExactDatesButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="hero-chips-enter pl-0 pr-1 sm:pl-10">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex w-full items-center justify-center rounded-full border border-white/40 bg-white px-3.5 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-white/90 disabled:opacity-50 min-[380px]:w-auto"
      >
        {label}
      </button>
    </div>
  );
}

function skyMessageWithVars(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, value),
    template,
  );
}

function chatPlaceholder(t: (key: never) => string): string {
  return t("heroChat.searchPlaceholder" as never);
}

export function HeroChatFlow({
  mode,
  onSearch,
  loading = false,
  flights = [],
  searchError = null,
  seedDestination,
  onSeedConsumed,
  selectedFlightId = null,
  onSelectFlightForAiPlan,
  flightSearchMeta = null,
  flightAdults = 1,
  staySearch = null,
  onClearSearch,
}: HeroChatFlowProps) {
  const { t, lang } = useI18n();
  const [planTravel, setPlanTravel] = useState<"flight" | "car" | "motorhome" | null>(null);
  const isFlightsOnly = mode === "flights";
  const isStaysOnly = mode === "stays";
  const effectiveRoadMode: "car" | "motorhome" | null =
    mode === "car" || planTravel === "car"
      ? "car"
      : mode === "motorhome" || planTravel === "motorhome"
        ? "motorhome"
        : null;
  const isMotorhomeOnly = effectiveRoadMode === "motorhome";
  const isCarOnly = effectiveRoadMode === "car";
  const isRoadGroundOnly = effectiveRoadMode != null;
  const isFullPlan = mode === "all";
  /** Skip pace/budget — flights / stays / avtodom / car go straight to results after party size. */
  const isQuickSearchMode = isFlightsOnly || isStaysOnly || isRoadGroundOnly;
  const roadChatNs = isCarOnly ? "heroChat.car" : "heroChat.motorhome";
  const roadT = useCallback(
    (key: string) => t(`${roadChatNs}.${key}` as never),
    [roadChatNs, t],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeControlsRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchSentRef = useRef(false);
  const flightsAnnouncedRef = useRef(false);
  const staysAnnouncedRef = useRef(false);
  /** Ensures location wishes survive into onSearch even if state batching lags. */
  const pendingLocationWishesRef = useRef<string>("");

  const [step, setStep] = useState<HeroChatStep>("destination");
  const [conversationStarted, setConversationStarted] = useState(false);
  const [messages, setMessages] = useState<HeroChatMessage[]>([]);
  const [collected, setCollected] = useState<Partial<HeroChatCollected>>({});
  const [textInput, setTextInput] = useState("");
  const [attachment, setAttachment] = useState<HeroChatAttachmentPayload | null>(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState<HeroChatSelectedFile | null>(null);
  const [fileProcessing, setFileProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** Where to go after the origin picker confirms. */
  const [afterOrigin, setAfterOrigin] = useState<"searching" | "pace">("searching");

  const agentName = t("heroChat.agentName" as never);
  const isSearching = step === "searching";
  const showSearchLoader =
    isSearching &&
    !searchError &&
    (isStaysOnly
      ? !staySearch
      : isRoadGroundOnly
        ? Boolean(loading)
        : flights.length === 0);
  const inputDisabled = isSearching;
  const showTripChecklist = conversationStarted && isFullPlan && !isRoadGroundOnly;

  const firstSkyMessageId = useMemo(
    () => messages.find((m) => m.role === "ai")?.id,
    [messages],
  );

  const scrollActiveStepIntoView = useCallback(() => {
    if (showSearchLoader || staySearch) return;
    window.requestAnimationFrame(() => {
      const target =
        showDatePicker && datePickerRef.current
          ? datePickerRef.current
          : activeControlsRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [showSearchLoader, showDatePicker, staySearch]);

  const scrollToBottom = useCallback(() => {
    // While the search loader is up, freeze auto-scroll so the spinner stays in view.
    if (showSearchLoader || staySearch) return;
    window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
      // Also bring the active chips/calendar into the phone viewport (not only the inner scroller).
      const target =
        showDatePicker && datePickerRef.current
          ? datePickerRef.current
          : activeControlsRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  }, [showSearchLoader, showDatePicker, staySearch]);

  useEffect(() => {
    if (!conversationStarted || isSearching) return;
    const timer = window.setTimeout(() => scrollActiveStepIntoView(), 80);
    return () => window.clearTimeout(timer);
  }, [step, showDatePicker, conversationStarted, isSearching, scrollActiveStepIntoView]);

  const appendMessages = useCallback(
    (...next: HeroChatMessage[]) => {
      setMessages((prev) => [...prev, ...next]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const chipLabel = useCallback(
    (prefix: string, id: string) => t(`${prefix}.${id}` as never),
    [t],
  );

  const startMotorhomeBrowser = useCallback(
    (data: HeroChatCollected) => {
      if (conversationStarted || searchSentRef.current) return;
      setConversationStarted(true);
      setCollected(data);
      setStep("searching");
      appendMessages(
        createChatMessage(
          "user",
          `${data.origin} → ${data.destination} · ${data.dates} · ${data.passengers}`,
        ),
        createChatMessage("ai", roadT("searching")),
      );
      setTextInput("");
    },
    [appendMessages, conversationStarted, roadT],
  );

  const startMotorhomeFromOrigin = useCallback(
    (originPlace: string, displayLabel?: string) => {
      const trimmed = originPlace.trim();
      if (!trimmed || conversationStarted) return;
      const userLabel = displayLabel?.trim() || trimmed;
      setConversationStarted(true);
      setCollected({ origin: trimmed });
      appendMessages(
        createChatMessage("user", userLabel),
        createChatMessage("ai", roadT("askEnd")),
      );
      setStep("destination");
      setTextInput("");
    },
    [appendMessages, conversationStarted, roadT],
  );

  const startFlow = useCallback(
    (destination: string, displayLabel?: string) => {
      const trimmed = destination.trim();
      const fileFallback = t("heroChat.fileOnlyDestination" as never);
      const resolved = trimmed || (attachment ? fileFallback : "");
      if (!resolved || step !== "destination") return;

      // Avtodom: destination step = END place (origin already collected).
      if (isRoadGroundOnly) {
        const userLabel = displayLabel?.trim() || trimmed;
        setCollected((prev) => ({ ...prev, destination: resolved }));
        appendMessages(
          createChatMessage("user", userLabel),
          createChatMessage("ai", t("heroChat.stepDates.ask" as never), {
            offerDatePicker: true,
          }),
        );
        setStep("dates");
        setTextInput("");
        return;
      }

      const userLabel = displayLabel?.trim() || trimmed || fileFallback;
      const userMessage =
        attachment && !trimmed
          ? `📎 ${attachment.filename}`
          : attachment
            ? `${userLabel}\n📎 ${attachment.filename}`
            : userLabel;

      const destWithAirport =
        !isStaysOnly && !isRoadGroundOnly && !isFullPlan
          ? withDestinationAirport(resolved)
          : resolved;
      const boot = resolveHeroChatBootstrap(destWithAirport, lang);
      const baseCollected = {
        destination: destWithAirport,
        attachment: attachment ?? undefined,
        ...(boot.passengers ? { passengers: boot.passengers.label } : {}),
        ...(boot.dates.departDate || boot.dates.precision !== "none"
          ? { dates: boot.dates.label }
          : {}),
      };

      setConversationStarted(true);
      setCollected(baseCollected);
      appendMessages(createChatMessage("user", userMessage));

      if (isFullPlan) {
        appendMessages(createChatMessage("ai", t("heroChat.travelMode.ask" as never)));
        setStep("travelMode");
        return;
      }

      // Flights: destination → origin (MUC…) → trip type → dates → …
      if (!isStaysOnly && !isRoadGroundOnly) {
        const knownOrigin = originsFromCollected(destWithAirport, "");
        setAfterOrigin(isFlightsOnly ? "searching" : "pace");
        if (knownOrigin.length === 0) {
          appendMessages(createChatMessage("ai", t("heroChat.origin.ask" as never)));
          setStep("origin");
          return;
        }
        const originLabel = formatOriginSelection(knownOrigin, lang);
        setCollected((prev) => ({ ...prev, origin: originLabel }));
        appendMessages(createChatMessage("ai", t("heroChat.tripType.ask" as never)));
        setStep("tripType");
        return;
      }

      // Rich prompt with dates but no party size → modern passenger cards only.
      if (boot.nextStep === "passengers" && boot.dates.label) {
        setCollected((prev) => ({
          ...prev,
          ...baseCollected,
          dates: boot.dates.label,
        }));
        appendMessages(
          createChatMessage(
            "ai",
            skyMessageWithVars(
              t(
                (isStaysOnly
                  ? "heroChat.passengers.tripReadyStays"
                  : "heroChat.passengers.tripReady") as never,
              ),
              {
                dates: boot.dates.label,
              },
            ),
          ),
        );
        setStep("passengers");
        return;
      }

      // Everything including passengers → search (or pace for full trip mode).
      if (boot.nextStep === "search" && boot.passengers && boot.dates.label) {
        setCollected((prev) => ({
          ...prev,
          ...baseCollected,
          passengers: boot.passengers!.label,
          dates: boot.dates.label,
        }));
        appendMessages(
          createChatMessage(
            "ai",
            skyMessageWithVars(t("heroChat.bootstrap.ready" as never), {
              passengers: boot.passengers.label,
              dates: boot.dates.label,
            }),
          ),
        );
        if (isStaysOnly) {
          appendMessages(createChatMessage("ai", t("cta.searchingStays" as never)));
          setStep("searching");
          return;
        }
      }
      if (boot.dates.precision === "vague" && !boot.dates.departDate) {
        appendMessages(
          createChatMessage(
            "ai",
            skyMessageWithVars(t("heroChat.stepDates.vague" as never), {
              period: boot.dates.label,
            }),
            { offerDatePicker: true },
          ),
        );
      } else if (boot.passengers) {
        appendMessages(
          createChatMessage(
            "ai",
            skyMessageWithVars(t("heroChat.bootstrap.gotPassengers" as never), {
              passengers: boot.passengers.label,
            }),
            { offerDatePicker: true },
          ),
        );
      } else {
        appendMessages(
          createChatMessage("ai", t("heroChat.stepDates.ask" as never), {
            offerDatePicker: true,
          }),
        );
      }
      setStep("dates");
    },
    [
      appendMessages,
      attachment,
      isFlightsOnly,
      isRoadGroundOnly,
      isStaysOnly,
      isFullPlan,
      lang,
      step,
      t,
    ],
  );

  useEffect(() => {
    return () => {
      if (selectedFilePreview?.previewUrl) {
        URL.revokeObjectURL(selectedFilePreview.previewUrl);
      }
    };
  }, [selectedFilePreview?.previewUrl]);

  function clearSelectedFile() {
    if (selectedFilePreview?.previewUrl) {
      URL.revokeObjectURL(selectedFilePreview.previewUrl);
    }
    setSelectedFilePreview(null);
    setAttachment(null);
    setFileError(null);
  }

  const clearSearch = useCallback(() => {
    if (selectedFilePreview?.previewUrl) {
      URL.revokeObjectURL(selectedFilePreview.previewUrl);
    }
    setSelectedFilePreview(null);
    setAttachment(null);
    setFileError(null);
    setFileProcessing(false);
    setStep("destination");
    setConversationStarted(false);
    setMessages([]);
    setCollected({});
    setTextInput("");
    setShowDatePicker(false);
    setAfterOrigin("searching");
    setPlanTravel(null);
    searchSentRef.current = false;
    flightsAnnouncedRef.current = false;
    staysAnnouncedRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClearSearch?.();
  }, [onClearSearch, selectedFilePreview?.previewUrl]);

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setFileError(null);
    const validationKey = validateHeroAttachmentFile(file);
    if (validationKey) {
      setFileError(t(validationKey as never));
      return;
    }

    setFileProcessing(true);
    try {
      if (selectedFilePreview?.previewUrl) {
        URL.revokeObjectURL(selectedFilePreview.previewUrl);
      }
      const payload = await fileToHeroAttachmentPayload(file);
      const previewUrl = createHeroAttachmentPreviewUrl(file, payload.kind);
      setAttachment(payload);
      setSelectedFilePreview({ file, previewUrl, kind: payload.kind });
    } catch (err) {
      const key =
        err instanceof Error && err.message.startsWith("heroChat.")
          ? err.message
          : "heroChat.fileReadError";
      setFileError(t(key as never));
    } finally {
      setFileProcessing(false);
    }
  }

  function openFilePicker() {
    if (fileProcessing || inputDisabled) return;
    fileInputRef.current?.click();
  }

  useEffect(() => {
    if (!seedDestination?.trim() || step !== "destination" || conversationStarted) return;
    startFlow(seedDestination.trim());
    onSeedConsumed?.();
  }, [seedDestination, step, conversationStarted, startFlow, onSeedConsumed]);

  useEffect(() => {
    if (!conversationStarted || showSearchLoader) return;
    scrollToBottom();
  }, [step, messages, showDatePicker, conversationStarted, showSearchLoader, scrollToBottom]);

  // Pin the loader into view once when search starts, then freeze scrolling.
  useEffect(() => {
    if (!showSearchLoader) return;
    const el = scrollRef.current;
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    });
  }, [showSearchLoader]);

  useEffect(() => {
    if (step !== "searching" || searchSentRef.current) return;

    // Stays: no origin airport — search Booking with city + dates + guests.
    if (isStaysOnly) {
      searchSentRef.current = true;
      const data = {
        ...(collected as HeroChatCollected),
        attachment: attachment ?? collected.attachment,
      } satisfies HeroChatCollected;
      onSearch(buildHeroStaysSearchQuery(data), data, mode);
      return;
    }

    // Avtodom: origin + destination places already in collected — generate road plan.
    if (isRoadGroundOnly) {
      if (!collected.origin?.trim() || !collected.destination?.trim()) {
        appendMessages(
          createChatMessage("ai", roadT("askEnd")),
        );
        setStep(collected.origin?.trim() ? "destination" : "origin");
        return;
      }
      searchSentRef.current = true;
      const data = {
        ...(collected as HeroChatCollected),
        attachment: attachment ?? collected.attachment,
      } satisfies HeroChatCollected;
      onSearch(
        isCarOnly ? buildHeroCarSearchQuery(data) : buildHeroMotorhomeSearchQuery(data),
        data,
        effectiveRoadMode ?? mode,
      );
      return;
    }

    // Block HKT→HKT before Make/Duffel (destination IATA mistaken as origin).
    const safeOrigins = originsFromCollected(collected.destination, collected.origin);
    if (safeOrigins.length === 0) {
      setCollected((prev) => ({ ...prev, origin: undefined }));
      setAfterOrigin("searching");
      appendMessages(createChatMessage("ai", t("heroChat.origin.ask" as never)));
      setStep("origin");
      return;
    }

    searchSentRef.current = true;

    const locationWishes =
      collected.locationWishes?.trim() || pendingLocationWishesRef.current.trim() || "";
    pendingLocationWishesRef.current = "";

    const data = {
      ...(collected as HeroChatCollected),
      origin: formatOriginSelection(safeOrigins, lang),
      attachment: attachment ?? collected.attachment,
      ...(locationWishes ? { locationWishes } : {}),
    } satisfies HeroChatCollected;
    // Keep English chip destination on `data` for IATA; localize only the Make/wishes query.
    const query = buildHeroMakeSearchQuery(
      localizeHeroCollectedForUi(data, lang, (key) => t(key as never)),
      mode,
      (key, vars) => {
        let out = t(key as never);
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            out = out.replace(`{${k}}`, v);
          }
        }
        return out;
      },
    );
    onSearch(query, data, mode);
  }, [
    step,
    collected,
    attachment,
    onSearch,
    mode,
    appendMessages,
    t,
    lang,
    isStaysOnly,
    isRoadGroundOnly,
    isCarOnly,
    effectiveRoadMode,
    roadT,
  ]);

  useEffect(() => {
    if (step === "destination") {
      searchSentRef.current = false;
      flightsAnnouncedRef.current = false;
      staysAnnouncedRef.current = false;
    }
  }, [step]);

  useEffect(() => {
    if (loading || flights.length === 0 || flightsAnnouncedRef.current) return;
    flightsAnnouncedRef.current = true;
    const namedOrigins = originsFromCollected(
      collected.destination,
      collected.origin,
    );
    const resultOrigins = [
      ...new Set(
        flights
          .map((f) => f.origin_iata?.trim().toUpperCase())
          .filter((o): o is string => Boolean(o && /^[A-Z]{3}$/.test(o))),
      ),
    ];
    const originsLabel =
      namedOrigins.length > 1
        ? namedOrigins.join(", ")
        : resultOrigins.length > 1
          ? resultOrigins.join(", ")
          : "";
    const intro =
      originsLabel
        ? skyMessageWithVars(t("heroChat.flightResultsIntroFrom" as never), {
            origins: originsLabel,
          })
        : t("heroChat.flightResultsIntro" as never);
    appendMessages(createChatMessage("ai", intro));
    scrollToBottom();
  }, [loading, flights, collected.destination, appendMessages, t, scrollToBottom]);

  function clearDatePickerOffers() {
    setMessages((prev) =>
      prev.map((message) =>
        message.offerDatePicker ? { ...message, offerDatePicker: false } : message,
      ),
    );
  }

  function startFlightSearch(opts?: { origins?: string[] }) {
    const origins = opts?.origins ?? [];
    appendMessages(
      createChatMessage(
        "ai",
        origins.length > 1
          ? skyMessageWithVars(t("heroChat.searchingFlightsFrom" as never), {
              origins: origins.join(", "),
            })
          : t("heroChat.searchingFlights" as never),
      ),
    );
    setStep("searching");
  }

  function startStaySearch() {
    appendMessages(createChatMessage("ai", t("cta.searchingStays" as never)));
    setStep("searching");
  }

  function continueFlightAfterDestination() {
    const dest = collected.destination ?? "";
    const destAir = withDestinationAirport(dest);
    if (destAir !== dest) {
      setCollected((prev) => ({ ...prev, destination: destAir }));
    }
    const knownOrigin = originsFromCollected(destAir, collected.origin);
    setAfterOrigin("pace");
    if (knownOrigin.length === 0) {
      appendMessages(createChatMessage("ai", t("heroChat.origin.ask" as never)));
      setStep("origin");
      return;
    }
    const originLabel = formatOriginSelection(knownOrigin, lang);
    setCollected((prev) => ({ ...prev, origin: originLabel, destination: destAir || prev.destination }));
    appendMessages(createChatMessage("ai", t("heroChat.tripType.ask" as never)));
    setStep("tripType");
  }

  function handleRoadOriginPick(place: string, label: string) {
    const trimmed = place.trim();
    if (!trimmed) return;
    setCollected((prev) => ({ ...prev, origin: trimmed }));
    appendMessages(createChatMessage("user", label.trim() || trimmed));
    if (!collected.dates?.trim()) {
      goAskDates();
      return;
    }
    if (!collected.passengers?.trim()) {
      askPassengers(collected.dates);
      return;
    }
    appendMessages(createChatMessage("ai", roadT("searching")));
    setStep("searching");
  }

  function handleTravelModeSelect(id: string, label: string) {
    appendMessages(createChatMessage("user", label));
    if (id === "car" || id === "motorhome") {
      setPlanTravel(id);
      appendMessages(createChatMessage("ai", t("heroChat.travelMode.askOrigin" as never)));
      setStep("origin");
      return;
    }
    setPlanTravel("flight");
    continueFlightAfterDestination();
  }

  function goToOriginStep(next: "searching" | "pace") {
    setAfterOrigin(next);
    appendMessages(createChatMessage("ai", t("heroChat.origin.ask" as never)));
    setStep("origin");
    scrollToBottom();
  }

  /** Skip the picker when the user already named airports in chat. */
  function continueWithOptionalOrigin(
    next: "searching" | "pace",
    context: { destination?: string; origin?: string; dates?: string },
  ) {
    if (context.dates?.trim()) {
      setCollected((prev) => ({
        ...prev,
        dates: context.dates!.trim() || prev.dates || "",
      }));
    }
    if (isStaysOnly || isRoadGroundOnly) {
      if (isRoadGroundOnly) {
        appendMessages(createChatMessage("ai", roadT("searching")));
        setStep("searching");
        return;
      }
      startStaySearch();
      return;
    }
    const known = originsFromCollected(context.destination, context.origin);
    if (known.length > 0) {
      const label = formatOriginSelection(known, lang);
      setCollected((prev) => ({
        ...prev,
        origin: prev.origin?.trim() || label,
      }));
      if (next === "searching") {
        startFlightSearch({ origins: known });
        return;
      }
      appendMessages(createChatMessage("ai", t("heroChat.pace.ask" as never)));
      setStep("pace");
      return;
    }
    goToOriginStep(next);
  }

  function askPassengers(datesLabel?: string) {
    const dates = (datesLabel ?? collected.dates)?.trim() || "";
    appendMessages(
      createChatMessage(
        "ai",
        dates
          ? skyMessageWithVars(
              t(
                (isStaysOnly
                  ? "heroChat.passengers.tripReadyStays"
                  : "heroChat.passengers.tripReady") as never,
              ),
              { dates },
            )
          : t("heroChat.passengers.browserTitle" as never),
      ),
    );
    setStep("passengers");
    scrollToBottom();
  }

  function needsFlightTripType(): boolean {
    return !isStaysOnly && !isRoadGroundOnly;
  }

  function goAskDates(messageKey: "heroChat.stepDates.ask" | "heroChat.stepDates.vague" = "heroChat.stepDates.ask", period?: string) {
    appendMessages(
      createChatMessage(
        "ai",
        period
          ? skyMessageWithVars(t(messageKey as never), { period })
          : t("heroChat.stepDates.ask" as never),
        { offerDatePicker: true },
      ),
    );
    setStep("dates");
    scrollToBottom();
  }

  /** Trip type → (open-jaw return-from) → dates, unless dates already known. */
  function goAskTripTypeOrContinue() {
    if (!needsFlightTripType()) {
      goAskDates();
      return;
    }
    if (collected.tripType) {
      const tripType = normalizeHeroTripType(collected.tripType);
      if (tripType === "openjaw" && !collected.returnFromIata?.trim()) {
        appendMessages(createChatMessage("ai", t("heroChat.returnFrom.ask" as never)));
        setStep("returnFrom");
        scrollToBottom();
        return;
      }
      if (collected.dates?.trim()) {
        continueWithOptionalOrigin(isQuickSearchMode ? "searching" : "pace", {
          destination: collected.destination,
          origin: collected.origin,
          dates: collected.dates,
        });
        return;
      }
      goAskDates();
      return;
    }
    appendMessages(createChatMessage("ai", t("heroChat.tripType.ask" as never)));
    setStep("tripType");
    scrollToBottom();
  }

  function handleTripTypeSelect(id: string, label: string) {
    const tripType = normalizeHeroTripType(id) as HeroTripType;
    appendMessages(createChatMessage("user", label));
    setCollected((prev) => ({
      ...prev,
      tripType,
      ...(tripType !== "openjaw" ? { returnFromIata: undefined } : {}),
    }));

    if (tripType === "openjaw") {
      appendMessages(createChatMessage("ai", t("heroChat.returnFrom.ask" as never)));
      setStep("returnFrom");
      scrollToBottom();
      return;
    }

    if (collected.dates?.trim()) {
      continueWithOptionalOrigin(isQuickSearchMode ? "searching" : "pace", {
        destination: collected.destination,
        origin: collected.origin,
        dates: collected.dates,
      });
      return;
    }
    goAskDates();
  }

  function handleReturnFromConfirm(iata: string, label: string) {
    const code = iata.trim().toUpperCase();
    appendMessages(createChatMessage("user", label || code));
    setCollected((prev) => ({ ...prev, returnFromIata: code, tripType: "openjaw" }));
    if (collected.dates?.trim()) {
      continueWithOptionalOrigin(isQuickSearchMode ? "searching" : "pace", {
        destination: collected.destination,
        origin: collected.origin,
        dates: collected.dates,
      });
      return;
    }
    goAskDates();
  }

  function continueAfterDates(dateLabel: string) {
    const dates = dateLabel.trim();
    setCollected((prev) => ({ ...prev, dates: dates || prev.dates || "" }));
    // Guided flow must collect party size before origin / search.
    if (!collected.passengers?.trim()) {
      askPassengers(dates);
      return;
    }
    continueWithOptionalOrigin(isQuickSearchMode ? "searching" : "pace", {
      destination: collected.destination,
      origin: collected.origin,
      dates,
    });
  }

  function advanceFromDates(label: string, options?: { silent?: boolean }) {
    setShowDatePicker(false);
    clearDatePickerOffers();
    if (!options?.silent && label.trim()) {
      appendMessages(createChatMessage("user", label.trim()));
    }
    continueAfterDates(label);
  }

  function handlePaceSelect(_id: string, label: string) {
    appendMessages(
      createChatMessage("user", label),
      createChatMessage("ai", t("heroChat.budget.ask" as never)),
    );
    setCollected((prev) => ({ ...prev, pace: label }));
    setStep("budget");
  }

  function advanceFromOrigin(label: string, iatas: string[] = []) {
    if (isRoadGroundOnly) {
      handleRoadOriginPick(label, label);
      return;
    }
    const destCode =
      parseMakeSearchDestination(collected.destination ?? "")?.toUpperCase() ?? null;
    const codes = (
      iatas.length > 0 ? iatas : parseMakeSearchOriginAirports(label)
    ).filter((code) => !destCode || code !== destCode);
    if (codes.length === 0) {
      appendMessages(
        createChatMessage("user", label),
        createChatMessage("ai", t("heroSearch.originSameAsDestination" as never)),
      );
      goToOriginStep(afterOrigin);
      return;
    }
    if (codes.length > 0) rememberRecentOrigins(codes);

    const originLabel = formatOriginSelection(codes, lang) || label;
    setCollected((prev) => ({
      ...prev,
      origin: originLabel,
      attachment: attachment ?? prev.attachment,
    }));
    appendMessages(createChatMessage("user", originLabel));

    // Stays never need trip type / flight origin pipeline beyond this.
    if (isStaysOnly) {
      if (!collected.dates?.trim()) {
        goAskDates();
        return;
      }
      if (!collected.passengers?.trim()) {
        askPassengers(collected.dates);
        return;
      }
      startStaySearch();
      return;
    }

    // Flights: origin → trip type → dates → passengers → search/pace.
    if (needsFlightTripType() && !collected.tripType) {
      appendMessages(createChatMessage("ai", t("heroChat.tripType.ask" as never)));
      setStep("tripType");
      scrollToBottom();
      return;
    }
    const tripType = normalizeHeroTripType(collected.tripType);
    if (tripType === "openjaw" && !collected.returnFromIata?.trim()) {
      appendMessages(createChatMessage("ai", t("heroChat.returnFrom.ask" as never)));
      setStep("returnFrom");
      scrollToBottom();
      return;
    }
    if (!collected.dates?.trim()) {
      goAskDates();
      return;
    }
    if (!collected.passengers?.trim()) {
      askPassengers(collected.dates);
      return;
    }

    const next = isQuickSearchMode ? "searching" : afterOrigin;
    if (next === "searching") {
      startFlightSearch({ origins: codes });
      return;
    }
    appendMessages(createChatMessage("ai", t("heroChat.pace.ask" as never)));
    setStep("pace");
  }

  function handleOriginPickerConfirm(iatas: string[], label: string) {
    advanceFromOrigin(label, iatas);
  }

  function handlePassengersSelect(label: string, rooms?: number) {
    const destination = collected.destination ?? "";
    const parsed = extractHeroChatDates(destination, lang);
    const knownDates =
      collected.dates?.trim() ||
      (parsed.departDate || parsed.precision === "exact" ? parsed.label : "");

    appendMessages(createChatMessage("user", label));
    setCollected((prev) => ({
      ...prev,
      passengers: label,
      ...(rooms != null ? { rooms } : {}),
    }));

    // Guided path: dates already chosen → trip type (if needed) → origin / search.
    if (knownDates) {
      const dateLabel = knownDates;
      setCollected((prev) => ({
        ...prev,
        dates: dateLabel,
        passengers: label,
        ...(rooms != null ? { rooms } : {}),
      }));
      if (needsFlightTripType() && !collected.tripType) {
        appendMessages(createChatMessage("ai", t("heroChat.tripType.ask" as never)));
        setStep("tripType");
        scrollToBottom();
        return;
      }
      continueWithOptionalOrigin(isQuickSearchMode ? "searching" : "pace", {
        destination,
        origin: collected.origin,
        dates: dateLabel,
      });
      return;
    }

    if (parsed.precision === "vague") {
      setCollected((prev) => ({ ...prev, dates: parsed.label }));
      if (needsFlightTripType() && !collected.tripType) {
        appendMessages(createChatMessage("ai", t("heroChat.tripType.ask" as never)));
        setStep("tripType");
        scrollToBottom();
        return;
      }
      goAskDates("heroChat.stepDates.vague", parsed.label);
      return;
    }

    goAskTripTypeOrContinue();
  }

  function handleToggleDatePicker() {
    setShowDatePicker((open) => {
      const next = !open;
      if (next) clearDatePickerOffers();
      return next;
    });
    window.setTimeout(() => {
      datePickerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    }, 100);
  }

  function handleDateSelect(_id: string, label: string) {
    advanceFromDates(label);
  }

  function handleDateRangeConfirm(label: string) {
    advanceFromDates(label);
  }

  function handleNightsSelect(_id: string, label: string) {
    appendMessages(createChatMessage("user", label));
    setCollected((prev) => ({ ...prev, nights: label }));
    if (isStaysOnly) {
      startStaySearch();
      return;
    }
    if (isRoadGroundOnly) {
      appendMessages(createChatMessage("ai", roadT("searching")));
      setStep("searching");
      return;
    }
    goToOriginStep(isFlightsOnly ? "searching" : "pace");
  }

  function handleBudgetSelect(_id: string, label: string) {
    appendMessages(
      createChatMessage("user", label),
      createChatMessage("ai", t("heroChat.wishes.ask" as never)),
    );
    setCollected((prev) => ({
      ...prev,
      budget: label,
      attachment: attachment ?? prev.attachment,
    }));
    setStep("wishes");
  }

  function finishWishesAndSearch(locationWishes?: string) {
    const trimmed = locationWishes?.trim() || "";
    pendingLocationWishesRef.current = trimmed;
    setCollected((prev) => ({
      ...prev,
      ...(trimmed ? { locationWishes: trimmed } : { locationWishes: undefined }),
      attachment: attachment ?? prev.attachment,
    }));
    appendMessages(createChatMessage("ai", t("heroChat.step6.loading" as never)));
    setStep("searching");
  }

  function handleWishesSubmit(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    appendMessages(createChatMessage("user", trimmed));
    setTextInput("");
    finishWishesAndSearch(trimmed);
  }

  function handleWishesSkip() {
    appendMessages(createChatMessage("user", t("heroChat.wishes.skip" as never)));
    setTextInput("");
    finishWishesAndSearch();
  }

  function handleStartPlanning() {
    if (inputDisabled || fileProcessing) return;
    const trimmed = textInput.trim();
    if (!trimmed && !attachment) {
      inputRef.current?.focus();
      return;
    }
    if (isRoadGroundOnly && !conversationStarted) {
      startMotorhomeFromOrigin(trimmed);
      return;
    }
    startFlow(trimmed);
    setTextInput("");
  }

  function handleDestinationPick(destination: string, label: string) {
    if (inputDisabled || fileProcessing) return;
    startFlow(destination, label);
    setTextInput("");
  }

  function handleTextSubmit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = textInput.trim();
    const canSendDestination = step === "destination" && (trimmed || attachment);
    const canSendDates = step === "dates" && !showDatePicker && Boolean(textInput.trim());
    if ((!trimmed && !canSendDestination && !canSendDates) || inputDisabled || fileProcessing) {
      return;
    }
    if (step !== "destination" && !trimmed && !canSendDates) return;

    switch (step) {
      case "destination":
        startFlow(trimmed);
        break;
      case "dates":
        if (showDatePicker) return;
        {
          const parsed = trimmed ? extractHeroChatDates(trimmed, lang) : null;
          const dateLabel =
            parsed && parsed.precision !== "none"
              ? parsed.label
              : trimmed;
          if (dateLabel.trim()) advanceFromDates(dateLabel.trim());
        }
        break;
      case "nights":
        handleNightsSelect("custom", trimmed);
        break;
      case "origin":
        advanceFromOrigin(trimmed);
        break;
      case "passengers": {
        const parsed = extractHeroChatPassengers(trimmed, lang);
        handlePassengersSelect(parsed?.label ?? trimmed);
        break;
      }
      case "pace":
        handlePaceSelect("custom", trimmed);
        break;
      case "budget":
        handleBudgetSelect("custom", trimmed);
        break;
      case "wishes":
        handleWishesSubmit(trimmed);
        break;
      default:
        break;
    }
    setTextInput("");
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  }

  const featureBadges = useMemo(
    () => HERO_FEATURE_BADGE_IDS.map((id) => t(`heroChat.feature.${id}` as never)),
    [t],
  );

  const showConversationChips = conversationStarted && !isSearching;

  const placeholder =
    step === "wishes"
      ? t("heroChat.wishes.placeholder" as never)
      : chatPlaceholder(t);
  const canSubmit =
    !inputDisabled &&
    !fileProcessing &&
    (step === "destination"
      ? Boolean(textInput.trim() || attachment)
      : step === "dates"
        ? !showDatePicker && Boolean(textInput.trim())
        : Boolean(textInput.trim()));

  return (
    <div
      id="hero-chat-window"
      className={cn(
        "relative z-20 mx-auto mt-10 w-full min-w-0 text-left pointer-events-auto",
        showTripChecklist || staySearch
          ? "max-w-4xl sm:max-w-5xl"
          : "max-w-2xl sm:max-w-3xl",
      )}
    >
      <div
        className={cn(
          showTripChecklist && "grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)] lg:items-start",
        )}
      >
      <div className="min-w-0">
      {!conversationStarted ? (
        <>
          {fileError ? (
            <p className="mb-3 text-center text-sm text-red-200" role="alert">
              {fileError}
            </p>
          ) : null}
          {isRoadGroundOnly ? (
            <MotorhomeSearchBrowser
              disabled={inputDisabled}
              onSubmit={startMotorhomeBrowser}
              variant={isCarOnly ? "car" : "motorhome"}
            />
          ) : (
            <HeroGuidedStart
              onPickDestination={handleDestinationPick}
              onTypeSubmit={handleStartPlanning}
              textInput={textInput}
              onTextChange={setTextInput}
              canSubmit={canSubmit}
              inputDisabled={inputDisabled}
              fileProcessing={fileProcessing}
              featureBadges={featureBadges}
              staysOnly={isStaysOnly}
              t={t}
            />
          )}
        </>
      ) : (
        <form
          onSubmit={handleTextSubmit}
          className="flex w-full flex-col rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 shadow-lg backdrop-blur-md"
        >
          {selectedFilePreview ? (
            <FilePreview
              preview={selectedFilePreview}
              onRemove={clearSelectedFile}
              removeLabel={t("heroChat.removeFile" as never)}
            />
          ) : null}
          <div className="flex items-center">
            <textarea
              ref={inputRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={inputDisabled || fileProcessing}
              autoComplete="off"
              rows={1}
              placeholder={placeholder}
              aria-label={placeholder}
              className="max-h-24 min-h-[2.5rem] w-full resize-none border-0 bg-transparent py-1.5 text-sm leading-relaxed text-white placeholder:text-white/60 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 sm:text-[15px]"
              style={{ color: "#fff", WebkitTextFillColor: "#fff" }}
            />
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label={t("heroChat.send" as never)}
              className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 shadow-md transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </form>
      )}

      {conversationStarted ? (
        <>
        <div
          ref={scrollRef}
          className={cn(
            "mt-6 space-y-3 px-1 py-1",
            // When the calendar is open, collapse the chat transcript so the picker fits.
            showDatePicker && step === "dates"
              ? "max-h-28 overflow-x-clip overflow-y-auto overscroll-y-contain sm:max-h-36"
              : showSearchLoader
                ? "max-h-[min(420px,50vh)] overflow-x-clip overflow-y-hidden"
                : staySearch
                  ? "max-h-none overflow-visible"
                  : "max-h-[min(420px,50vh)] overflow-x-clip overflow-y-auto overscroll-y-contain",
          )}
        >
          {messages.map((message) => (
            <div key={message.id} className="space-y-2">
              {message.role === "ai" ? (
                <SkyMessage
                  message={message}
                  showHeader={message.id === firstSkyMessageId}
                  agentName={agentName}
                />
              ) : (
                <UserMessage message={message} />
              )}
            </div>
          ))}

          {showSearchLoader ? (
            <div
              className="hero-sky-enter mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-white/30 bg-black/55 px-4 py-3 shadow-lg backdrop-blur-md sm:ml-10"
              role="status"
              aria-live="polite"
            >
              <Loader2
                className="h-6 w-6 shrink-0 animate-spin text-sky-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]"
                aria-hidden
              />
              <span className="text-sm font-medium tracking-wide text-white">
                {t(
                  (isRoadGroundOnly
                    ? `${roadChatNs}.searching`
                    : isStaysOnly
                      ? "cta.searchingStays"
                      : "cta.searchingFlights") as never,
                )}
              </span>
            </div>
          ) : null}

          {showConversationChips && step === "destination" && isRoadGroundOnly ? (
            <div className="space-y-2">
              <p className="pl-0 text-center text-xs text-white/65 sm:pl-10 sm:text-left">
                {roadT("endHint")}
              </p>
              <QuickReplyChips
                layout="grid"
                disabled={loading}
                options={HERO_MOTORHOME_END_CHIPS.map((chip) => {
                  const name = t(chip.nameKey as never);
                  const label = name.startsWith("hero.mhEnd.") ? chip.place : name;
                  return { id: chip.id, label: `${chip.emoji} ${label}` };
                })}
                onSelect={(id, label) => {
                  const chip = HERO_MOTORHOME_END_CHIPS.find((c) => c.id === id);
                  handleDestinationPick(chip?.place ?? label, label);
                }}
                footer={
                  <MotorhomeTypeEndField
                    value={textInput}
                    onChange={setTextInput}
                    disabled={loading}
                    t={t}
                    typeEndLabel={roadT("typeEnd")}
                    typeEndPlaceholder={roadT("typeEndPlaceholder")}
                    onSubmit={() => {
                      const trimmed = textInput.trim();
                      if (!trimmed || loading) return;
                      handleDestinationPick(trimmed, trimmed);
                    }}
                  />
                }
              />
            </div>
          ) : null}

          {!loading && searchError ? (
            <div className="hero-sky-enter pl-10 pr-1">
              <p
                className={
                  searchError.startsWith("error.quota")
                    ? "rounded-2xl border border-sky-300/40 bg-sky-500/15 px-4 py-3 text-sm text-sky-50"
                    : "rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                }
              >
                {resolveErrorMessage(t, searchError)}
              </p>
            </div>
          ) : null}

          {!loading && staySearch ? (
            <div className="hero-sky-enter mx-auto w-full max-w-5xl overflow-visible rounded-2xl bg-white p-3 shadow-lg sm:p-4">
              <HotelsSection
                city={staySearch.city}
                checkIn={staySearch.checkIn}
                checkOut={staySearch.checkOut}
                stayInfo={{
                  adults: staySearch.adults,
                  childrenAges: staySearch.childrenAges,
                  rooms: staySearch.rooms,
                }}
                bookingFirst
              />
            </div>
          ) : null}

          {!loading && !staySearch && flights.length > 0 ? (
            <div className="hero-sky-enter mx-auto w-full max-w-xl space-y-2 pl-0 pr-1 sm:pl-10">
              {flights.map((flight, index) => (
                <FlightCard
                  key={flight.id}
                  flight={flight}
                  adults={flightAdults}
                  searchMeta={flightSearchMeta}
                  selectedForAi={selectedFlightId === flight.id}
                  onSelectForAiPlan={onSelectFlightForAiPlan}
                  isFirst={index === 0}
                />
              ))}
            </div>
          ) : null}

          <div ref={activeControlsRef}>
          {showConversationChips && step === "passengers" ? (
            <HeroPassengerBrowser
              disabled={loading}
              stays={isStaysOnly}
              onSelect={(label, _adults, _children, rooms) =>
                handlePassengersSelect(label, rooms)
              }
            />
          ) : null}

          {showConversationChips && step === "pace" && !isQuickSearchMode ? (
            <QuickReplyChips
              disabled={loading}
              options={PACE_CHIP_IDS.map((id) => ({
                id,
                label: t(`heroChat.pace.${id}` as never),
              }))}
              onSelect={handlePaceSelect}
            />
          ) : null}

          {showConversationChips && step === "travelMode" ? (
            <QuickReplyChips
              layout="grid"
              disabled={loading}
              options={[
                { id: "flight", label: t("heroChat.travelMode.flight" as never) },
                { id: "car", label: t("heroChat.travelMode.car" as never) },
                { id: "motorhome", label: t("heroChat.travelMode.motorhome" as never) },
              ]}
              onSelect={handleTravelModeSelect}
            />
          ) : null}

          {showConversationChips && step === "origin" && isRoadGroundOnly ? (
            <QuickReplyChips
              layout="grid"
              disabled={loading}
              options={HERO_MOTORHOME_START_CHIPS.map((chip) => {
                const name = t(chip.nameKey as never);
                const label = name.startsWith("hero.mhStart.") ? chip.place : `${chip.emoji} ${name}`;
                return { id: chip.id, label };
              })}
              onSelect={(id, label) => {
                const chip = HERO_MOTORHOME_START_CHIPS.find((c) => c.id === id);
                handleRoadOriginPick(chip?.place ?? label, label);
              }}
            />
          ) : null}

          {showConversationChips && step === "tripType" ? (
            <QuickReplyChips
              layout="grid"
              disabled={loading}
              options={TRIP_TYPE_IDS.map((id) => ({
                id,
                label: t(`heroChat.tripType.${id}` as never),
              }))}
              onSelect={handleTripTypeSelect}
            />
          ) : null}

          {showConversationChips && step === "returnFrom" ? (
            <div className="hero-chips-enter pl-0 sm:pl-10">
              <HeroReturnFromPicker
                excludeIata={parseMakeSearchDestination(collected.destination ?? "")}
                disabled={loading}
                onConfirm={handleReturnFromConfirm}
              />
            </div>
          ) : null}

          {showConversationChips && step === "dates" && !showDatePicker ? (
            <div className="space-y-2">
              <QuickReplyChips
                layout="grid"
                disabled={loading}
                options={DATE_CHIP_IDS.map((id) => ({
                  id,
                  label: chipLabel("heroChat.dates", id),
                }))}
                onSelect={handleDateSelect}
              />
              <PickExactDatesButton
                label={t("heroChat.pickExactDates" as never)}
                disabled={loading}
                onClick={handleToggleDatePicker}
              />
            </div>
          ) : null}

          {showConversationChips && step === "nights" && !isQuickSearchMode ? (
            <QuickReplyChips
              disabled={loading}
              options={NIGHT_CHIP_IDS.map((id) => ({
                id,
                label: chipLabel("heroChat.nights", id),
              }))}
              onSelect={handleNightsSelect}
            />
          ) : null}

          {showConversationChips && step === "origin" && !isRoadGroundOnly ? (
            <div className="hero-chips-enter pl-0 sm:pl-10">
              <OriginAirportPicker
                excludeIata={parseMakeSearchDestination(collected.destination ?? "")}
                onConfirm={handleOriginPickerConfirm}
              />
            </div>
          ) : null}

          {showConversationChips && step === "budget" && !isQuickSearchMode ? (
            <QuickReplyChips
              disabled={loading}
              options={BUDGET_CHIP_IDS.map((id) => ({
                id,
                label: chipLabel("heroChat.budget", id),
              }))}
              onSelect={handleBudgetSelect}
            />
          ) : null}

          {showConversationChips && step === "wishes" && !isQuickSearchMode ? (
            <div className="space-y-2 pl-0 sm:pl-10">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (textInput.trim()) handleWishesSubmit(textInput);
                    }
                  }}
                  disabled={loading}
                  placeholder={t("heroChat.wishes.placeholder" as never)}
                  aria-label={t("heroChat.wishes.placeholder" as never)}
                  className="min-w-0 flex-1 rounded-xl border border-white/30 bg-white/15 px-3 py-2.5 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/50"
                />
                <button
                  type="button"
                  disabled={loading || !textInput.trim()}
                  onClick={() => handleWishesSubmit(textInput)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white disabled:opacity-40"
                  aria-label={t("heroChat.send" as never)}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
              <QuickReplyChips
                disabled={loading}
                options={[
                  {
                    id: "skip",
                    label: t("heroChat.wishes.skip" as never),
                  },
                ]}
                onSelect={() => handleWishesSkip()}
              />
            </div>
          ) : null}
          </div>
        </div>

        {/* Car / motorhome / flights / stays: checklist is "all"-only — always offer clear here. */}
        {!showTripChecklist ? (
          <div className="mt-3 flex justify-center sm:justify-start sm:pl-2">
            <button
              type="button"
              onClick={clearSearch}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white/90 shadow-sm backdrop-blur-md transition hover:bg-white/20 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {t("search.clearNew" as never)}
            </button>
          </div>
        ) : null}

        {showDatePicker && step === "dates" ? (
          <div
            ref={datePickerRef}
            className="hero-chips-enter mt-3 space-y-2 pl-0 sm:pl-2"
          >
            <HeroDateRangeCalendar
              lang={lang}
              mode={
                normalizeHeroTripType(collected.tripType) === "oneway" ? "single" : "range"
              }
              confirmLabel={t("heroChat.confirm" as never)}
              disabled={loading}
              onConfirm={handleDateRangeConfirm}
            />
            <PickExactDatesButton
              label={t("heroChat.closeExactDates" as never)}
              disabled={loading}
              onClick={handleToggleDatePicker}
            />
          </div>
        ) : null}
        </>
      ) : null}
      </div>

      {showTripChecklist ? (
        <HeroTripChecklist
          collected={collected}
          onClear={clearSearch}
          className={cn(
            "lg:sticky lg:top-4",
            // On mobile, hide the tall checklist while the calendar is open so the picker fits.
            showDatePicker && step === "dates" && "hidden lg:block",
          )}
        />
      ) : null}
      </div>

      <style>{`
        @keyframes heroSkyEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroChipsEnter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-sky-enter {
          animation: heroSkyEnter 0.3s ease-out both;
        }
        .hero-chips-enter {
          animation: heroChipsEnter 0.35s ease-out 0.15s both;
        }
      `}</style>
    </div>
  );
}
