import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, FileDown, X } from 'lucide-react';
import { listPdfDownloads, type PdfDownloadRow } from '@/lib/pdfDownloads.functions';

export const Route = createFileRoute('/_authenticated/admin/pdf-downloads')({
  head: () => ({ meta: [{ title: 'PDF prenosi — Admin' }] }),
  component: PdfDownloadsAdminPage,
});

function PdfDownloadsAdminPage() {
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const fetchDownloads = useServerFn(listPdfDownloads);

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

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['pdf-downloads', userFilter, planFilter],
    enabled: isAdmin === true,
    queryFn: () =>
      fetchDownloads({
        data: {
          limit: 300,
          userId: userFilter ?? undefined,
          planId: planFilter ?? undefined,
        },
      }),
  });

  const filteredRows = useMemo<PdfDownloadRow[]>(() => {
    if (!data?.rows) return [];
    const s = search.trim().toLowerCase();
    if (!s) return data.rows;
    return data.rows.filter((r) => {
      return (
        r.user_email?.toLowerCase().includes(s) ||
        r.user_full_name?.toLowerCase().includes(s) ||
        r.plan_title?.toLowerCase().includes(s) ||
        r.plan_destination?.toLowerCase().includes(s) ||
        r.source?.toLowerCase().includes(s)
      );
    });
  }, [data, search]);

  if (roleLoading) {
    return <div className="p-8 text-muted-foreground">Preverjam dovoljenja…</div>;
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileDown className="h-7 w-7" /> PDF prenosi
          </h1>
          <p className="text-muted-foreground">
            Pregled prenosov PDF dokumentov po uporabniku in planu.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Osveži
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Skupaj prenosov</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.totals.total ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Neuspeli</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${(data?.totals.failed ?? 0) > 0 ? 'text-destructive' : ''}`}>
              {data?.totals.failed ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Različnih uporabnikov</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.totals.byUser.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Različnih planov</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.totals.byPlan.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Po uporabniku</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-72 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Uporabnik</TableHead>
                  <TableHead className="text-right">Št.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.totals.byUser ?? []).map((u) => (
                  <TableRow
                    key={u.user_id}
                    className={`cursor-pointer ${userFilter === u.user_id ? 'bg-muted' : ''}`}
                    onClick={() =>
                      setUserFilter(userFilter === u.user_id ? null : u.user_id)
                    }
                  >
                    <TableCell>
                      <div className="text-sm">{u.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{u.email ?? u.user_id}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{u.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Po planu</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-72 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Št.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.totals.byPlan ?? []).map((p) => (
                  <TableRow
                    key={p.plan_id}
                    className={`cursor-pointer ${planFilter === p.plan_id ? 'bg-muted' : ''}`}
                    onClick={() =>
                      setPlanFilter(planFilter === p.plan_id ? null : p.plan_id)
                    }
                  >
                    <TableCell>
                      <div className="text-sm">{p.title ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{p.destination ?? p.plan_id}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{p.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <Input
          placeholder="Iskanje po e-pošti, imenu, planu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {userFilter && (
          <Badge variant="secondary" className="gap-1">
            User: {userFilter.slice(0, 8)}…
            <button onClick={() => setUserFilter(null)}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {planFilter && (
          <Badge variant="secondary" className="gap-1">
            Plan: {planFilter.slice(0, 8)}…
            <button onClick={() => setPlanFilter(null)}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Nalagam…</div>
          ) : !filteredRows.length ? (
            <div className="p-8 text-center text-muted-foreground">Ni prenosov.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Čas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uporabnik</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Vir / runtime</TableHead>
                  <TableHead>Request ID</TableHead>
                  <TableHead>Naprava / napaka</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => (
                  <TableRow key={r.id} className={r.status === 'failed' ? 'bg-destructive/5' : ''}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(r.downloaded_at).toLocaleString('sl-SI')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'failed' ? 'destructive' : r.status === 'success' ? 'default' : 'outline'}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.user_full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.user_email ?? r.user_id.slice(0, 8) + '…'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.plan_title ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.plan_destination ?? ''}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {r.source ? <Badge variant="outline">{r.source}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                        {r.runtime ? <Badge variant="secondary" className="text-[10px] w-fit">{r.runtime}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground max-w-[140px] truncate" title={r.request_id ?? ''}>
                      {r.request_id ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[260px]">
                      {r.error_message ? (
                        <div className="text-destructive break-words">{r.error_message}</div>
                      ) : (
                        <div className="text-muted-foreground truncate" title={r.user_agent ?? ''}>
                          {r.user_agent ?? '—'}
                        </div>
                      )}
                      {r.referrer ? (
                        <div className="text-[10px] text-muted-foreground truncate" title={r.referrer}>
                          ref: {r.referrer}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
