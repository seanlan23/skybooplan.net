import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Hotel, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { buildBookingSearchUrl, resolveHotelBookingUrl } from "@/lib/bookingUrl";
import { searchHotels } from "@/lib/hotels.functions";
import { selectHotelSource } from "@/lib/hotelSelection";
import { interpolate } from "@/lib/interpolate";
import { formatLocalDate } from "@/lib/dateUtils";

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
  const safeHref = href.startsWith("http") ? href : "https://www.booking.com/";

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

export function HotelsSection({
  city,
  checkIn,
  checkOut,
  stayInfo,
  regionFallback,
}: {
  city: string;
  checkIn: string;
  checkOut?: string;
  stayInfo?: StayInfo;
  regionFallback?: string;
}) {
  const { t } = useI18n();
  const aid = import.meta.env.VITE_BOOKING_AFFILIATE_ID || "";

  const adults = stayInfo?.adults ?? 2;
  const rooms = stayInfo?.rooms ?? 1;
  const childrenAges = stayInfo?.childrenAges ?? [];

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

  const buildBookingUrl = (queryCity: string, hotelName?: string) =>
    buildBookingSearchUrl({
      ...bookingBase,
      destination: queryCity,
      hotelName,
    });

  const [sort, setSort] = useState<"priceAsc" | "priceDesc" | "ratingDesc">("priceAsc");

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
      console.log("[HotelsSection] fetchHotels payload", payload);
      return fetchHotels({ data: payload });
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const shouldFallback =
    primary.isSuccess &&
    (primary.data?.hotels?.length ?? 0) === 0 &&
    !!regionFallback &&
    regionFallback.trim().toLowerCase() !== city.trim().toLowerCase();

  const fallback = useQuery({
    queryKey: ["hotels-fallback", regionFallback, checkIn, effectiveCheckOut, adults, rooms, childrenAges.join(",")],
    enabled: shouldFallback,
    queryFn: () =>
      fetchHotels({
        data: {
          city: regionFallback!,
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

  const selection = selectHotelSource(primary, fallback, city, regionFallback);
  const { isLoading, usedFallback, sourceCity } = selection;
  const realHotels = selection.hotels;
  const apiError = primary.data?.error ?? (shouldFallback ? fallback.data?.error : null);
  const isError = selection.isError || Boolean(apiError);

  const hotels = realHotels.map((h) => ({
    id: h.id,
    name: h.name,
    price: h.price,
    rating: h.rating,
    reviews: h.reviews,
    area: "all" as const,
    image: h.image,
    bookingUrl: h.bookingUrl,
  }));

  const filtered = useMemo(() => {
    let list = [...hotels];
    if (sort === "priceAsc") list = list.sort((a, b) => a.price - b.price);
    if (sort === "priceDesc") list = list.sort((a, b) => b.price - a.price);
    if (sort === "ratingDesc") list = list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [hotels, sort]);

  const fmtDate = (iso: string) => formatLocalDate(iso, undefined, { day: "numeric", month: "short" });

  return (
    <div className="pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 mt-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <Hotel className="h-5 w-5 text-sky-600" />
          {t("aiplan.hotelsIn" as never)} {sourceCity}
        </div>
        <BookingLink
          href={buildBookingUrl(sourceCity)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-2 text-xs font-semibold text-white transition-colors"
        >
          {t("aiplan.browseHotels" as never)}
          <ExternalLink className="h-3 w-3" />
        </BookingLink>
      </div>

      {usedFallback && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {interpolate(t("aiplan.hotelsFallbackNotice" as never), {
            city: <strong key="city">{city}</strong>,
            hub: <strong key="hub">{sourceCity}</strong>,
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          <span className="text-slate-500 font-medium">{t("aiplan.sortBy" as never)}</span>
          {(["priceAsc", "priceDesc", "ratingDesc"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                sort === s
                  ? "bg-sky-600 border-sky-600 text-white"
                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              {t(`aiplan.${s}` as never)}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("aiplan.hotelsLoading" as never)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          <p className="font-medium text-slate-700">
            {interpolate(t("aiplan.hotelsEmptyTitle" as never), {
              city: <strong key="city">{city}</strong>,
              dates: checkOut ? ` (${fmtDate(checkIn)} – ${fmtDate(checkOut)})` : "",
            })}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isError
              ? apiError || t("aiplan.hotelsEmptyErrorSub" as never)
              : t("aiplan.hotelsEmptyDefaultSub" as never)}
          </p>
          <BookingLink
            href={buildBookingUrl(regionFallback || city)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-2 text-xs font-semibold text-white"
          >
            {t("aiplan.hotelsEmptyCta" as never)}
            <ExternalLink className="h-3 w-3" />
          </BookingLink>
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto pb-2 snap-x snap-mandatory">
          <div className="flex gap-3 px-1">
            {filtered.map((h) => {
              const bookUrl = resolveHotelBookingUrl(h.bookingUrl, {
                ...bookingBase,
                destination: sourceCity,
                hotelName: h.name,
              });
              return (
                <BookingLink
                  key={h.id}
                  href={bookUrl}
                  className="snap-start shrink-0 w-[260px] block rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-sky-200 transition-shadow"
                >
                  <div className="relative h-36 w-full bg-slate-100">
                    <img src={h.image} alt={h.name} loading="lazy" className="h-full w-full object-cover" />
                    {h.rating > 0 && (
                      <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-0.5 text-xs font-bold text-white shadow">
                        {h.rating.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-semibold text-sm text-slate-900 leading-tight line-clamp-2 min-h-[2.5rem]">
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
      )}
      <p className="text-[11px] text-slate-400 mt-2">{t("aiplan.hotelsHint" as never)}</p>
    </div>
  );
}
