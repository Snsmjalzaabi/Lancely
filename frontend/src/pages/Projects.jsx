import { useEffect, useState } from 'react';
import { FolderKanban, Plus, MoreHorizontal, Pencil, Trash2, CalendarDays } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, formatMoney, formatDate } from '@/lib/api';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { ExportButton } from '@/components/ExportButton';
import { useAuth } from '@/contexts/AuthContext';

const empty = { name: '', client_id: '', status: 'active', deadline: '', value: 0, notes: '' };

export default function Projects() {
  const { user } = useAuth();
  const currency = user?.currency || 'AED';
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, cl] = await Promise.all([api.get('/projects'), api.get('/clients')]);
      setList(pr.data || []); setClients(cl.data || []);
    } catch { toast.error('Failed to load projects'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const clientMap = clients.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...empty, ...p, value: p.value || 0, client_id: p.client_id || '' }); setOpen(true); };

  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) { toast.error('Project name required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        client_id: form.client_id || null,
        status: form.status,
        deadline: form.deadline || null,
        value: Number(form.value || 0),
        notes: form.notes || null,
      };
      if (editing) { await api.put(`/projects/${editing.id}`, payload); toast.success('Project updated'); }
      else { await api.post('/projects', payload); toast.success('Project created'); }
      setOpen(false); await load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete project "${p.name}"?`)) return;
    try { await api.delete(`/projects/${p.id}`); toast.success('Deleted'); await load(); }
    catch { toast.error('Failed'); }
  };

  const deadlineTone = (d, status) => {
    if (!d || status === 'completed' || status === 'cancelled') return 'text-muted-foreground';
    const today = new Date(); today.setHours(0,0,0,0);
    const dd = new Date(d); dd.setHours(0,0,0,0);
    const diff = (dd - today) / 86400000;
    if (diff < 0) return 'text-red-300';
    if (diff <= 7) return 'text-amber-300';
    return 'text-muted-foreground';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Projects</h2>
          <p className="text-sm text-muted-foreground">Track engagements, deadlines, and project value.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton entity="projects" testid="projects-export-button" />
          <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="projects-add-button"><Plus className="h-4 w-4 mr-1.5" /> New Project</Button>
        </div>
      </div>

      <Card className="rounded-2xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-elev-1)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : list.length === 0 ? (
            <div className="p-6"><EmptyState icon={FolderKanban} title="No projects yet" description="Track your engagements, deadlines and project values." action={<Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="projects-empty-add"><Plus className="h-4 w-4 mr-1.5" /> New Project</Button>} testid="projects-empty-state" /></div>
          ) : (
            <Table data-testid="projects-table">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Project</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Deadline</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(p => (
                  <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {p.notes && <div className="text-xs text-muted-foreground truncate max-w-md">{p.notes}</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{clientMap[p.client_id]?.name || '—'}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className={`hidden md:table-cell text-sm flex items-center gap-1.5 ${deadlineTone(p.deadline, p.status)}`}><CalendarDays className="h-3.5 w-3.5" /> {formatDate(p.deadline)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(p.value || 0, currency)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`project-row-actions-${p.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => remove(p)} className="text-red-300"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Edit project' : 'New project'}</DialogTitle>
            <DialogDescription>Track a project for one of your clients.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Name *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-background/40" data-testid="project-form-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={form.client_id || undefined} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="bg-background/40" data-testid="project-form-client"><SelectValue placeholder="Select client (optional)" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-background/40" data-testid="project-form-status"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deadline</Label>
              <Input type="date" value={form.deadline || ''} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="bg-background/40" data-testid="project-form-deadline" />
            </div>
            <div className="space-y-1.5">
              <Label>Value ({currency})</Label>
              <Input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="bg-background/40 tabular-nums" data-testid="project-form-value" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-background/40" rows={3} data-testid="project-form-notes" />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="project-form-submit">{saving ? 'Saving...' : (editing ? 'Save changes' : 'Create')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
