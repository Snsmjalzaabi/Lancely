import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Receipt, FolderKanban, BellRing, Settings as SettingsIcon, LogOut, Sparkles, Repeat, Wallet, BarChart3, Activity } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

const groups = [
  {
    label: 'Workspace',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', testid: 'sidebar-nav-dashboard' },
      { to: '/clients', icon: Users, label: 'Clients', testid: 'sidebar-nav-clients' },
      { to: '/projects', icon: FolderKanban, label: 'Projects', testid: 'sidebar-nav-projects' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/quotations', icon: FileText, label: 'Quotations', testid: 'sidebar-nav-quotations' },
      { to: '/invoices', icon: Receipt, label: 'Invoices', testid: 'sidebar-nav-invoices' },
      { to: '/recurring', icon: Repeat, label: 'Recurring', testid: 'sidebar-nav-recurring' },
      { to: '/expenses', icon: Wallet, label: 'Expenses', testid: 'sidebar-nav-expenses' },
      { to: '/payments', icon: BellRing, label: 'Payments', testid: 'sidebar-nav-payments' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/reports', icon: BarChart3, label: 'Reports', testid: 'sidebar-nav-reports' },
      { to: '/activity', icon: Activity, label: 'Activity', testid: 'sidebar-nav-activity' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/settings', icon: SettingsIcon, label: 'Settings', testid: 'sidebar-nav-settings' },
    ],
  },
];

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">{g.label}</div>
          <div className="flex flex-col gap-1">
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={onNavigate}
                data-testid={it.testid}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-200 ${
                    isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary" />}
                    <it.icon className={`h-4 w-4 ${'shrink-0'}`} />
                    <span>{it.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const SidebarBody = (
    <div className="h-full flex flex-col">
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="font-display text-lg font-semibold tracking-tight leading-none">Lancely</div>
            <div className="text-[10.5px] text-muted-foreground tracking-wider uppercase mt-1">UAE Freelancer Suite</div>
          </div>
        </div>
      </div>
      <div className="px-3 flex-1 overflow-y-auto">
        <NavItems onNavigate={() => setMobileOpen?.(false)} />
      </div>
      <div className="px-3 pb-4 pt-3 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-8 w-8 rounded-full bg-accent/30 text-accent-foreground flex items-center justify-center text-xs font-semibold">
            {(user?.name || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate" data-testid="sidebar-user-name">{user?.name || 'User'}</div>
            <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/60" onClick={handleLogout} data-testid="sidebar-logout-button" aria-label="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[260px] border-r border-border bg-card/60 backdrop-blur-sm z-30">
        {SidebarBody}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[280px] bg-card border-border">
          {SidebarBody}
        </SheetContent>
      </Sheet>
    </>
  );
}
