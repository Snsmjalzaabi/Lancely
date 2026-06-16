import { Sparkles, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useBilling } from '@/contexts/BillingContext';

/** Small pill that surfaces the user's current plan in the header / nav. */
export function PlanBadge() {
  const { planTier, trialEndsAt } = useBilling();
  if (planTier === 'pro') {
    return (
      <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 text-primary" data-testid="plan-badge-pro">
        <Sparkles className="h-3 w-3" /> Pro
      </Badge>
    );
  }
  if (planTier === 'trial') {
    let daysLeft = '';
    try {
      if (trialEndsAt) {
        const d = Math.max(0, Math.ceil((new Date(trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)));
        daysLeft = `· ${d}d left`;
      }
    } catch (e) { /* noop */ }
    return (
      <Badge variant="secondary" className="gap-1" data-testid="plan-badge-trial">
        <Clock className="h-3 w-3" /> Pro trial {daysLeft}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-testid="plan-badge-free">Free plan</Badge>
  );
}
