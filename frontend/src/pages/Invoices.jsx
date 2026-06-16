import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Plus, MoreHorizontal, Download, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, formatMoney, formatDate, pdfUrl } from '@/lib/api';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { ExportButton } from '@/components/ExportButton';

export default function Invoices() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [clients, setClients] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [inv, cli] = await Promise.all([api.get('/invoices'), api.get('/clients')]);
      setList(inv.data || []);
      const map = {};
      (cli.data || []).forEach(c => { map[c.id] = c; });
      setClients(map);
    } catch { toast.error('Failed to load invoices'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markPaid = async (inv) => {
    try { await api.patch(`/invoices/${inv.id}/status`, { status: 'paid' }); toast.success('Marked paid'); await load(); }
    catch { toast.error('Failed'); }
  };
  const remove = async (inv) => {
    if (!window.confirm(`Delete ${inv.number}?`)) return;
    try { await api.delete(`/invoices/${inv.id}`); toast.success('Deleted'); await load(); }
    catch { toast.error('Failed'); }
  };

  const filtered = list.filter(inv => {
    if (tab !== 'all' && inv.status !== tab) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const c = clients[inv.client_id];
    return [inv.number, inv.title, c?.name, c?.company].filter(Boolean).some(v => v.toLowerCase().includes(s));
  });

  const counts = list.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Invoices</h2>
          <p className="text-sm text-muted-foreground">Track payments, send PDFs, and stay on top of overdues.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search invoices..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-background/40 w-full sm:w-64" data-testid="invoices-search-input" />
          <ExportButton entity="invoices" testid="invoices-export-button" />
          <Button onClick={() => navigate('/invoices/new')} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="invoices-add-button"><Plus className="h-4 w-4 mr-1.5" /> New Invoice</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="all" data-testid="invoices-tab-all">All <span className="ml-1.5 text-muted-foreground">{list.length}</span></TabsTrigger>
          <TabsTrigger value="unpaid" data-testid="invoices-tab-unpaid">Unpaid <span className="ml-1.5 text-amber-300">{counts.unpaid || 0}</span></TabsTrigger>
          <TabsTrigger value="overdue" data-testid="invoices-tab-overdue">Overdue <span className="ml-1.5 text-red-300">{counts.overdue || 0}</span></TabsTrigger>
          <TabsTrigger value="paid" data-testid="invoices-tab-paid">Paid <span className="ml-1.5 text-emerald-300">{counts.paid || 0}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="rounded-2xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-elev-1)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6"><EmptyState icon={Receipt} title={list.length === 0 ? 'No invoices yet' : 'No invoices match your filters'} description={list.length === 0 ? 'Create an invoice and track payment status in one place.' : undefined} action={list.length === 0 ? <Button onClick={() => navigate('/invoices/new')} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="invoices-empty-add"><Plus className="h-4 w-4 mr-1.5" /> New Invoice</Button> : null} testid="invoices-empty-state" /></div>
          ) : (
            <Table data-testid="invoices-table">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead className="hidden md:table-cell">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(inv => (
                  <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">{inv.number}<span className="text-[10px] uppercase text-muted-foreground border border-border rounded-full px-1.5 py-0.5">{inv.currency || 'AED'}</span></div>
                      <div className="text-xs text-muted-foreground">{inv.title || 'Invoice'}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{clients[inv.client_id]?.name || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(inv.due_date)}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(inv.total, inv.currency)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`invoice-row-actions-${inv.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuItem onClick={() => navigate(`/invoices/${inv.id}`)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                          {inv.status !== 'paid' && <DropdownMenuItem onClick={() => markPaid(inv)} data-testid={`invoice-action-mark-paid-${inv.id}`}><CheckCircle2 className="h-4 w-4 mr-2" /> Mark Paid</DropdownMenuItem>}
                          <DropdownMenuItem onClick={() => window.open(pdfUrl('invoices', inv.id), '_blank')} data-testid={`invoice-action-pdf-${inv.id}`}><Download className="h-4 w-4 mr-2" /> Download PDF</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => remove(inv)} className="text-red-300"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
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
