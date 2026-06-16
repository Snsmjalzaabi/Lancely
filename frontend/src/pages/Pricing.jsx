import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Sparkles, ArrowLeft, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useBilling } from '@/contexts/BillingContext';

const FREE_FEATURES = [
  '1 client',
  '3 invoices per month',
  '3 quotations per month',
  'PDF export (with "Made with Lancely" footer)',
  'CSV exports',
  'Multi-currency invoicing',
];

const PRO_FEATURES = [
  'Unlimited clients, invoices, quotations',
  'AI invoice generator (text → invoice)',
  'AI email composer (gentle / firm / overdue tones)',
  'AI expense categorization',
  'Recurring invoices (weekly, monthly, quarterly, yearly)',
  'Custom reminder templates with AI drafting',
  'No watermark on PDFs',
  'Priority email support',
];

export default function Pricing() {
  const { user } = useAuth();
  const billing = useBilling();
  const navigate = useNavigate();
  const [purchasingPlan, setPurchasingPlan] = useState(null);
  const [offerings, setOfferings] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rc = await billing.ensureRevenueCat();
      if (!rc || !alive) return;
      try {
        const offers = await rc.getOfferings({ currency: 'AED' });
        if (alive) setOfferings(offers);
      } catch (err) {
        console.warn('Failed to load RevenueCat offerings:', err?.message || err);
      }
    })();
    return () => { alive = false; };
  }, [billing]);

  const handlePurchase = async (packageIdentifier) => {
    if (!user) {
      navigate('/login');
      return;
    }
    const rc = await billing.ensureRevenueCat();
    if (!rc) {
      toast.error('Billing is not yet configured. Please contact support.');
      return;
    }
    const pkg = (offerings?.current?.availablePackages || []).find(p =>
      p.identifier === packageIdentifier || p?.rcBillingProduct?.identifier?.includes(packageIdentifier)
    ) || offerings?.current?.availablePackages?.[0];
    if (!pkg) {
      toast.error('No subscription package available. Please try again later.');
      return;
    }
    setPurchasingPlan(packageIdentifier);
    try {
      await rc.purchase({ rcPackage: pkg });
      await billing.refreshFromRevenueCat();
      toast.success('Welcome to Lancely Pro! Your account has been upgraded.');
      navigate('/dashboard');
    } catch (err) {
      if (err?.errorCode === 'PURCHASE_CANCELLED' || /cancel/i.test(err?.message || '')) {
        // user closed the paywall — silent
      } else {
        console.error('purchase failed:', err);
        toast.error(err?.message || 'Purchase failed. Please try again.');
      }
    } finally {
      setPurchasingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="pricing-page">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate(user ? '/dashboard' : '/login')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {billing.isPro && (
            <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="h-3 w-3" /> You’re on Pro
            </Badge>
          )}
        </div>

        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-3">Simple pricing</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Choose your plan</h1>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Built for UAE freelancers. Try Pro free for 14 days — no credit card needed during the trial.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Free */}
          <Card className="rounded-2xl border-border bg-card flex flex-col" data-testid="pricing-card-free">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Free</h3>
                <Badge variant="outline">Starter</Badge>
              </div>
              <div className="mt-3">
                <div className="text-3xl font-semibold">AED 0</div>
                <div className="text-sm text-muted-foreground">Try the essentials</div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between gap-6">
              <ul className="space-y-2 text-sm">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex gap-2 items-start">
                    <Check className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" disabled data-testid="pricing-free-cta">
                {billing.planTier === 'free' ? 'Your current plan' : 'Included'}
              </Button>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card className="rounded-2xl border-primary/40 bg-card relative flex flex-col shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]" data-testid="pricing-card-pro">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-primary text-primary-foreground gap-1">
                <Sparkles className="h-3 w-3" /> Most popular
              </Badge>
            </div>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Pro</h3>
                <Badge variant="secondary" className="text-primary border-primary/30 bg-primary/10">14-day trial</Badge>
              </div>
              <div className="mt-3">
                <div className="text-3xl font-semibold">AED 39<span className="text-base text-muted-foreground font-normal"> /month</span></div>
                <div className="text-sm text-muted-foreground">or AED 390 / year · save ~16%</div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between gap-6">
              <ul className="space-y-2 text-sm">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex gap-2 items-start">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => handlePurchase('$rc_monthly')}
                  disabled={billing.isPro || !!purchasingPlan}
                  data-testid="pricing-pro-monthly-cta"
                >
                  {billing.isPro ? 'You’re on Pro' : purchasingPlan === '$rc_monthly' ? 'Opening checkout…' : (
                    <>Subscribe monthly <ArrowRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handlePurchase('$rc_annual')}
                  disabled={billing.isPro || !!purchasingPlan}
                  data-testid="pricing-pro-yearly-cta"
                >
                  {billing.isPro ? 'Active' : purchasingPlan === '$rc_annual' ? 'Opening checkout…' : 'Subscribe yearly (save ~16%)'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10">
          Payments secured by Stripe via RevenueCat. Cancel anytime from Settings → Billing.
          <br /> Questions? Email <Link to="mailto:hello@lance-ly.com" className="underline">hello@lance-ly.com</Link>.
        </p>
      </div>
    </div>
  );
}
