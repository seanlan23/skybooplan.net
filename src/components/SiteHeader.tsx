import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, User as UserIcon, LogOut } from "lucide-react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useState, useRef, useEffect } from "react";
import logo from "@/assets/skybooplan-logo-transparent-v2.png";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";

export function SiteHeader() {
  const t = useT();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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
          {user ? (
            <>
              <Link
                to="/my-trips"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
                className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
              >
                <LayoutGrid className="h-4 w-4" />
                {t("nav.myPlans")}
              </Link>
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-brand text-brand-foreground text-sm font-semibold hover:opacity-90"
                >
                  {user.email?.[0].toUpperCase() ?? "U"}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                    </div>
                    <Link to="/profile" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted">
                      <UserIcon className="h-4 w-4" /> {t("nav.profile")}
                    </Link>
                    <Link to="/my-trips" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted">
                      <LayoutGrid className="h-4 w-4" /> {t("nav.myTrips")}
                    </Link>
                    <button
                      onClick={async () => { await signOut(); setMenuOpen(false); navigate({ to: "/" }); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-muted"
                    >
                      <LogOut className="h-4 w-4" /> {t("nav.signOut")}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-semibold text-foreground hover:text-brand transition-colors px-3 py-2">
                {t("nav.signIn")}
              </Link>
              <Link to="/signup"
                className="hidden sm:inline-flex rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow-md transition-shadow"
                style={{ background: "var(--gradient-warm)" }}>
                {t("nav.signUp")}
              </Link>
            </>
          )}
          <LanguagePicker />

        </div>
      </div>
    </header>
  );
}
