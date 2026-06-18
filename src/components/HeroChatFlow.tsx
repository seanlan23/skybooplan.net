import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
  type RefObject,
} from "react";
import { ArrowUp, Loader2, Mic, Paperclip, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  createHeroAttachmentPreviewUrl,
  fileToHeroAttachmentPayload,
  validateHeroAttachmentFile,
  type HeroChatAttachmentPayload,
  type HeroChatSelectedFile,
} from "@/lib/heroChatAttachment";
import { HeroDateRangeCalendar } from "@/components/HeroDateRangeCalendar";
import {
  buildHeroMakeSearchQuery,
  createChatMessage,
  type HeroChatCollected,
  type HeroChatMessage,
  type HeroChatMode,
  type HeroChatStep,
} from "@/lib/heroChatFlow";
import { extractHeroChatDates } from "@/lib/heroChatDates";
import { FlightCard } from "@/components/FlightCard";
import { RotatingTextareaPlaceholder } from "@/components/RotatingTextareaPlaceholder";
import type { MakeSearchFlight } from "@/lib/makeSearch";

const DATE_CHIP_IDS = ["endOctober", "startNovember", "octNov", "flexible"] as const;
const NIGHT_CHIP_IDS = ["3-5", "7", "10-14", "2weeks"] as const;
const ORIGIN_CHIP_IDS = ["ljubljana", "zagreb", "vienna", "venice", "other"] as const;
const PASSENGER_CHIP_IDS = ["1adult", "2adults", "2adults1child", "2adults2children"] as const;
const BUDGET_CHIP_IDS = ["under500", "500-1000", "1000-2000", "2000plus"] as const;

const HERO_FEATURE_BADGE_IDS = ["itinerary", "flights", "pdf"] as const;

const HERO_PLACEHOLDER_EXAMPLE_KEYS = [
  "heroChat.placeholder.example1",
  "heroChat.placeholder.example2",
  "heroChat.placeholder.example3",
  "heroChat.placeholder.example4",
  "heroChat.placeholder.example5",
  "heroChat.placeholder.example6",
] as const;

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

function AttachmentToolbar({
  fileInputRef,
  onAttachClick,
  onFileChange,
  fileProcessing,
  attachLabel,
  processingLabel,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAttachClick: () => void;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  fileProcessing: boolean;
  attachLabel: string;
  processingLabel: string;
}) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        multiple={false}
        onChange={onFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={onAttachClick}
        disabled={fileProcessing}
        aria-label={attachLabel}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-white/60 transition-colors hover:text-white/90 disabled:cursor-wait disabled:opacity-50"
      >
        {fileProcessing ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <Paperclip className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {fileProcessing ? (
        <span className="sr-only">{processingLabel}</span>
      ) : null}
    </>
  );
}

