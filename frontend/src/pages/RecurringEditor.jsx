import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Repeat, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, formatMoney, formatDate } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function RecurringEditor() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState({
    client_id: '',
    title: 'Monthly retainer',
    notes: '',
    frequency: 'monthly',
    next_run_date: new Date().toISOString().slice(0, 10),
    is_active: true,
    currency: user?.currency || 'AED',
    items: [{ description: '', quantity: 1, rate: 0 }],
    due_days: 14,
  });

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/clients'),
      api.get('/currencies'),
      id ? api.get(`/recurring-invoices/${id}`) : Promise.resolve(null),
    ]).then(([cli, cur, rec]) => {
      if (!alive) return;
      setClients(cli.data || []);
      setCurrencies(cur.data || []);
      if (rec) {
        const d = rec.data;
        setDoc({
          client_id: d.client_id,
          title: d.title || '',
          notes: d.notes || '',
          frequency: d.frequency,
          next_run_date: d.next_run_date || new Date().toISOString().slice(0, 10),
          is_active: !!d.is_active,
          currency: d.currency || 'AED',
          items: (d.items && d.items.length > 0) ? d.items.map(i => ({ description: i.description, quantity: i.quantity, rate: i.rate })) : [{ description: '', quantity: 1, rate: 0 }],
          due_days: d.due_days || 14,
          generated_count: d.generated_count,
          last_generated_at: d.last_generated_at,
        });
      } else if (cli.data?.length === 1) {
        setDoc(d => ({ ...d, client_id: cli.data[0].id }));
      }
      setLoading(false);
    }).catch(() => { if (alive) { toast.error('Failed to load'); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [id]);

  const totals = useMemo(() => {
    const subtotal = (doc.items || []).reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.rate || 0)), 0);
    const vat = subtotal * 0.05;
    return { subtotal, vat, total: subtotal + vat };
  }, [doc.items]);

  const updateItem = (idx, key, value) => setDoc(d => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, [key]: value } : it) }));
  const addItem = () => setDoc(d => ({ ...d, items: [...d.items, { description: '', quantity: 1, rate: 0 }] }));
  const removeItem = (idx) => setDoc(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!doc.client_id) { toast.error('Select a client'); return; }
    setSaving(true);
    try {
      const payload = {
        client_id: doc.client_id,
        title: doc.title || 'Recurring Invoice',
        notes: doc.notes || null,
        frequency: doc.frequency,
        next_run_date: doc.next_run_date,
        is_active: doc.is_active,
        currency: doc.currency,
        due_days: Number(doc.due_days || 14),
        items: doc.items.filter(i => (i.description || '').trim()).map(i => ({ description: i.description, quantity: Number(i.quantity || 0), rate: Number(i.rate || 0) })),
      };
      if (id) { await api.put(`/recurring-invoices/${id}`, payload); toast.success('Saved'); }
      else { const { data } = await api.post('/recurring-invoices', payload); toast.success('Recurring invoice created'); navigate(`/recurring/${data.id}`, { replace: true }); }
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const generateNow = async () => {
    if (!id) { toast.error('Save first'); return; }
    try { const { data } = await api.post(`/recurring-invoices/${id}/generate`); toast.success(`Generated ${data.number}`); navigate(`/invoices/${data.id}`); }
    catch { toast.error('Failed to generate'); }
  };

  if (loading) return <div className="text-sm text-muted-foreground p-6">Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/recurring')} className="h-9 w-9"><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">{id ? 'Edit Recurring' : 'New Recurring Invoice'}</h2>
            <p className="text-sm text-muted-foreground">Configure schedule, line items, and currency.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {id && <Button variant="secondary" onClick={generateNow} data-testid="recurring-generate-now"><Zap className="h-4 w-4 mr-1.5" /> Generate now</Button>}
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="recurring-save-button"><Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
          <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
            <CardHeader className="pb-3"><CardTitle className="font-display text-base">Template Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Title</Label>
                <Input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} className="bg-background/40" data-testid="recurring-title-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <Select value={doc.client_id || undefined} onValueChange={(v) => setDoc({ ...doc, client_id: v })}>
                  <SelectTrigger className="bg-background/40" data-testid="recurring-client-select"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={doc.frequency} onValueChange={(v) => setDoc({ ...doc, frequency: v })}>
                  <SelectTrigger className="bg-background/40" data-testid="recurring-frequency-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Next run date</Label>
                <Input type="date" value={doc.next_run_date} onChange={(e) => setDoc({ ...doc, next_run_date: e.target.value })} className="bg-background/40" data-testid="recurring-next-run-date" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={doc.currency} onValueChange={(v) => setDoc({ ...doc, currency: v })}>
                  <SelectTrigger className="bg-background/40" data-testid="recurring-currency-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due in (days)</Label>
                <Input type="number" min="1" value={doc.due_days} onChange={(e) => setDoc({ ...doc, due_days: e.target.value })} className="bg-background/40 tabular-nums" data-testid="recurring-due-days" />
              </div>
              <div className="space-y-1.5 sm:col-span-2 flex items-center gap-3 pt-2">
                <Switch checked={doc.is_active} onCheckedChange={(v) => setDoc({ ...doc, is_active: v })} data-testid="recurring-active-switch" />
                <Label className="!mt-0">Active <span className="text-muted-foreground text-xs">(auto-generate on schedule)</span></Label>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="font-display text-base">Line items</CardTitle>
              <Button size="sm" variant="secondary" onClick={addItem} data-testid="recurring-add-item-button"><Plus className="h-4 w-4 mr-1" /> Add item</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {doc.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 items-center">
                  <Input className="col-span-12 md:col-span-6 bg-background/40" placeholder="Description" value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} data-testid={`recurring-item-desc-${idx}`} />
                  <Input type="number" min="0" step="0.01" className="col-span-4 md:col-span-2 bg-background/40 text-right tabular-nums" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} data-testid={`recurring-item-qty-${idx}`} />
                  <Input type="number" min="0" step="0.01" className="col-span-4 md:col-span-2 bg-background/40 text-right tabular-nums" value={it.rate} onChange={(e) => updateItem(idx, 'rate', e.target.value)} data-testid={`recurring-item-rate-${idx}`} />
                  <div className="col-span-3 md:col-span-1 text-right text-sm tabular-nums text-muted-foreground">{formatMoney((Number(it.quantity)||0) * (Number(it.rate)||0), doc.currency)}</div>
                  <Button variant="ghost" size="icon" className="col-span-1 h-9 w-9 text-muted-foreground hover:text-red-300" onClick={() => removeItem(idx)} disabled={doc.items.length <= 1}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
            <CardHeader className="pb-3"><CardTitle className="font-display text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={doc.notes || ''} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} className="bg-background/40 min-h-[80px]" data-testid="recurring-notes-input" />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-4">
          <div className="sticky top-20">
            <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" /> Per-cycle Total</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(totals.subtotal, doc.currency)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">VAT (5%)</span><span className="tabular-nums">{formatMoney(totals.vat, doc.currency)}</span></div>
                  <div className="border-t border-border pt-2.5 flex items-center justify-between"><span className="font-medium">Total</span><span className="font-display text-lg font-semibold tabular-nums">{formatMoney(totals.total, doc.currency)}</span></div>
                </div>
                <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                  <div>Next run: <b>{formatDate(doc.next_run_date)}</b></div>
                  <div>Frequency: <b className="capitalize">{doc.frequency}</b></div>
                  {doc.generated_count != null && <div>Generated: <b>{doc.generated_count}</b> time(s)</div>}
                  {doc.last_generated_at && <div>Last: <b>{formatDate(doc.last_generated_at)}</b></div>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
