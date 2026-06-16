import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mail } from 'lucide-react';

export function SendEmailDialog({ open, onOpenChange, status, form, setForm, onSubmit, sending, titleNoun }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Send {titleNoun} by email</DialogTitle>
          <DialogDescription>Compose and send a reminder to your client.</DialogDescription>
        </DialogHeader>
        {status && !status.configured && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
            Email service is not configured. Add <code className="font-mono">RESEND_API_KEY</code> to backend .env to enable actual sending. You can still preview the email below.
          </div>
        )}
        {status && status.configured && (
          <div className="text-xs text-muted-foreground">Sender: <code className="font-mono">{status.sender}</code></div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="email" required value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="bg-background/40" data-testid="email-to-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="bg-background/40" data-testid="email-subject-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Body (HTML)</Label>
            <Textarea required rows={8} value={form.html} onChange={(e) => setForm({ ...form, html: e.target.value })} className="bg-background/40 font-mono text-xs" data-testid="email-html-input" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={sending} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="email-send-submit">
              <Mail className="h-4 w-4 mr-1.5" /> {sending ? 'Sending...' : (status?.configured ? 'Send email' : 'Try send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
