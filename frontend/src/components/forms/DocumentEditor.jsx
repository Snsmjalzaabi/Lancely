import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Download, Save, FileText, Receipt, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, formatAED, pdfUrl } from '@/lib/api';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/StatusBadge';

// Generic document editor used for both invoices and quotations.
// Props: kind="invoice" | "quotation"
export default function DocumentEditor({ kind }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const isInvoice = kind === 'invoice';
  const titleNoun = isInvoice ? 'Invoice' : 'Quotation';

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState({
    client_id: '',
    title: '',
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    notes: '',
    status: isInvoice ? 'unpaid' : 'draft',
    items: [{ description: '', quantity: 1, rate: 0 }],
    number: null,
    converted_invoice_id: null,
  });

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/clients'),
      id ? api.get(`/${isInvoice ? 'invoices' : 'quotations'}/${id}`) : Promise.resolve(null),
    ])
      .then(([clientsRes, docRes]) => {
        if (!alive) return;
        setClients(clientsRes.data || []);
        if (docRes) {
          const d = docRes.data;
          setDoc({
            ...doc,
            ...d,
            items: (d.items && d.items.length > 0) ? d.items.map(i => ({ description: i.description, quantity: i.quantity, rate: i.rate })) : [{ description: '', quantity: 1, rate: 0 }],
          });
        } else if (clientsRes.data?.length === 1) {
          setDoc(d => ({ ...d, client_id: clientsRes.data[0].id }));
        }
        setLoading(false);
      })
      .catch(() => { if (alive) { toast.error('Failed to load'); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [id]);

  const totals = useMemo(() => {
    const subtotal = (doc.items || []).reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.rate || 0)), 0);
    const vat = subtotal * 0.05;
    const total = subtotal + vat;
    return { subtotal: Math.round(subtotal * 100) / 100, vat: Math.round(vat * 100) / 100, total: Math.round(total * 100) / 100 };
  }, [doc.items]);

  const updateItem = (idx, key, value) => {
    setDoc(d => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, [key]: value } : it) }));
  };
  const addItem = () => setDoc(d => ({ ...d, items: [...d.items, { description: '', quantity: 1, rate: 0 }] }));
  const removeItem = (idx) => setDoc(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!doc.client_id) { toast.error('Please select a client'); return; }
    if ((doc.items || []).length === 0 || doc.items.every(i => !i.description?.trim())) { toast.error('Add at least one line item'); return; }
    setSaving(true);
    try {
      const payload = {
        client_id: doc.client_id,
        title: doc.title || titleNoun,
        issue_date: doc.issue_date,
        notes: doc.notes || null,
        status: doc.status,
        items: doc.items.filter(i => (i.description || '').trim()).map(i => ({ description: i.description, quantity: Number(i.quantity || 0), rate: Number(i.rate || 0) })),
      };
      if (isInvoice) payload.due_date = doc.due_date;
      else payload.valid_until = doc.valid_until;

      if (id) {
        const { data } = await api.put(`/${isInvoice ? 'invoices' : 'quotations'}/${id}`, payload);
        setDoc(d => ({ ...d, ...data }));
        toast.success(`${titleNoun} updated`);
      } else {
        const { data } = await api.post(`/${isInvoice ? 'invoices' : 'quotations'}`, payload);
        toast.success(`${titleNoun} created`);
        navigate(`/${isInvoice ? 'invoices' : 'quotations'}/${data.id}`, { replace: true });
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = () => {
    if (!id) { toast.error('Save first to download PDF'); return; }
    const url = pdfUrl(isInvoice ? 'invoices' : 'quotations', id);
    window.open(url, '_blank');
  };

  const markPaid = async () => {
    try {
      const { data } = await api.patch(`/invoices/${id}/status`, { status: 'paid' });
      setDoc(d => ({ ...d, status: data.status, payment_date: data.payment_date }));
      toast.success('Marked as paid');
    } catch { toast.error('Failed to update status'); }
  };

  const markUnpaid = async () => {
    try {
      const { data } = await api.patch(`/invoices/${id}/status`, { status: 'unpaid' });
      setDoc(d => ({ ...d, status: data.status, payment_date: null }));
      toast.success('Marked as unpaid');
    } catch { toast.error('Failed to update status'); }
  };

  const convertToInvoice = async () => {
    if (!id) { toast.error('Save the quotation first'); return; }
    try {
      const { data } = await api.post(`/quotations/${id}/convert`);
      toast.success('Converted to invoice');
      navigate(`/invoices/${data.id}`);
    } catch (err) { toast.error(err?.response?.data?.detail || 'Convert failed'); }
  };

  if (loading) return <div className="text-sm text-muted-foreground p-6">Loading...</div>;

  const hasClients = clients.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(isInvoice ? '/invoices' : '/quotations')} aria-label="Back" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">{id ? doc.number || titleNoun : `New ${titleNoun}`}</h2>
              {doc.status && id && <StatusBadge status={doc.status} />}
            </div>
            <p className="text-sm text-muted-foreground">{id ? `Edit ${titleNoun.toLowerCase()} details and line items.` : `Create a new ${titleNoun.toLowerCase()} for your client.`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {id && isInvoice && doc.status !== 'paid' && <Button onClick={markPaid} variant="secondary" data-testid="invoice-mark-paid-button"><Receipt className="h-4 w-4 mr-1.5" /> Mark Paid</Button>}
          {id && isInvoice && doc.status === 'paid' && <Button onClick={markUnpaid} variant="ghost" data-testid="invoice-mark-unpaid-button"><RefreshCw className="h-4 w-4 mr-1.5" /> Mark Unpaid</Button>}
          {id && !isInvoice && <Button onClick={convertToInvoice} variant="secondary" data-testid="quotation-convert-to-invoice-button"><Receipt className="h-4 w-4 mr-1.5" /> Convert to Invoice</Button>}
          {id && <Button onClick={downloadPdf} variant="ghost" data-testid={`${kind}-download-pdf-button`}><Download className="h-4 w-4 mr-1.5" /> PDF</Button>}
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid={`${kind}-save-button`}><Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      {!hasClients && (
        <Card className="rounded-2xl border border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-amber-200">Add a client first before creating {titleNoun.toLowerCase()}s. <Button onClick={() => navigate('/clients')} variant="link" className="text-primary px-2 h-auto">Go to Clients →</Button></CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
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
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</SelectItem>)}
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
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="font-display text-base">Line items</CardTitle>
              <Button size="sm" variant="secondary" onClick={addItem} data-testid={`${kind}-add-item-button`}><Plus className="h-4 w-4 mr-1" /> Add item</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="hidden md:grid grid-cols-12 gap-3 text-xs uppercase tracking-wider text-muted-foreground px-2">
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Rate (AED)</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-1"></div>
              </div>
              {doc.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 items-center">
                  <Input className="col-span-12 md:col-span-6 bg-background/40" placeholder="Description" value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} data-testid={`${kind}-item-desc-${idx}`} />
                  <Input type="number" min="0" step="0.01" className="col-span-4 md:col-span-2 bg-background/40 text-right tabular-nums" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} data-testid={`${kind}-item-qty-${idx}`} />
                  <Input type="number" min="0" step="0.01" className="col-span-4 md:col-span-2 bg-background/40 text-right tabular-nums" value={it.rate} onChange={(e) => updateItem(idx, 'rate', e.target.value)} data-testid={`${kind}-item-rate-${idx}`} />
                  <div className="col-span-3 md:col-span-1 text-right text-sm tabular-nums text-muted-foreground">{formatAED((Number(it.quantity)||0) * (Number(it.rate)||0))}</div>
                  <Button variant="ghost" size="icon" className="col-span-1 h-9 w-9 text-muted-foreground hover:text-red-300" onClick={() => removeItem(idx)} disabled={doc.items.length <= 1} data-testid={`${kind}-item-remove-${idx}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
            <CardHeader className="pb-3"><CardTitle className="font-display text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={doc.notes || ''} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} placeholder="Payment terms, bank details, thank-you note..." className="bg-background/40 min-h-[100px]" data-testid={`${kind}-notes-input`} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <div className="sticky top-20">
            <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums" data-testid={`${kind}-summary-subtotal`}>{formatAED(totals.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">VAT (5%)</span>
                    <span className="tabular-nums" data-testid={`${kind}-summary-vat`}>{formatAED(totals.vat)}</span>
                  </div>
                  <div className="border-t border-border pt-2.5 flex items-center justify-between">
                    <span className="font-medium">Total</span>
                    <span className="font-display text-lg font-semibold tabular-nums" data-testid={`${kind}-summary-total`}>{formatAED(totals.total)}</span>
                  </div>
                </div>
                <div className="mt-5 text-xs text-muted-foreground leading-relaxed">Amounts are in AED. UAE VAT (5%) is applied to all line items. Issue a TRN-tagged document by filling Business info in Settings.</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
