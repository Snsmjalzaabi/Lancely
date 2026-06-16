import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api, formatMoney, formatDate } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ArrowUpRight, TrendingUp, Wallet, Clock, AlertTriangle, FolderKanban, Users, Receipt, FileText, BellRing } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';

function KPICard({ label, value, sub, icon: Icon, tone = 'primary', testid }) {
  const tones = {
    primary: 'text-primary bg-primary/10 border-primary/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    red: 'text-red-300 bg-red-500/10 border-red-500/20',
    cyan: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  };
  return (
    <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)] overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-display text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums mt-2" data-testid={testid}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${tones[tone]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 [box-shadow:var(--shadow-elev-1)]">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-sm font-semibold mt-0.5">{formatMoney(payload[0].value, currency)}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const currency = user?.currency || 'AED';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    api.get('/analytics/dashboard').then(({ data }) => {
      if (alive) { setData(data); setLoading(false); }
    }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const isEmpty = !loading && data && data.total_clients === 0 && data.unpaid_count === 0 && data.total_revenue === 0;

  // Memoize the "needs attention" list to avoid recomputing on every render
  const needsAttention = useMemo(
    () => (data?.recent_invoices || []).filter((i) => i.status !== 'paid').slice(0, 5),
    [data?.recent_invoices]
  );

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="rounded-2xl border border-border bg-card">
              <CardContent className="p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-28 mt-3" />
                <Skeleton className="h-3 w-20 mt-2" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KPICard label="Total Revenue" value={formatMoney(data?.total_revenue || 0, currency)} sub="Paid invoices" icon={Wallet} tone="primary" testid="kpi-total-revenue" />
            <KPICard label="Unpaid Invoices" value={String(data?.unpaid_count || 0)} sub={formatMoney(data?.unpaid_amount || 0, currency) + ' pending'} icon={Clock} tone="amber" testid="kpi-unpaid-invoices" />
            <KPICard label="Overdue Invoices" value={String(data?.overdue_count || 0)} sub={formatMoney(data?.overdue_amount || 0, currency) + ' overdue'} icon={AlertTriangle} tone="red" testid="kpi-overdue-invoices" />
            <KPICard label="Active Projects" value={String(data?.active_projects || 0)} sub={`${data?.total_clients || 0} clients`} icon={FolderKanban} tone="cyan" testid="kpi-active-projects" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Earnings chart */}
        <Card className="rounded-2xl border border-border bg-card lg:col-span-2 [box-shadow:var(--shadow-elev-1)]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-base font-semibold tracking-tight flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Monthly Earnings</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Paid invoices over the last 6 months (AED)</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64" data-testid="earnings-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.monthly_earnings || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={60} />
                  <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.4 }} />
                  <Area type="monotone" dataKey="earnings" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#earnGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Needs attention */}
        <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base font-semibold tracking-tight flex items-center gap-2"><BellRing className="h-4 w-4 text-amber-300" /> Needs Attention</CardTitle>
            <p className="text-xs text-muted-foreground">Recent unpaid / overdue invoices</p>
          </CardHeader>
          <CardContent>
            {needsAttention.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">All clear. No outstanding invoices.</div>
            ) : (
              <div className="divide-y divide-border">
                {needsAttention.map(inv => (
                  <button key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/30 px-2 -mx-2 rounded-lg transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{inv.number}</div>
                      <div className="text-xs text-muted-foreground">Due {formatDate(inv.due_date)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm tabular-nums">{formatMoney(inv.total, inv.currency || currency)}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      {isEmpty && (
        <Card className="rounded-2xl border border-dashed border-border bg-card/40">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight">Welcome to Lancely</h3>
                <p className="text-sm text-muted-foreground mt-1">Set up your workspace in a few steps.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate('/clients')} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="dashboard-add-client-cta"><Users className="h-4 w-4 mr-1.5" /> Add a client</Button>
                <Button onClick={() => navigate('/invoices/new')} variant="secondary" data-testid="dashboard-create-invoice-cta"><Receipt className="h-4 w-4 mr-1.5" /> Create an invoice</Button>
                <Button onClick={() => navigate('/settings')} variant="ghost" data-testid="dashboard-settings-cta">Business settings <ArrowUpRight className="h-4 w-4 ml-1.5" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
