import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('Welcome back');
      navigate('/dashboard');
    } catch (err) {
      // Pydantic 422 returns `detail` as an array; legacy 4xx returns a string.
      const raw = err?.response?.data?.detail;
      let message;
      if (typeof raw === 'string') {
        message = raw;
      } else if (Array.isArray(raw) && raw.length > 0) {
        const first = raw[0];
        const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : 'input';
        message = `${field}: ${first?.msg || 'invalid value'}`;
      } else if (raw && typeof raw === 'object') {
        message = raw.message || JSON.stringify(raw);
      } else {
        message = err?.message || 'Login failed';
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background bg-noise">
      {/* Brand panel */}
      <div className="hidden lg:flex relative items-center justify-center p-12 overflow-hidden border-r border-border">
        <div className="absolute -top-32 -left-24 h-[520px] w-[520px] rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-[420px] w-[420px] rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-11 w-11 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-display text-2xl font-semibold tracking-tight">Lancely</div>
              <div className="text-xs text-muted-foreground tracking-widest uppercase">UAE Freelancer Suite</div>
            </div>
          </div>
          <h2 className="font-display text-3xl xl:text-4xl font-semibold tracking-tight leading-tight">Get paid faster. Stay compliant.</h2>
          <p className="text-muted-foreground mt-4 leading-relaxed">Clients, quotations, invoices, projects, VAT, and reminders — built for the way UAE freelancers actually work.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {['5% UAE VAT calculations baked-in','Professional PDF invoices & quotations','Smart payment reminders so you never chase','Beautiful dashboard analytics'].map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                <span className="text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="font-display text-xl font-semibold tracking-tight">Lancely</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 [box-shadow:var(--shadow-elev-2)]">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to manage your freelance business.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" required placeholder="you@studio.com" className="pl-9 bg-background/40" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email-input" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" required placeholder="••••••••" className="pl-9 bg-background/40" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password-input" />
                </div>
              </div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading} data-testid="login-form-submit-button">
                {loading ? 'Signing in...' : (<><span>Sign in</span><ArrowRight className="h-4 w-4 ml-1.5" /></>)}
              </Button>
            </form>
            <div className="mt-6 text-sm text-center text-muted-foreground">
              New to Lancely? <Link to="/register" className="text-primary hover:underline" data-testid="login-go-register">Create an account</Link>
            </div>
          </div>
          <div className="text-center text-xs text-muted-foreground mt-6">By signing in, you agree to our terms and privacy policy.</div>
        </div>
      </div>
    </div>
  );
}
