import { Badge } from '@/components/ui/badge';

const styles = {
  paid: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  unpaid: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  overdue: 'bg-red-500/15 text-red-200 border-red-500/30',
  draft: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
  sent: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30',
  accepted: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-200 border-red-500/30',
  active: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30',
  on_hold: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  cancelled: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
};

export function StatusBadge({ status, className = '' }) {
  const key = (status || '').toLowerCase();
  const cls = styles[key] || 'bg-slate-500/15 text-slate-200 border-slate-500/30';
  const label = key.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 border ${cls} ${className}`}>
      {label}
    </Badge>
  );
}
