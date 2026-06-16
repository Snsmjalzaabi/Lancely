import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Plus, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

const titles = {
  '/dashboard': 'Dashboard',
  '/clients': 'Clients',
  '/quotations': 'Quotations',
  '/invoices': 'Invoices',
  '/projects': 'Projects',
  '/payments': 'Payments & Reminders',
  '/recurring': 'Recurring Invoices',
  '/settings': 'Settings',
};

function getTitle(pathname) {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith('/invoices')) return 'Invoice';
  if (pathname.startsWith('/quotations')) return 'Quotation';
  if (pathname.startsWith('/recurring')) return 'Recurring Invoice';
  return 'Lancely';
}

export default function Topbar({ onMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { refreshUser } = useAuth();

  const handleToggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    toggleTheme();
    try {
      await api.put('/auth/me', { theme: newTheme });
      refreshUser?.();
    } catch (err) {
      // Theme is still applied locally; server sync is best-effort.
      console.warn('Failed to sync theme preference with server:', err?.message || err);
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 h-14">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={onMenu} data-testid="topbar-menu-button" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-base sm:text-lg font-semibold tracking-tight truncate" data-testid="topbar-title">{getTitle(pathname)}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-muted/60" onClick={handleToggleTheme} data-testid="topbar-theme-toggle" aria-label="Toggle theme" title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3" data-testid="topbar-create-button">
                <Plus className="h-4 w-4 mr-1.5" /> Create
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border">
              <DropdownMenuItem onClick={() => navigate('/invoices/new')} data-testid="topbar-create-invoice">New Invoice</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/quotations/new')} data-testid="topbar-create-quotation">New Quotation</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/recurring/new')} data-testid="topbar-create-recurring">New Recurring Invoice</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/clients')} data-testid="topbar-create-client">New Client</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/projects')} data-testid="topbar-create-project">New Project</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
