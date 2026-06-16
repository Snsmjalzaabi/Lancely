import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { csvUrl } from '@/lib/api';

const LABELS = {
  clients: 'clients.csv',
  invoices: 'invoices.csv',
  quotations: 'quotations.csv',
  projects: 'projects.csv',
};

export function ExportButton({ entity, label, testid }) {
  // Single-entity export shortcut
  const onClick = () => window.open(csvUrl(entity), '_blank');
  return (
    <Button variant="secondary" onClick={onClick} className="hover:bg-secondary/80" data-testid={testid || `export-${entity}-button`}>
      <FileSpreadsheet className="h-4 w-4 mr-1.5" /> {label || 'Export CSV'}
    </Button>
  );
}

export function ExportMenu() {
  // Workspace-wide export menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" data-testid="export-menu-trigger"><Download className="h-4 w-4 mr-1.5" /> Export</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Download as CSV</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(LABELS).map(([k, label]) => (
          <DropdownMenuItem key={k} onClick={() => window.open(csvUrl(k), '_blank')} data-testid={`export-menu-${k}`}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
