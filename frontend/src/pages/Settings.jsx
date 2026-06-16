import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, User, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({ name: '', business_name: '', trn: '', address: '', phone: '', website: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setForm({
      name: user.name || '',
      business_name: user.business_name || '',
      trn: user.trn || '',
      address: user.address || '',
      phone: user.phone || '',
      website: user.website || '',
    });
  }, [user]);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try { await api.put('/auth/me', form); await refreshUser(); toast.success('Settings saved'); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your profile and business info that appears on PDFs.</p>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="profile" data-testid="settings-tab-profile"><User className="h-3.5 w-3.5 mr-1.5" /> Profile</TabsTrigger>
          <TabsTrigger value="business" data-testid="settings-tab-business"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Business</TabsTrigger>
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
          <div className="flex justify-end mt-5">
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="settings-save"><Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving...' : 'Save changes'}</Button>
          </div>
        </form>
      </Tabs>
    </div>
  );
}
