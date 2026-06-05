import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plane, Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset password — Skybooplan" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [mode, setMode] = useState<"request" | "set">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setMode("set");
    }
  }, []);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Check your email for the reset link.");
  };

  const setNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated.");
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--gradient-hero)" }}>
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8 text-foreground">
          <Plane className="h-6 w-6 text-brand" />
          <span className="font-bold text-xl">Skybooplan</span>
        </Link>

        <div className="rounded-3xl bg-card border border-border shadow-[var(--shadow-card)] p-8">
          <h1 className="text-2xl font-bold text-foreground">
            {mode === "request" ? "Reset password" : "Set new password"}
          </h1>

          <form onSubmit={mode === "request" ? requestReset : setNewPassword} className="mt-6 space-y-4">
            {mode === "request" ? (
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
                  className="w-full rounded-2xl border border-border bg-background pl-11 pr-4 py-3 focus:outline-none focus:border-brand" />
              </div>
            ) : (
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password"
                  className="w-full rounded-2xl border border-border bg-background pl-11 pr-4 py-3 focus:outline-none focus:border-brand" />
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full rounded-2xl py-3 font-semibold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-warm)" }}>
              {mode === "request" ? "Send reset link" : "Update password"}
            </button>
          </form>

          <Link to="/login" className="mt-6 block text-center text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
