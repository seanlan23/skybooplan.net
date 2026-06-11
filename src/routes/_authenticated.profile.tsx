import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Skybooplan" }] }),
  component: ProfilePage,
});

const TRAVEL_STYLES = ["Family-friendly", "Hidden gems", "Foodie", "Adventure", "Slow travel", "Luxury", "Budget"];

function ProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [bio, setBio] = useState("");
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [styles, setStyles] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setFullName(data.full_name ?? "");
        setHomeCity(data.home_city ?? "");
        setBio(data.bio ?? "");
        setLanguage(data.preferred_language ?? "en");
        setCurrency((data.preferred_currency as "EUR" | "USD") ?? "EUR");
        setStyles(data.travel_style ?? []);
      }
      setLoading(false);
    });
  }, [user]);

  const toggleStyle = (s: string) => {
    setStyles((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      home_city: homeCity,
      bio,
      preferred_language: language,
      preferred_currency: currency,
      travel_style: styles,
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved.");
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />
      <main className="flex-1 mx-auto max-w-3xl w-full px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground">Your profile</h1>
        <p className="mt-2 text-muted-foreground">This helps the AI personalize your travel plans.</p>

        {loading ? (
          <div className="mt-8 text-muted-foreground">Loading…</div>
        ) : (
          <div className="mt-8 rounded-3xl bg-card border border-border shadow-[var(--shadow-card)] p-8 space-y-6">
            <Row label="Full name">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
            </Row>
            <Row label="Email">
              <input value={user?.email ?? ""} disabled className={`${inputClass} opacity-60`} />
            </Row>
            <Row label="Home city">
              <input value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder="Ljubljana"
                className={inputClass} />
            </Row>
            <div className="grid grid-cols-2 gap-4">
              <Row label="Language">
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
                  <option value="sl">Slovenščina</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="it">Italiano</option>
                  <option value="de">Deutsch</option>
                </select>
              </Row>
              <Row label="Currency">
                <select value={currency} onChange={(e) => setCurrency(e.target.value as "EUR" | "USD")} className={inputClass}>
                  <option value="EUR">€ EUR</option>
                  <option value="USD">$ USD</option>
                </select>
              </Row>
            </div>
            <Row label="Travel style">
              <div className="flex flex-wrap gap-2">
                {TRAVEL_STYLES.map((s) => (
                  <button key={s} type="button" onClick={() => toggleStyle(s)}
                    className={`rounded-full px-3 py-1.5 text-sm border transition-all ${
                      styles.includes(s)
                        ? "bg-brand text-brand-foreground border-brand"
                        : "bg-background text-foreground/80 border-border hover:border-brand/50"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="About you">
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                placeholder="Tell us a bit about how you like to travel…" className={inputClass} />
            </Row>

            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-warm)" }}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

const inputClass = "w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-[15px] focus:outline-none focus:border-brand transition-colors";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
