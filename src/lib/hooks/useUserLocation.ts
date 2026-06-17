import { useEffect, useState } from "react";

export type UserLocation = {
  latitude: number;
  longitude: number;
  source: "gps" | "ip";
};

export type UserLocationState = {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
};

type IpApiResponse = {
  latitude?: number;
  longitude?: number;
  country_code?: string;
};

const IPAPI_URL = "https://ipapi.co/json/";

function readCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function fetchIpLocation(): Promise<UserLocation | null> {
  try {
    const res = await fetch(IPAPI_URL);
    if (!res.ok) return null;

    const data = (await res.json()) as IpApiResponse;
    const latitude = readCoordinate(data.latitude);
    const longitude = readCoordinate(data.longitude);
    if (latitude == null || longitude == null) return null;

    return { latitude, longitude, source: "ip" };
  } catch {
    return null;
  }
}

function fetchGpsLocation(): Promise<UserLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "gps",
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 300_000,
      },
    );
  });
}

export function useUserLocation(): UserLocationState {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveLocation() {
      setLoading(true);
      setError(null);

      const gps = await fetchGpsLocation();
      if (cancelled) return;

      if (gps) {
        setLocation(gps);
        setLoading(false);
        return;
      }

      const ip = await fetchIpLocation();
      if (cancelled) return;

      if (ip) {
        setLocation(ip);
      } else {
        setError("location_unavailable");
      }
      setLoading(false);
    }

    void resolveLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  return { location, loading, error };
}
