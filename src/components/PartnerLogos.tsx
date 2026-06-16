import { cn } from "@/lib/utils";

type LogoProps = { className?: string };

/** Official Simple Icons path — https://simpleicons.org/?q=booking */
export function BookingLogo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("h-8 w-8", className)}
      role="img"
      aria-label="Booking.com"
    >
      <title>Booking.com</title>
      <path d="M24 0H0v24h24ZM8.575 6.563h2.658c2.108 0 3.473 1.15 3.473 2.898 0 1.15-.575 1.82-.91 2.108l-.287.263.335.192c.815.479 1.318 1.389 1.318 2.395 0 1.988-1.51 3.257-3.857 3.257H7.449V7.713c0-.623.503-1.126 1.126-1.15zm1.7 1.868c-.479.024-.694.264-.694.79v1.893h1.676c.958 0 1.294-.743 1.294-1.365 0-.815-.503-1.318-1.318-1.318zm-.096 4.36c-.407.071-.598.31-.598.79v2.251h1.868c.934 0 1.509-.55 1.509-1.533 0-.934-.599-1.509-1.51-1.509zm7.737 2.394c.743 0 1.341.599 1.341 1.342a1.34 1.34 0 0 1-1.341 1.341 1.355 1.355 0 0 1-1.341-1.341c0-.743.598-1.342 1.34-1.342z" />
    </svg>
  );
}

/** Skyscanner mark + wordmark (brand lockup geometry). */
export function SkyscannerLogo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 168 32"
      fill="currentColor"
      className={cn("h-8 w-auto", className)}
      role="img"
      aria-label="Skyscanner"
    >
      <title>Skyscanner</title>
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M16 6.5a9.5 9.5 0 0 1 6.7 16.1l-1.9-1.9a6.8 6.8 0 1 0-9.6 0l-1.9 1.9A9.5 9.5 0 0 1 16 6.5z"
        fill="currentColor"
      />
      <path d="M16 10.5 20.8 16 16 21.5 11.2 16 16 10.5z" fill="currentColor" />
      <text
        x="36"
        y="21.5"
        fill="currentColor"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="17"
        fontWeight="700"
        letterSpacing="-0.02em"
      >
        Skyscanner
      </text>
    </svg>
  );
}

/** Airalo wordmark. */
export function AiraloLogo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 96 32"
      fill="currentColor"
      className={cn("h-8 w-auto", className)}
      role="img"
      aria-label="Airalo"
    >
      <title>Airalo</title>
      <text
        x="0"
        y="22"
        fill="currentColor"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="22"
        fontWeight="700"
        letterSpacing="-0.03em"
      >
        airalo
      </text>
    </svg>
  );
}

/** Duffel wordmark. */
export function DuffelLogo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 108 32"
      fill="currentColor"
      className={cn("h-8 w-auto", className)}
      role="img"
      aria-label="Duffel"
    >
      <title>Duffel</title>
      <text
        x="0"
        y="22"
        fill="currentColor"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize="22"
        fontWeight="700"
        letterSpacing="-0.04em"
      >
        duffel
      </text>
    </svg>
  );
}

export const PARTNER_LOGOS = [
  { id: "booking", Logo: BookingLogo },
  { id: "skyscanner", Logo: SkyscannerLogo },
  { id: "airalo", Logo: AiraloLogo },
  { id: "duffel", Logo: DuffelLogo },
] as const;
