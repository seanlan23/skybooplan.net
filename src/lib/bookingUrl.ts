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
  /** Guest review floor (80 = 8.0+). */
  reviewScore?: number;
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
  const hotel = params.hotelName?.trim() ?? "";
  return hotel || city;
}

export function ensureHotelCheckoutAfterCheckin(checkIn: string, checkOut?: string): string {
  return ensureCheckoutAfterCheckin(checkIn, checkOut);
}

function bookingUiLang(lang?: string): string {
  if (lang === "sl") return "sl";
  if (lang === "de") return "de";
  return "en-us";
}

/** Local noon so `YYYY-MM-DD` does not shift a day west of UTC. */
function bookingCalendarDate(iso: string): Date | null {
  const day = normalizeBookingDate(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const dt = new Date(`${day}T12:00:00`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

export function isValidBookingIsoDate(raw?: string | null): boolean {
  return bookingCalendarDate(raw ?? "") != null;
}

/**
 * Hotel stay from the selected flight (destination arrival / inbound depart)
 * wins over a stored/mock hotel date. Empty or invalid values never reach
 * Booking (that opens “today”).
 */
export function resolveBookingStayDates(opts: {
  flightDepartDate?: string;
  flightReturnDate?: string;
  checkIn?: string;
  checkOut?: string;
}): { checkIn: string; checkOut: string } | null {
  const checkIn = [opts.flightDepartDate, opts.checkIn]
    .map((v) => (v ? normalizeBookingDate(v) : ""))
    .find((v) => isValidBookingIsoDate(v));
  if (!checkIn) return null;
  const checkOut = [opts.flightReturnDate, opts.checkOut]
    .map((v) => (v ? normalizeBookingDate(v) : ""))
    .find((v) => isValidBookingIsoDate(v));
  return { checkIn, checkOut: ensureCheckoutAfterCheckin(checkIn, checkOut) };
}

function setBookingStayDates(url: URL, checkIn: string, checkOut: string) {
  const inDate = bookingCalendarDate(checkIn);
  const outDate = bookingCalendarDate(checkOut);
  if (!inDate || !outDate) return;
  url.searchParams.set("checkin", checkIn);
  url.searchParams.set("checkout", checkOut);
  url.searchParams.set("checkin_year", String(inDate.getFullYear()));
  url.searchParams.set("checkin_month", String(inDate.getMonth() + 1));
  url.searchParams.set("checkin_monthday", String(inDate.getDate()));
  url.searchParams.set("checkout_year", String(outDate.getFullYear()));
  url.searchParams.set("checkout_month", String(outDate.getMonth() + 1));
  url.searchParams.set("checkout_monthday", String(outDate.getDate()));
}

/** Booking.com searchresults URL — ISO dates + year/month/monthday (calendar lock). */
export function buildBookingSearchUrl(params: BookingSearchParams): string {
  const destination = searchDestination(params);
  const stay = resolveBookingStayDates({
    checkIn: params.checkIn,
    checkOut: params.checkOut,
  });
  if (!destination || !stay) return applyBookingNetworkTracking("https://www.booking.com/");

  const checkInDate = bookingCalendarDate(stay.checkIn);
  const checkoutDate = bookingCalendarDate(stay.checkOut);
  if (!checkInDate || !checkoutDate) {
    return applyBookingNetworkTracking("https://www.booking.com/");
  }

  const search = new URLSearchParams({
    ss: destination,
    checkin: stay.checkIn,
    checkout: stay.checkOut,
    checkin_year: String(checkInDate.getFullYear()),
    checkin_month: String(checkInDate.getMonth() + 1),
    checkin_monthday: String(checkInDate.getDate()),
    checkout_year: String(checkoutDate.getFullYear()),
    checkout_month: String(checkoutDate.getMonth() + 1),
    checkout_monthday: String(checkoutDate.getDate()),
    group_adults: String(params.adults || 2),
    no_rooms: String(params.rooms ?? 1),
    group_children: String(params.childrenAges?.length ?? 0),
  });
  (params.childrenAges ?? []).forEach((age) => search.append("age", String(age)));
  const reviewScore = params.reviewScore ?? 80;
  if (reviewScore > 0) search.set("review_score", String(reviewScore));
  if (params.nflt?.length) search.set("nflt", params.nflt.join(";"));
  if (params.lang) search.set("lang", bookingUiLang(params.lang));

  return applyBookingNetworkTracking(
    `https://www.booking.com/searchresults.html?${search.toString()}`,
  );
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
  const stay = resolveBookingStayDates({
    checkIn: fallback.checkIn,
    checkOut: fallback.checkOut,
  });
  if (stay && searchDestination(fallback)) {
    return buildBookingSearchUrl({ ...fallback, ...stay });
  }

  const incoming = extractBookingHopDest(apiUrl ?? "") ?? apiUrl;
  if (!incoming || !allowedBookingDest(incoming)) {
    return buildBookingSearchUrl(fallback);
  }

  try {
    const u = new URL(incoming);
    if (isBookingHomepage(u.pathname, u.search)) {
      return buildBookingSearchUrl(fallback);
    }
    if (stay) setBookingStayDates(u, stay.checkIn, stay.checkOut);
    return applyBookingNetworkTracking(u.toString());
  } catch {
    return buildBookingSearchUrl(fallback);
  }
}

const CJ_TRACK_HOST =
  /(?:^|\.)(?:anrdoezrs|jdoqocy|tkqlhce|dpbolvw|kqzyfj|tqlkg|qksrv|emjcd|awxibrm)\.(?:net|com)$/i;

/** Evergreen CJ click for Skybooplan website (PID 101761713). Public tracking URL. */
export const SKYBOOPLAN_CJ_CLICK_URL =
  "https://www.jdoqocy.com/click-101761713-15735418";

/** First-party hop so Safari/adblock cannot skip the CJ tracker in the <a href>. */
export const BOOKING_CLICK_HOP_PATH = "/api/go/booking";

export const SKYBOOPLAN_SITE = "https://www.skybooplan.com";

export function bookingClickHopHref(bookingDest: string): string {
  return `${BOOKING_CLICK_HOP_PATH}?u=${encodeURIComponent(bookingDest)}`;
}

/** PDF / offline links cannot use a site-relative hop. */
export function toAbsoluteBookingClickHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/")) return `${SKYBOOPLAN_SITE}${trimmed}`;
  return trimmed;
}

export function isSkybooplanBookingHop(href: string): boolean {
  if (!href) return false;
  if (href.startsWith(`${BOOKING_CLICK_HOP_PATH}?`) || href === BOOKING_CLICK_HOP_PATH) {
    return true;
  }
  try {
    return new URL(href, "https://www.skybooplan.com").pathname === BOOKING_CLICK_HOP_PATH;
  } catch {
    return false;
  }
}

export function extractBookingHopDest(href: string): string | null {
  if (!isSkybooplanBookingHop(href)) return null;
  try {
    const u = href.startsWith("http")
      ? new URL(href)
      : new URL(href, "https://www.skybooplan.com");
    return allowedBookingDest(u.searchParams.get("u") ?? "");
  } catch {
    return null;
  }
}

/** Every hotel/stay <a href> must pass through here so cards cannot leak booking.com. */
export function toBookingClickHref(href: string): string {
  if (isSkybooplanBookingHop(href)) return href;
  if (href.startsWith("http")) return applyBookingNetworkTracking(href);
  return applyBookingNetworkTracking("https://www.booking.com/");
}

export function allowedBookingDest(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!/(^|\.)booking\.com$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function toCjTrackedUrl(
  bookingDest: string,
  cjClickUrl: string = SKYBOOPLAN_CJ_CLICK_URL,
): string | null {
  try {
    if (CJ_TRACK_HOST.test(new URL(bookingDest).hostname)) return bookingDest;
    const click = new URL(
      cjClickUrl.includes("://") ? cjClickUrl : `https://${cjClickUrl}`,
    );
    click.searchParams.set("url", bookingDest);
    return click.toString();
  } catch {
    return null;
  }
}

/** HTML hop so the browser actually loads jdoqocy (Safari skips tracker 302 chains). */
export function renderBookingHopHtml(cjUrl: string): string {
  const js = JSON.stringify(cjUrl);
  const href = cjUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Opening Booking.com</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1f33;color:#fff}
  p{margin:0 0 .75rem;opacity:.85}
  a{color:#7dd3fc}
</style>
</head>
<body>
<p>Opening Booking.com…</p>
<p><a href="${href}">Continue</a></p>
<script>setTimeout(function(){location.replace(${js});},800);</script>
</body>
</html>`;
}

function readViteCjClickUrl(): string {
  // Static access only — Vite replaces this at build time. Dynamic
  // `import.meta.env[name]` is empty in the production client bundle.
  return String(import.meta.env.VITE_CJ_CLICK_URL ?? "").trim();
}

function readViteAffiliateLabel(): string {
  return String(import.meta.env.VITE_BOOKING_AFFILIATE_LABEL ?? "").trim();
}

export function readCjClickUrl(): string {
  const fromVite = readViteCjClickUrl();
  if (fromVite) return fromVite;
  if (typeof process !== "undefined") {
    const fromProc = String(
      process.env.CJ_CLICK_URL || process.env.VITE_CJ_CLICK_URL || "",
    ).trim();
    if (fromProc) return fromProc;
  }
  return SKYBOOPLAN_CJ_CLICK_URL;
}

function readAffiliateLabel(): string {
  const fromVite = readViteAffiliateLabel();
  if (fromVite) return fromVite;
  if (typeof process === "undefined") return "";
  return String(
    process.env.BOOKING_AFFILIATE_LABEL ||
      process.env.VITE_BOOKING_AFFILIATE_LABEL ||
      "",
  ).trim();
}

/**
 * CJ Affiliate hop for Booking.com (Partner Hub `aid` is no longer the live program).
 * Default is the Skybooplan CJ click URL. Override with VITE_CJ_CLICK_URL.
 * Pass `{ cjClickUrl: "" }` to skip wrapping (tests / opt-out).
 */
export function applyBookingNetworkTracking(
  bookingUrl: string,
  tracking?: { cjClickUrl?: string; label?: string },
): string {
  if (!bookingUrl.startsWith("http")) return bookingUrl;

  const label = tracking?.label ?? readAffiliateLabel();
  const cjClick =
    tracking && "cjClickUrl" in tracking
      ? (tracking.cjClickUrl ?? "").trim()
      : readCjClickUrl();

  let dest = bookingUrl;
  try {
    const destUrl = new URL(dest);
    if (label && destUrl.hostname.includes("booking.com")) {
      destUrl.searchParams.set("label", label);
      dest = destUrl.toString();
    }
  } catch {
    return bookingUrl;
  }

  if (!cjClick) return dest;

  try {
    const destHost = new URL(dest).hostname;
    if (CJ_TRACK_HOST.test(destHost)) {
      if (tracking && "cjClickUrl" in tracking) return dest;
      const nested = new URL(dest).searchParams.get("url");
      const booking = nested ? allowedBookingDest(nested) : null;
      return booking ? bookingClickHopHref(booking) : dest;
    }

    const inner = new URL(dest);
    if (inner.hostname.includes("booking.com")) {
      inner.searchParams.delete("aid");
      dest = inner.toString();
    }

    // Direct jdoqocy hrefs are skipped by Safari/ITP and many ad blockers:
    // they open the inner booking.com `url=` and never hit CJ. Hop via Skybooplan first.
    if (tracking && "cjClickUrl" in tracking) {
      return toCjTrackedUrl(dest, cjClick) ?? dest;
    }
    return bookingClickHopHref(dest);
  } catch {
    return dest;
  }
}
