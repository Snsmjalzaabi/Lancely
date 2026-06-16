import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, AlertTriangle, Wallet, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api, formatMoney, formatDate } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';

function TooltipBox({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>{payload.map(p => <div key={p.dataKey} className="font-medium"><span style={{color: p.color}}>●</span> {p.dataKey}: {formatMoney(p.value, currency)}</div>)}</div>;
}

export default function Reports() {
  const { user } = useAuth();
  const currency = user?.currency || 'AED';
  const navigate = useNavigate();
  const [pl, setPl] = useState(null);
  const [aging, setAging] = useState(null);
  const [cashflow, setCashflow] = useState(null);
  const [clients, setClients] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/reports/pl').then(r => r.data),
      api.get('/reports/aging').then(r => r.data),
      api.get('/reports/cashflow').then(r => r.data),
      api.get('/reports/client-profitability').then(r => r.data),
    ]).then(([a,b,c,d]) => { setPl(a); setAging(b); setCashflow(c); setClients(d); setLoading(false); })
      .catch(err => { console.error('reports load', err); setLoading(false); });
  }, []);

  if (loading) return <div className="space-y-4">{Array.from({length:3}).map((_,i)=><Skeleton key={`skel-${i}`} className="h-40 w-full rounded-2xl" />)}</div>;

  return (
    <div className="space-y-5">
      <div><h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Reports</h2><p className="text-sm text-muted-foreground">Profit & Loss, aging, cash flow, and per-client performance.</p></div>
      <Tabs defaultValue="pl">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="pl" data-testid="reports-tab-pl"><TrendingUp className="h-3.5 w-3.5 mr-1.5" /> P&L</TabsTrigger>
          <TabsTrigger value="aging" data-testid="reports-tab-aging"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Aging</TabsTrigger>
          <TabsTrigger value="cashflow" data-testid="reports-tab-cashflow"><Wallet className="h-3.5 w-3.5 mr-1.5" /> Cash Flow</TabsTrigger>
          <TabsTrigger value="clients" data-testid="reports-tab-clients"><Users className="h-3.5 w-3.5 mr-1.5" /> Clients</TabsTrigger>
        </TabsList>
        <TabsContent value="pl" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Income</div><div className="font-display text-2xl font-semibold tabular-nums mt-1 text-emerald-300" data-testid="pl-income">{formatMoney(pl?.income || 0, currency)}</div></CardContent></Card>
            <Card className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Expense</div><div className="font-display text-2xl font-semibold tabular-nums mt-1 text-red-300" data-testid="pl-expense">{formatMoney(pl?.expense || 0, currency)}</div></CardContent></Card>
            <Card className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Net</div><div className="font-display text-2xl font-semibold tabular-nums mt-1 text-primary" data-testid="pl-net">{formatMoney(pl?.net || 0, currency)}</div></CardContent></Card>
          </div>
          <Card className="rounded-2xl border border-border bg-card"><CardHeader className="pb-2"><CardTitle className="font-display text-base">Monthly P&L</CardTitle></CardHeader><CardContent><div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pl?.series || []} margin={{top:10,right:10,left:0,bottom:0}}>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="month" tick={{fill:'hsl(var(--muted-foreground))',fontSize:12}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:'hsl(var(--muted-foreground))',fontSize:12}} axisLine={false} tickLine={false} width={60} />
                <Tooltip content={<TooltipBox currency={currency} />} cursor={{fill:'hsl(var(--muted)/0.3)'}} />
                <Legend wrapperStyle={{fontSize:'12px'}} />
                <Bar dataKey="income" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                <Bar dataKey="expense" fill="hsl(0 70% 60%)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div></CardContent></Card>
        </TabsContent>
        <TabsContent value="aging" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(aging?.buckets || {}).map(([k,v]) => (
              <Card key={k} className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">{k} days</div><div className="font-display text-lg font-semibold tabular-nums mt-1" data-testid={`aging-bucket-${k}`}>{formatMoney(v, currency)}</div></CardContent></Card>
            ))}
          </div>
          <Card className="rounded-2xl border border-border bg-card overflow-hidden">
            <CardContent className="p-0">
              <Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Invoice</TableHead><TableHead>Due</TableHead><TableHead>Bucket</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
              <TableBody>{(aging?.rows || []).map(r => (
                <TableRow key={r.invoice_id} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/invoices/${r.invoice_id}`)}>
                  <TableCell className="font-medium">{r.number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.due_date)} <span className="text-xs">({r.days_overdue}d)</span></TableCell>
                  <TableCell><Badge variant="outline" className={r.bucket==='current'?'border-cyan-500/40 text-cyan-300':r.bucket==='90+'?'border-red-500/40 text-red-300':'border-amber-500/40 text-amber-300'}>{r.bucket}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.outstanding, r.currency)}</TableCell>
                </TableRow>))}
              </TableBody></Table>
              {(aging?.rows || []).length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No outstanding invoices. Nice work.</div>}
            </CardContent></Card>
        </TabsContent>
        <TabsContent value="cashflow" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Next 30 days</div><div className="font-display text-2xl font-semibold tabular-nums mt-1" data-testid="cashflow-30">{formatMoney(cashflow?.next_30_days || 0, currency)}</div></CardContent></Card>
            <Card className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Next 60 days</div><div className="font-display text-2xl font-semibold tabular-nums mt-1">{formatMoney(cashflow?.next_60_days || 0, currency)}</div></CardContent></Card>
            <Card className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Next 90 days</div><div className="font-display text-2xl font-semibold tabular-nums mt-1">{formatMoney(cashflow?.next_90_days || 0, currency)}</div></CardContent></Card>
          </div>
        </TabsContent>
        <TabsContent value="clients" className="mt-4">
          <Card className="rounded-2xl border border-border bg-card overflow-hidden">
            <CardContent className="p-0">
              <Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Client</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Invoices</TableHead><TableHead className="text-right">Avg Days to Pay</TableHead></TableRow></TableHeader>
              <TableBody>{(clients || []).map(c => (
                <TableRow key={c.client_id} className="hover:bg-muted/30">
                  <TableCell><div className="font-medium">{c.name}</div>{c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(c.revenue, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-300">{formatMoney(c.outstanding, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.invoice_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.avg_days_to_pay != null ? `${c.avg_days_to_pay}d` : '—'}</TableCell>
                </TableRow>))}
              </TableBody></Table>
              {(clients || []).length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No clients yet.</div>}
            </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
