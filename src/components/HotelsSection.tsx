import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Hotel, Loader2, MapPin, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  buildBookingSearchUrl,
  toBookingClickHref,
  resolveHotelBookingUrl,
} from "@/lib/bookingUrl";
import { bookingNfltFor } from "@/lib/hotelAmenities";
import { searchHotels } from "@/lib/hotels.functions";
import { hotelCapitalFallback, hotelSearchQueryAlias } from "@/lib/hotelDestinationPick";
import type { StayIntentFilters } from "@/lib/stayIntent";
import { selectHotelSource } from "@/lib/hotelSelection";
import { interpolate } from "@/lib/interpolate";
import { formatLocalDate } from "@/lib/dateUtils";
import {
  applyHotelFilters,
  LOCAL_AMENITY_KEYS,
  perNightPrice,
  priceExtent,
  priceHistogram,
  reviewBand,
  sortHotels,
  stayNights,
  type HotelResultSort,
} from "@/lib/hotelResults";

export type StayInfo = {
  adults: number;
  childrenAges?: number[];
  rooms: number;
};

function BookingLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const safeHref = toBookingClickHref(href);

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      {children}
    </a>
  );
}

function BookingCta({
  href,
  label,
  size = "compact",
}: {
  href: string;
  label: string;
  size?: "compact" | "hero";
}) {
  return (
    <BookingLink
      href={href}
      className={
        size === "hero"
          ? "inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0071c2] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#005999]"
          : "inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#0071c2] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#005999] sm:w-auto"
      }
    >
      {label}
      <ExternalLink className={size === "hero" ? "h-4 w-4" : "h-3 w-3"} />
    </BookingLink>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Star key={i} className="h-3 w-3 fill-current" />
      ))}
    </span>
  );
}

const EMPTY_POPULAR = {
  breakfast: false,
  allInclusive: false,
  balcony: false,
  hotel: false,
  apartment: false,
  cabin: false,
  nature: false,
  jacuzzi: false,
  pool: false,
  parking: false,
  freeCancel: false,
};

