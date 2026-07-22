import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Logo, LogoMark } from "@/components/Logo";
import { googleSignInHref } from "@/lib/auth.urls";

export const Route = createFileRoute("/auth/google")({
  validateSearch: (search: Record<string, unknown>) => ({
    callbackUrl:
      typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
  }),
  head: () => ({
    meta: [{ title: "Google prijava — skybooplan" }],
  }),
  component: GoogleAuthStartPage,
});

/** Bookmark-compatible page → server CSRF starter. */
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
      style={{
        background:
          "linear-gradient(165deg, oklch(0.99 0.01 240) 0%, oklch(0.96 0.04 235) 42%, oklch(0.98 0.03 70) 100%)",
      }}
    >
      <div className="w-full max-w-sm rounded-[28px] border border-sky-200/60 bg-white px-8 py-10 text-center shadow-[0_18px_40px_rgba(2,132,199,0.1)]">
        <Link to="/" className="mb-6 inline-flex justify-center" aria-label="skybooplan">
          <Logo size="md" />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Povezujem z Googlom
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Trenutek — odpiram varno Google prijavo za tvoj skybooplan račun.
        </p>
        <div
          className="relative mx-auto mt-8 grid h-16 w-16 place-items-center rounded-full"
          style={{
            background:
              "linear-gradient(145deg, rgba(14,165,233,0.12), rgba(244,162,97,0.16))",
          }}
          aria-hidden
        >
          <span className="absolute inset-[-4px] animate-spin rounded-full border-2 border-transparent border-t-sky-500 border-r-orange-400" />
          <LogoMark size={28} />
        </div>
        <p className="mt-6 text-xs text-slate-500">
          AI travel agent · <span className="font-semibold text-sky-700">skybooplan</span>
        </p>
      </div>
    </div>
  );
}
