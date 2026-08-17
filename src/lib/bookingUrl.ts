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
  if (!destination) return applyBookingNetworkTracking("https://www.booking.com/");

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
  url.searchParams.set("do_availability_check", "1");
  if (params.nflt?.length) {
    url.searchParams.set("nflt", params.nflt.join(";"));
    // Homepage `src=index` drops nflt. dest_id keeps the place for signed-in users.
    url.searchParams.set("src", "searchresults");
  } else {
    url.searchParams.set("src", "index");
  }

  return applyBookingNetworkTracking(url.toString());
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
  const incoming = extractBookingHopDest(apiUrl ?? "") ?? apiUrl;
  if (!incoming || !allowedBookingDest(incoming)) {
    return buildBookingSearchUrl(fallback);
  }

  try {
    const u = new URL(incoming);
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
    if (fallback.nflt?.length) {
      u.searchParams.set("nflt", fallback.nflt.join(";"));
    }

    if (u.pathname.includes("searchresults") && !u.searchParams.get("ss")) {
      const destination = searchDestination(fallback);
      if (destination) {
        u.searchParams.set("ss", destination);
        u.searchParams.set("ssne", destination);
        u.searchParams.set("ssne_untouched", destination);
      }
    }

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
