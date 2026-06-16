import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { api, formatDate } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { toast } from 'sonner';

const ACTION_LABEL = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  payment_added: 'Payment added',
  payment_removed: 'Payment removed',
  auto_reminder_sent: 'Auto reminder sent',
  viewed_publicly: 'Viewed publicly',
  bulk_mark_paid: 'Bulk marked paid',
  bulk_mark_unpaid: 'Bulk marked unpaid',
  bulk_delete: 'Bulk deleted',
  restore: 'Data restored',
};

export default function ActivityFeed() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/activity?limit=200').then(({data}) => setRows(data))
      .catch(err => { console.error(err); toast.error('Failed to load activity'); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div><h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Activity</h2><p className="text-sm text-muted-foreground">Audit log of changes across your workspace.</p></div>
      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-0">
          {loading ? <div className="p-6 space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-10 w-full" />)}</div>
          : rows.length === 0 ? <div className="p-6"><EmptyState icon={Activity} title="No activity yet" description="Once you create clients, invoices, or expenses, you'll see them here." testid="activity-empty" /></div>
          : <div className="divide-y divide-border">{rows.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20" data-testid={`activity-row-${r.id}`}>
                <div className="h-2 w-2 rounded-full bg-primary/60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-medium">{ACTION_LABEL[r.action] || r.action}</span> <span className="text-muted-foreground">· {r.entity_type}</span></div>
                  {r.details && Object.keys(r.details).length > 0 && <div className="text-xs text-muted-foreground truncate">{Object.entries(r.details).slice(0,3).map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</div>}
                </div>
                <div className="text-xs text-muted-foreground shrink-0">{formatDate(r.created_at)}</div>
              </div>))}
            </div>}
        </CardContent>
      </Card>
    </div>
  );
}
