import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const titles = {
  '/dashboard': 'Dashboard',
  '/clients': 'Clients',
  '/quotations': 'Quotations',
  '/invoices': 'Invoices',
  '/projects': 'Projects',
  '/payments': 'Payments & Reminders',
  '/settings': 'Settings',
};

function getTitle(pathname) {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith('/invoices')) return 'Invoice';
  if (pathname.startsWith('/quotations')) return 'Quotation';
  return 'Lancely';
}

export default function Topbar({ onMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 h-14">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={onMenu} data-testid="topbar-menu-button" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-base sm:text-lg font-semibold tracking-tight truncate" data-testid="topbar-title">{getTitle(pathname)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3" data-testid="topbar-create-button">
                <Plus className="h-4 w-4 mr-1.5" /> Create
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border">
              <DropdownMenuItem onClick={() => navigate('/invoices/new')} data-testid="topbar-create-invoice">New Invoice</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/quotations/new')} data-testid="topbar-create-quotation">New Quotation</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/clients')} data-testid="topbar-create-client">New Client</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/projects')} data-testid="topbar-create-project">New Project</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
