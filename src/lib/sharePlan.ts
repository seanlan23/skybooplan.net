import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { SKYBOOPLAN_SITE } from "@/lib/bookingUrl";
import { lookupDestination } from "@/lib/destinationCoords";
import { normalizeCoverUrl, RESORT_COVER_FALLBACKS } from "@/lib/resortPackage";
import type { ResortHotelOffer } from "@/lib/resortHotelPicks";
import { resolveTripLocale } from "@/lib/tripLocale";
import type { TripStyle } from "@/lib/tripStyle";

export type SharePlanParams = {
  from?: string;
  to?: string;
  depart?: string;
  return?: string;
  style?: string;
  hotelId?: string;
  guests?: number;
  s?: string;
};

export type ShareOgMeta = {
  title: string;
  description: string;
  image: string;
};

const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clip(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

export function asShareIata(value: unknown): string | undefined {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();
  return IATA.test(code) ? code : undefined;
}

export function asShareIsoDate(value: unknown): string | undefined {
  const raw = String(value ?? "").trim().slice(0, 10);
  return ISO_DATE.test(raw) ? raw : undefined;
}

export function asShareGuests(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const guests = Math.round(n);
  return guests >= 1 && guests <= 20 ? guests : undefined;
}

export function asShareStyle(value: unknown): TripStyle | undefined {
  const raw = String(value ?? "").trim();
  if (raw === "single_base" || raw === "explorer" || raw === "roadtrip") return raw;
  if (raw === "resort") return "single_base";
  if (raw === "explore") return "explorer";
  return undefined;
}

function unquoteParam(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseSharePlanSearch(search: Record<string, unknown> | null | undefined): SharePlanParams {
  const raw = search ?? {};
  const hotelId = clip(unquoteParam(String(raw.hotelId ?? "")), 80);
  const token = clip(unquoteParam(String(raw.s ?? "")), 32);
  return {
    from: asShareIata(raw.from),
    to: asShareIata(raw.to),
    depart: asShareIsoDate(raw.depart),
    return: asShareIsoDate(raw.return),
    style: asShareStyle(raw.style),
    hotelId,
    guests: asShareGuests(raw.guests),
    s: token,
  };
}

/** When TanStack `search` is empty on SSR, recover params from the request URL. */
export function resolveSharePlanSearch(
  search?: SharePlanParams | Record<string, unknown> | null,
  href?: string | null,
): SharePlanParams {
  const parsed = parseSharePlanSearch(search);
  if (parsed.s || parsed.to || parsed.from) return parsed;
  const raw = (href ?? "").trim();
  if (!raw) return parsed;
  try {
    const url = raw.includes("://")
      ? new URL(raw)
      : new URL(raw, "https://www.skybooplan.com");
    return parseSharePlanSearch(Object.fromEntries(url.searchParams.entries()));
  } catch {
    return parsed;
  }
}

export function tripDayCount(depart?: string, returnDate?: string, nights?: number): number {
  const start = asShareIsoDate(depart);
  const end = asShareIsoDate(returnDate);
  if (start && end) {
    const a = Date.parse(`${start}T00:00:00Z`);
    const b = Date.parse(`${end}T00:00:00Z`);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      return Math.max(1, Math.round((b - a) / 86_400_000));
    }
  }
  if (typeof nights === "number" && Number.isFinite(nights) && nights > 0) {
    return Math.round(nights);
  }
  return 0;
}

export function shareDestinationLabel(opts: {
  destinationIata?: string;
  destinationName?: string;
  destinationPlace?: string;
  lang?: string;
}): { city: string; country?: string; placeLine: string } {
  const iata = asShareIata(opts.destinationIata) ?? "";
  const meta = iata ? lookupDestination(iata) : undefined;
  const city =
    clip(opts.destinationPlace, 80) ||
    clip(opts.destinationName, 80) ||
    meta?.name ||
    iata ||
    "Trip";
  const locale = resolveTripLocale(iata, city, opts.lang === "en" ? "en" : "sl");
  const country = locale.country !== "XX" ? locale.countryName : undefined;
  return {
    city,
    country,
    placeLine: country ? `${city}, ${country}` : city,
  };
}

export function upgradeShareImageUrl(url?: string): string {
  const raw = url?.trim() ?? "";
  if (!raw) return RESORT_COVER_FALLBACKS[0];
  const abs = normalizeCoverUrl(raw);
  if (!/^https?:\/\//i.test(abs)) return RESORT_COVER_FALLBACKS[0];
  return abs.replace(/\/max\d+x\d+\//i, "/max1280x900/");
}

export function buildShareOgTitle(opts: {
  city: string;
  country?: string;
  days: number;
  pricePerPerson: number;
  lang?: string;
}): string {
  const place = opts.country ? `${opts.city}, ${opts.country}` : opts.city;
  const price = Math.max(0, Math.round(opts.pricePerPerson));
  const days = Math.max(1, Math.round(opts.days) || 1);
  const lang = (opts.lang ?? "sl").slice(0, 2);
  if (price <= 0) {
    if (lang === "sl") return `${place} – pripravljen oddih z letom in hotelom`;
    if (lang === "de") return `${place} – Urlaub mit Flug und Hotel`;
    return `${place} – a ready-made getaway with flights and hotel`;
  }
  if (lang === "sl") {
    return `${place} – ${days} dni oddiha z letom in hotelom že od ${price} € / osebo`;
  }
  if (lang === "de") {
    return `${place} – ${days} Tage Urlaub mit Flug und Hotel ab ${price} € / Person`;
  }
  return `${place} – ${days}-day getaway with flights and hotel from ${price} € / person`;
}

export function buildShareOgDescription(lang?: string): string {
  const code = (lang ?? "sl").slice(0, 2);
  if (code === "sl") {
    return "Preveri pripravljen paket z letalsko karto in preverjenim hotelom z oceno 8+.";
  }
  if (code === "de") {
    return "Sieh dir das fertige Paket mit Flug und geprüftem Hotel (Note 8+) an.";
  }
  return "Check this ready-made package with a flight and a verified 8+ hotel.";
}

export function buildShareOgMeta(opts: {
  destinationIata?: string;
  destinationName?: string;
  destinationPlace?: string;
  depart?: string;
  return?: string;
  nights?: number;
  pricePerPerson: number;
  imageUrl?: string;
  lang?: string;
}): ShareOgMeta {
  const dest = shareDestinationLabel(opts);
  const days = tripDayCount(opts.depart, opts.return, opts.nights) || 1;
  return {
    title: buildShareOgTitle({
      city: dest.city,
      country: dest.country,
      days,
      pricePerPerson: opts.pricePerPerson,
      lang: opts.lang,
    }),
    description: buildShareOgDescription(opts.lang),
    image: upgradeShareImageUrl(opts.imageUrl),
  };
}

export function buildSharePlanPath(params: SharePlanParams): string {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.depart) q.set("depart", params.depart);
  if (params.return) q.set("return", params.return);
  if (params.style) q.set("style", params.style);
  if (params.hotelId) q.set("hotelId", params.hotelId);
  if (params.guests && params.guests > 0) q.set("guests", String(params.guests));
  if (params.s) q.set("s", params.s);
  const qs = q.toString();
  return qs ? `/plan?${qs}` : "/plan";
}

export function absoluteShareUrl(path: string, origin?: string): string {
  const base = (origin || SKYBOOPLAN_SITE).replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function slimShareOffer(offer: ResortHotelOffer): ResortHotelOffer {
  return {
    id: offer.id,
    tier: offer.tier,
    name: clip(offer.name, 160) ?? offer.name,
    imageUrl: offer.imageUrl,
    images: (offer.images ?? []).slice(0, 6),
    guestScore: offer.guestScore,
    reviewWord: clip(offer.reviewWord, 40),
    hotelEur: offer.hotelEur,
    mealPlan: offer.mealPlan,
    bookingHref: offer.bookingHref,
  };
}

/** Keep live cards + resort blocks. Do not persist React-only blobs. */
export function slimPlanForShare(plan: AiTripPlan): AiTripPlan {
  return {
    destinationName: clip(plan.destinationName, 200) ?? "Trip",
    summary: clip(plan.summary, 800) ?? "",
    contentLanguage: plan.contentLanguage,
    totalBudgetEur: plan.totalBudgetEur,
    flightTotalEur: plan.flightTotalEur,
    centerLat: plan.centerLat,
    centerLng: plan.centerLng,
    originIata: plan.originIata,
    destinationIata: plan.destinationIata,
    originPlace: clip(plan.originPlace, 120),
    destinationPlace: clip(plan.destinationPlace, 120),
    accommodationMode: plan.accommodationMode,
    groundTransportMode: plan.groundTransportMode,
    travelPace: plan.travelPace,
    tripStyle: plan.tripStyle,
    weatherWidget: plan.weatherWidget,
    safetyWarning: plan.safetyWarning ?? undefined,
    travelRequirements: plan.travelRequirements,
    hotels: plan.hotels,
    flightContext: plan.flightContext,
    resortStay: plan.resortStay,
    resortOffers: (plan.resortOffers ?? []).slice(0, 6).map(slimShareOffer),
    days: (plan.days ?? []).map((d) => ({
      ...d,
      city: clip(d.city, 120) ?? d.city,
      title: clip(d.title, 400) ?? d.title,
    })),
  };
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  if (typeof document === "undefined") return false;
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  return ok;
}
