import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  GlassWater,
  Luggage,
  Plane,
  Ship,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import type { ResortStay } from "@/lib/aiPlan.functions";
import type { TripFlightContext } from "@/lib/flightScheduling";
import type { HotelStayDates } from "@/lib/hotelStayDates";
import { packageGalleryImages } from "@/lib/hotelImages";
import {
  packageBookingHref,
  RESORT_COVER_FALLBACKS,
  type PackageMealPlan,
  type PackageTransferKind,
  type ResortPackage,
} from "@/lib/resortPackage";
import { SharePlanButton } from "@/components/SharePlanButton";
import { SingleBaseStayView } from "@/components/SingleBaseStayView";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useI18n } from "@/lib/i18n";
import { formatPaxCountPhrase, stayNightsPhrase } from "@/lib/slovenePax";
import { cn } from "@/lib/utils";

function mealPlanLabel(plan: PackageMealPlan, t: (key: never) => string): string {
  return plan === "all_inclusive"
    ? t("aiplan.package.mealAllInclusive" as never)
    : t("aiplan.package.mealBreakfast" as never);
}

function tierLabel(tier: ResortPackage["tier"], mealPlan: PackageMealPlan, t: (key: never) => string): string | null {
  if (tier === "value") return t("aiplan.package.tierValue" as never);
  if (tier === "recommended") return t("aiplan.package.tierRecommended" as never);
  if (tier === "all_inclusive" || tier === "all_inclusive_alt") {
    return t("aiplan.package.tierAllInclusive" as never);
  }
  if (tier === "boutique") return t("aiplan.package.tierBoutique" as never);
  if (tier === "premium") {
    return mealPlan === "all_inclusive"
      ? t("aiplan.package.tierPremiumAi" as never)
      : t("aiplan.package.tierPremium" as never);
  }
  return null;
}

function bookingHrefFor(
  pkg: ResortPackage,
  flightStay?: HotelStayDates,
): string | undefined {
  return packageBookingHref({
    destination: pkg.destinationLabel || pkg.title,
    hotelName: pkg.title,
    checkIn: pkg.checkIn,
    checkOut: pkg.checkOut,
    hotelCheckIn: flightStay?.checkIn,
    hotelCheckOut: flightStay?.checkOut,
    adults: pkg.adults,
    rooms: pkg.rooms,
    childrenAges: pkg.childrenAges,
  });
}

function transferLabel(kind: PackageTransferKind, t: (key: never) => string): string {
  if (kind === "seaplane") return t("aiplan.package.transferSeaplane" as never);
  if (kind === "speedboat") return t("aiplan.package.transferSpeedboat" as never);
  if (kind === "van") return t("aiplan.package.transferVan" as never);
  return t("aiplan.package.transferGeneric" as never);
}