function QuickReplyChips({
  options,
  onSelect,
  disabled,
}: {
  options: ChipOption[];
  onSelect: (id: string, label: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="hero-chips-enter pl-10 pr-1">
      <div className="flex flex-wrap gap-2 pb-1 sm:flex-nowrap sm:overflow-x-auto sm:[-ms-overflow-style:none] sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden">
        {options.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(id, label)}
            className="inline-flex shrink-0 items-center rounded-full border border-white/40 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-white/90 disabled:opacity-50"
          >
            <span className="whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HeroCtaArea({
  onStartPlanning,
  disabled,
  featureBadges,
  ctaLabel,
}: {
  onStartPlanning: () => void;
  disabled?: boolean;
  featureBadges: string[];
  ctaLabel: string;
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-4">
      <button
        type="button"
        disabled={disabled}
        onClick={onStartPlanning}
        className="inline-flex items-center justify-center rounded-full bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ctaLabel}
      </button>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {featureBadges.map((label) => (
          <span
            key={label}
            className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm text-white/80 backdrop-blur-sm"
          >
            {label}
          </span>
        ))}
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
    <div className="hero-chips-enter pl-10 pr-1">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex items-center rounded-full border border-white/40 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-white/90 disabled:opacity-50"
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
}: HeroChatFlowProps) {
  const { t, lang } = useI18n();
  const isFlightsOnly = mode === "flights";
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchSentRef = useRef(false);
  const flightsAnnouncedRef = useRef(false);

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
  const [originFreeText, setOriginFreeText] = useState(false);

  const agentName = t("heroChat.agentName" as never);
  const isSearching = step === "searching";
  const inputDisabled = isSearching;

  const firstSkyMessageId = useMemo(
    () => messages.find((m) => m.role === "ai")?.id,
    [messages],
  );

  const scrollToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

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

  const startFlow = useCallback(
    (destination: string, displayLabel?: string) => {
      const trimmed = destination.trim();
      const fileFallback = t("heroChat.fileOnlyDestination" as never);
      const resolved = trimmed || (attachment ? fileFallback : "");
      if (!resolved || step !== "destination") return;

      const userLabel = displayLabel?.trim() || trimmed || fileFallback;
      const userMessage =
        attachment && !trimmed
          ? `📎 ${attachment.filename}`
          : attachment
            ? `${userLabel}\n📎 ${attachment.filename}`
            : userLabel;

      setConversationStarted(true);
      setCollected({
        destination: resolved,
        attachment: attachment ?? undefined,
      });
      appendMessages(
        createChatMessage("user", userMessage),
        createChatMessage("ai", t("heroChat.step1.ai" as never)),
      );
      setStep("passengers");
    },
    [appendMessages, attachment, step, t],
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
    if (!conversationStarted) return;
    scrollToBottom();
  }, [step, messages, showDatePicker, originFreeText, conversationStarted, scrollToBottom]);

  useEffect(() => {
    if (step !== "searching" || searchSentRef.current) return;
    searchSentRef.current = true;

    const data = {
      ...(collected as HeroChatCollected),
      attachment: attachment ?? collected.attachment,
    } satisfies HeroChatCollected;
    const query = buildHeroMakeSearchQuery(data, mode);
    onSearch(query, data, mode);
  }, [step, collected, attachment, onSearch, mode]);

  useEffect(() => {
    if (step === "destination") {
      searchSentRef.current = false;
      flightsAnnouncedRef.current = false;
    }
  }, [step]);

  useEffect(() => {
    if (loading || flights.length === 0 || flightsAnnouncedRef.current) return;
    flightsAnnouncedRef.current = true;
    appendMessages(createChatMessage("ai", t("heroChat.flightResultsIntro" as never)));
    scrollToBottom();
  }, [loading, flights, appendMessages, t, scrollToBottom]);

  function clearDatePickerOffers() {
    setMessages((prev) =>
      prev.map((message) =>
        message.offerDatePicker ? { ...message, offerDatePicker: false } : message,
      ),
    );
  }

  function startFlightSearch(dateLabel: string) {
    appendMessages(createChatMessage("ai", t("heroChat.searchingFlights" as never)));
    setCollected((prev) => ({ ...prev, dates: dateLabel.trim() || prev.dates || "" }));
    setStep("searching");
  }

  function advanceFromDates(label: string, options?: { silent?: boolean }) {
    setShowDatePicker(false);
    clearDatePickerOffers();
    if (!options?.silent && label.trim()) {
      appendMessages(createChatMessage("user", label.trim()));
    }
    startFlightSearch(label);
  }

  function advanceFromOrigin(label: string) {
    setOriginFreeText(false);
    if (isFlightsOnly) {
      appendMessages(
        createChatMessage("user", label),
        createChatMessage("ai", t("heroChat.step6.loading" as never)),
      );
      setCollected((prev) => ({
        ...prev,
        origin: label,
        attachment: attachment ?? prev.attachment,
      }));
      setStep("searching");
      return;
    }
    appendMessages(
      createChatMessage("user", label),
      createChatMessage("ai", t("heroChat.step5.ai" as never)),
    );
    setCollected((prev) => ({ ...prev, origin: label }));
    setStep("budget");
  }

  function advanceToDatesFromPassengers(label: string) {
    const destination = collected.destination ?? "";
    const parsed = extractHeroChatDates(destination, lang);

    appendMessages(createChatMessage("user", label));
    setCollected((prev) => ({ ...prev, passengers: label }));

    if (parsed.precision === "exact") {
      appendMessages(
        createChatMessage(
          "ai",
          skyMessageWithVars(t("heroChat.stepDates.exact" as never), { dates: parsed.label }),
        ),
      );
      setCollected((prev) => ({ ...prev, dates: parsed.label, passengers: label }));
      startFlightSearch(parsed.label);
      return;
    }

    if (parsed.precision === "vague") {
      appendMessages(
        createChatMessage(
          "ai",
          skyMessageWithVars(t("heroChat.stepDates.vague" as never), { period: parsed.label }),
          { offerDatePicker: true },
        ),
      );
      setCollected((prev) => ({ ...prev, dates: parsed.label }));
      setStep("dates");
      return;
    }

    appendMessages(
      createChatMessage("ai", t("heroChat.stepDates.ask" as never), { offerDatePicker: true }),
    );
    setStep("dates");
  }

  function handleToggleDatePicker() {
    setShowDatePicker((open) => {
      const next = !open;
      if (next) clearDatePickerOffers();
      return next;
    });
    scrollToBottom();
  }

  function handleDateSelect(_id: string, label: string) {
    advanceFromDates(label);
  }

  function handleDateRangeConfirm(label: string) {
    advanceFromDates(label);
  }

  function handleOriginSelect(id: string, label: string) {
    if (id === "other") {
      setOriginFreeText(true);
      scrollToBottom();
      inputRef.current?.focus();
      return;
    }
    advanceFromOrigin(label);
  }

  function handleNightsSelect(_id: string, label: string) {
    appendMessages(
      createChatMessage("user", label),
      createChatMessage("ai", t("heroChat.step3.ai" as never)),
    );
    setCollected((prev) => ({ ...prev, nights: label }));
    setStep("origin");
  }

  function handlePassengersSelect(_id: string, label: string) {
    advanceToDatesFromPassengers(label);
  }

  function handleBudgetSelect(_id: string, label: string) {
    appendMessages(
      createChatMessage("user", label),
      createChatMessage("ai", t("heroChat.step6.loading" as never)),
    );
    setCollected((prev) => ({
      ...prev,
      budget: label,
      attachment: attachment ?? prev.attachment,
    }));
    setStep("searching");
  }

  function handleStartPlanning() {
    if (inputDisabled || fileProcessing) return;
    const trimmed = textInput.trim();
    if (!trimmed && !attachment) {
      inputRef.current?.focus();
      return;
    }
    startFlow(trimmed);
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
      case "passengers":
        advanceToDatesFromPassengers(trimmed);
        break;
      case "budget":
        handleBudgetSelect("custom", trimmed);
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

  const showConversationChips =
    conversationStarted &&
    !isSearching &&
    !(step === "origin" && originFreeText);

  const placeholder = chatPlaceholder(t);
  const rotatingPlaceholderItems = useMemo(
    () => [
      placeholder,
      ...HERO_PLACEHOLDER_EXAMPLE_KEYS.map((key) => t(key as never)),
    ],
    [placeholder, t],
  );
  const showRotatingPlaceholder =
    !conversationStarted && !textInput.trim() && !inputDisabled && !fileProcessing;
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
      className="relative z-20 mx-auto mt-10 w-full min-w-0 max-w-2xl text-left pointer-events-auto sm:max-w-3xl"
    >
      {!conversationStarted ? (
        <>
          <form
            onSubmit={handleTextSubmit}
            className="flex min-h-[120px] w-full flex-col rounded-2xl border border-white/25 bg-white/10 p-5 shadow-lg backdrop-blur-md"
          >
            {selectedFilePreview ? (
              <FilePreview
                preview={selectedFilePreview}
                onRemove={clearSelectedFile}
                removeLabel={t("heroChat.removeFile" as never)}
              />
            ) : null}

            {fileError ? (
              <p className="mb-3 text-sm text-red-200" role="alert">
                {fileError}
              </p>
            ) : null}

            <div className="relative min-h-[4.5rem] w-full flex-1">
              <RotatingTextareaPlaceholder
                items={rotatingPlaceholderItems}
                active={showRotatingPlaceholder}
                className="text-base leading-relaxed sm:text-[17px]"
              />
              <textarea
                ref={inputRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                disabled={inputDisabled || fileProcessing}
                autoComplete="off"
                rows={3}
                placeholder={showRotatingPlaceholder ? "" : placeholder}
                aria-label={placeholder}
                className="relative z-10 min-h-[4.5rem] w-full flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-white placeholder:text-white/60 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 sm:text-[17px]"
                style={{ color: "#fff", WebkitTextFillColor: "#fff" }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <AttachmentToolbar
                fileInputRef={fileInputRef}
                onAttachClick={openFilePicker}
                onFileChange={handleFileUpload}
                fileProcessing={fileProcessing}
                attachLabel={t("heroChat.attachFile" as never)}
                processingLabel={t("heroChat.fileProcessing" as never)}
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  aria-label="Voice input (coming soon)"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition-colors hover:text-white/70 disabled:cursor-default"
                >
                  <Mic className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  aria-label={t("heroChat.send" as never)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-md transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            </div>
          </form>

          <HeroCtaArea
            ctaLabel={t("heroChat.startPlanningCta" as never)}
            featureBadges={featureBadges}
            disabled={loading || inputDisabled || fileProcessing || !canSubmit}
            onStartPlanning={handleStartPlanning}
          />
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
        <div
          ref={scrollRef}
          className="mt-6 max-h-[min(420px,50vh)] space-y-3 overflow-x-hidden overflow-y-auto px-1 py-1"
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

          {isSearching && loading ? (
            <div className="flex items-center gap-2 pl-10 text-sm text-white/80">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            </div>
          ) : null}

          {!loading && searchError ? (
            <div className="hero-sky-enter pl-10 pr-1">
              <p className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {searchError.startsWith("heroSearch.") ||
                searchError.startsWith("error.")
                  ? t(searchError as never)
                  : searchError}
              </p>
            </div>
          ) : null}

          {!loading && flights.length > 0 ? (
            <div className="hero-sky-enter space-y-3 pl-0 pr-1 sm:pl-10">
              {flights.map((flight) => (
                <FlightCard key={flight.id} flight={flight} />
              ))}
            </div>
          ) : null}

          {showConversationChips && step === "passengers" ? (
            <QuickReplyChips
              disabled={loading}
              options={PASSENGER_CHIP_IDS.map((id) => ({
                id,
                label: chipLabel("heroChat.passengers", id),
              }))}
              onSelect={handlePassengersSelect}
            />
          ) : null}

          {showConversationChips && step === "dates" && !showDatePicker ? (
            <>
              <QuickReplyChips
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
            </>
          ) : null}

          {showDatePicker && step === "dates" ? (
            <div className="hero-chips-enter space-y-2 pl-0 sm:pl-2">
              <HeroDateRangeCalendar
                lang={lang}
                confirmLabel={t("heroChat.confirm" as never)}
                disabled={loading}
                onConfirm={handleDateRangeConfirm}
              />
              <div className="pl-10">
                <PickExactDatesButton
                  label={t("heroChat.pickExactDates" as never)}
                  disabled={loading}
                  onClick={handleToggleDatePicker}
                />
              </div>
            </div>
          ) : null}

          {showConversationChips && step === "nights" && !isFlightsOnly ? (
            <QuickReplyChips
              disabled={loading}
              options={NIGHT_CHIP_IDS.map((id) => ({
                id,
                label: chipLabel("heroChat.nights", id),
              }))}
              onSelect={handleNightsSelect}
            />
          ) : null}

          {showConversationChips && step === "origin" ? (
            <QuickReplyChips
              disabled={loading}
              options={ORIGIN_CHIP_IDS.map((id) => ({
                id,
                label: chipLabel("heroChat.origin", id),
              }))}
              onSelect={handleOriginSelect}
            />
          ) : null}

          {showConversationChips && step === "budget" && !isFlightsOnly ? (
            <QuickReplyChips
              disabled={loading}
              options={BUDGET_CHIP_IDS.map((id) => ({
                id,
                label: chipLabel("heroChat.budget", id),
              }))}
              onSelect={handleBudgetSelect}
            />
          ) : null}
        </div>
      ) : null}

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
