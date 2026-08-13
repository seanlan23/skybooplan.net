import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, User as UserIcon, LogOut } from "lucide-react";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { LanguagePicker } from "@/components/LanguagePicker";
import { Logo } from "@/components/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { googleSignInHref } from "@/lib/auth.urls";
import { HOME_RESET_EVENT, requestHomeReset } from "@/lib/sessionStore";
import { cn } from "@/lib/utils";

function userAvatarUrl(user: NonNullable<ReturnType<typeof useAuth>["user"]>): string | undefined {
  const meta = user.user_metadata ?? {};
  return (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined);
}

function userDisplayName(user: NonNullable<ReturnType<typeof useAuth>["user"]>): string {
  const meta = user.user_metadata ?? {};
  return (
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "U"
  );
}

export function SiteHeader({
  variant = "default",
  className,
}: {
  variant?: "default" | "hero";
  className?: string;
} = {}) {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isHero = variant === "hero";

  useEffect(() => {
    const onClick = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const avatarUrl = user ? userAvatarUrl(user) : undefined;
  const displayName = user ? userDisplayName(user) : "";

  function handleLogoClick(e: ReactMouseEvent<HTMLAnchorElement>) {
    requestHomeReset();
    if (pathname === "/") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(HOME_RESET_EVENT));
    }
  }

  const navLinkClass = cn(
    "transition-colors whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]",
    isHero ? "text-white hover:text-white" : "text-foreground/80 hover:text-foreground",
  );

  /** Hero sits on bright sky photos — never use bare translucent white text alone. */
  const subtleTextClass = cn(
    "text-sm font-medium transition-colors whitespace-nowrap",
    isHero
      ? "rounded-full bg-black/55 px-2.5 py-1 text-white shadow-sm ring-1 ring-white/30 hover:bg-black/70"
      : "text-foreground/80 hover:text-foreground",
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full max-w-full overflow-visible border-b backdrop-blur-md pt-[env(safe-area-inset-top)]",
        isHero
          ? "border-white/15 bg-gradient-to-b from-black/55 via-black/40 to-black/25 text-white"
          : "border-border/60 bg-background/80 text-foreground",
        className,
      )}
    >
      <div className="relative flex h-16 w-full items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
        {/* Left — logo (smaller on mobile; capped width so € / lang / sign-in never overlap) */}
        <div className="relative z-10 min-w-0 max-w-[calc(100%-10.5rem)] shrink sm:max-w-none">
          <Link
            to="/"
            onClick={handleLogoClick}
            className="flex h-11 max-w-full items-center overflow-hidden"
            aria-label="Skybooplan"
          >
            <Logo size="sm" className="md:hidden" />
            <Logo size="md" className="hidden md:inline-flex" />
          </Link>
        </div>

        {/* Center — navigation (desktop only) */}
        <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex items-center gap-6 lg:gap-10 text-[15px] font-medium">
          <a href="#hero-chat-window" className={navLinkClass}>
            {t("nav.flights")}
          </a>
          <a href="#hero-chat-window" className={navLinkClass}>
            {t("nav.stays")}
          </a>
          <a href="#ai-planner" className={navLinkClass}>
            {t("nav.ai")}
          </a>
        </nav>

        {/* Right — currency, language, auth */}
        <div className="relative z-10 flex shrink-0 items-center gap-1.5 sm:gap-3 md:gap-4">
          <CurrencyPicker variant={variant} />
          <LanguagePicker variant={variant} />

          {loading ? (
            <div className="h-5 w-16 animate-pulse rounded bg-muted/40" aria-hidden />
          ) : user ? (
            <>
              <Link
                to="/dashboard"
                aria-label={t("dashboard.badge")}
                className={cn("inline-flex items-center gap-2", subtleTextClass)}
              >
                <LayoutGrid className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t("dashboard.badge")}</span>
              </Link>
              <div ref={menuRef} className="relative flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={cn(
                    "flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors",
                    isHero ? "hover:bg-white/10" : "hover:bg-muted/60",
                  )}
                  aria-label={displayName}
                >
                  <Avatar
                    className={cn(
                      "h-8 w-8 sm:h-9 sm:w-9 border",
                      isHero ? "border-white/25" : "border-border",
                    )}
                  >
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                    <AvatarFallback className="bg-brand text-brand-foreground text-sm font-semibold">
                      {displayName[0]?.toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      "hidden md:inline max-w-[120px] truncate text-sm font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]",
                      isHero ? "text-white" : "text-foreground",
                    )}
                  >
                    {displayName}
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-border bg-card text-foreground shadow-lg overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <Link
                      to="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted"
                    >
                      <LayoutGrid className="h-4 w-4 shrink-0" /> {t("dashboard.badge")}
                    </Link>
                    <Link
                      to="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted"
                    >
                      <UserIcon className="h-4 w-4 shrink-0" /> {t("nav.profile")}
                    </Link>
                    <Link
                      to="/my-trips"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted"
                    >
                      <LayoutGrid className="h-4 w-4 shrink-0" /> {t("nav.myTrips")}
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        void signOut();
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-destructive hover:bg-muted"
                    >
                      <LogOut className="h-4 w-4 shrink-0" /> {t("nav.logout")}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <a
              href={googleSignInHref()}
              aria-label={t("nav.signInGoogle")}
              className={subtleTextClass}
            >
              {t("nav.signIn")} →
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
