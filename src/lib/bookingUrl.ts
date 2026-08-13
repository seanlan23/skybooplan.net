export type BookingSearchParams = {
  destination: string;
  checkIn: string;
  checkOut?: string;
  adults?: number;
  rooms?: number;
  childrenAges?: number[];
  affiliateId?: string;
  /** When set, search targets a specific property within the destination. */
  hotelName?: string;
  /** Booking.com `nflt` tokens (mealplan, ht_id, facilities). */
  nflt?: string[];
  /** Booking dest from searchDestination — without this, logged-in users often land on an empty search. */
  destId?: string;
  destType?: string;
  lang?: string;
};

function normalizeBookingDate(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : iso.trim();
}

export function normalizeHotelSearchDate(iso: string): string {
  return normalizeBookingDate(iso);
}

function ensureCheckoutAfterCheckin(checkIn: string, checkOut?: string): string {
  const inDate = normalizeBookingDate(checkIn);
  let outDate = checkOut ? normalizeBookingDate(checkOut) : inDate;
  if (!outDate || outDate <= inDate) {
    const next = new Date(`${inDate}T12:00:00`);
    next.setDate(next.getDate() + 1);
    outDate = next.toISOString().slice(0, 10);
  }
  return outDate;
}

function searchDestination(params: BookingSearchParams): string {
  const city = params.destination.trim();
  if (!city) return "";
  return params.hotelName?.trim() ? `${params.hotelName.trim()}, ${city}` : city;
}

export function ensureHotelCheckoutAfterCheckin(checkIn: string, checkOut?: string): string {
  return ensureCheckoutAfterCheckin(checkIn, checkOut);
}

function bookingUiLang(lang?: string): string {
  if (lang === "sl") return "sl";
  if (lang === "de") return "de";
  return "en-us";
}

function setBookingStayDates(url: URL, checkIn: string, checkOut: string) {
  url.searchParams.set("checkin", checkIn);
  url.searchParams.set("checkout", checkOut);
  const [inY, inM, inD] = checkIn.split("-");
  const [outY, outM, outD] = checkOut.split("-");
  if (inY && inM && inD) {
    url.searchParams.set("checkin_year", inY);
    url.searchParams.set("checkin_month", String(Number(inM)));
    url.searchParams.set("checkin_monthday", String(Number(inD)));
  }
  if (outY && outM && outD) {
    url.searchParams.set("checkout_year", outY);
    url.searchParams.set("checkout_month", String(Number(outM)));
    url.searchParams.set("checkout_monthday", String(Number(outD)));
  }
}

/** Standard Booking.com affiliate search URL with destination + stay dates. */
export function buildBookingSearchUrl(params: BookingSearchParams): string {
  const destination = searchDestination(params);
  if (!destination) return "https://www.booking.com/";

  const checkIn = normalizeBookingDate(params.checkIn);
  const checkOut = ensureCheckoutAfterCheckin(checkIn, params.checkOut);
  const lang = bookingUiLang(params.lang);

  const url = new URL("https://www.booking.com/searchresults.html");
  url.searchParams.set("ss", destination);
  url.searchParams.set("ssne", destination);
  url.searchParams.set("ssne_untouched", destination);
  setBookingStayDates(url, checkIn, checkOut);
  url.searchParams.set("group_adults", String(params.adults ?? 2));
  url.searchParams.set("no_rooms", String(params.rooms ?? 1));
  url.searchParams.set("group_children", String(params.childrenAges?.length ?? 0));
  (params.childrenAges ?? []).forEach((age) => url.searchParams.append("age", String(age)));
  if (params.affiliateId) url.searchParams.set("aid", params.affiliateId);
  if (params.destId) {
    url.searchParams.set("dest_id", params.destId);
    url.searchParams.set("dest_type", params.destType || "city");
  }
  url.searchParams.set("lang", lang);
  url.searchParams.set("selected_currency", "EUR");
  url.searchParams.set("sb", "1");
  url.searchParams.set("src_elem", "sb");
  // `index` = new homepage search. `searchresults` is a refinement and
  // Booking often drops ss/dates for signed-in users (empty destination).
  url.searchParams.set("src", "index");
  url.searchParams.set("do_availability_check", "1");
  if (params.nflt?.length) {
    url.searchParams.set("nflt", params.nflt.join(";"));
  }

  return url.toString();
}

function isBookingHomepage(pathname: string, search: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/" || path === "/index.html") return true;
  if (path === "/searchresults.html") {
    const qs = new URLSearchParams(search);
    return !qs.get("ss") && !qs.get("checkin");
  }
  return false;
}

/**
 * Normalize an API-provided Booking URL. Rebuilds homepage/broken links and
 * always ensures check-in, check-out, and guest params are present.
 */
export function resolveHotelBookingUrl(
  apiUrl: string | undefined,
  fallback: BookingSearchParams,
): string {
  if (!apiUrl || !/^https?:\/\/(www\.)?booking\.com/i.test(apiUrl)) {
    return buildBookingSearchUrl(fallback);
  }

  try {
    const u = new URL(apiUrl);
    if (isBookingHomepage(u.pathname, u.search)) {
      return buildBookingSearchUrl(fallback);
    }

    const checkIn = normalizeBookingDate(fallback.checkIn);
    const checkOut = ensureCheckoutAfterCheckin(checkIn, fallback.checkOut);

    setBookingStayDates(u, checkIn, checkOut);
    u.searchParams.set("group_adults", String(fallback.adults ?? 2));
    u.searchParams.set("no_rooms", String(fallback.rooms ?? 1));
    u.searchParams.set("group_children", String(fallback.childrenAges?.length ?? 0));
    if (fallback.affiliateId) u.searchParams.set("aid", fallback.affiliateId);
    if (fallback.destId) {
      u.searchParams.set("dest_id", fallback.destId);
      u.searchParams.set("dest_type", fallback.destType || "city");
    }

    if (u.pathname.includes("searchresults") && !u.searchParams.get("ss")) {
      const destination = searchDestination(fallback);
      if (destination) {
        u.searchParams.set("ss", destination);
        u.searchParams.set("ssne", destination);
        u.searchParams.set("ssne_untouched", destination);
      }
    }

    return u.toString();
  } catch {
    return buildBookingSearchUrl(fallback);
  }
}
