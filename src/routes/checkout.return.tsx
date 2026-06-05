import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export const Route = createFileRoute('/checkout/return')({
  validateSearch: (search: Record<string, unknown>): { session_id?: string; plan_id?: string } => ({
    session_id: typeof search.session_id === 'string' ? search.session_id : undefined,
    plan_id: typeof search.plan_id === 'string' ? search.plan_id : undefined,
  }),
  component: CheckoutReturn,
});

type SyncState = 'syncing' | 'ready' | 'timeout';

function CheckoutReturn() {
  const { session_id, plan_id } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<SyncState>('syncing');
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);

  // Poll the subscriptions table until status=active OR ~30s elapsed.
  // Stripe webhook usually arrives within 1–3s on sandbox, longer in production.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Anonymous return (shouldn't happen, but don't block UI)
      setState('ready');
      return;
    }

    cancelledRef.current = false;
    const MAX_ATTEMPTS = 20; // 20 × 1500ms ≈ 30s
    const POLL_MS = 1500;

    const tick = async (n: number) => {
      if (cancelledRef.current) return;
      setAttempt(n);
      const { data } = await supabase
        .from('subscriptions')
        .select('tier,status,current_period_end')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const tier = data?.tier ?? 'free';
      const status = data?.status ?? 'active';
      const periodEnd = data?.current_period_end ?? null;
      const notExpired = !periodEnd || new Date(periodEnd).getTime() > Date.now();
      const active = tier !== 'free' && status === 'active' && notExpired;

      if (active) {
        // Broadcast so the subscription hook on other tabs/components refreshes.
        window.dispatchEvent(new Event('subscription:refresh'));
        setState('ready');

        // Auto-navigate to the freshly paid plan, or to the My trips list.
        setTimeout(() => {
          if (cancelledRef.current) return;
          if (plan_id) {
            navigate({ to: '/my-trips/$planId', params: { planId: plan_id } });
          } else {
            navigate({ to: '/my-trips' });
          }
        }, 900);
        return;
      }

      if (n >= MAX_ATTEMPTS) {
        setState('timeout');
        return;
      }
      setTimeout(() => tick(n + 1), POLL_MS);
    };

    tick(1);
    return () => {
      cancelledRef.current = true;
    };
  }, [user, authLoading, plan_id, navigate]);

  const headerIcon =
    state === 'ready' ? (
      <CheckCircle2 className="h-9 w-9 text-brand" />
    ) : state === 'timeout' ? (
      <AlertTriangle className="h-9 w-9 text-amber-500" />
    ) : (
      <Loader2 className="h-9 w-9 text-brand animate-spin" />
    );

  const title =
    state === 'ready'
      ? 'Plačilo potrjeno!'
      : state === 'timeout'
        ? 'Plačilo še ni potrjeno'
        : 'Potrjujemo plačilo…';

  const description =
    state === 'ready'
      ? 'Tvoj plan je odklenjen. Preusmerjamo te v Moja potovanja…'
      : state === 'timeout'
        ? 'Plačilo je bilo izvedeno, vendar se posodobitev še sinhronizira. Osveži stran čez nekaj sekund.'
        : `Sinhronizacija s ponudnikom plačila${'.'.repeat((attempt % 3) + 1)}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--gradient-hero)' }}>
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-md text-center bg-card rounded-3xl border border-border p-10 shadow-[var(--shadow-card)]">
          <div className="mx-auto w-16 h-16 rounded-full bg-brand-soft flex items-center justify-center mb-6">
            {headerIcon}
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">{title}</h1>
          <p className="text-muted-foreground mb-8 min-h-[3rem]">{description}</p>
          {session_id && state !== 'ready' && (
            <p className="text-xs text-muted-foreground mb-6 font-mono opacity-60">
              session: {session_id.slice(0, 14)}…
            </p>
          )}
          <Link
            to="/my-trips"
            className="inline-flex items-center justify-center rounded-2xl px-6 py-3 font-semibold text-primary-foreground shadow-md hover:shadow-lg transition-all"
            style={{ background: 'var(--gradient-warm)' }}
          >
            Pojdi v Moja potovanja
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
