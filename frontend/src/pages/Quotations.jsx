import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, MoreHorizontal, Download, Pencil, Trash2, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, formatAED, formatDate, pdfUrl } from '@/lib/api';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';

export default function Quotations() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [clients, setClients] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [qts, cli] = await Promise.all([api.get('/quotations'), api.get('/clients')]);
      setList(qts.data || []);
      const map = {}; (cli.data || []).forEach(c => map[c.id] = c);
      setClients(map);
    } catch { toast.error('Failed to load quotations'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.number}?`)) return;
    try { await api.delete(`/quotations/${item.id}`); toast.success('Deleted'); await load(); }
    catch { toast.error('Failed'); }
  };
  const convert = async (item) => {
    try { const { data } = await api.post(`/quotations/${item.id}/convert`); toast.success('Converted'); navigate(`/invoices/${data.id}`); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Convert failed'); }
  };

  const filtered = list.filter(it => {
    const s = q.trim().toLowerCase(); if (!s) return true;
    const c = clients[it.client_id];
    return [it.number, it.title, c?.name, c?.company].filter(Boolean).some(v => v.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Quotations</h2>
          <p className="text-sm text-muted-foreground">Send VAT-ready quotes and convert them to invoices in one click.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search quotations..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-background/40 w-full sm:w-64" data-testid="quotations-search-input" />
          <Button onClick={() => navigate('/quotations/new')} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="quotations-add-button"><Plus className="h-4 w-4 mr-1.5" /> New Quotation</Button>
        </div>
      </div>

      <Card className="rounded-2xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-elev-1)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6"><EmptyState icon={FileText} title={list.length === 0 ? 'No quotations yet' : 'No quotations match your search'} description={list.length === 0 ? 'Create your first quotation and impress your clients with professional documents.' : undefined} action={list.length === 0 ? <Button onClick={() => navigate('/quotations/new')} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="quotations-empty-add"><Plus className="h-4 w-4 mr-1.5" /> New Quotation</Button> : null} testid="quotations-empty-state" /></div>
          ) : (
            <Table data-testid="quotations-table">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Quotation</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead className="hidden md:table-cell">Issue Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => (
                  <TableRow key={item.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/quotations/${item.id}`)}>
                    <TableCell>
                      <div className="font-medium">{item.number}</div>
                      <div className="text-xs text-muted-foreground">{item.title || 'Quotation'}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{clients[item.client_id]?.name || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(item.issue_date)}</TableCell>
                    <TableCell><StatusBadge status={item.status || 'draft'} /></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatAED(item.total)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`quotation-row-actions-${item.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuItem onClick={() => navigate(`/quotations/${item.id}`)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => convert(item)} data-testid={`quotation-action-convert-${item.id}`}><Receipt className="h-4 w-4 mr-2" /> Convert to Invoice</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(pdfUrl('quotations', item.id), '_blank')} data-testid={`quotation-action-pdf-${item.id}`}><Download className="h-4 w-4 mr-2" /> Download PDF</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => remove(item)} className="text-red-300"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
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
