import { useEffect, useRef, useState } from "react";
import { Plane, Hotel, Route, ArrowLeftRight, Search, ChevronDown, Calendar as CalendarIcon, Users, Minus, Plus, BedDouble, Info, Car, Bus, TrainFront } from "lucide-react";
import type { GroundTransportMode } from "@/lib/aiPlan.functions";
import { groundTransportLabel } from "@/lib/groundTransport";
import { format, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { AirportAutocomplete } from "@/components/AirportAutocomplete";
import { TravelAccessoriesBar } from "@/components/TravelAccessoriesBar";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useI18n } from "@/lib/i18n";
import { formatTravellersSummary } from "@/lib/travellersFormat";

export type Tab = "flights" | "stays" | "ai";
export type CabinClass = "economy" | "premium" | "business" | "first";

type TripTypeUi = "Return" | "One-way" | "Multi-city";

function tripTypeFromSearchValues(tripType?: SearchValues["tripType"]): TripTypeUi {
  if (tripType === "multicity") return "Multi-city";
  if (tripType === "oneway") return "One-way";
  return "Return";
}

/** Round-trip dates everywhere except explicit one-way flights. */
function showReturnDateField(tab: Tab, tripType: TripTypeUi): boolean {
  if (tab === "stays" || tab === "ai") return true;
  return tripType === "Return";
}

