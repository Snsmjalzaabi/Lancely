import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { API_BASE, formatMoney, formatDate } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import axios from 'axios';

export default function PublicInvoice() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/public/invoices/${token}`)
      .then(({data}) => setData(data))
      .catch(e => setErr(e?.response?.status === 404 ? 'Invoice not found or link expired.' : 'Failed to load invoice.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="min-h-screen bg-background p-8"><Skeleton className="h-40 w-full max-w-3xl mx-auto" /></div>;
  if (err) return <div className="min-h-screen bg-background flex items-center justify-center p-8"><div className="text-center"><h1 className="font-display text-2xl">Lancely</h1><p className="text-muted-foreground mt-2">{err}</p></div></div>;

  const inv = data?.invoice || {};
  const client = data?.client || {};
  const biz = data?.business || {};

  return (
    <div className="min-h-screen bg-background bg-noise">
      <div className="max-w-3xl mx-auto p-6 sm:p-10">
        <div className="flex items-center gap-2 mb-8"><div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center"><Sparkles className="h-4 w-4 text-primary" /></div><div className="font-display text-lg font-semibold tracking-tight">Lancely</div></div>
        <Card className="rounded-2xl border border-border bg-card overflow-hidden">
          <CardContent className="p-6 sm:p-10">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">From</div>
                <div className="font-display text-lg font-semibold mt-1">{biz.business_name || biz.name || 'Lancely'}</div>
                {biz.address && <div className="text-sm text-muted-foreground">{biz.address}</div>}
                {biz.trn && <div className="text-xs text-muted-foreground font-mono mt-0.5">TRN: {biz.trn}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Invoice</div>
                <div className="font-display text-2xl font-semibold mt-1">{inv.number}</div>
                <div className="mt-1"><StatusBadge status={inv.status} /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Bill To</div><div className="font-medium mt-1">{client.name}</div>{client.company && <div className="text-sm text-muted-foreground">{client.company}</div>}{client.trn && <div className="text-xs text-muted-foreground font-mono">TRN: {client.trn}</div>}</div>
              <div className="text-right"><div className="text-xs uppercase tracking-wider text-muted-foreground">Issue / Due</div><div className="text-sm mt-1">{formatDate(inv.issue_date)}</div><div className="text-sm text-muted-foreground">{formatDate(inv.due_date)}</div></div>
            </div>
            <div className="mt-8 border-t border-border pt-6">
              <div className="grid grid-cols-12 gap-2 text-xs uppercase tracking-wider text-muted-foreground pb-2 border-b border-border"><div className="col-span-7">Description</div><div className="col-span-2 text-right">Qty</div><div className="col-span-3 text-right">Amount</div></div>
              {(inv.items || []).map((it, i) => <div key={it.id || `${i}-${it.description || ''}`} className="grid grid-cols-12 gap-2 py-3 border-b border-border last:border-0"><div className="col-span-7">{it.description}</div><div className="col-span-2 text-right tabular-nums">{it.quantity}</div><div className="col-span-3 text-right tabular-nums">{formatMoney((it.quantity||0)*(it.rate||0), inv.currency)}</div></div>)}
            </div>
            <div className="mt-6 flex justify-end"><div className="w-full sm:w-72 space-y-2">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(inv.subtotal, inv.currency)}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">VAT (5%)</span><span className="tabular-nums">{formatMoney(inv.vat, inv.currency)}</span></div>
              <div className="flex items-center justify-between border-t border-border pt-2"><span className="font-medium">Total</span><span className="font-display text-xl font-semibold tabular-nums">{formatMoney(inv.total, inv.currency)}</span></div>
              {inv.paid_amount > 0 && <div className="flex items-center justify-between text-sm"><span className="text-emerald-300">Paid</span><span className="tabular-nums text-emerald-300">{formatMoney(inv.paid_amount, inv.currency)}</span></div>}
            </div></div>
            {inv.notes && <div className="mt-8 text-sm text-muted-foreground"><div className="text-xs uppercase tracking-wider mb-1">Notes</div><div className="whitespace-pre-line">{inv.notes}</div></div>}
          </CardContent>
        </Card>
        <div className="text-center mt-6 text-xs text-muted-foreground">Generated with Lancely · Read-only view</div>
      </div>
    </div>
  );
}
