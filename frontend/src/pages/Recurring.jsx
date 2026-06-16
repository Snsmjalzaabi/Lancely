import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Repeat, Plus, MoreHorizontal, Pencil, Trash2, Play, Pause, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { api, formatMoney, formatDate } from '@/lib/api';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

export default function Recurring() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [clients, setClients] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [rec, cli] = await Promise.all([api.get('/recurring-invoices'), api.get('/clients')]);
      setList(rec.data || []);
      const map = {}; (cli.data || []).forEach(c => { map[c.id] = c; });
      setClients(map);
    } catch { toast.error('Failed to load recurring invoices'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runDue = async () => {
    try {
      const { data } = await api.post('/recurring-invoices/run-due');
      if (data.count > 0) toast.success(`${data.count} invoice(s) generated`);
      else toast.info('No recurring invoices due right now');
      await load();
    } catch { toast.error('Failed to run due'); }
  };

  const generateNow = async (rec) => {
    try { const { data } = await api.post(`/recurring-invoices/${rec.id}/generate`); toast.success(`Generated ${data.number}`); await load(); }
    catch { toast.error('Failed to generate'); }
  };

  const toggleActive = async (rec) => {
    try {
      const payload = {
        client_id: rec.client_id,
        title: rec.title,
        notes: rec.notes,
        frequency: rec.frequency,
        next_run_date: rec.next_run_date,
        is_active: !rec.is_active,
        currency: rec.currency,
        items: rec.items,
        due_days: rec.due_days,
      };
      await api.put(`/recurring-invoices/${rec.id}`, payload);
      toast.success(rec.is_active ? 'Paused' : 'Resumed');
      await load();
    } catch { toast.error('Failed'); }
  };

  const remove = async (rec) => {
    if (!window.confirm(`Delete "${rec.title}"?`)) return;
    try { await api.delete(`/recurring-invoices/${rec.id}`); toast.success('Deleted'); await load(); }
    catch { toast.error('Failed'); }
  };

  const computeTotal = (items, currency) => {
    const subtotal = (items || []).reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.rate || 0)), 0);
    return formatMoney(subtotal * 1.05, currency);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Recurring Invoices</h2>
          <p className="text-sm text-muted-foreground">Auto-generate invoices on a schedule. Pause anytime.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={runDue} data-testid="recurring-run-due-button"><Zap className="h-4 w-4 mr-1.5" /> Run all due</Button>
          <Button onClick={() => navigate('/recurring/new')} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="recurring-add-button"><Plus className="h-4 w-4 mr-1.5" /> New Recurring</Button>
        </div>
      </div>

      <Card className="rounded-2xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-elev-1)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : list.length === 0 ? (
            <div className="p-6"><EmptyState icon={Repeat} title="No recurring invoices yet" description="Create a template and auto-generate invoices weekly, monthly, quarterly, or yearly." action={<Button onClick={() => navigate('/recurring/new')} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="recurring-empty-add"><Plus className="h-4 w-4 mr-1.5" /> New Recurring</Button>} testid="recurring-empty-state" /></div>
          ) : (
            <Table data-testid="recurring-table">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Template</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead className="hidden md:table-cell">Next run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/recurring/${r.id}`)}>
                    <TableCell>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{(r.items || []).length} item(s) · generated {r.generated_count || 0} time(s)</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{clients[r.client_id]?.name || '-'}</TableCell>
                    <TableCell className="capitalize text-sm">{r.frequency}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(r.next_run_date)}</TableCell>
                    <TableCell>
                      {r.is_active ? <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full">Active</Badge>
                                   : <Badge className="bg-slate-500/15 text-slate-300 border border-slate-500/30 rounded-full">Paused</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{computeTotal(r.items, r.currency)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`recurring-row-actions-${r.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuItem onClick={() => navigate(`/recurring/${r.id}`)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => generateNow(r)} data-testid={`recurring-generate-${r.id}`}><Zap className="h-4 w-4 mr-2" /> Generate now</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(r)} data-testid={`recurring-toggle-${r.id}`}>{r.is_active ? <><Pause className="h-4 w-4 mr-2" /> Pause</> : <><Play className="h-4 w-4 mr-2" /> Resume</>}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => remove(r)} className="text-red-300"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
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
    </div>
  );
}