function PackageGallery({
  pkg,
  onOpen,
  bookingHref,
}: {
  pkg: ResortPackage;
  onOpen: () => void;
  bookingHref?: string;
}) {
  const { t } = useI18n();
  const images = packageGalleryImages({
    images: pkg.images,
    coverImageUrl: pkg.coverImageUrl,
    fallbacks: RESORT_COVER_FALLBACKS,
  });
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const skipOpenRef = useRef(false);
  const count = images.length;
  const multi = count > 1;
  const index = count ? ((currentImageIndex % count) + count) % count : 0;
  const src = images[index] ?? RESORT_COVER_FALLBACKS[0];
  const galleryKey = images.join("|");

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [pkg.id, galleryKey]);

  const go = (delta: number) => {
    if (!multi) return;
    setCurrentImageIndex((i) => (i + delta + count) % count);
  };

  const stopCard = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      className="group relative aspect-video w-full overflow-hidden rounded-t-2xl"
      onPointerDown={(e) => {
        if (multi) e.stopPropagation();
      }}
      onTouchStart={(e) => {
        if (!multi) return;
        e.stopPropagation();
        const touch = e.touches[0];
        if (!touch) return;
        swipeRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(e) => {
        if (!multi || !swipeRef.current) return;
        const touch = e.touches[0];
        if (!touch) return;
        const dx = touch.clientX - swipeRef.current.x;
        const dy = touch.clientY - swipeRef.current.y;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          e.stopPropagation();
        }
      }}
      onTouchEnd={(e) => {
        if (!multi || !swipeRef.current) return;
        const touch = e.changedTouches[0];
        const start = swipeRef.current;
        swipeRef.current = null;
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        skipOpenRef.current = true;
        go(dx < 0 ? 1 : -1);
      }}
    >
      {bookingHref ? (
        <a
          href={bookingHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (skipOpenRef.current) {
              skipOpenRef.current = false;
              e.preventDefault();
            }
          }}
          className="absolute inset-0 z-0 text-left"
          aria-label={`${pkg.title}. ${t("aiplan.package.bookResort" as never)}`}
        >
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={(e) => {
              const fallback = RESORT_COVER_FALLBACKS.find((url) => url !== src);
              if (fallback) e.currentTarget.src = fallback;
            }}
          />
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (skipOpenRef.current) {
              skipOpenRef.current = false;
              return;
            }
            onOpen();
          }}
          className="absolute inset-0 z-0 text-left"
          aria-label={`${pkg.title}. ${t("aiplan.package.openDetails" as never)}`}
        >
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={(e) => {
              const fallback = RESORT_COVER_FALLBACKS.find((url) => url !== src);
              if (fallback) e.currentTarget.src = fallback;
            }}
          />
        </button>
      )}
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/55 via-black/15 to-transparent"
        aria-hidden
      />

      {pkg.destinationLabel ? (
        <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-800 shadow-sm">
          {pkg.destinationLabel}
        </span>
      ) : null}
      {typeof pkg.guestScore === "number" && pkg.guestScore > 0 ? (
        <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
          <Star className="h-3 w-3 fill-white" aria-hidden />
          {pkg.guestScore.toFixed(1)}
          {pkg.guestScoreLabel?.trim() ? ` ${pkg.guestScoreLabel.trim()}` : ""}
        </span>
      ) : null}

      {multi ? (
        <>
          <button
            type="button"
            aria-label={t("aiplan.package.prevPhoto" as never)}
            className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-70 shadow-sm backdrop-blur-[2px] transition-opacity hover:bg-black/55 md:opacity-0 md:group-hover:opacity-100"
            onClick={(e) => {
              stopCard(e);
              go(-1);
            }}
            onPointerDown={stopCard}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t("aiplan.package.nextPhoto" as never)}
            className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-70 shadow-sm backdrop-blur-[2px] transition-opacity hover:bg-black/55 md:opacity-0 md:group-hover:opacity-100"
            onClick={(e) => {
              stopCard(e);
              go(1);
            }}
            onPointerDown={stopCard}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div
            className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-1.5"
            role="tablist"
            aria-label={t("aiplan.package.photoOf" as never)
              .replace("{n}", String(index + 1))
              .replace("{total}", String(count))}
          >
            {images.map((_, i) => (
              <button
                key={`${images[i]}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}/${count}`}
                className={cn(
                  "h-1.5 rounded-full shadow-sm transition-all",
                  i === index ? "w-4 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80",
                )}
                onClick={(e) => {
                  stopCard(e);
                  setCurrentImageIndex(i);
                }}
                onPointerDown={stopCard}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Badge({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-start gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium leading-snug text-slate-700 sm:text-xs">
      <span className="mt-0.5 shrink-0 text-sky-700">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

export type PackageShareContext = {
  plan: AiTripPlan;
  from?: string;
  to?: string;
  depart?: string;
  returnDate?: string;
  guests?: number;
  style?: string;
};

export function PackageCard({
  pkg,
  selected = false,
  onOpen,
  flightStay,
  share,
}: {
  pkg: ResortPackage;
  selected?: boolean;
  onOpen: () => void;
  flightStay?: HotelStayDates;
  share?: PackageShareContext;
}) {
  const { t, formatMoney, lang } = useI18n();
  const bookingHref = bookingHrefFor(pkg, flightStay);
  const flightLine =
    pkg.originIata && pkg.destinationIata
      ? t("aiplan.package.flightIncluded" as never)
          .replace("{from}", pkg.originIata)
          .replace("{to}", pkg.destinationIata)
      : t("aiplan.package.flightIncludedShort" as never);
  const tier = tierLabel(pkg.tier, pkg.mealPlan, t);

  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300",
        selected
          ? "border-sky-400 shadow-md ring-2 ring-sky-200"
          : "border-slate-200 hover:-translate-y-0.5 hover:shadow-lg",
      )}
    >
      <PackageGallery pkg={pkg} onOpen={onOpen} bookingHref={bookingHref} />

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {tier ? (
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">{tier}</p>
        ) : null}
        <h3 className="text-lg font-bold leading-snug text-slate-900">{pkg.title}</h3>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          <Badge icon={<Plane className="h-3.5 w-3.5" aria-hidden />}>{flightLine}</Badge>
          <Badge
            icon={
              pkg.mealPlan === "all_inclusive" ? (
                <GlassWater className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden />
              )
            }
          >
            {mealPlanLabel(pkg.mealPlan, t)}
          </Badge>
          <Badge icon={<Ship className="h-3.5 w-3.5" aria-hidden />}>
            {transferLabel(pkg.transferKind, t)}
          </Badge>
          {pkg.includesCheckedBag ? (
            <Badge icon={<Luggage className="h-3.5 w-3.5" aria-hidden />}>
              {t("aiplan.package.checkedBag" as never)}
            </Badge>
          ) : null}
        </ul>

        <div className="mt-auto pt-4">
          {pkg.pricePerPersonEur > 0 ? (
            <>
              <p className="text-2xl font-bold tracking-tight text-slate-900">
                {t("aiplan.package.perPerson" as never).replace(
                  "{price}",
                  formatMoney(pkg.pricePerPersonEur),
                )}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                {formatPaxCountPhrase(
                  t("aiplan.package.totalForStay" as never)
                    .replace("{price}", formatMoney(pkg.totalEur))
                    .replace(
                      "{stay}",
                      stayNightsPhrase(Math.max(1, pkg.nights ?? 1), lang),
                    ),
                  pkg.pax,
                )}
              </p>
            </>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700"
          >
            {t("aiplan.package.openDetails" as never)}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          {share ? (
            <div className="mt-2">
              <SharePlanButton
                variant="card"
                plan={share.plan}
                pkg={pkg}
                from={share.from}
                to={share.to}
                depart={share.depart}
                returnDate={share.returnDate}
                guests={share.guests}
                style={share.style}
              />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function PackageDeck({
  packages,
  selectedId,
  onSelect,
  flightStay,
  share,
}: {
  packages: ResortPackage[];
  selectedId?: string;
  onSelect: (id: string) => void;
  flightStay?: HotelStayDates;
  share?: PackageShareContext;
}) {
  if (packages.length === 0) return null;

  const cards = packages.map((pkg) => (
    <PackageCard
      key={pkg.id}
      pkg={pkg}
      selected={pkg.id === selectedId}
      onOpen={() => onSelect(pkg.id)}
      flightStay={flightStay}
      share={share}
    />
  ));

  if (packages.length === 1) {
    return <div className="max-w-md">{cards}</div>;
  }

  return (
    <>
      <div className="md:hidden">
        <Carousel opts={{ align: "start", loop: false }} className="w-full">
          <CarouselContent className="-ml-3">
            {packages.map((pkg) => (
              <CarouselItem key={pkg.id} className="basis-[86%] pl-3">
                <PackageCard
                  pkg={pkg}
                  selected={pkg.id === selectedId}
                  onOpen={() => onSelect(pkg.id)}
                  flightStay={flightStay}
                  share={share}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-1" />
          <CarouselNext className="right-1" />
        </Carousel>
      </div>
      <div className="hidden grid-cols-1 gap-6 md:grid md:grid-cols-2 lg:grid-cols-3">
        {cards}
      </div>
    </>
  );
}

export function PackagePlanDetails({
  stay,
  pkg,
  onDownloadPdf,
  flights,
  flightStay,
}: {
  stay: ResortStay;
  pkg: ResortPackage;
  onDownloadPdf?: () => void;
  flights?: TripFlightContext | null;
  flightStay?: HotelStayDates;
}) {
  const { t } = useI18n();
  const bookingHref = bookingHrefFor(pkg, flightStay);

  return (
    <div className="scroll-mt-24 space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {pkg.flightHref ? (
          <a
            href={pkg.flightHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-100"
          >
            <Plane className="h-4 w-4" aria-hidden />
            {t("aiplan.package.buyFlight" as never)}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
        {bookingHref ? (
          <a
            href={bookingHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            {t("aiplan.package.bookResort" as never)}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
        {onDownloadPdf ? (
          <button
            type="button"
            onClick={onDownloadPdf}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 sm:col-span-2"
          >
            <Download className="h-4 w-4" aria-hidden />
            {t("aiplan.package.downloadPdf" as never)}
          </button>
        ) : null}
      </div>
      <p className="text-sm font-medium text-slate-600">
        {t("aiplan.package.protocolIntro" as never)}
      </p>
      <SingleBaseStayView
        stay={stay}
        destination={{
          destinationIata: pkg.destinationIata,
          destinationName: pkg.destinationLabel,
          destinationPlace: pkg.destinationLabel,
        }}
        flights={flights}
      />
    </div>
  );
}