export type SearchValues = {
  mode: Tab;
  from: string;
  to: string;
  departDate: string;
  returnDate: string;
  /** Flights: return vs one-way vs multi-city — drives API slice count */
  tripType?: "return" | "oneway" | "multicity";
  /** Multi-city legs (open-jaw). When set, overrides classic from/to/returnDate for search. */
  slices?: Array<{ from: string; to: string; departDate: string }>;
  /** Total travellers (adults + children) — kept for backward compatibility */
  pax: number;
  language?: string;
  currency?: "EUR" | "USD";
  /** Free-text destination for Stays-only search */
  destination?: string;
  /** AI planner — origin/destination places and ground transport mode */
  originPlace?: string;
  destinationPlace?: string;
  groundTransportMode?: GroundTransportMode;
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
  onValuesChange,
  loading,
  initialValues,
}: {
  onSearch?: (v: SearchValues) => void;
  /** Called whenever any field changes — used for localStorage draft persistence. */
  onValuesChange?: (v: SearchValues) => void;
  loading?: boolean;
  initialValues?: SearchValues | null;
}) {
  const { t, lang, currency } = useI18n();
  const [tab, setTab] = useState<Tab>("flights");
  const [tripType, setTripType] = useState<"Return" | "One-way" | "Multi-city">("Return");
  const [tripTypeOpen, setTripTypeOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [leg2From, setLeg2From] = useState("");
  const [leg2To, setLeg2To] = useState("");
  const [leg2Date, setLeg2Date] = useState("");
  const [leg2DateOpen, setLeg2DateOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [originPlace, setOriginPlace] = useState("");
  const [destinationPlace, setDestinationPlace] = useState("");
  const [groundTransportMode, setGroundTransportMode] = useState<GroundTransportMode>("car");
  const [transportModeOpen, setTransportModeOpen] = useState(false);

  // Flights traveller state
  const [adults, setAdults] = useState(1);
  const [cabinClass, setCabinClass] = useState<CabinClass>("economy");

  // Stays traveller state
  const [stayAdults, setStayAdults] = useState(2);
  const [childrenAges, setChildrenAges] = useState<number[]>([]);
  const [rooms, setRooms] = useState(1);

  // Controlled popover open states for Skyscanner-style auto-advance
  const [dateOpen, setDateOpen] = useState(false);
  const [travellersOpen, setTravellersOpen] = useState(false);
  const skipValuesEmit = useRef(true);

  // AI planner always uses round-trip dates (no one-way toggle in that tab).
  useEffect(() => {
    if (tab === "ai" && tripType !== "Return") {
      setTripType("Return");
    }
  }, [tab, tripType]);

  function buildSearchValues(): SearchValues {
    const isStays = tab === "stays";
    const isMulticity = tripType === "Multi-city";
    const isReturn = showReturnDateField(tab, tripType);
    const pax = isStays ? stayAdults + childrenAges.length : adults + childrenAges.length;
    const slices =
      isMulticity && leg2From && leg2To && leg2Date
        ? [
            { from, to, departDate },
            { from: leg2From, to: leg2To, departDate: leg2Date },
          ]
        : undefined;
    return {
      mode: tab,
      from: tab === "ai" ? originPlace : from,
      to: tab === "ai" ? destinationPlace : to,
      departDate,
      returnDate: isReturn ? returnDate : isMulticity ? leg2Date : "",
      tripType:
        tab === "ai"
          ? "return"
          : isMulticity
            ? "multicity"
            : isReturn
              ? "return"
              : "oneway",
      slices,
      pax,
      language: lang,
      currency,
      destination: isStays ? destination : undefined,
      originPlace: tab === "ai" ? originPlace : undefined,
      destinationPlace: tab === "ai" ? destinationPlace : undefined,
      groundTransportMode: tab === "ai" ? groundTransportMode : undefined,
      adults,
      children: childrenAges.length,
      cabinClass,
      stayAdults,
      childrenAges,
      rooms,
    };
  }

  useEffect(() => {
    skipValuesEmit.current = true;
    if (!initialValues) {
      setFrom("");
      setTo("");
      setDepartDate("");
      setReturnDate("");
      setDestination("");
      setOriginPlace("");
      setDestinationPlace("");
      setGroundTransportMode("car");
      setTripType("Return");
      setLeg2From("");
      setLeg2To("");
      setLeg2Date("");
      setAdults(1);
      setCabinClass("economy");
      setStayAdults(2);
      setChildrenAges([]);
      setRooms(1);
      return;
    }
    setFrom(initialValues.from);
    setTo(initialValues.to);
    setDepartDate(initialValues.departDate ?? "");
    setReturnDate(initialValues.returnDate ?? "");
    if (initialValues.tripType === "multicity" && initialValues.slices?.length) {
      setTripType("Multi-city");
      const leg1 = initialValues.slices[0];
      if (leg1) {
        setFrom(leg1.from);
        setTo(leg1.to);
        setDepartDate(leg1.departDate);
      }
      const leg2 = initialValues.slices[1];
      if (leg2) {
        setLeg2From(leg2.from);
        setLeg2To(leg2.to);
        setLeg2Date(leg2.departDate);
      }
    } else {
      setTripType(
        initialValues.mode === "ai"
          ? "Return"
          : tripTypeFromSearchValues(initialValues.tripType),
      );
    }
    if (initialValues.destination) setDestination(initialValues.destination);
    if (initialValues.originPlace) setOriginPlace(initialValues.originPlace);
    if (initialValues.destinationPlace) setDestinationPlace(initialValues.destinationPlace);
    if (initialValues.groundTransportMode) setGroundTransportMode(initialValues.groundTransportMode);
    if (initialValues.mode) setTab(initialValues.mode);
    if (typeof initialValues.adults === "number") setAdults(initialValues.adults);
    if (initialValues.childrenAges) setChildrenAges(initialValues.childrenAges);
    else if (typeof initialValues.children === "number" && initialValues.children > 0) {
      setChildrenAges(Array(initialValues.children).fill(8));
    }
    if (initialValues.cabinClass) setCabinClass(initialValues.cabinClass);
    if (typeof initialValues.stayAdults === "number") setStayAdults(initialValues.stayAdults);
    if (initialValues.childrenAges) setChildrenAges(initialValues.childrenAges);
    if (typeof initialValues.rooms === "number") setRooms(initialValues.rooms);
  }, [initialValues]);

  useEffect(() => {
    if (!onValuesChange) return;
    if (skipValuesEmit.current) {
      skipValuesEmit.current = false;
      return;
    }
    onValuesChange(buildSearchValues());
  }, [
    onValuesChange,
    tab,
    tripType,
    from,
    to,
    departDate,
    returnDate,
    leg2From,
    leg2To,
    leg2Date,
    destination,
    originPlace,
    destinationPlace,
    groundTransportMode,
    adults,
    cabinClass,
    stayAdults,
    childrenAges,
    rooms,
    lang,
    currency,
  ]);

  function handleSearch() {
    onSearch?.(buildSearchValues());
  }

  const tripTypeLabel =
    tripType === "Return" ? t("trip.return") : tripType === "One-way" ? t("trip.oneway") : t("trip.multicity");

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
            <Route className="h-4 w-4 shrink-0" /> {t("tab.ai")}
          </TabButton>
        </div>

        <div className="flex items-center gap-2">

          {tab !== "stays" && tab !== "ai" && (
            <Popover open={tripTypeOpen} onOpenChange={setTripTypeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
                >
                  {tripTypeLabel}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1">
                {(["Return", "One-way", "Multi-city"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setTripType(opt);
                      setTripTypeOpen(false);
                      if (opt === "One-way") setReturnDate("");
                      if (opt === "Multi-city") {
                        setReturnDate("");
                        if (!leg2To && from) setLeg2To(from);
                      }
                    }}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      tripType === opt ? "bg-brand-soft text-brand font-semibold" : "hover:bg-muted",
                    )}
                  >
                    {opt === "Return" ? t("trip.return") : opt === "One-way" ? t("trip.oneway") : t("trip.multicity")}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
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
      ) : tab === "ai" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_1fr_minmax(15rem,1.25fr)_1fr_auto] gap-x-3 gap-y-3 items-stretch">
          <AirportAutocomplete
            label={t("field.originPlace" as never) as string}
            placeholder={t("field.originPlacePlaceholder" as never) as string}
            value={originPlace}
            onChange={setOriginPlace}
            kind="place"
          />
          <AirportAutocomplete
            label={t("field.destinationPlace" as never) as string}
            placeholder={t("field.destinationPlacePlaceholder" as never) as string}
            value={destinationPlace}
            onChange={setDestinationPlace}
            kind="place"
          />
          <TransportModeField
            value={groundTransportMode}
            onChange={setGroundTransportMode}
            open={transportModeOpen}
            onOpenChange={setTransportModeOpen}
          />
          <DateField
            departDate={departDate}
            returnDate={returnDate}
            showReturn={showReturnDateField("ai", tripType)}
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
            childrenAges={childrenAges}
            onChildrenAges={setChildrenAges}
            cabinClass={cabinClass}
            onCabinClass={setCabinClass}
            open={travellersOpen}
            onOpenChange={setTravellersOpen}
          />
          <SearchButton onClick={handleSearch} loading={loading} label={ctaLabel} loadingLabel={loadingLabel} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_minmax(15rem,1.4fr)_1fr_auto] gap-x-3 gap-y-3 items-stretch">
          <AirportAutocomplete
            label={t("field.from")}
            placeholder={t("field.fromPlaceholder")}
            value={from}
            onChange={setFrom}
          />
          <div className="relative">
            <AirportAutocomplete
              label={t("field.to")}
              placeholder={t("field.toPlaceholder")}
              value={to}
              onChange={setTo}
            />
            {tripType !== "Multi-city" && (
              <button
                aria-label={t("search.swapAirports")}
                onClick={() => {
                  const a = from;
                  setFrom(to);
                  setTo(a);
                }}
                className="hidden lg:flex absolute -left-6 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:shadow-md transition-shadow"
              >
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          <DateField
            departDate={departDate}
            returnDate={returnDate}
            showReturn={showReturnDateField("flights", tripType)}
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
            childrenAges={childrenAges}
            onChildrenAges={setChildrenAges}
            cabinClass={cabinClass}
            onCabinClass={setCabinClass}
            open={travellersOpen}
            onOpenChange={setTravellersOpen}
          />

          <SearchButton onClick={handleSearch} loading={loading} label={ctaLabel} loadingLabel={loadingLabel} />

          {tripType === "Multi-city" && (
            <>
              <p className="lg:col-span-5 text-xs font-medium text-muted-foreground -mt-1 mb-0.5">
                {t("multicity.returnLeg")}
              </p>
              <AirportAutocomplete
                label={t("field.from")}
                placeholder={t("field.fromPlaceholder")}
                value={leg2From}
                onChange={setLeg2From}
              />
              <AirportAutocomplete
                label={t("field.to")}
                placeholder={t("field.toPlaceholder")}
                value={leg2To}
                onChange={setLeg2To}
              />
              <SingleDateField
                label={t("field.depart")}
                value={leg2Date}
                onChange={setLeg2Date}
                open={leg2DateOpen}
                onOpenChange={setLeg2DateOpen}
                minDate={departDate ? parseISO(departDate) : undefined}
              />
              <div className="hidden lg:block" aria-hidden />
              <div className="hidden lg:block" aria-hidden />
            </>
          )}
        </div>
      )}

      <TravelAccessoriesBar />
    </div>
  );
}

