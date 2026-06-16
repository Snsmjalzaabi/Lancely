import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Reusable upgrade prompt shown when a Free-tier user attempts a Pro action.
 * Open via controlled `open` prop; the parent owns the state because triggers are
 * scattered across many feature surfaces.
 */
export function UpgradeModal({ open, onOpenChange, title, reason, feature }) {
  const navigate = useNavigate();
  const headline = title || 'Unlock with Lancely Pro';
  const sub = reason || `${feature || 'This feature'} is part of the Pro plan.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="upgrade-modal">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <Badge variant="secondary" className="text-[10px] tracking-wider uppercase">Lancely Pro</Badge>
          </div>
          <DialogTitle className="text-xl">{headline}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{sub}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm text-foreground/90 mt-2">
          <li className="flex gap-2"><span className="text-primary">•</span> Unlimited clients, invoices, and quotations</li>
          <li className="flex gap-2"><span className="text-primary">•</span> AI invoice generator, email composer, expense categorization</li>
          <li className="flex gap-2"><span className="text-primary">•</span> Recurring invoices and custom reminder templates</li>
          <li className="flex gap-2"><span className="text-primary">•</span> No “Made with Lancely” watermark on PDFs</li>
        </ul>

        <div className="mt-4 rounded-xl border border-border bg-card/50 p-3 text-center">
          <div className="text-2xl font-semibold">AED 39<span className="text-sm text-muted-foreground font-normal"> /month</span></div>
          <div className="text-xs text-muted-foreground">or AED 390/year · save ~16%</div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" data-testid="upgrade-modal-not-now">
            <X className="h-4 w-4 mr-1" /> Not now
          </Button>
          <Button onClick={() => { onOpenChange(false); navigate('/pricing'); }} className="flex-1" data-testid="upgrade-modal-cta">
            See plans <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Convenience hook: returns [open, setOpen, modalElement] for one-liner usage. */
export function useUpgradeModal(defaults = {}) {
  const [open, setOpen] = useState(false);
  const element = (
    <UpgradeModal open={open} onOpenChange={setOpen} {...defaults} />
  );
  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false), element };
}
