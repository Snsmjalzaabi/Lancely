import { useEffect, useMemo, useState } from 'react';
import { Receipt as ReceiptIcon, Plus, Pencil, Trash2, MoreHorizontal, Wand2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { api, formatMoney, formatDate } from '@/lib/api';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORIES = ['software','subscriptions','hardware','office','travel','fuel','meals','marketing','advertising','design_assets','stock_media','legal','accounting','bank_fees','utilities','phone_internet','education','freelancers','outsourcing','rent','tax','general'];

const emptyExpense = (currency) => ({ date: new Date().toISOString().slice(0,10), category: 'general', vendor: '', amount: 0, currency: currency || 'AED', notes: '' });

export default function Expenses() {
  const { user } = useAuth();
  const currency = user?.currency || 'AED';
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyExpense(currency));
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/expenses'); setList(data); }
    catch (err) { console.error('load expenses failed', err); toast.error('Failed to load expenses'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyExpense(currency)); setOpen(true); };
  const openEdit = (e) => { setEditing(e); setForm({ ...emptyExpense(currency), ...e }); setOpen(true); };

  const aiCategorize = async () => {
    if (!form.vendor && !form.notes) { toast.info('Add vendor or notes first'); return; }
    setAiBusy(true);
    try {
      const { data } = await api.post('/ai/categorize-expense', { vendor: form.vendor, notes: form.notes, amount: Number(form.amount) || 0 });
      setForm(f => ({ ...f, category: data.category }));
      toast.success(`AI suggests: ${data.category} (${Math.round((data.confidence||0)*100)}% confidence)`);
    } catch (err) { console.warn('AI categorize failed', err); toast.error('AI categorize failed'); }
    finally { setAiBusy(false); }
  };

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) || 0 };
      if (editing) await api.put(`/expenses/${editing.id}`, payload);
      else await api.post('/expenses', payload);
      toast.success(editing ? 'Expense updated' : 'Expense added');
      setOpen(false);
      await load();
    } catch (err) { console.error('save expense failed', err); toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (e) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await api.delete(`/expenses/${e.id}`); toast.success('Deleted'); await load(); }
    catch (err) { console.error(err); toast.error('Failed'); }
  };

  const totalByCategory = useMemo(() => {
    const map = {};
    for (const e of list) map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    return map;
  }, [list]);
  const grand = Object.values(totalByCategory).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Expenses</h2>
          <p className="text-sm text-muted-foreground">Log business expenses to compute real profit and stay tax-ready.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="expenses-add-button"><Plus className="h-4 w-4 mr-1.5" /> Add Expense</Button>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Total</div><div className="font-display text-xl font-semibold tabular-nums mt-1">{formatMoney(grand, currency)}</div></CardContent></Card>
          {Object.entries(totalByCategory).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v]) => (
            <Card key={k} className="rounded-2xl border border-border bg-card"><CardContent className="p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">{k.replace('_',' ')}</div><div className="font-display text-lg font-semibold tabular-nums mt-1">{formatMoney(v, currency)}</div></CardContent></Card>
          ))}
        </div>
      )}

      <Card className="rounded-2xl border border-border bg-card overflow-hidden">
        <CardContent className="p-0">
          {loading ? <div className="p-6 space-y-3">{Array.from({length:4}).map((_,i) => <Skeleton key={`skel-${i}`} className="h-10 w-full" />)}</div>
            : list.length === 0 ? <div className="p-6"><EmptyState icon={ReceiptIcon} title="No expenses yet" description="Log your first business expense. Categories like software, fuel, and marketing roll up into your P&L." action={<Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="expenses-empty-add"><Plus className="h-4 w-4 mr-1.5" /> Add Expense</Button>} testid="expenses-empty-state" /></div>
            : <Table data-testid="expenses-table"><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
              <TableBody>{list.map(e => (
                <TableRow key={e.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-sm text-muted-foreground">{formatDate(e.date)}</TableCell>
                  <TableCell><div className="font-medium">{e.vendor || '—'}</div>{e.notes && <div className="text-xs text-muted-foreground truncate max-w-md">{e.notes}</div>}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{(e.category||'').replace('_',' ')}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(e.amount, e.currency)}</TableCell>
                  <TableCell>
                    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`expense-row-actions-${e.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        <DropdownMenuItem onClick={() => openEdit(e)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => remove(e)} className="text-red-300"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent></DropdownMenu>
                  </TableCell>
                </TableRow>))}
              </TableBody></Table>}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader><DialogTitle className="font-display">{editing ? 'Edit expense' : 'Add expense'}</DialogTitle><DialogDescription>Log a business expense. AI can auto-categorize from the vendor name.</DialogDescription></DialogHeader>
          <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="bg-background/40" data-testid="expense-form-date" /></div>
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" min="0" step="0.01" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="bg-background/40 tabular-nums" data-testid="expense-form-amount" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Vendor</Label><Input value={form.vendor} onChange={e => setForm({...form, vendor: e.target.value})} className="bg-background/40" placeholder="e.g., Adobe, ENOC, Etisalat" data-testid="expense-form-vendor" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="bg-background/40" rows={2} data-testid="expense-form-notes" /></div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label>Category</Label><Button type="button" variant="ghost" size="sm" onClick={aiCategorize} disabled={aiBusy} className="h-7 text-xs" data-testid="expense-form-ai-categorize"><Wand2 className="h-3 w-3 mr-1" /> {aiBusy ? 'Thinking...' : 'AI suggest'}</Button></div>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}><SelectTrigger className="bg-background/40" data-testid="expense-form-category"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-border max-h-72">{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace('_',' ')}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Currency</Label><Input value={form.currency} onChange={e => setForm({...form, currency: e.target.value.toUpperCase()})} className="bg-background/40" data-testid="expense-form-currency" /></div>
            <DialogFooter className="sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="expense-form-submit">{saving ? 'Saving...' : (editing ? 'Save changes' : 'Add expense')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
