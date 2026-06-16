import { useState } from 'react';
import { Wand2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const EXAMPLES = [
  '3 days website work at AED 800/day plus a logo for AED 1500',
  'Monthly social media management: 10 posts AED 250 each, 1 strategy session AED 800',
  '2 hours of consulting at AED 500/hr, plus AED 1200 for revisions',
];

export function AIGenerateButton({ currency, onApply, kind }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (text.trim().length < 4) { toast.info('Add a short description first'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/ai/parse-invoice', { text, currency });
      onApply(data);
      toast.success(`AI added ${data.items?.length || 0} line item(s)`);
      setOpen(false);
      setText('');
    } catch (err) {
      console.error('AI parse failed', err);
      toast.error(err?.response?.data?.detail || 'AI parse failed');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15" data-testid={`${kind}-ai-generate-button`}>
        <Wand2 className="h-4 w-4 mr-1.5" /> AI Generate
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI {kind === 'invoice' ? 'Invoice' : 'Quotation'} Generator</DialogTitle>
            <DialogDescription>Describe the work in plain English. AI will produce line items with quantities and rates.</DialogDescription>
          </DialogHeader>
          <Textarea rows={5} value={text} onChange={e => setText(e.target.value)} className="bg-background/40" placeholder="e.g., 3 days website work at AED 800/day plus a logo for AED 1500" data-testid={`${kind}-ai-text-input`} />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(ex => <button key={ex} onClick={() => setText(ex)} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted/50 text-muted-foreground">{ex}</button>)}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={run} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid={`${kind}-ai-run`}><Wand2 className="h-4 w-4 mr-1.5" /> {busy ? 'Thinking...' : 'Generate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
