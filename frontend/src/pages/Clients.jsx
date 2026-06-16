import { useEffect, useState } from 'react';
import { Users, Plus, Pencil, Trash2, Mail, Phone, Building2, MoreHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportButton } from '@/components/ExportButton';

const empty = { name: '', company: '', email: '', phone: '', address: '', trn: '', notes: '' };

export default function Clients() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/clients');
      setList(data);
    } catch { toast.error('Failed to load clients'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...empty, ...c }); setOpen(true); };

  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) { toast.error('Client name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        await api.put(`/clients/${editing.id}`, payload);
        toast.success('Client updated');
      } else {
        await api.post('/clients', payload);
        toast.success('Client added');
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete client "${c.name}"?`)) return;
    try {
      await api.delete(`/clients/${c.id}`);
      toast.success('Client deleted');
      await load();
    } catch { toast.error('Failed to delete'); }
  };

  const filtered = list.filter(c => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [c.name, c.company, c.email, c.trn].filter(Boolean).some(v => v.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Clients</h2>
          <p className="text-sm text-muted-foreground">Manage your client roster and VAT details.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search clients..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-background/40 w-full sm:w-64" data-testid="clients-search-input" />
          <ExportButton entity="clients" testid="clients-export-button" />
          <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="clients-add-button"><Plus className="h-4 w-4 mr-1.5" /> Add Client</Button>
        </div>
      </div>

      <Card className="rounded-2xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-elev-1)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`skel-${i}`} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Users} title={q ? 'No clients match your search' : 'No clients yet'} description={q ? undefined : 'Add your first client to start creating quotations and invoices.'} action={!q ? <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="clients-empty-add-button"><Plus className="h-4 w-4 mr-1.5" /> Add Client</Button> : null} testid="clients-empty-state" />
            </div>
          ) : (
            <Table data-testid="clients-table">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead className="hidden lg:table-cell">TRN / VAT</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-accent/25 text-accent-foreground flex items-center justify-center text-xs font-semibold">
                          {(c.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          {c.company && <div className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{c.company}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-sm space-y-0.5">
                        {c.email && <div className="text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</div>}
                        {c.phone && <div className="text-muted-foreground flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {c.trn ? <Badge variant="outline" className="font-mono text-xs">{c.trn}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/60" data-testid={`client-row-actions-${c.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuItem onClick={() => openEdit(c)} data-testid={`client-edit-${c.id}`}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => remove(c)} className="text-red-300 focus:text-red-200" data-testid={`client-delete-${c.id}`}><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
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
            <DialogTitle className="font-display">{editing ? 'Edit client' : 'Add a client'}</DialogTitle>
            <DialogDescription>Capture client details for invoices and quotations.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-background/40" required data-testid="client-form-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="bg-background/40" data-testid="client-form-company" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-background/40" data-testid="client-form-email" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-background/40" data-testid="client-form-phone" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-background/40" data-testid="client-form-address" />
            </div>
            <div className="space-y-1.5">
              <Label>TRN / VAT Number</Label>
              <Input value={form.trn} onChange={(e) => setForm({ ...form, trn: e.target.value })} className="bg-background/40 font-mono" placeholder="100xxxxxxxx0003" data-testid="client-form-trn" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-background/40" rows={3} data-testid="client-form-notes" />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="client-form-submit">{saving ? 'Saving...' : (editing ? 'Save changes' : 'Add client')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
