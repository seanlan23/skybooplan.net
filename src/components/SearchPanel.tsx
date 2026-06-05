import { useEffect, useState } from "react";
import { Plane, Hotel, Sparkles, ArrowLeftRight, Search, ChevronDown, Calendar as CalendarIcon, Users, Minus, Plus, BedDouble, Info } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { AirportAutocomplete } from "@/components/AirportAutocomplete";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useI18n } from "@/lib/i18n";

export type Tab = "flights" | "stays" | "ai";
export type CabinClass = "economy" | "premium" | "business" | "first";

export type SearchValues = {
  mode: Tab;
  from: string;
  to: string;
  departDate: string;
  returnDate: string;
  /** Total travellers (adults + children) — kept for backward compatibility */
  pax: number;
  language?: string;
  /** Free-text destination for Stays-only search */
  destination?: string;
  /** Flights only */
  adults?: number;
  children?: number;
  cabinClass?: CabinClass;
  /** Stays only */
  stayAdults?: number;
  childrenAges?: number[];
  rooms?: number;
};

export function SearchPanel({
  onSearch,
  loading,
  initialValues,
}: {
  onSearch?: (v: SearchValues) => void;
  loading?: boolean;
  initialValues?: SearchValues | null;
}) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>("flights");
  const [tripType, setTripType] = useState("Return");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [destination, setDestination] = useState("");

  // Flights traveller state
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [cabinClass, setCabinClass] = useState<CabinClass>("economy");

  // Stays traveller state
  const [stayAdults, setStayAdults] = useState(2);
  const [childrenAges, setChildrenAges] = useState<number[]>([]);
  const [rooms, setRooms] = useState(1);

  // Controlled popover open states for Skyscanner-style auto-advance
  const [dateOpen, setDateOpen] = useState(false);
  const [travellersOpen, setTravellersOpen] = useState(false);

  useEffect(() => {
    if (!initialValues) {
      setFrom("");
      setTo("");
      setDepartDate("");
      setReturnDate("");
      setDestination("");
      setTripType("Return");
      setAdults(1);
      setChildren(0);
      setCabinClass("economy");
      setStayAdults(2);
      setChildrenAges([]);
      setRooms(1);
      return;
    }
    setFrom(initialValues.from);
    setTo(initialValues.to);
    setDepartDate(initialValues.departDate);
    setReturnDate(initialValues.returnDate);
    setTripType(initialValues.returnDate ? "Return" : "One-way");
    if (initialValues.destination) setDestination(initialValues.destination);
    if (initialValues.mode) setTab(initialValues.mode);
    if (typeof initialValues.adults === "number") setAdults(initialValues.adults);
    if (typeof initialValues.children === "number") setChildren(initialValues.children);
    if (initialValues.cabinClass) setCabinClass(initialValues.cabinClass);
    if (typeof initialValues.stayAdults === "number") setStayAdults(initialValues.stayAdults);
    if (initialValues.childrenAges) setChildrenAges(initialValues.childrenAges);
    if (typeof initialValues.rooms === "number") setRooms(initialValues.rooms);
  }, [initialValues]);

  function handleSearch() {
    const isStays = tab === "stays";
    const pax = isStays ? stayAdults + childrenAges.length : adults + children;
    onSearch?.({
      mode: tab,
      from,
      to,
      departDate,
      returnDate,
      pax,
      language: lang,
      destination: isStays ? destination : undefined,
      adults,
      children,
      cabinClass,
      stayAdults,
      childrenAges,
      rooms,
    });
  }

  const ctaLabel =
    tab === "stays" ? t("cta.searchStays") : tab === "ai" ? t("cta.generateAi") : t("cta.searchFlights");
  const loadingLabel =
    tab === "stays" ? t("cta.searchingStays") : tab === "ai" ? t("cta.generating") : t("cta.searchingFlights");

  return (
    <div className="w-full rounded-3xl border-2 border-brand/40 bg-card p-5 sm:p-6 shadow-[var(--shadow-search)]">
      {/* Tabs row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton active={tab === "flights"} onClick={() => setTab("flights")} variant="primary">
            <Plane className="h-4 w-4" /> {t("tab.flights")}
          </TabButton>
          <TabButton active={tab === "stays"} onClick={() => setTab("stays")} variant="primary">
            <Hotel className="h-4 w-4" /> {t("tab.stays")}
          </TabButton>
          <TabButton active={tab === "ai"} onClick={() => setTab("ai")} variant="primary">
            <Sparkles className="h-4 w-4" /> {t("tab.ai")}
          </TabButton>
        </div>

        <div className="flex items-center gap-2">

          {tab !== "stays" && (
            <button
              onClick={() => setTripType(tripType === "Return" ? "One-way" : "Return")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
            >
              {tripType === "Return" ? t("trip.return") : t("trip.oneway")}
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Fields row — adapts per tab */}
      {tab === "stays" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-stretch">
          <AirportAutocomplete
            label={t("field.destination")}
            placeholder="npr. Avstrija, Toskana, Bali, Dunaj …"
            value={destination}
            onChange={setDestination}
            kind="place"
          />

          <DateField
            departDate={departDate}
            returnDate={returnDate}
            showReturn
            onDepart={setDepartDate}
            onReturn={setReturnDate}
            checkInOut
            open={dateOpen}
            onOpenChange={setDateOpen}
            onComplete={() => {
              setDateOpen(false);
              setTimeout(() => setTravellersOpen(true), 80);
            }}
          />
          <StaysGuestsField
            adults={stayAdults}
            onAdults={setStayAdults}
            childrenAges={childrenAges}
            onChildrenAges={setChildrenAges}
            rooms={rooms}
            onRooms={setRooms}
            open={travellersOpen}
            onOpenChange={setTravellersOpen}
          />
          <SearchButton onClick={handleSearch} loading={loading} label={ctaLabel} loadingLabel={loadingLabel} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-stretch">
          <AirportAutocomplete label={t("field.from")} placeholder={t("field.fromPlaceholder")} value={from} onChange={setFrom} />
          <div className="relative">
            <AirportAutocomplete label={t("field.to")} placeholder={t("field.toPlaceholder")} value={to} onChange={setTo} />
            <button
              aria-label="Swap"
              onClick={() => {
                const a = from;
                setFrom(to);
                setTo(a);
              }}
              className="hidden lg:flex absolute -left-6 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:shadow-md transition-shadow"
            >
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <DateField
            departDate={departDate}
            returnDate={returnDate}
            showReturn={tripType === "Return"}
            onDepart={setDepartDate}
            onReturn={setReturnDate}
            open={dateOpen}
            onOpenChange={setDateOpen}
            onComplete={() => {
              setDateOpen(false);
              setTimeout(() => setTravellersOpen(true), 80);
            }}
          />

          <FlightsTravellersField
            adults={adults}
            onAdults={setAdults}
            children={children}
            onChildren={setChildren}
            cabinClass={cabinClass}
            onCabinClass={setCabinClass}
            open={travellersOpen}
            onOpenChange={setTravellersOpen}
          />

          <SearchButton onClick={handleSearch} loading={loading} label={ctaLabel} loadingLabel={loadingLabel} />
        </div>
      )}
    </div>
  );
}

