import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { startGoogleSignIn } from "@/lib/auth.urls";

export const Route = createFileRoute("/auth/google")({
  validateSearch: (search: Record<string, unknown>) => ({
    callbackUrl:
      typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
  }),
  head: () => ({
    meta: [{ title: "Google prijava — Skybooplan" }],
  }),
  component: GoogleAuthStartPage,
});

/** Intermediate page: Auth.js v5 needs CSRF POST — never GET /api/auth/signin/google. */
function GoogleAuthStartPage() {
  const { callbackUrl } = Route.useSearch();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Prefer explicit callback from query; otherwise default /auth/callback.
        if (callbackUrl?.startsWith("http")) {
          const origin = new URL(callbackUrl).origin;
          await startGoogleSignIn(origin);
        } else {
          await startGoogleSignIn();
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Google prijava ni uspela";
        setError(message);
        toast.error(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callbackUrl]);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="rounded-3xl border border-border bg-card px-8 py-10 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-foreground">
          {error ? error : "Preusmerjam na Google…"}
        </p>
        {error ? (
          <a
            href="/login"
            className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
          >
            Nazaj na prijavo
          </a>
        ) : null}
      </div>
    </div>
  );
}
