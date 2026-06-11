import { Link } from "@tanstack/react-router";
import { LayoutGrid, User as UserIcon, LogOut } from "lucide-react";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { LanguagePicker } from "@/components/LanguagePicker";
import { GoogleIcon } from "@/components/GoogleIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useRef, useEffect } from "react";
import logo from "@/assets/skybooplan-logo-transparent-v2.png";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { googleSignInHref } from "@/lib/auth.urls";

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

  return (
    <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 h-28 flex items-center justify-between gap-8">
        <Link to="/" className="flex items-center shrink-0">
          <img src={logo} alt="Skybooplan" className="h-16 sm:h-[4.6rem] w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium text-foreground/80">
          <a href="#flights" className="hover:text-foreground transition-colors">{t("nav.flights")}</a>
          <a href="#stays" className="hover:text-foreground transition-colors">{t("nav.stays")}</a>
          <a href="#ai-planner" className="hover:text-foreground transition-colors">{t("nav.ai")}</a>
        </nav>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-9 w-24 rounded-full bg-muted/60 animate-pulse" />
          ) : user ? (
            <>
              <Link
                to="/dashboard"
                className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
              >
                <LayoutGrid className="h-4 w-4" />
                {t("dashboard.badge")}
              </Link>
              <div ref={menuRef} className="relative flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 sm:pr-3 hover:bg-muted/60 transition-colors"
                  aria-label={displayName}
                >
                  <Avatar className="h-9 w-9 border border-border">
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
                    <Link to="/dashboard" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted">
                      <LayoutGrid className="h-4 w-4" /> {t("dashboard.badge")}
                    </Link>
                    <Link to="/profile" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted">
                      <UserIcon className="h-4 w-4" /> {t("nav.profile")}
                    </Link>
                    <Link to="/my-trips" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted">
                      <LayoutGrid className="h-4 w-4" /> {t("nav.myTrips")}
                    </Link>
                    <button
                      type="button"
                      onClick={() => { void signOut(); setMenuOpen(false); }}
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
              className="inline-flex items-center gap-2.5 rounded-full border border-border/80 bg-background px-4 py-2.5 text-sm font-semibold shadow-sm transition-all hover:border-brand/30 hover:shadow-md"
            >
              <GoogleIcon className="h-4 w-4" />
              <span>{t("nav.signInGoogle")}</span>
            </a>
          )}
          <CurrencyPicker />
          <LanguagePicker />
        </div>
      </div>
    </header>
  );
}