export function HotelsSection({
  city,
  checkIn,
  checkOut,
  stayInfo,
  regionFallback,
  initialFilters,
  bookingFirst = false,
}: {
  city: string;
  checkIn: string;
  checkOut?: string;
  stayInfo?: StayInfo;
  regionFallback?: string;
  /** Pre-check popular filters from hero text ("koča z jacuzzijem"). */
  initialFilters?: StayIntentFilters;
  /** Hero stays: Booking link is the product; RapidAPI cards are optional. */
  bookingFirst?: boolean;
}) {
  const { t, lang } = useI18n();
  const aid = import.meta.env.VITE_BOOKING_AFFILIATE_ID || "";

  const adults = stayInfo?.adults ?? 2;
  const rooms = stayInfo?.rooms ?? 1;
  const childrenAges = stayInfo?.childrenAges ?? [];
  const guests = adults + childrenAges.length;
  const nights = stayNights(checkIn, checkOut);

  const bookingBase = useMemo(
    () => ({
      checkIn,
      checkOut,
      adults,
      rooms,
      childrenAges,
      affiliateId: aid || undefined,
    }),
    [checkIn, checkOut, adults, rooms, childrenAges, aid],
  );

  const [sort, setSort] = useState<HotelResultSort>(bookingFirst ? "top" : "priceAsc");
  const [minRating, setMinRating] = useState(0);
  const [starFilter, setStarFilter] = useState<number[]>([]);
  const [maxPerNight, setMaxPerNight] = useState<number | null>(null);
  const [popular, setPopular] = useState({
    ...EMPTY_POPULAR,
    hotel: Boolean(initialFilters?.hotel),
    apartment: Boolean(initialFilters?.apartment),
    cabin: Boolean(initialFilters?.cabin),
    nature: Boolean(initialFilters?.nature),
    jacuzzi: Boolean(initialFilters?.jacuzzi),
  });
  const capitalFallback = regionFallback ?? hotelCapitalFallback(city);

  const nflt = useMemo(() => bookingNfltFor(popular), [popular]);

  const fetchHotels = useServerFn(searchHotels);
  const effectiveCheckOut = checkOut ?? checkIn;

  const primary = useQuery({
    queryKey: ["hotels", city, checkIn, effectiveCheckOut, adults, rooms, childrenAges.join(",")],
    queryFn: () => {
      const payload = {
        city,
        checkIn,
        checkOut: effectiveCheckOut,
        adults,
        rooms,
        childrenAges,
        currency: "EUR" as const,
      };
      return fetchHotels({ data: payload });
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const shouldFallback =
    primary.isSuccess &&
    (primary.data?.hotels?.length ?? 0) === 0 &&
    !!capitalFallback &&
    capitalFallback.trim().toLowerCase() !== city.trim().toLowerCase();

  const fallback = useQuery({
    queryKey: ["hotels-fallback", capitalFallback, checkIn, effectiveCheckOut, adults, rooms, childrenAges.join(",")],
    enabled: shouldFallback,
    queryFn: () =>
      fetchHotels({
        data: {
          city: capitalFallback!,
          checkIn,
          checkOut: effectiveCheckOut,
          adults,
          rooms,
          childrenAges,
          currency: "EUR",
        },
      }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const selection = selectHotelSource(primary, fallback, city, capitalFallback);
  const { isLoading, usedFallback, sourceCity } = selection;
  const realHotels = selection.hotels;
  const isError = selection.isError || Boolean(primary.data?.error ?? (shouldFallback ? fallback.data?.error : null));
  const dest = usedFallback ? fallback.data?.dest : primary.data?.dest;

  const buildBookingUrl = (queryCity: string, hotelName?: string) =>
    buildBookingSearchUrl({
      ...bookingBase,
      destination: hotelSearchQueryAlias(queryCity),
      hotelName,
      nflt,
      destId: dest?.destId,
      destType: dest?.destType,
      lang,
    });
  const bookingHref = buildBookingUrl(capitalFallback && usedFallback ? sourceCity : city);

  const nightlyPrices = realHotels.map((h) => perNightPrice(h.price, nights));
  const extent = priceExtent(nightlyPrices);
  const budgetMax = maxPerNight ?? extent.max;
  const hist = priceHistogram(nightlyPrices);
  const histPeak = Math.max(1, ...hist);
  const hasStars = realHotels.some((h) => (h.stars ?? 0) >= 3);

  const filtered = useMemo(() => {
    if (!bookingFirst) {
      return sortHotels(realHotels, sort === "top" ? "priceAsc" : sort);
    }
    const next = applyHotelFilters(realHotels, nights, {
      maxPerNight: budgetMax,
      minRating,
      stars: starFilter,
      ...popular,
    });
    return sortHotels(next, sort);
  }, [bookingFirst, realHotels, nights, budgetMax, minRating, starFilter, sort, popular]);

  const popularCounts = useMemo(() => {
    const count = (pred: (h: (typeof realHotels)[number]) => boolean) =>
      realHotels.filter(pred).length;
    return {
      breakfast: count((h) => Boolean(h.amenities?.breakfast)),
      allInclusive: count((h) => Boolean(h.amenities?.allInclusive)),
      balcony: count((h) => Boolean(h.amenities?.balcony)),
      hotel: count((h) => h.kind === "hotel"),
      apartment: count((h) => h.kind === "apartment"),
      cabin: 0,
      nature: 0,
      jacuzzi: 0,
      pool: count((h) => Boolean(h.amenities?.pool)),
      parking: count((h) => Boolean(h.amenities?.parking)),
      freeCancel: count((h) => Boolean(h.amenities?.freeCancel)),
    };
  }, [realHotels]);

  const bookingOnlyPopular =
    LOCAL_AMENITY_KEYS.some((key) => popular[key] && popularCounts[key] === 0) ||
    popular.cabin ||
    popular.nature ||
    popular.jacuzzi;

  const mapCenter = useMemo(() => {
    const pts = realHotels.filter((h) => h.lat != null && h.lng != null) as Array<{
      lat: number;
      lng: number;
    }>;
    if (pts.length === 0) return null;
    return {
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
    };
  }, [realHotels]);

  const fmtDate = (iso: string) => formatLocalDate(iso, undefined, { day: "numeric", month: "short" });
  const dateLabel = checkOut ? `${fmtDate(checkIn)} – ${fmtDate(checkOut)}` : fmtDate(checkIn);

  function reviewLabel(rating: number, apiWord?: string) {
    const band = reviewBand(rating);
    if (band === 9) return t("aiplan.reviewWord9" as never);
    if (band === 8) return t("aiplan.reviewWord8" as never);
    if (band === 7) return t("aiplan.reviewWord7" as never);
    if (band === 6) return t("aiplan.reviewWord6" as never);
    return apiWord || t("aiplan.reviewWordOk" as never);
  }

  function toggleStar(n: number) {
    setStarFilter((prev) => (prev.includes(n) ? prev.filter((s) => s !== n) : [...prev, n]));
  }

  const filtersActive =
    minRating > 0 ||
    starFilter.length > 0 ||
    (maxPerNight != null && maxPerNight < extent.max) ||
    Object.values(popular).some(Boolean);

  return (
    <div className="border-t border-slate-100 pt-2" onClick={(e) => e.stopPropagation()}>
      <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Hotel className={`h-5 w-5 ${bookingFirst ? "text-[#0071c2]" : "text-sky-600"}`} />
            {t("aiplan.hotelsIn" as never)} {sourceCity}
          </div>
          {bookingFirst ? (
            <p className="mt-0.5 text-xs text-slate-500">
              {dateLabel}
              {" · "}
              {adults} {t("heroChat.passengers.adults" as never).toLowerCase()}
              {childrenAges.length > 0
                ? ` · ${childrenAges.length} ${t("heroChat.passengers.children" as never).toLowerCase()}`
                : ""}
              {` · ${rooms} ${rooms === 1 ? t("trav.room") : t("trav.roomsPlural")}`}
            </p>
          ) : null}
        </div>
        {!bookingFirst ? <BookingCta href={bookingHref} label={t("aiplan.browseHotels" as never)} /> : null}
      </div>

      {bookingFirst ? (
        <div className="mb-3 space-y-2">
          <BookingCta href={bookingHref} label={t("aiplan.hotelsEmptyCta" as never)} size="hero" />
          <p className="text-xs text-slate-500">{t("aiplan.hotelsBookingFirstSub" as never)}</p>
        </div>
      ) : null}

      {usedFallback && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {interpolate(t("aiplan.hotelsFallbackNotice" as never), {
            city: <strong key="city">{city}</strong>,
            hub: <strong key="hub">{sourceCity}</strong>,
          })}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("aiplan.hotelsLoading" as never)}
        </div>
      ) : realHotels.length === 0 ? (
        bookingFirst ? (
          <p className="text-xs text-slate-500">
            {isError ? t("aiplan.hotelsEmptyErrorSub" as never) : t("aiplan.hotelsEmptyDefaultSub" as never)}
          </p>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <p className="font-medium text-slate-700">
              {interpolate(t("aiplan.hotelsEmptyTitle" as never), {
                city: <strong key="city">{city}</strong>,
                dates: checkOut ? ` (${fmtDate(checkIn)} – ${fmtDate(checkOut)})` : "",
              })}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {isError ? t("aiplan.hotelsEmptyErrorSub" as never) : t("aiplan.hotelsEmptyDefaultSub" as never)}
            </p>
            <div className="mt-3">
              <BookingCta href={buildBookingUrl(capitalFallback || city)} label={t("aiplan.hotelsEmptyCta" as never)} />
            </div>
          </div>
        )
      ) : !bookingFirst ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-500">{t("aiplan.sortBy" as never)}</span>
            {(["priceAsc", "priceDesc", "ratingDesc"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`rounded-full border px-2.5 py-1 transition-colors ${
                  sort === s
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {t(`aiplan.${s}` as never)}
              </button>
            ))}
          </div>
          <div className="-mx-1 snap-x snap-mandatory overflow-x-auto pb-2">
            <div className="flex gap-3 px-1">
              {filtered.map((h) => {
                const bookUrl = resolveHotelBookingUrl(h.bookingUrl, {
                  ...bookingBase,
                  destination: hotelSearchQueryAlias(sourceCity),
                  hotelName: h.name,
                  destId: dest?.destId,
                  destType: dest?.destType,
                  lang,
                });
                return (
                  <BookingLink
                    key={h.id}
                    href={bookUrl}
                    className="block w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:border-sky-200 hover:shadow-md"
                  >
                    <div className="relative h-36 w-full bg-slate-100">
                      <img src={h.image} alt={h.name} loading="lazy" className="h-full w-full object-cover" />
                      {h.rating > 0 ? (
                        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-0.5 text-xs font-bold text-white shadow">
                          {h.rating.toFixed(1)}
                        </div>
                      ) : null}
                    </div>
                    <div className="p-3">
                      <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-slate-900">
                        {h.name}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {fmtDate(checkIn)}
                        {checkOut ? ` – ${fmtDate(checkOut)}` : ""}
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-base font-bold text-slate-900">
                          {h.price > 0 ? `€${h.price}` : "—"}
                          <span className="text-xs font-normal text-slate-500">
                            {t("aiplan.perNight" as never)}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white">
                          {t("aiplan.book" as never)}
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </BookingLink>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="h-fit space-y-4 rounded-lg border border-slate-200 bg-white p-3 lg:sticky lg:top-4">
            <BookingLink
              href={bookingHref}
              className="relative block overflow-hidden rounded-md border border-slate-200"
            >
              {mapCenter ? (
                <iframe
                  title={t("aiplan.showOnMap" as never)}
                  className="pointer-events-none h-28 w-full border-0"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapCenter.lng - 0.08}%2C${mapCenter.lat - 0.05}%2C${mapCenter.lng + 0.08}%2C${mapCenter.lat + 0.05}&layer=mapnik&marker=${mapCenter.lat}%2C${mapCenter.lng}`}
                />
              ) : (
                <div className="flex h-28 items-center justify-center bg-slate-100 text-slate-400">
                  <MapPin className="h-6 w-6" />
                </div>
              )}
              <span className="absolute inset-x-3 bottom-3 inline-flex items-center justify-center rounded-md bg-[#0071c2] px-3 py-1.5 text-xs font-semibold text-white shadow">
                {t("aiplan.showOnMap" as never)}
              </span>
            </BookingLink>

            <div>
              <p className="mb-2 text-sm font-bold text-slate-900">{t("aiplan.filterBudget" as never)}</p>
              <div className="mb-2 flex h-10 items-end gap-px">
                {hist.map((count, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-[#febb02]/80"
                    style={{ height: `${Math.max(8, (count / histPeak) * 100)}%` }}
                  />
                ))}
              </div>
              <input
                type="range"
                min={Math.max(1, extent.min)}
                max={Math.max(extent.max, extent.min + 1)}
                value={budgetMax}
                onChange={(e) => setMaxPerNight(Number(e.target.value))}
                className="w-full accent-[#0071c2]"
                aria-label={t("aiplan.filterBudget" as never)}
              />
              <p className="mt-1 text-xs text-slate-600">
                €{extent.min} – €{budgetMax}
                {t("aiplan.perNight" as never)}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-bold text-slate-900">{t("aiplan.filterPopular" as never)}</p>
              <div className="space-y-1.5 text-sm text-slate-700">
                {(
                  [
                    ["breakfast", "aiplan.filterBreakfast"],
                    ["allInclusive", "aiplan.filterAllInclusive"],
                    ["balcony", "aiplan.filterBalcony"],
                    ["hotel", "aiplan.filterHotels"],
                    ["apartment", "aiplan.filterApartments"],
                    ["cabin", "aiplan.filterCabin"],
                    ["nature", "aiplan.filterNature"],
                    ["jacuzzi", "aiplan.filterJacuzzi"],
                    ["pool", "aiplan.filterPool"],
                    ["parking", "aiplan.filterParking"],
                    ["freeCancel", "aiplan.filterFreeCancel"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={popular[key]}
                        onChange={() =>
                          setPopular((cur) => ({ ...cur, [key]: !cur[key] }))
                        }
                        className="h-3.5 w-3.5 accent-[#0071c2]"
                      />
                      {t(label as never)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {popularCounts[key] > 0 ? popularCounts[key] : ""}
                    </span>
                  </label>
                ))}
              </div>
              {bookingOnlyPopular ? (
                <p className="mt-2 text-[11px] leading-snug text-slate-500">
                  {t("aiplan.filterOnBooking" as never)}
                </p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-sm font-bold text-slate-900">{t("aiplan.filterGuestRating" as never)}</p>
              <div className="space-y-1.5 text-sm text-slate-700">
                {(
                  [
                    [9, "aiplan.filterRating9"],
                    [8, "aiplan.filterRating8"],
                    [7, "aiplan.filterRating7"],
                  ] as const
                ).map(([n, key]) => (
                  <label key={n} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={minRating === n}
                      onChange={() => setMinRating((cur) => (cur === n ? 0 : n))}
                      className="h-3.5 w-3.5 accent-[#0071c2]"
                    />
                    {t(key as never)}
                  </label>
                ))}
              </div>
            </div>

            {hasStars ? (
              <div>
                <p className="mb-2 text-sm font-bold text-slate-900">{t("aiplan.filterStars" as never)}</p>
                <div className="space-y-1.5 text-sm text-slate-700">
                  {[5, 4, 3].map((n) => (
                    <label key={n} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={starFilter.includes(n)}
                        onChange={() => toggleStar(n)}
                        className="h-3.5 w-3.5 accent-[#0071c2]"
                      />
                      <Stars count={n} />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setMinRating(0);
                  setStarFilter([]);
                  setMaxPerNight(null);
                  setPopular({ ...EMPTY_POPULAR });
                }}
                className="text-xs font-semibold text-[#0071c2] hover:underline"
              >
                {t("aiplan.filtersClear" as never)}
              </button>
            ) : null}
          </aside>

          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {interpolate(t("aiplan.hotelsFound" as never), {
                  city: sourceCity,
                  n: String(filtered.length),
                })}
              </p>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                {t("aiplan.sortBy" as never)}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as HotelResultSort)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800"
                >
                  <option value="top">{t("aiplan.sortTop" as never)}</option>
                  <option value="priceAsc">{t("aiplan.sortPriceLow" as never)}</option>
                  <option value="priceDesc">{t("aiplan.sortPriceHigh" as never)}</option>
                  <option value="ratingDesc">{t("aiplan.sortBestReviewed" as never)}</option>
                </select>
              </label>
            </div>

            {filtered.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-600">
                {t("aiplan.hotelsFilterEmpty" as never)}
              </p>
            ) : (
              <div className="space-y-3">
                {filtered.map((h) => {
                  const bookUrl = resolveHotelBookingUrl(h.bookingUrl, {
                    ...bookingBase,
                    destination: hotelSearchQueryAlias(sourceCity),
                    hotelName: h.name,
                    destId: dest?.destId,
                    destType: dest?.destType,
                    lang,
                  });
                  const nightly = perNightPrice(h.price, nights);
                  return (
                    <BookingLink
                      key={h.id}
                      href={bookUrl}
                      className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-[#0071c2]/40 sm:flex-row"
                    >
                      <div className="relative h-40 w-full shrink-0 bg-slate-100 sm:h-auto sm:w-[200px]">
                        <img src={h.image} alt={h.name} loading="lazy" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:flex-row sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-[#003b95]">{h.name}</h3>
                            {h.stars ? <Stars count={h.stars} /> : null}
                          </div>
                          {h.neighborhood ? (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-[#0071c2]">
                              <MapPin className="h-3 w-3" />
                              {h.neighborhood}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-500">
                            {interpolate(t("aiplan.nightsGuests" as never), {
                              nights: String(nights),
                              guests: String(guests),
                            })}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end justify-between gap-2 sm:min-w-[9.5rem]">
                          {h.rating > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <div className="text-sm font-bold text-slate-900">{reviewLabel(h.rating, h.reviewWord)}</div>
                                {h.reviews > 0 ? (
                                  <div className="text-[11px] text-slate-500">
                                    {h.reviews} {t("aiplan.reviews" as never)}
                                  </div>
                                ) : null}
                              </div>
                              <div className="rounded-md rounded-bl-none bg-[#003b95] px-2 py-1 text-sm font-bold text-white">
                                {h.rating.toFixed(1)}
                              </div>
                            </div>
                          ) : null}
                          <div className="text-right">
                            {h.originalPrice && h.originalPrice > h.price ? (
                              <div className="text-xs text-red-600 line-through">€{h.originalPrice}</div>
                            ) : null}
                            <div className="text-lg font-extrabold text-slate-900">
                              {h.price > 0 ? `€${h.price}` : "—"}
                            </div>
                            {nightly > 0 && nights > 1 ? (
                              <div className="text-[11px] text-slate-500">
                                €{nightly}
                                {t("aiplan.perNight" as never)}
                              </div>
                            ) : null}
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#0071c2] px-3 py-2 text-xs font-semibold text-white">
                            {t("aiplan.seeAvailability" as never)}
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </BookingLink>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">{t("aiplan.hotelsHint" as never)}</p>
    </div>
  );
}
