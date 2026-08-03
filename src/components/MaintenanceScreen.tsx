import { useEffect } from "react";
import { Settings } from "lucide-react";

/**
 * Full-site maintenance gate. Toggle with VITE_MAINTENANCE_MODE=true|false.
 * Default: on while the flag is unset or "true".
 */
export function isMaintenanceModeEnabled(): boolean {
  const flag = import.meta.env.VITE_MAINTENANCE_MODE;
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  // Enabled by default until the update window ends — set VITE_MAINTENANCE_MODE=false to reopen.
  return true;
}

/** Solid white cover over the whole viewport — nothing from the app UI shows through. */
export function MaintenanceScreen() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    document.title = "Skybooplan — Updating";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: "1.5rem",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        color: "#171717",
        textAlign: "center",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <Settings
        style={{
          width: 56,
          height: 56,
          marginBottom: 32,
          color: "#a3a3a3",
          animation: "skybooplan-gear-spin 3s linear infinite",
        }}
        strokeWidth={1.5}
        aria-hidden
      />
      <style>{`
        @keyframes skybooplan-gear-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#a3a3a3",
        }}
      >
        Skybooplan
      </p>
      <h1
        style={{
          margin: "12px 0 0",
          maxWidth: 420,
          fontSize: "clamp(1.5rem, 4vw, 1.875rem)",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "#171717",
        }}
      >
        We&apos;re currently updating
      </h1>
      <p
        style={{
          margin: "16px 0 0",
          maxWidth: 360,
          fontSize: 16,
          lineHeight: 1.6,
          color: "#737373",
        }}
      >
        The site is temporarily unavailable while we finish an update.
        <br />
        We expect to be back online by tomorrow at 17:00.
      </p>
    </div>
  );
}