function TabButton({
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
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all",
        active && variant === "primary" && "text-primary-foreground shadow-md",
        active && variant === "primary" && "[background:var(--gradient-warm)]",
        active && variant === "default" && "bg-brand text-brand-foreground shadow-md",
        !active && "text-foreground/70 hover:text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 hover:border-brand/40 transition-colors focus-within:border-brand focus-within:bg-card">
      <div className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">{label}</div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />
    </div>
  );
}

function DateField({
  departDate,
  returnDate,
  showReturn,
  onDepart,
  onReturn,
  checkInOut = false,
  open,
  onOpenChange,
  onComplete,
}: {
  departDate: string;
  returnDate: string;
  showReturn: boolean;
  onDepart: (v: string) => void;
  onReturn: (v: string) => void;
  checkInOut?: boolean;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  onComplete?: () => void;
}) {
  const { t } = useI18n();
  const labelA = checkInOut ? t("field.checkin") : t("field.depart");
  const labelB = checkInOut ? t("field.checkout") : t("field.return");
  const departSel = departDate ? parseISO(departDate) : undefined;
  const returnSel = returnDate ? parseISO(returnDate) : undefined;
  // Which side is "active" when user opens the calendar
  const [focusSide, setFocusSide] = useState<"from" | "to">("from");

  const handleRangeDayClick = (day: Date | undefined) => {
    if (!day) return;
    if (!showReturn) {
      onDepart(format(day, "yyyy-MM-dd"));
      onOpenChange?.(false);
      onComplete?.();
      return;
    }

    if (focusSide === "from") {
      // First click always sets departure
      onDepart(format(day, "yyyy-MM-dd"));
      // If existing return is before new depart → clear it
      if (returnDate && parseISO(returnDate) < day) {
        onReturn("");
      }
      setFocusSide("to");
      // keep popover open for return selection
      return;
    }

    // focusSide === "to"
    if (!departSel) {
      // No depart yet — treat as depart click
      onDepart(format(day, "yyyy-MM-dd"));
      setFocusSide("to");
      return;
    }
    if (day < departSel) {
      // Picking an earlier date → restart the range with new depart
      onDepart(format(day, "yyyy-MM-dd"));
      onReturn("");
      setFocusSide("to");
      return;
    }
    onReturn(format(day, "yyyy-MM-dd"));
    onOpenChange?.(false);
    onComplete?.();
  };

  const handleTriggerClick = (side: "from" | "to") => {
    setFocusSide(side);
    onOpenChange?.(true);
  };

  const SummaryCell = ({
    label,
    value,
    placeholder,
    onClick,
    active,
  }: {
    label: string;
    value?: Date;
    placeholder: string;
    onClick: () => void;
    active: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn("w-full text-left group rounded-xl", active && "")}
    >
      <div className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-[15px] font-medium text-foreground">
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand transition-colors" />
        <span className={cn("truncate", !value && "text-muted-foreground/60")}>
          {value ? format(value, "d MMM yyyy") : placeholder}
        </span>
      </div>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 hover:border-brand/40 transition-colors cursor-pointer">
          <div className={cn("grid gap-2", showReturn ? "grid-cols-2" : "grid-cols-1")}>
            {showReturn ? (
              <>
                <SummaryCell
                  label={labelA}
                  value={departSel}
                  placeholder={t("field.selectDate")}
                  onClick={() => handleTriggerClick("from")}
                  active={focusSide === "from"}
                />
                <div className="border-l border-border pl-3">
                  <SummaryCell
                    label={labelB}
                    value={returnSel}
                    placeholder={t("field.selectDate")}
                    onClick={() => handleTriggerClick("to")}
                    active={focusSide === "to"}
                  />
                </div>
              </>
            ) : (
              <SummaryCell
                label={labelA}
                value={departSel}
                placeholder={t("field.selectDate")}
                onClick={() => handleTriggerClick("from")}
                active
              />
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        side="bottom"
        sideOffset={8}
        avoidCollisions={false}
      >
        {showReturn ? (
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={{ from: departSel, to: returnSel }}
            onDayClick={handleRangeDayClick}
            onSelect={() => {
              /* controlled manually via onDayClick */
            }}
            disabled={{ before: new Date() }}
            defaultMonth={departSel ?? new Date()}
            showOutsideDays={false}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        ) : (
          <Calendar
            mode="single"
            selected={departSel}
            onSelect={(d) => {
              if (d) {
                onDepart(format(d, "yyyy-MM-dd"));
                onOpenChange?.(false);
                onComplete?.();
              }
            }}
            disabled={{ before: new Date() }}
            defaultMonth={departSel ?? new Date()}
            showOutsideDays={false}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        )}
      </PopoverContent>
    </Popover>
  );
}



function SearchButton({
  onClick,
  loading,
  label,
  loadingLabel,
}: {
  onClick: () => void;
  loading?: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="h-full min-h-[68px] inline-flex items-center justify-center gap-2 rounded-2xl px-6 font-semibold text-brand-foreground shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ background: "var(--gradient-brand)" }}
    >
      <Search className="h-5 w-5" />
      {loading ? loadingLabel : label}
    </button>
  );
}

function DatePickerCell({
  label,
  value,
  onChange,
  minDate,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minDate?: Date;
}) {
  const { t } = useI18n();
  const selected = value ? parseISO(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full text-left group"
        >
          <div className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">{label}</div>
          <div className="mt-1 flex items-center gap-2 text-[15px] font-medium text-foreground">
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand transition-colors" />
            <span className={cn("truncate", !selected && "text-muted-foreground/60")}>
              {selected ? format(selected, "d MMM yyyy") : t("field.selectDate")}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        side="bottom"
        sideOffset={8}
        avoidCollisions={false}
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          disabled={minDate ? { before: minDate } : undefined}
          defaultMonth={selected ?? minDate ?? new Date()}
          showOutsideDays={false}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Skyscanner-style traveller popovers ---------- */

function Stepper({
  value,
  onChange,
  min = 0,
  max = 9,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Decrease"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-6 text-center font-semibold text-foreground tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Increase"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

const CABIN_KEY: Record<CabinClass, "cabin.economy" | "cabin.premium" | "cabin.business" | "cabin.first"> = {
  economy: "cabin.economy",
  premium: "cabin.premium",
  business: "cabin.business",
  first: "cabin.first",
};

function FlightsTravellersField({
  adults,
  onAdults,
  children,
  onChildren,
  cabinClass,
  onCabinClass,
  open,
  onOpenChange,
}: {
  adults: number;
  onAdults: (n: number) => void;
  children: number;
  onChildren: (n: number) => void;
  cabinClass: CabinClass;
  onCabinClass: (c: CabinClass) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const { t } = useI18n();
  const total = adults + children;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-2xl border border-border bg-background/60 px-4 py-3 hover:border-brand/40 transition-colors text-left w-full"
        >
          <div className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
            {t("field.travellers")}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            {total} {total === 1 ? t("trav.adult") : t("trav.people")}
          </div>
          <div className="text-xs text-muted-foreground truncate">{t(CABIN_KEY[cabinClass])}</div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-5" align="end" side="bottom" sideOffset={8} avoidCollisions={false}>
        <div className="space-y-5">
          {/* Cabin class */}
          <div>
            <div className="text-sm font-semibold text-foreground mb-2">{t("trav.cabinClass")}</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CABIN_KEY) as CabinClass[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onCabinClass(c)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-medium transition-colors text-center",
                    cabinClass === c
                      ? "bg-sky-500 text-white border-sky-500"
                      : "bg-card text-foreground border-border hover:border-sky-300",
                  )}
                >
                  {t(CABIN_KEY[c])}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{t("trav.cabinNote")}</span>
            </div>
          </div>

          {/* Adults */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">{t("trav.adults")}</div>
              <div className="text-xs text-muted-foreground">{t("trav.adultsAge")}</div>
            </div>
            <Stepper value={adults} onChange={onAdults} min={1} max={9} />
          </div>

          {/* Children */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">{t("trav.children")}</div>
              <div className="text-xs text-muted-foreground">{t("trav.childrenAge")}</div>
            </div>
            <Stepper value={children} onChange={onChildren} min={0} max={8} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StaysGuestsField({
  adults,
  onAdults,
  childrenAges,
  onChildrenAges,
  rooms,
  onRooms,
  open,
  onOpenChange,
}: {
  adults: number;
  onAdults: (n: number) => void;
  childrenAges: number[];
  onChildrenAges: (a: number[]) => void;
  rooms: number;
  onRooms: (n: number) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const { t } = useI18n();
  const total = adults + childrenAges.length;

  function setChildCount(n: number) {
    const clamped = Math.max(0, Math.min(8, n));
    if (clamped > childrenAges.length) {
      onChildrenAges([...childrenAges, ...Array(clamped - childrenAges.length).fill(8)]);
    } else {
      onChildrenAges(childrenAges.slice(0, clamped));
    }
  }
  function setChildAge(idx: number, age: number) {
    onChildrenAges(childrenAges.map((a, i) => (i === idx ? age : a)));
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-2xl border border-border bg-background/60 px-4 py-3 hover:border-brand/40 transition-colors text-left w-full"
        >
          <div className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
            {t("field.guests")}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            {total} {total === 1 ? t("trav.guest") : t("trav.guestsPlural")}
          </div>
          <div className="text-xs text-muted-foreground truncate">{rooms} {rooms === 1 ? t("trav.room") : t("trav.roomsPlural")}</div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-5" align="end" side="bottom" sideOffset={8} avoidCollisions={false}>
        <div className="space-y-5">
          {/* Adults */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">{t("trav.adults")}</div>
              <div className="text-xs text-muted-foreground">{t("trav.adultsAge")}</div>
            </div>
            <Stepper value={adults} onChange={onAdults} min={1} max={16} />
          </div>

          {/* Children */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">{t("trav.children")}</div>
              <div className="text-xs text-muted-foreground">{t("trav.childrenAge")}</div>
            </div>
            <Stepper value={childrenAges.length} onChange={setChildCount} min={0} max={8} />
          </div>

          {/* Per-child age selectors */}
          {childrenAges.length > 0 && (
            <div className="space-y-2 pl-1">
              {childrenAges.map((age, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="text-sm text-foreground">{t("trav.child")} {i + 1}</div>
                  <select
                    value={age}
                    onChange={(e) => setChildAge(i, Number(e.target.value))}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                    aria-label={`${t("trav.ageOf")} ${i + 1}`}
                  >
                    {Array.from({ length: 18 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? t("trav.under1") : `${n} ${n === 1 ? t("trav.year") : t("trav.years")}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Rooms */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-semibold text-foreground">{t("trav.rooms")}</div>
                <div className="text-xs text-muted-foreground">{t("trav.roomsDesc")}</div>
              </div>
            </div>
            <Stepper value={rooms} onChange={onRooms} min={1} max={8} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
