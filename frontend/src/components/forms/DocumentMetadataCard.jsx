import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function DocumentMetadataCard({ kind, doc, setDoc, clients, currencies }) {
  const isInvoice = kind === 'invoice';
  const titleNoun = isInvoice ? 'Invoice' : 'Quotation';
  return (
    <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
      <CardHeader className="pb-3"><CardTitle className="font-display text-base">Details</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Title</Label>
          <Input value={doc.title || ''} onChange={(e) => setDoc({ ...doc, title: e.target.value })} placeholder={`${titleNoun} title (e.g. Website redesign)`} className="bg-background/40" data-testid={`${kind}-title-input`} />
        </div>
        <div className="space-y-1.5">
          <Label>Client *</Label>
          <Select value={doc.client_id || undefined} onValueChange={(v) => setDoc({ ...doc, client_id: v })}>
            <SelectTrigger className="bg-background/40" data-testid={`${kind}-client-select`}><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={doc.status} onValueChange={(v) => setDoc({ ...doc, status: v })}>
            <SelectTrigger className="bg-background/40" data-testid={`${kind}-status-select`}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {isInvoice ? (
                <>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Issue date</Label>
          <Input type="date" value={doc.issue_date || ''} onChange={(e) => setDoc({ ...doc, issue_date: e.target.value })} className="bg-background/40" data-testid={`${kind}-issue-date`} />
        </div>
        <div className="space-y-1.5">
          <Label>{isInvoice ? 'Due date' : 'Valid until'}</Label>
          <Input type="date" value={isInvoice ? (doc.due_date || '') : (doc.valid_until || '')} onChange={(e) => setDoc({ ...doc, [isInvoice ? 'due_date' : 'valid_until']: e.target.value })} className="bg-background/40" data-testid={`${kind}-due-date`} />
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={doc.currency} onValueChange={(v) => setDoc({ ...doc, currency: v })}>
            <SelectTrigger className="bg-background/40" data-testid={`${kind}-currency-select`}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
