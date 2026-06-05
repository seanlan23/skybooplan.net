import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Repeat2, ArrowRight, Minus, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { replayWebhookEvent } from '@/lib/webhooks.functions';

export const Route = createFileRoute('/_authenticated/admin/webhooks')({
  head: () => ({
    meta: [{ title: 'Webhook dogodki — Admin' }],
  }),
  component: WebhookEventsPage,
});

type WebhookEvent = {
  id: string;
  stripe_event_id: string | null;
  event_type: string;
  environment: string;
  status: string;
  error_message: string | null;
  payload_masked: any;
  user_id: string | null;
  stripe_object_id: string | null;
  created_at: string;
  processed_at: string | null;
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  processed: 'default',
  received: 'secondary',
  ignored: 'outline',
  failed: 'destructive',
};

function WebhookEventsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [selected, setSelected] = useState<WebhookEvent | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const replayFn = useServerFn(replayWebhookEvent);

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ['is-admin'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });

  const {
    data: events,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['webhook-events', statusFilter, envFilter],
    enabled: isAdmin === true,
    queryFn: async () => {
      let q = supabase
        .from('webhook_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (envFilter !== 'all') q = q.eq('environment', envFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as WebhookEvent[];
    },
  });

  const { data: audits, refetch: refetchAudits } = useQuery({
    queryKey: ['replay-audits', selected?.id],
    enabled: !!selected?.id && isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_replay_audits')
        .select('*')
        .eq('original_event_id', selected!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  async function handleReplay(eventId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setReplayingId(eventId);
    try {
      const res = await replayFn({ data: { eventId } });
      if (res.ok) {
        const changed = (res.diff ?? []).filter((d: any) => d.kind !== 'unchanged').length;
        toast.success(`Replay uspešen (${res.outcome}) — ${changed} sprememb v naročninah`);
      } else {
        toast.error(`Replay neuspešen: ${res.error ?? 'neznana napaka'}`);
      }
      await Promise.all([refetch(), refetchAudits()]);
    } catch (err: any) {
      toast.error(`Replay napaka: ${err?.message ?? String(err)}`);
    } finally {
      setReplayingId(null);
    }
  }

  if (roleLoading) {
    return (
      <div className="p-8 text-muted-foreground">Preverjam dovoljenja…</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Dostop zavrnjen</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Ta stran je dostopna samo administratorjem.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webhook dogodki</h1>
          <p className="text-muted-foreground">
            Prejeti Stripe webhook-i in stanje obdelave. Občutljivi podatki so maskirani.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Osveži
        </Button>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vsi statusi</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={envFilter} onValueChange={setEnvFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Okolje" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vsa okolja</SelectItem>
            <SelectItem value="sandbox">Sandbox</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Nalagam…</div>
          ) : !events?.length ? (
            <div className="p-8 text-center text-muted-foreground">Ni dogodkov.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Čas</TableHead>
                  <TableHead>Tip dogodka</TableHead>
                  <TableHead>Okolje</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stripe ID</TableHead>
                  <TableHead>Napaka</TableHead>
                  <TableHead className="text-right">Dejanja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(e)}
                  >
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString('sl-SI')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.event_type}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.environment}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[e.status] ?? 'outline'}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                      {e.stripe_object_id ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                      {e.error_message ?? ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={replayingId === e.id}
                        onClick={(ev) => handleReplay(e.id, ev)}
                      >
                        <Repeat2 className={`h-4 w-4 mr-1 ${replayingId === e.id ? 'animate-spin' : ''}`} />
                        Replay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {selected?.event_type}{' '}
              <Badge variant={statusVariant[selected?.status ?? ''] ?? 'outline'}>
                {selected?.status}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={replayingId === selected.id}
                  onClick={() => handleReplay(selected.id)}
                >
                  <Repeat2 className={`h-4 w-4 mr-2 ${replayingId === selected.id ? 'animate-spin' : ''}`} />
                  Ponovno obdelaj (replay)
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Stripe event ID:</span><br /><code className="text-xs">{selected.stripe_event_id ?? '—'}</code></div>
                <div><span className="text-muted-foreground">Stripe object ID:</span><br /><code className="text-xs">{selected.stripe_object_id ?? '—'}</code></div>
                <div><span className="text-muted-foreground">User ID:</span><br /><code className="text-xs">{selected.user_id ?? '—'}</code></div>
                <div><span className="text-muted-foreground">Okolje:</span><br />{selected.environment}</div>
                <div><span className="text-muted-foreground">Prejeto:</span><br />{new Date(selected.created_at).toLocaleString('sl-SI')}</div>
                <div><span className="text-muted-foreground">Obdelano:</span><br />{selected.processed_at ? new Date(selected.processed_at).toLocaleString('sl-SI') : '—'}</div>
              </div>
              {selected.error_message && (
                <div className="bg-destructive/10 text-destructive p-3 rounded text-xs">
                  <strong>Napaka:</strong> {selected.error_message}
                </div>
              )}
              <div>
                <p className="text-muted-foreground mb-1">Vsebina (maskirana):</p>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[300px]">
                  {JSON.stringify(selected.payload_masked, null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 font-semibold">Replay audit log ({audits?.length ?? 0})</p>
                {!audits?.length ? (
                  <p className="text-xs text-muted-foreground">Brez replay poskusov.</p>
                ) : (
                  <div className="space-y-2">
                    {audits.map((a) => {
                      const changed = (a.diff ?? []).filter((d: any) => d.kind !== 'unchanged');
                      return (
                        <div key={a.id} className="border rounded p-2 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span>{new Date(a.created_at).toLocaleString('sl-SI')}</span>
                            <Badge variant={statusVariant[a.outcome] ?? 'outline'}>{a.outcome}</Badge>
                          </div>
                          {a.error_message && (
                            <div className="text-xs text-destructive">{a.error_message}</div>
                          )}
                          {changed.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Brez sprememb v naročninah.</p>
                          ) : (
                            <div className="space-y-2">
                              {changed.map((d: any, i: number) => {
                                const fields = (d.fields ?? {}) as Record<string, { before: any; after: any }>;
                                const highlightOrder = ['plans_remaining', 'status'];
                                const highlighted = highlightOrder.filter((f) => f in fields);
                                const others = Object.keys(fields).filter((f) => !highlightOrder.includes(f));
                                const fmt = (v: any) =>
                                  v === null || v === undefined ? '∅' : typeof v === 'string' ? v : JSON.stringify(v);
                                const kindBadge =
                                  d.kind === 'added' ? 'default' :
                                  d.kind === 'removed' ? 'destructive' :
                                  d.kind === 'changed' ? 'secondary' : 'outline';

                                return (
                                  <div key={i} className="border rounded p-2 space-y-2 bg-muted/30">
                                    <div className="flex items-center gap-2 text-xs">
                                      <Badge variant={kindBadge as any}>{d.kind}</Badge>
                                      <code className="text-[10px] text-muted-foreground truncate">
                                        {d.stripe_subscription_id}
                                      </code>
                                    </div>

                                    {highlighted.length > 0 && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {highlighted.map((f) => (
                                          <div
                                            key={f}
                                            className="rounded border-2 border-primary/30 bg-primary/5 p-2 animate-[diff-flash_1.2s_ease-out]"
                                          >
                                            <div className="text-[10px] uppercase tracking-wide text-primary font-semibold mb-1">
                                              {f === 'plans_remaining' ? 'Plans remaining' : 'Status'}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-mono">
                                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 text-destructive line-through animate-[diff-slide-left_0.8s_ease-out_forwards]">
                                                <Minus className="h-3 w-3" />
                                                {fmt(fields[f].before)}
                                              </span>
                                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 animate-[diff-arrow_0.5s_ease-out_0.2s_forwards]" />
                                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/10 text-success font-semibold animate-[diff-slide-right_0.8s_ease-out_0.3s_forwards]">
                                                <Plus className="h-3 w-3" />
                                                {fmt(fields[f].after)}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {others.length > 0 && (
                                      <details className="text-xs">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                          Druge spremembe ({others.length})
                                        </summary>
                                        <table className="w-full mt-1">
                                          <thead>
                                            <tr className="text-[10px] text-muted-foreground uppercase">
                                              <th className="text-left py-0.5 pr-2">Polje</th>
                                              <th className="text-left py-0.5 pr-2">Staro</th>
                                              <th className="text-left py-0.5">Novo</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {others.map((field) => (
                                              <tr key={field} className="border-t">
                                                <td className="py-0.5 pr-2 font-mono">{field}</td>
                                                <td className="py-0.5 pr-2 text-destructive line-through font-mono">
                                                  {fmt(fields[field].before)}
                                                </td>
                                                <td className="py-0.5 text-primary font-mono">
                                                  {fmt(fields[field].after)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </details>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
