import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { formatMoney } from '@/lib/api';

export function LineItemsCard({ kind, items, currency, onAdd, onChange, onRemove }) {
  return (
    <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="font-display text-base">Line items</CardTitle>
        <Button size="sm" variant="secondary" onClick={onAdd} data-testid={`${kind}-add-item-button`}><Plus className="h-4 w-4 mr-1" /> Add item</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="hidden md:grid grid-cols-12 gap-3 text-xs uppercase tracking-wider text-muted-foreground px-2">
          <div className="col-span-6">Description</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-2 text-right">Rate ({currency})</div>
          <div className="col-span-1 text-right">Amount</div>
          <div className="col-span-1"></div>
        </div>
        {items.map((it, idx) => (
          <div key={it._key} className="grid grid-cols-12 gap-3 items-center">
            <Input className="col-span-12 md:col-span-6 bg-background/40" placeholder="Description" value={it.description} onChange={(e) => onChange(idx, 'description', e.target.value)} data-testid={`${kind}-item-desc-${idx}`} />
            <Input type="number" min="0" step="0.01" className="col-span-4 md:col-span-2 bg-background/40 text-right tabular-nums" value={it.quantity} onChange={(e) => onChange(idx, 'quantity', e.target.value)} data-testid={`${kind}-item-qty-${idx}`} />
            <Input type="number" min="0" step="0.01" className="col-span-4 md:col-span-2 bg-background/40 text-right tabular-nums" value={it.rate} onChange={(e) => onChange(idx, 'rate', e.target.value)} data-testid={`${kind}-item-rate-${idx}`} />
            <div className="col-span-3 md:col-span-1 text-right text-sm tabular-nums text-muted-foreground">{formatMoney((Number(it.quantity) || 0) * (Number(it.rate) || 0), currency)}</div>
            <Button variant="ghost" size="icon" className="col-span-1 h-9 w-9 text-muted-foreground hover:text-red-300" onClick={() => onRemove(idx)} disabled={items.length <= 1} data-testid={`${kind}-item-remove-${idx}`}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
