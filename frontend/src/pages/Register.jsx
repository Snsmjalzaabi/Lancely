import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Lock, User, Briefcase, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', business_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const onChange = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim() });
      toast.success('Account created · Welcome to Lancely');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background bg-noise">
      <div className="hidden lg:flex relative items-center justify-center p-12 overflow-hidden border-r border-border">
        <div className="absolute -top-32 -left-24 h-[520px] w-[520px] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-[420px] w-[420px] rounded-full bg-accent/10 blur-3xl" />
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
          <h2 className="font-display text-3xl xl:text-4xl font-semibold tracking-tight leading-tight">Run your freelance business like a studio.</h2>
          <p className="text-muted-foreground mt-4 leading-relaxed">Sign up free and start sending professional, VAT-ready invoices in minutes.</p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[{k:'1', v:'min setup'},{k:'5%', v:'VAT auto-calc'},{k:'PDF', v:'invoices & quotes'},{k:'AED', v:'native currency'}].map((s) => (
              <div key={s.v} className="rounded-xl border border-border bg-card/60 p-4">
                <div className="font-display text-2xl font-semibold tracking-tight">{s.k}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="font-display text-xl font-semibold tracking-tight">Lancely</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 [box-shadow:var(--shadow-elev-2)]">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">Start managing clients, invoices, and VAT in one place.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Your name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="name" required className="pl-9 bg-background/40" placeholder="Aisha Khan" value={form.name} onChange={onChange('name')} data-testid="register-name-input" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biz">Business name</Label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="biz" className="pl-9 bg-background/40" placeholder="Studio AK" value={form.business_name} onChange={onChange('business_name')} data-testid="register-business-name-input" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" required className="pl-9 bg-background/40" placeholder="you@studio.com" value={form.email} onChange={onChange('email')} data-testid="register-email-input" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" required minLength={6} className="pl-9 bg-background/40" placeholder="At least 6 characters" value={form.password} onChange={onChange('password')} data-testid="register-password-input" />
                </div>
              </div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading} data-testid="register-form-submit-button">
                {loading ? 'Creating account...' : (<><span>Create account</span><ArrowRight className="h-4 w-4 ml-1.5" /></>)}
              </Button>
            </form>
            <div className="mt-6 text-sm text-center text-muted-foreground">
              Already have an account? <Link to="/login" className="text-primary hover:underline" data-testid="register-go-login">Sign in</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
