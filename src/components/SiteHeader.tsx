import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, User as UserIcon, LogOut } from "lucide-react";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { LanguagePicker } from "@/components/LanguagePicker";
import { GoogleIcon } from "@/components/GoogleIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useRef, useEffect, type MouseEvent } from "react";
import logo from "@/assets/skybooplan-logo-transparent-v2.png";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { googleSignInHref } from "@/lib/auth.urls";
import { HOME_RESET_EVENT, requestHomeReset } from "@/lib/sessionStore";

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

export function SiteHeader() {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const avatarUrl = user ? userAvatarUrl(user) : undefined;
  const displayName = user ? userDisplayName(user) : "";

  function handleLogoClick(e: MouseEvent) {
    requestHomeReset();
    if (pathname === "/") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(HOME_RESET_EVENT));
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full max-w-full overflow-x-hidden bg-background/80 backdrop-blur-md border-b border-border/60">
      <div className="mx-auto max-w-7xl w-full min-w-0 px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2 py-3 lg:h-28 lg:py-0">
          <Link to="/" onClick={handleLogoClick} className="flex items-center shrink-0 min-w-0">
            <img
              src={logo}
              alt="Skybooplan"
              className="h-11 w-auto sm:h-14 lg:h-[4.6rem] max-w-[min(11rem,42vw)]"
            />
          </Link>

          <nav className="hidden md:flex flex-1 items-center justify-center gap-6 lg:gap-10 px-2 text-[15px] font-medium text-foreground/80 min-w-0">
            <a href="#flights" className="hover:text-foreground transition-colors whitespace-nowrap">
              {t("nav.flights")}
            </a>
            <a href="#stays" className="hover:text-foreground transition-colors whitespace-nowrap">
              {t("nav.stays")}
            </a>
            <a href="#ai-planner" className="hover:text-foreground transition-colors whitespace-nowrap">
              {t("nav.ai")}
            </a>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {loading ? (
              <div className="h-9 w-9 sm:w-24 rounded-full bg-muted/60 animate-pulse" />
            ) : user ? (
              <>
                <Link
                  to="/dashboard"
                  className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
                >
                  <LayoutGrid className="h-4 w-4" />
                  {t("dashboard.badge")}
                </Link>
                <div ref={menuRef} className="relative flex items-center gap-1.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 sm:pr-3 hover:bg-muted/60 transition-colors"
                    aria-label={displayName}
                  >
                    <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border border-border">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                      <AvatarFallback className="bg-brand text-brand-foreground text-sm font-semibold">
                        {displayName[0]?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline max-w-[140px] truncate text-sm font-medium text-foreground">
                      {displayName}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-muted/60 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("nav.logout")}
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-border bg-card shadow-lg overflow-hidden z-50">
                      <div className="px-4 py-3 border-b border-border">
                        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Link
                        to="/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted"
                      >
                        <LayoutGrid className="h-4 w-4" /> {t("dashboard.badge")}
                      </Link>
                      <Link
                        to="/profile"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted"
                      >
                        <UserIcon className="h-4 w-4" /> {t("nav.profile")}
                      </Link>
                      <Link
                        to="/my-trips"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted"
                      >
                        <LayoutGrid className="h-4 w-4" /> {t("nav.myTrips")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          void signOut();
                          setMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-muted sm:hidden"
                      >
                        <LogOut className="h-4 w-4" /> {t("nav.logout")}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <a
                href={googleSignInHref()}
                aria-label={t("nav.signInGoogle")}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-all hover:border-brand/30 hover:shadow-md shrink-0"
              >
                <GoogleIcon className="h-4 w-4 shrink-0" />
                <span>{t("nav.signIn")}</span>
              </a>
            )}

            <div className="hidden lg:flex items-center gap-2">
              <CurrencyPicker />
              <LanguagePicker />
            </div>
          </div>
        </div>

        <div className="flex lg:hidden items-center justify-end gap-2 pb-3 border-t border-border/40 pt-2">
          <CurrencyPicker compact />
          <LanguagePicker compact />
        </div>
      </div>
    </header>
  );
}
