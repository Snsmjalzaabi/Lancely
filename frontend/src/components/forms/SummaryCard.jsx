import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { formatMoney } from '@/lib/api';

export function SummaryCard({ kind, totals, currency }) {
  return (
    <div className="sticky top-20">
      <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums" data-testid={`${kind}-summary-subtotal`}>{formatMoney(totals.subtotal, currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">VAT (5%)</span>
              <span className="tabular-nums" data-testid={`${kind}-summary-vat`}>{formatMoney(totals.vat, currency)}</span>
            </div>
            <div className="border-t border-border pt-2.5 flex items-center justify-between">
              <span className="font-medium">Total</span>
              <span className="font-display text-lg font-semibold tabular-nums" data-testid={`${kind}-summary-total`}>{formatMoney(totals.total, currency)}</span>
            </div>
          </div>
          <div className="mt-5 text-xs text-muted-foreground leading-relaxed">Amounts are in <b>{currency}</b>. UAE VAT (5%) is applied to all line items. Update your TRN and business info in Settings to appear on the PDF.</div>
        </CardContent>
      </Card>
    </div>
  );
}
