import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Wand2, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

const PLACEHOLDERS = [
  'client_name','client_first_name','client_company','business_name',
  'invoice_number','currency','total','paid','outstanding','due_date','issue_date',
  'days_overdue','state','today',
];

const empty = { name: '', trigger: 'after', days: 1, subject: '', html: '', is_active: true };

export default function ReminderTemplates() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTone, setAiTone] = useState('gentle');
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/reminders/templates'); setList(data); }
    catch (err) { console.error('load templates', err); toast.error('Failed to load templates'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(empty); setPreview(null); setOpen(true); };
  const openEdit = (t) => { setEditing(t); setForm({ ...t }); setPreview(null); setOpen(true); };

  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim() || !form.subject.trim() || !form.html.trim()) { toast.error('Name, subject and body are required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, days: Number(form.days) || 0 };
      if (editing) await api.put(`/reminders/templates/${editing.id}`, payload);
      else await api.post('/reminders/templates', payload);
      toast.success(editing ? 'Template updated' : 'Template created');
      setOpen(false);
      await load();
    } catch (err) { console.error('save tpl', err); toast.error(err?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try { await api.delete(`/reminders/templates/${t.id}`); toast.success('Deleted'); await load(); }
    catch (err) { console.error(err); toast.error('Failed'); }
  };

  const aiDraft = async () => {
    setAiBusy(true);
    try {
      const { data } = await api.post('/ai/draft-template', { trigger: form.trigger, days: Number(form.days) || 0, tone: aiTone, name: form.name || undefined });
      setForm(f => ({ ...f, name: data.name || f.name, subject: data.subject || f.subject, html: data.html || f.html }));
      toast.success('AI draft inserted — edit freely');
    } catch (err) { console.error('ai draft', err); toast.error(err?.response?.data?.detail || 'AI draft failed'); }
    finally { setAiBusy(false); }
  };

  const runPreview = async () => {
    try {
      const { data } = await api.post('/reminders/templates/preview', { subject: form.subject, html: form.html });
      setPreview(data);
    } catch (err) { console.error('preview', err); toast.error('Preview failed'); }
  };

  const insertPlaceholder = (ph) => {
    setForm(f => ({ ...f, html: (f.html || '') + ` {${ph}}` }));
  };

  return (
    <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-base">Email Templates</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Author the actual emails your auto-reminders send. Use <code className="font-mono">{'{placeholders}'}</code>.</p>
        </div>
        <Button size="sm" onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="reminder-tpl-add"><Plus className="h-4 w-4 mr-1.5" /> New template</Button>
      </CardHeader>
      <CardContent>
        {loading ? <div className="space-y-2">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <div className="divide-y divide-border">
            {list.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-3" data-testid={`reminder-tpl-row-${t.id}`}>
                <Badge variant="outline" className={t.trigger === 'before' ? 'border-cyan-500/40 text-cyan-300' : 'border-amber-500/40 text-amber-300'}>
                  {t.trigger === 'before' ? `${t.days}d before` : `${t.days}d after`}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.subject}</div>
                </div>
                {t.is_active ? <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full">Active</Badge> : <Badge variant="outline" className="text-muted-foreground">Off</Badge>}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} data-testid={`reminder-tpl-edit-${t.id}`}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-300" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {list.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No templates yet. Click “New template”.</div>}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Edit template' : 'New reminder template'}</DialogTitle>
            <DialogDescription>Write your own subject and body. Available placeholders are listed below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-background/40" data-testid="reminder-tpl-name" /></div>
              <div className="space-y-1.5"><Label>Active</Label><div className="h-10 flex items-center"><Switch checked={!!form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} data-testid="reminder-tpl-active" /></div></div>
              <div className="space-y-1.5">
                <Label>Trigger</Label>
                <Select value={form.trigger} onValueChange={v => setForm({ ...form, trigger: v })}>
                  <SelectTrigger className="bg-background/40" data-testid="reminder-tpl-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border"><SelectItem value="before">Before due date</SelectItem><SelectItem value="after">After due date</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Days</Label><Input type="number" min="0" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} className="bg-background/40 tabular-nums" data-testid="reminder-tpl-days" /></div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={aiTone} onValueChange={setAiTone}><SelectTrigger className="bg-background/40 w-36" data-testid="reminder-tpl-ai-tone"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-border"><SelectItem value="gentle">Gentle</SelectItem><SelectItem value="firm">Firm</SelectItem><SelectItem value="overdue">Direct</SelectItem><SelectItem value="final">Final notice</SelectItem></SelectContent></Select>
              <Button type="button" variant="secondary" onClick={aiDraft} disabled={aiBusy} className="bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15" data-testid="reminder-tpl-ai-draft"><Wand2 className="h-4 w-4 mr-1.5" /> {aiBusy ? 'Drafting...' : 'AI draft'}</Button>
              <Button type="button" variant="ghost" onClick={runPreview} data-testid="reminder-tpl-preview"><Eye className="h-4 w-4 mr-1.5" /> Preview</Button>
            </div>
            <div className="space-y-1.5"><Label>Subject *</Label><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="bg-background/40" data-testid="reminder-tpl-subject" placeholder="e.g., Friendly reminder: Invoice {invoice_number}" /></div>
            <div className="space-y-1.5"><Label>Body (HTML) *</Label><Textarea rows={8} value={form.html} onChange={e => setForm({ ...form, html: e.target.value })} className="bg-background/40 font-mono text-xs" data-testid="reminder-tpl-html" placeholder="<p>Hi {client_first_name},</p>..." /></div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Click to insert placeholder</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PLACEHOLDERS.map(ph => <button type="button" key={ph} onClick={() => insertPlaceholder(ph)} className="text-xs px-2 py-0.5 rounded-md border border-border bg-background/40 hover:bg-muted/60 font-mono text-muted-foreground hover:text-foreground">{'{' + ph + '}'}</button>)}
              </div>
            </div>
            {preview && (
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Preview (sample data)</div>
                <div className="font-medium text-sm mb-2">{preview.subject}</div>
                <div className="prose prose-invert prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: preview.html }} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="reminder-tpl-submit">{saving ? 'Saving...' : (editing ? 'Save changes' : 'Create template')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
