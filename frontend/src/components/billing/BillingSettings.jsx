import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ExternalLink, RefreshCw, Check } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useBilling } from '@/contexts/BillingContext';

function LimitRow({ label, used, cap }) {
  const pct = cap == null ? 0 : Math.min(100, Math.round(((used || 0) / cap) * 100));
  const isUnlimited = cap == null;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{used || 0}{isUnlimited ? ' · Unlimited' : ` / ${cap}`}</span>
      </div>
      {!isUnlimited && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

export function BillingSettings() {
  const billing = useBilling();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { billing.refresh(); /* on mount */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onManage = async () => {
    // Open the RevenueCat-issued management URL for Web Billing customers
    try {
      const { data } = await api.get('/billing/management-url');
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        toast.info('No active subscription to manage. Subscribe first from the Pricing page.');
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        toast.info('No active subscription to manage. Subscribe first from the Pricing page.');
      } else {
        toast.error('Unable to open billing portal right now.');
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await billing.refreshFromRevenueCat();
      toast.success('Plan status refreshed.');
    } finally {
      setRefreshing(false);
    }
  };

  const { planTier, isPro, isTrial, trialEndsAt, currentPeriodEnd, limits, usage } = billing;
  const tierLabel = planTier === 'pro' ? 'Pro' : planTier === 'trial' ? 'Pro trial' : 'Free';
  const renewIso = currentPeriodEnd || trialEndsAt;
  const renewDate = renewIso ? new Date(renewIso) : null;
  const renewText = renewDate && !isNaN(renewDate) ? renewDate.toLocaleDateString() : null;

  return (
    <div className="space-y-4" data-testid="billing-settings">
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm text-muted-foreground">Current plan</div>
              <div className="flex items-center gap-2 mt-1">
                <h3 className="text-2xl font-semibold">{tierLabel}</h3>
                {isPro && <Badge className="bg-primary/10 text-primary border-primary/30 gap-1"><Sparkles className="h-3 w-3" /> Pro</Badge>}
                {isTrial && <Badge variant="secondary">14-day trial</Badge>}
              </div>
              {renewText && (
                <div className="text-xs text-muted-foreground mt-2">
                  {isTrial ? `Trial ends on ${renewText}` : isPro ? `Renews on ${renewText}` : ''}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} data-testid="billing-refresh-btn">
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              {isPro || isTrial ? (
                <Button variant="outline" onClick={onManage} data-testid="billing-manage-btn">
                  <ExternalLink className="h-4 w-4 mr-1" /> Manage billing
                </Button>
              ) : (
                <Button onClick={() => navigate('/pricing')} data-testid="billing-upgrade-btn">
                  <Sparkles className="h-4 w-4 mr-1" /> Upgrade to Pro
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">Usage this period</div>
          <LimitRow label="Clients" used={usage.clients_used} cap={limits.max_clients} />
          <LimitRow label="Invoices this month" used={usage.invoices_used_this_month} cap={limits.max_invoices_per_month} />
          <LimitRow label="Quotations this month" used={usage.quotations_used_this_month} cap={limits.max_quotations_per_month} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card">
        <CardHeader>
          <h4 className="font-semibold">Pro feature access</h4>
        </CardHeader>
        <CardContent>
          <ul className="grid sm:grid-cols-2 gap-2 text-sm">
            {[
              ['AI invoice generator', limits.allow_ai],
              ['AI email composer', limits.allow_ai],
              ['AI expense categorization', limits.allow_ai],
              ['Recurring invoices', limits.allow_recurring],
              ['Custom reminder templates', limits.allow_custom_templates],
              ['No “Made with Lancely” watermark', !limits.pdf_watermark],
            ].map(([label, granted]) => (
              <li key={label} className="flex items-center gap-2">
                <span className={`h-5 w-5 rounded-full flex items-center justify-center ${granted ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Check className="h-3 w-3" />
                </span>
                <span className={granted ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
