import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { resolveOriginHubsForGeo } from "@/lib/originHubsByGeo";

function header(headers: Headers, name: string): string | null {
  const v = headers.get(name);
  return v?.trim() || null;
}

function parseCoord(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Suggest origin airport chips from coarse IP geo (Vercel / Cloudflare headers).
 * No GPS permission — country (+ optional lat/lng) only.
 */
export const suggestOriginHubs = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    country: string | null;
    city: string | null;
    iatas: string[];
  }> => {
    const request = getRequest();
    const headers = request?.headers ?? new Headers();

    const country = (
      header(headers, "x-vercel-ip-country") ||
      header(headers, "cf-ipcountry") ||
      header(headers, "x-country-code") ||
      ""
    )
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2);

    const city =
      header(headers, "x-vercel-ip-city") ||
      header(headers, "cf-ipcity") ||
      null;

    const lat = parseCoord(
      header(headers, "x-vercel-ip-latitude") || header(headers, "cf-iplatitude"),
    );
    const lng = parseCoord(
      header(headers, "x-vercel-ip-longitude") || header(headers, "cf-iplongitude"),
    );

    // Local/dev often has no geo headers — keep CE defaults.
    const iatas = resolveOriginHubsForGeo({
      country: country || null,
      lat,
      lng,
      limit: 6,
    });

    return {
      country: country || null,
      city,
      iatas,
    };
  },
);
