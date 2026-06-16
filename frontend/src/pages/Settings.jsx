import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, User, Building2, Coins, Palette, Mail, BellRing } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import ReminderTemplates from '@/components/ReminderTemplates';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({ name: '', business_name: '', trn: '', address: '', phone: '', website: '', currency: 'AED' });
  const [saving, setSaving] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [emailStatus, setEmailStatus] = useState(null);
  const [reminders, setReminders] = useState({ auto_reminders_enabled: false, remind_days_before_due: [3], remind_days_after_due: [1, 7] });
  const [remindersBusy, setRemindersBusy] = useState(false);

  useEffect(() => {
    if (user) setForm({
      name: user.name || '',
      business_name: user.business_name || '',
      trn: user.trn || '',
      address: user.address || '',
      phone: user.phone || '',
      website: user.website || '',
      currency: user.currency || 'AED',
    });
  }, [user]);

  useEffect(() => {
    api.get('/currencies').then(({ data }) => setCurrencies(data)).catch((err) => console.warn('Could not load currencies:', err?.message || err));
    api.get('/email/status').then(({ data }) => setEmailStatus(data)).catch((err) => console.warn('Could not load email status:', err?.message || err));
    api.get('/reminders/settings').then(({ data }) => setReminders((prev) => ({ ...prev, ...data }))).catch((err) => console.warn('Could not load reminders settings:', err?.message || err));
  }, []);

  const saveReminders = async (next) => {
    setRemindersBusy(true);
    try {
      const { data } = await api.put('/reminders/settings', next);
      setReminders((prev) => ({ ...prev, ...data, ...next }));
      toast.success('Reminders updated');
    } catch (err) { console.error('Reminders save', err); toast.error('Failed to save reminders'); }
    finally { setRemindersBusy(false); }
  };

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try { await api.put('/auth/me', form); await refreshUser(); toast.success('Settings saved'); }
    catch (err) { console.error('Settings save failed:', err); toast.error(err?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const changeTheme = async (t) => {
    setTheme(t);
    try { await api.put('/auth/me', { theme: t }); }
    catch (err) { console.warn('Theme sync to server failed (local change still applied):', err?.message || err); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your profile, business info, currency, theme and email.</p>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="profile" data-testid="settings-tab-profile"><User className="h-3.5 w-3.5 mr-1.5" /> Profile</TabsTrigger>
          <TabsTrigger value="business" data-testid="settings-tab-business"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Business</TabsTrigger>
          <TabsTrigger value="preferences" data-testid="settings-tab-preferences"><Palette className="h-3.5 w-3.5 mr-1.5" /> Preferences</TabsTrigger>
          <TabsTrigger value="email" data-testid="settings-tab-email"><Mail className="h-3.5 w-3.5 mr-1.5" /> Email</TabsTrigger>
          <TabsTrigger value="reminders" data-testid="settings-tab-reminders"><BellRing className="h-3.5 w-3.5 mr-1.5" /> Reminders</TabsTrigger>
        </TabsList>
        <form onSubmit={save}>
          <TabsContent value="profile" className="mt-4">
            <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base">Profile</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Your name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-background/40" data-testid="settings-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={user?.email || ''} disabled className="bg-background/40 text-muted-foreground" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-background/40" data-testid="settings-phone" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="business" className="mt-4">
            <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base">Business Information</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Business name</Label>
                  <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className="bg-background/40" placeholder="Used on PDFs" data-testid="settings-business-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>TRN / VAT number</Label>
                  <Input value={form.trn} onChange={(e) => setForm({ ...form, trn: e.target.value })} className="bg-background/40 font-mono" placeholder="100xxxxxxxx0003" data-testid="settings-trn" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-background/40" placeholder="Office / studio address" data-testid="settings-address" />
                </div>
                <div className="space-y-1.5">
                  <Label>Website</Label>
                  <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="bg-background/40" placeholder="https://" data-testid="settings-website" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="preferences" className="mt-4 space-y-4">
            <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> Default currency</CardTitle></CardHeader>
              <CardContent className="max-w-md">
                <div className="space-y-1.5">
                  <Label>Used as the default for new invoices and quotations</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger className="bg-background/40" data-testid="settings-currency"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /> Appearance</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Button type="button" onClick={() => changeTheme('dark')} variant={theme === 'dark' ? 'default' : 'secondary'} className={theme === 'dark' ? 'bg-primary text-primary-foreground' : ''} data-testid="settings-theme-dark">Dark</Button>
                  <Button type="button" onClick={() => changeTheme('light')} variant={theme === 'light' ? 'default' : 'secondary'} className={theme === 'light' ? 'bg-primary text-primary-foreground' : ''} data-testid="settings-theme-light">Light</Button>
                  <span className="text-xs text-muted-foreground">Current: {theme}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="email" className="mt-4">
            <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Email Service</CardTitle></CardHeader>
              <CardContent>
                {emailStatus ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-2 w-2 rounded-full ${emailStatus.configured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="font-medium">{emailStatus.configured ? 'Configured' : 'Not configured'}</span>
                      <span className="text-muted-foreground">· Provider: {emailStatus.provider}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Sender: <code className="font-mono">{emailStatus.sender}</code></div>
                    <p className="text-xs text-muted-foreground max-w-2xl">{emailStatus.note}</p>
                  </div>
                ) : <div className="text-sm text-muted-foreground">Loading email status...</div>}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="reminders" className="mt-4 space-y-4">
            <Card className="rounded-2xl border border-border bg-card [box-shadow:var(--shadow-elev-1)]">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /> Automated Payment Reminders</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Enable auto-reminders</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">An hourly job emails clients before due and after due. Requires email service to be configured.</p>
                  </div>
                  <Switch checked={!!reminders.auto_reminders_enabled} disabled={remindersBusy} onCheckedChange={(v) => saveReminders({ ...reminders, auto_reminders_enabled: v })} data-testid="reminders-toggle" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Days BEFORE due (comma-separated)</Label>
                    <Input value={(reminders.remind_days_before_due || []).join(', ')} onChange={(e) => setReminders({ ...reminders, remind_days_before_due: e.target.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n >= 0) })} className="bg-background/40 tabular-nums" placeholder="3, 1" data-testid="reminders-days-before" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Days AFTER due (overdue)</Label>
                    <Input value={(reminders.remind_days_after_due || []).join(', ')} onChange={(e) => setReminders({ ...reminders, remind_days_after_due: e.target.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n >= 0) })} className="bg-background/40 tabular-nums" placeholder="1, 7" data-testid="reminders-days-after" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" disabled={remindersBusy} onClick={() => saveReminders(reminders)} data-testid="reminders-save">Save reminder schedule</Button>
                </div>
                {!emailStatus?.configured && <div className="text-xs text-amber-300 border border-amber-500/30 bg-amber-500/5 rounded-lg p-3">Email service is not configured. Reminders will be logged but no real emails sent until you add <code className="font-mono">RESEND_API_KEY</code> to backend .env.</div>}
              </CardContent>
            </Card>
            <ReminderTemplates />
          </TabsContent>
          <div className="flex justify-end mt-5">
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="settings-save"><Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving...' : 'Save changes'}</Button>
          </div>
        </form>
      </Tabs>
    </div>
  );
}
