import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { hasUnlimitedAccess } from "@/lib/unlimitedAccess";

export type SubscriptionInfo = {
  loading: boolean;
  isActive: boolean;
  tier: "free" | "one_time" | "monthly" | "yearly" | null;
  currentPeriodEnd: string | null;
  refresh: () => Promise<void>;
};

/**
 * Reads the current user's subscription row.
 * Considers the subscription active when status = 'active' and tier != 'free'.
 * One-time purchases (tier = 'one_time') count as active for plans created
 * before the period ends.
 *
 * Auto-refreshes on window focus and on the "subscription:refresh" event so
 * the dashboard unlocks immediately once the Stripe webhook lands in the DB.
 */
export function useSubscription(): SubscriptionInfo {
  const { user } = useAuth();
  const [info, setInfo] = useState<Omit<SubscriptionInfo, "refresh">>({
    loading: true,
    isActive: false,
    tier: null,
    currentPeriodEnd: null,
  });
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const fetchOnce = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setInfo({ loading: false, isActive: false, tier: null, currentPeriodEnd: null });
      return;
    }

    if (hasUnlimitedAccess(user?.email)) {
      setInfo({
        loading: false,
        isActive: true,
        tier: "yearly",
        currentPeriodEnd: null,
      });
      return;
    }

    const { data } = await supabase
      .from("subscriptions")
      .select("tier,status,current_period_end")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tier = (data?.tier ?? "free") as SubscriptionInfo["tier"];
    const status = data?.status ?? "active";
    const periodEnd = data?.current_period_end ?? null;
    const notExpired = !periodEnd || new Date(periodEnd).getTime() > Date.now();
    const isActive = tier !== "free" && status === "active" && notExpired;
    setInfo({ loading: false, isActive, tier, currentPeriodEnd: periodEnd });
  }, [user?.email]);

  useEffect(() => {
    fetchOnce();

    const onFocus = () => fetchOnce();
    const onCustom = () => fetchOnce();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchOnce();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("subscription:refresh", onCustom);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("subscription:refresh", onCustom);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id, fetchOnce]);

  return { ...info, refresh: fetchOnce };
}
