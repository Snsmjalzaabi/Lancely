import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Save, Receipt, RefreshCw, Mail } from 'lucide-react';
import { api, formatMoney, pdfUrl } from '@/lib/api';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { withKey, withKeys } from '@/lib/itemKeys';
import { DocumentMetadataCard } from '@/components/forms/DocumentMetadataCard';
import { LineItemsCard } from '@/components/forms/LineItemsCard';
import { SummaryCard } from '@/components/forms/SummaryCard';
import { SendEmailDialog } from '@/components/forms/SendEmailDialog';
import { Textarea } from '@/components/ui/textarea';
import { CardHeader, CardTitle } from '@/components/ui/card';

const VAT_RATE = 0.05;

function computeTotals(items) {
  const subtotal = (items || []).reduce(
    (s, it) => s + Number(it.quantity || 0) * Number(it.rate || 0),
    0
  );
  const vat = subtotal * VAT_RATE;
  const total = subtotal + vat;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

function buildEmailDefaults({ kind, doc, client, user, totals, id }) {
  const isInvoice = kind === 'invoice';
  const titleNoun = isInvoice ? 'Invoice' : 'Quotation';
  const num = doc.number || titleNoun;
  const businessName = user?.business_name || user?.name || 'Lancely';
  const subject = `${titleNoun} ${num} from ${businessName}`;
  const dueLine = isInvoice && doc.due_date ? `<p>Payment is due by <b>${doc.due_date}</b>.</p>` : '';
  const html = `
      <p>Hi ${client?.name || 'there'},</p>
      <p>Please find ${titleNoun.toLowerCase()} <b>${num}</b> attached for <b>${formatMoney(totals.total, doc.currency)}</b>.</p>
      ${dueLine}
      <p>You can view and download a copy here: <a href="${pdfUrl(isInvoice ? 'invoices' : 'quotations', id)}">Download ${titleNoun} PDF</a></p>
      <p>Thanks,<br/>${businessName}</p>
    `.trim();
  return { to: client?.email || '', subject, html };
}

export default function DocumentEditor({ kind }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const isInvoice = kind === 'invoice';
  const titleNoun = isInvoice ? 'Invoice' : 'Quotation';
  const { user } = useAuth();
  const defaultCurrency = user?.currency || 'AED';

  const [clients, setClients] = useState([]);
  const [currencies, setCurrencies] = useState([]);
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
    items: [withKey({ description: '', quantity: 1, rate: 0 })],
    number: null,
    currency: defaultCurrency,
    converted_invoice_id: null,
  });

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', html: '' });
  const [emailSending, setEmailSending] = useState(false);

  // Load clients + currencies + (optional) existing doc
  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/clients'),
      api.get('/currencies'),
      id ? api.get(`/${isInvoice ? 'invoices' : 'quotations'}/${id}`) : Promise.resolve(null),
    ])
      .then(([clientsRes, curRes, docRes]) => {
        if (!alive) return;
        setClients(clientsRes.data || []);
        setCurrencies(curRes.data || []);
        if (docRes) {
          const d = docRes.data;
          setDoc((prev) => ({
            ...prev,
            ...d,
            currency: d.currency || defaultCurrency,
            items: (d.items && d.items.length > 0)
              ? withKeys(d.items.map((i) => ({ description: i.description, quantity: i.quantity, rate: i.rate })))
              : [withKey({ description: '', quantity: 1, rate: 0 })],
          }));
        } else if (clientsRes.data?.length === 1) {
          setDoc((prev) => ({ ...prev, client_id: clientsRes.data[0].id }));
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        console.error('DocumentEditor load failed:', err);
        toast.error('Failed to load');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [id, isInvoice, defaultCurrency]);

  const totals = useMemo(() => computeTotals(doc.items), [doc.items]);

  const updateItem = useCallback((idx, key, value) => {
    setDoc((d) => ({ ...d, items: d.items.map((it, i) => (i === idx ? { ...it, [key]: value } : it)) }));
  }, []);
  const addItem = useCallback(() => {
    setDoc((d) => ({ ...d, items: [...d.items, withKey({ description: '', quantity: 1, rate: 0 })] }));
  }, []);
  const removeItem = useCallback((idx) => {
    setDoc((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));
  }, []);

  const save = useCallback(async () => {
    if (!doc.client_id) { toast.error('Please select a client'); return; }
    if ((doc.items || []).length === 0 || doc.items.every((i) => !i.description?.trim())) {
      toast.error('Add at least one line item');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        client_id: doc.client_id,
        title: doc.title || titleNoun,
        issue_date: doc.issue_date,
        notes: doc.notes || null,
        status: doc.status,
        currency: doc.currency || defaultCurrency,
        items: doc.items
          .filter((i) => (i.description || '').trim())
          .map((i) => ({ description: i.description, quantity: Number(i.quantity || 0), rate: Number(i.rate || 0) })),
      };
      if (isInvoice) payload.due_date = doc.due_date;
      else payload.valid_until = doc.valid_until;

      if (id) {
        const { data } = await api.put(`/${isInvoice ? 'invoices' : 'quotations'}/${id}`, payload);
        setDoc((d) => ({ ...d, ...data, items: withKeys(data.items || d.items) }));
        toast.success(`${titleNoun} updated`);
      } else {
        const { data } = await api.post(`/${isInvoice ? 'invoices' : 'quotations'}`, payload);
        toast.success(`${titleNoun} created`);
        navigate(`/${isInvoice ? 'invoices' : 'quotations'}/${data.id}`, { replace: true });
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [doc, defaultCurrency, id, isInvoice, navigate, titleNoun]);

  const downloadPdf = useCallback(() => {
    if (!id) { toast.error('Save first to download PDF'); return; }
    window.open(pdfUrl(isInvoice ? 'invoices' : 'quotations', id), '_blank');
  }, [id, isInvoice]);

  const setStatus = useCallback(async (newStatus) => {
    try {
      const { data } = await api.patch(`/invoices/${id}/status`, { status: newStatus });
      setDoc((d) => ({ ...d, status: data.status, payment_date: data.payment_date }));
      toast.success(newStatus === 'paid' ? 'Marked as paid' : 'Marked as unpaid');
    } catch (err) {
      console.error('Status update failed:', err);
      toast.error('Failed to update status');
    }
  }, [id]);

  const convertToInvoice = useCallback(async () => {
    if (!id) { toast.error('Save the quotation first'); return; }
    try {
      const { data } = await api.post(`/quotations/${id}/convert`);
      toast.success('Converted to invoice');
      navigate(`/invoices/${data.id}`);
    } catch (err) {
      console.error('Convert failed:', err);
      toast.error(err?.response?.data?.detail || 'Convert failed');
    }
  }, [id, navigate]);

  const openEmail = useCallback(async () => {
    if (!id) { toast.error('Save first before sending'); return; }
    try {
      const { data: status } = await api.get('/email/status');
      setEmailStatus(status);
    } catch (err) {
      console.warn('Could not load email status; showing fallback:', err?.message || err);
      setEmailStatus({ configured: false, sender: 'unknown', provider: 'resend', note: 'Status unavailable.' });
    }
    const client = clients.find((x) => x.id === doc.client_id);
    setEmailForm(buildEmailDefaults({ kind, doc, client, user, totals, id }));
    setEmailOpen(true);
  }, [id, clients, doc, kind, user, totals]);

  const sendEmail = useCallback(async (e) => {
    e?.preventDefault();
    if (!emailForm.to || !emailForm.subject) { toast.error('Recipient and subject are required'); return; }
    setEmailSending(true);
    try {
      const { data } = await api.post('/email/send', { ...emailForm, invoice_id: isInvoice ? id : undefined });
      if (data.ok) toast.success('Email sent');
      else if (data.status === 'not_configured') toast.warning(data.message || 'Email not configured');
      setEmailOpen(false);
    } catch (err) {
      console.error('Email send failed:', err);
      toast.error(err?.response?.data?.detail || 'Email send failed');
    } finally {
      setEmailSending(false);
    }
  }, [emailForm, isInvoice, id]);

  if (loading) return <div className="text-sm text-muted-foreground p-6">Loading...</div>;
  const hasClients = clients.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(isInvoice ? '/invoices' : '/quotations')} aria-label="Back" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">{id ? doc.number || titleNoun : `New ${titleNoun}`}</h2>
              {doc.status && id && <StatusBadge status={doc.status} />}
              {doc.currency && id && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">{doc.currency}</span>}
            </div>
            <p className="text-sm text-muted-foreground">{id ? `Edit ${titleNoun.toLowerCase()} details and line items.` : `Create a new ${titleNoun.toLowerCase()} for your client.`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {id && <Button onClick={openEmail} variant="secondary" data-testid={`${kind}-send-email-button`}><Mail className="h-4 w-4 mr-1.5" /> Send Email</Button>}
          {id && isInvoice && doc.status !== 'paid' && <Button onClick={() => setStatus('paid')} variant="secondary" data-testid="invoice-mark-paid-button"><Receipt className="h-4 w-4 mr-1.5" /> Mark Paid</Button>}
          {id && isInvoice && doc.status === 'paid' && <Button onClick={() => setStatus('unpaid')} variant="ghost" data-testid="invoice-mark-unpaid-button"><RefreshCw className="h-4 w-4 mr-1.5" /> Mark Unpaid</Button>}
          {id && !isInvoice && <Button onClick={convertToInvoice} variant="secondary" data-testid="quotation-convert-to-invoice-button"><Receipt className="h-4 w-4 mr-1.5" /> Convert to Invoice</Button>}
          {id && <Button onClick={downloadPdf} variant="ghost" data-testid={`${kind}-download-pdf-button`}><Download className="h-4 w-4 mr-1.5" /> PDF</Button>}
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid={`${kind}-save-button`}><Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      {!hasClients && (
        <Card className="rounded-2xl border border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-amber-300">Add a client first before creating {titleNoun.toLowerCase()}s. <Button onClick={() => navigate('/clients')} variant="link" className="text-primary px-2 h-auto">Go to Clients →</Button></CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
          <DocumentMetadataCard kind={kind} doc={doc} setDoc={setDoc} clients={clients} currencies={currencies} />
          <LineItemsCard kind={kind} items={doc.items} currency={doc.currency} onAdd={addItem} onChange={updateItem} onRemove={removeItem} />
          <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
            <CardHeader className="pb-3"><CardTitle className="font-display text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={doc.notes || ''} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} placeholder="Payment terms, bank details, thank-you note..." className="bg-background/40 min-h-[100px]" data-testid={`${kind}-notes-input`} />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-4">
          <SummaryCard kind={kind} totals={totals} currency={doc.currency} />
        </div>
      </div>

      <SendEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        status={emailStatus}
        form={emailForm}
        setForm={setEmailForm}
        onSubmit={sendEmail}
        sending={emailSending}
        titleNoun={titleNoun}
      />
    </div>
  );
}
