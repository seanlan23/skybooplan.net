import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { googleSignInHref } from "@/lib/auth.urls";

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

/** Bookmark-compatible page → server CSRF starter (no fetch). */
function GoogleAuthStartPage() {
  const { callbackUrl } = Route.useSearch();

  useEffect(() => {
    if (callbackUrl?.startsWith("http")) {
      const origin = new URL(callbackUrl).origin;
      window.location.replace(googleSignInHref(origin));
      return;
    }
    window.location.replace(googleSignInHref());
  }, [callbackUrl]);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="rounded-3xl border border-border bg-card px-8 py-10 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-foreground">Preusmerjam na Google…</p>
      </div>
    </div>
  );
}