const TRANSPORT_MODE_OPTIONS: {
  key: GroundTransportMode;
  icon: typeof Car;
}[] = [
  { key: "car", icon: Car },
  { key: "motorhome", icon: Bus },
  { key: "train", icon: TrainFront },
];

function TransportModeField({
  value,
  onChange,
  open,
  onOpenChange,
}: {
  value: GroundTransportMode;
  onChange: (v: GroundTransportMode) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const { t, lang, currency } = useI18n();
  const current = TRANSPORT_MODE_OPTIONS.find((o) => o.key === value) ?? TRANSPORT_MODE_OPTIONS[0]!;
  const Icon = current.icon;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-2xl border border-border bg-background/60 px-4 py-3 hover:border-brand/40 transition-colors text-left w-full h-full"
        >
          <div className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
            {t("field.transportMode" as never) as string}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {groundTransportLabel(value, lang)}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {TRANSPORT_MODE_OPTIONS.map((opt) => {
          const OptIcon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                onChange(opt.key);
                onOpenChange?.(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                value === opt.key ? "bg-brand-soft text-brand font-semibold" : "hover:bg-muted",
              )}
            >
              <OptIcon className="h-4 w-4" />
              {groundTransportLabel(opt.key, lang)}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
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
        <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 hover:border-brand/40 transition-colors cursor-pointer min-w-0 w-full">
          <div className={cn("grid gap-2 min-w-0", showReturn ? "grid-cols-2" : "grid-cols-1")}>
            {showReturn ? (
              <>
                <SummaryCell
                  label={labelA}
                  value={departSel}
                  placeholder={t("field.selectDate")}
                  onClick={() => handleTriggerClick("from")}
                  active={focusSide === "from"}
                />
                <div className="border-l border-border pl-3 min-w-0">
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

function SingleDateField({
  label,
  value,
  onChange,
  open,
  onOpenChange,
  minDate,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  minDate?: Date;
}) {
  const { t } = useI18n();
  const selected = value ? parseISO(value) : undefined;
  const earliest = startOfDay(minDate ?? new Date());

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-full rounded-2xl border border-border bg-background/60 px-4 py-3 hover:border-brand/40 transition-colors focus:outline-none focus:border-brand focus:bg-card text-left group"
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
          onSelect={(d) => {
            if (d) {
              onChange(format(d, "yyyy-MM-dd"));
              onOpenChange?.(false);
            }
          }}
          disabled={{ before: earliest }}
          defaultMonth={selected ?? earliest}
          showOutsideDays={false}
          initialFocus
          className="p-3 pointer-events-auto"
        />
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
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label={t("common.decrease")}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-6 text-center font-semibold text-foreground tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label={t("common.increase")}
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
  childrenAges,
  onChildrenAges,
  cabinClass,
  onCabinClass,
  open,
  onOpenChange,
}: {
  adults: number;
  onAdults: (n: number) => void;
  childrenAges: number[];
  onChildrenAges: (a: number[]) => void;
  cabinClass: CabinClass;
  onCabinClass: (c: CabinClass) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const { t, lang, currency } = useI18n();

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
            {t("field.travellers")}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            {formatTravellersSummary(lang, adults, childrenAges.length)}
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
            <Stepper value={childrenAges.length} onChange={setChildCount} min={0} max={8} />
          </div>

          {childrenAges.length > 0 && (
            <div className="space-y-2 pl-1">
              {childrenAges.map((age, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="text-sm text-foreground">
                    {t("trav.child")} {i + 1}
                  </div>
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
