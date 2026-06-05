import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createHash, randomUUID } from 'crypto';
import {
  getRequestHeader,
  getRequestIP,
} from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

// ============================================================
// Types
// ============================================================

export type PdfDownloadRow = {
  id: string;
  downloaded_at: string;
  source: string | null;
  user_agent: string | null;
  ip_hash: string | null;
  user_id: string;
  user_email: string | null;
  user_full_name: string | null;
  plan_id: string;
  plan_title: string | null;
  plan_destination: string | null;
  status: string;
  runtime: string | null;
  request_id: string | null;
  referrer: string | null;
  error_message: string | null;
  byte_size: number | null;
};

export type PdfDownloadsResult = {
  rows: PdfDownloadRow[];
  totals: {
    total: number;
    failed: number;
    byUser: { user_id: string; email: string | null; full_name: string | null; count: number }[];
    byPlan: { plan_id: string; title: string | null; destination: string | null; count: number }[];
  };
};

// ============================================================
// Admin listing
// ============================================================

export const listPdfDownloads = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).optional(),
        userId: z.string().uuid().optional(),
        planId: z.string().uuid().optional(),
        status: z.enum(['success', 'failed', 'pending']).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PdfDownloadsResult> => {
    const { supabase, userId } = context;

    const { data: roleRow, error: roleErr } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleErr || !roleRow) {
      throw new Error('Forbidden');
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    let q = supabaseAdmin
      .from('pdf_downloads')
      .select(
        'id, downloaded_at, source, user_agent, ip_hash, user_id, plan_id, status, runtime, request_id, referrer, error_message, byte_size',
      )
      .order('downloaded_at', { ascending: false })
      .limit(data.limit ?? 200);
    if (data.userId) q = q.eq('user_id', data.userId);
    if (data.planId) q = q.eq('plan_id', data.planId);
    if (data.status) q = q.eq('status', data.status);

    const { data: downloads, error } = await q;
    if (error) throw new Error(error.message);
    const list = (downloads ?? []) as Array<{
      id: string;
      downloaded_at: string;
      source: string | null;
      user_agent: string | null;
      ip_hash: string | null;
      user_id: string;
      plan_id: string;
      status: string;
      runtime: string | null;
      request_id: string | null;
      referrer: string | null;
      error_message: string | null;
      byte_size: number | null;
    }>;

    const userIds = Array.from(new Set(list.map((r) => r.user_id)));
    const planIds = Array.from(new Set(list.map((r) => r.plan_id)));

    type ProfileLite = { user_id: string; email: string | null; full_name: string | null };
    type PlanLite = { id: string; title: string | null; destination: string | null };

    const [profilesRes, plansRes] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from('profiles').select('user_id, email, full_name').in('user_id', userIds)
        : Promise.resolve({ data: [] as ProfileLite[] }),
      planIds.length
        ? supabaseAdmin.from('travel_plans').select('id, title, destination').in('id', planIds)
        : Promise.resolve({ data: [] as PlanLite[] }),
    ]);

    const profileMap = new Map<string, ProfileLite>(
      ((profilesRes.data ?? []) as ProfileLite[]).map((p) => [p.user_id, p]),
    );
    const planMap = new Map<string, PlanLite>(
      ((plansRes.data ?? []) as PlanLite[]).map((p) => [p.id, p]),
    );

    const rows: PdfDownloadRow[] = list.map((r) => {
      const p = profileMap.get(r.user_id);
      const pl = planMap.get(r.plan_id);
      return {
        id: r.id,
        downloaded_at: r.downloaded_at,
        source: r.source,
        user_agent: r.user_agent,
        ip_hash: r.ip_hash,
        user_id: r.user_id,
        user_email: p?.email ?? null,
        user_full_name: p?.full_name ?? null,
        plan_id: r.plan_id,
        plan_title: pl?.title ?? null,
        plan_destination: pl?.destination ?? null,
        status: r.status,
        runtime: r.runtime,
        request_id: r.request_id,
        referrer: r.referrer,
        error_message: r.error_message,
        byte_size: r.byte_size,
      };
    });

    const byUserMap = new Map<
      string,
      { user_id: string; email: string | null; full_name: string | null; count: number }
    >();
    const byPlanMap = new Map<
      string,
      { plan_id: string; title: string | null; destination: string | null; count: number }
    >();
    let failed = 0;
    for (const r of rows) {
      if (r.status === 'failed') failed += 1;
      const u = byUserMap.get(r.user_id) ?? {
        user_id: r.user_id,
        email: r.user_email,
        full_name: r.user_full_name,
        count: 0,
      };
      u.count += 1;
      byUserMap.set(r.user_id, u);

      const pl = byPlanMap.get(r.plan_id) ?? {
        plan_id: r.plan_id,
        title: r.plan_title,
        destination: r.plan_destination,
        count: 0,
      };
      pl.count += 1;
      byPlanMap.set(r.plan_id, pl);
    }

    return {
      rows,
      totals: {
        total: rows.length,
        failed,
        byUser: Array.from(byUserMap.values()).sort((a, b) => b.count - a.count),
        byPlan: Array.from(byPlanMap.values()).sort((a, b) => b.count - a.count),
      },
    };
  });

// ============================================================
// Logging a PDF download (called from client after generation)
// ============================================================

const SourceEnum = z.enum(['trip_detail', 'trip_list', 'home', 'preview', 'email']);
const StatusEnum = z.enum(['success', 'failed', 'pending']);

export const logPdfDownload = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        planId: z.string().uuid(),
        source: SourceEnum.optional(),
        status: StatusEnum.optional().default('success'),
        errorMessage: z.string().max(1000).optional(),
        byteSize: z.number().int().min(0).max(200_000_000).optional(),
        runtime: z.enum(['browser', 'ssr', 'edge', 'worker', 'unknown']).optional(),
        referrer: z.string().max(2000).optional(),
        requestId: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const userAgent = getRequestHeader('user-agent') ?? null;
    const referrer = data.referrer ?? getRequestHeader('referer') ?? null;
    const requestId =
      data.requestId ??
      getRequestHeader('x-request-id') ??
      getRequestHeader('cf-ray') ??
      randomUUID();

    const ip = (() => {
      try {
        return getRequestIP({ xForwardedFor: true }) ?? null;
      } catch {
        return null;
      }
    })();
    const ipHash = ip
      ? createHash('sha256').update(`${ip}:pdf_downloads`).digest('hex').slice(0, 32)
      : null;

    // This handler always runs on the server (Worker). The client passes its own
    // runtime indicator (browser) so the row reflects where the user triggered it.
    const runtime = data.runtime ?? 'edge';

    const { error } = await supabase.from('pdf_downloads').insert({
      user_id: userId,
      plan_id: data.planId,
      source: data.source ?? null,
      status: data.status,
      error_message: data.errorMessage ?? null,
      byte_size: data.byteSize ?? null,
      user_agent: userAgent,
      referrer,
      ip_hash: ipHash,
      request_id: requestId,
      runtime,
    });

    if (error) {
      console.error('[pdf_downloads] insert failed', {
        requestId,
        userId,
        planId: data.planId,
        error: error.message,
      });
      return { ok: false as const, requestId, error: error.message };
    }

    return { ok: true as const, requestId };
  });
