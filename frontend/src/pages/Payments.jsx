import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BellRing, AlertTriangle, Clock, CheckCircle2, Download, CheckCheck } from 'lucide-react';
import { api, formatMoney, formatDate, pdfUrl } from '@/lib/api';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';

function Section({ icon: Icon, title, tone, count, children, testid }) {
  const tones = {
    amber: 'text-amber-300',
    red: 'text-red-300',
    emerald: 'text-emerald-300',
  };
  return (
    <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]" data-testid={testid}>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="font-display text-base font-semibold tracking-tight flex items-center gap-2">
          <Icon className={`h-4 w-4 ${tones[tone]}`} />
          <span>{title}</span>
          <span className="ml-1 text-xs text-muted-foreground font-normal">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ inv, navigate, onPaid }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b last:border-b-0 border-border">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{inv.number} · <span className="text-muted-foreground">{inv.client?.name || 'No client'}</span></div>
        <div className="text-xs text-muted-foreground">{inv.status === 'paid' ? `Paid ${formatDate(inv.payment_date)}` : `Due ${formatDate(inv.due_date)}`}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm tabular-nums">{formatMoney(inv.total, inv.currency)}</span>
        <StatusBadge status={inv.status} />
        <div className="hidden sm:flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(pdfUrl('invoices', inv.id), '_blank')} aria-label="Download" data-testid={`payments-pdf-${inv.id}`}><Download className="h-3.5 w-3.5" /></Button>
          {inv.status !== 'paid' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onPaid(inv)} aria-label="Mark paid" data-testid={`payments-mark-paid-${inv.id}`}><CheckCheck className="h-3.5 w-3.5" /></Button>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${inv.id}`)}>Open</Button>
      </div>
    </div>
  );
}

export default function Payments() {
  const navigate = useNavigate();
  const [data, setData] = useState({ upcoming: [], overdue: [], paid: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/payments/reminders'); setData(data); }
    catch { toast.error('Failed to load reminders'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markPaid = async (inv) => {
    try { await api.patch(`/invoices/${inv.id}/status`, { status: 'paid' }); toast.success('Marked paid'); await load(); }
    catch { toast.error('Failed'); }
  };

  if (loading) return <div className="space-y-4">{Array.from({length:3}).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Payments & Reminders</h2>
        <p className="text-sm text-muted-foreground">A focused view of what needs to be paid, what's late, and what's been settled.</p>
      </div>
      <Section icon={AlertTriangle} title="Overdue" tone="red" count={data.overdue.length} testid="payments-section-overdue">
        {data.overdue.length === 0 ? <div className="text-sm text-muted-foreground py-2">Nothing overdue. Great work.</div> : data.overdue.map(inv => <Row key={inv.id} inv={inv} navigate={navigate} onPaid={markPaid} />)}
      </Section>
      <Section icon={Clock} title="Upcoming" tone="amber" count={data.upcoming.length} testid="payments-section-upcoming">
        {data.upcoming.length === 0 ? <div className="text-sm text-muted-foreground py-2">No upcoming invoices.</div> : data.upcoming.map(inv => <Row key={inv.id} inv={inv} navigate={navigate} onPaid={markPaid} />)}
      </Section>
      <Section icon={CheckCircle2} title="Paid" tone="emerald" count={data.paid.length} testid="payments-section-paid">
        {data.paid.length === 0 ? <div className="text-sm text-muted-foreground py-2">No paid invoices yet.</div> : data.paid.slice(0, 12).map(inv => <Row key={inv.id} inv={inv} navigate={navigate} onPaid={markPaid} />)}
      </Section>
    </div>
  );
}
