import { AlertTriangle, Mail, Calendar, CheckSquare, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardData } from '@/hooks/useDashboardData';

interface NeedsAttentionCardProps {
  data: DashboardData | null;
  loading: boolean;
}

interface AttentionItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  count?: number;
  variant?: 'default' | 'warning' | 'destructive';
}

function AttentionItem({ icon, title, description, count, variant = 'default' }: AttentionItemProps) {
  const variantClasses = {
    default: 'border-border',
    warning: 'border-yellow-500/50 bg-yellow-500/5',
    destructive: 'border-destructive/50 bg-destructive/5',
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${variantClasses[variant]}`}>
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground text-sm">{title}</p>
          {count !== undefined && count > 0 && (
            <Badge variant={variant === 'destructive' ? 'destructive' : 'secondary'} className="text-xs">
              {count}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
      </div>
    </div>
  );
}

export function NeedsAttentionCard({ data, loading }: NeedsAttentionCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Needs Attention
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const items: AttentionItemProps[] = [];

  // Emails awaiting response
  if (data?.gmail.connected && data.gmail.awaitingResponse.length > 0) {
    items.push({
      icon: <Mail className="h-4 w-4" />,
      title: 'Emails awaiting response',
      description: data.gmail.awaitingResponse[0]?.subject || 'Older than 24 hours',
      count: data.gmail.awaitingResponse.length,
      variant: 'warning',
    });
  }

  // Pending calendar invites
  if (data?.calendar.connected && data.calendar.pendingInvites.length > 0) {
    items.push({
      icon: <Calendar className="h-4 w-4" />,
      title: 'Pending calendar invites',
      description: data.calendar.pendingInvites[0]?.summary || 'Awaiting RSVP',
      count: data.calendar.pendingInvites.length,
      variant: 'warning',
    });
  }

  // Overdue Monday tasks
  if (data?.monday.connected && data.monday.overdueTasks.length > 0) {
    items.push({
      icon: <CheckSquare className="h-4 w-4" />,
      title: 'Overdue tasks',
      description: data.monday.overdueTasks[0]?.name || 'Tasks past due date',
      count: data.monday.overdueTasks.length,
      variant: 'destructive',
    });
  }

  // Overdue followups
  const overdueFollowups = data?.contacts.followupsDue.filter(f => {
    if (!f.nextFollowupDate) return false;
    return new Date(f.nextFollowupDate) < new Date();
  }) || [];

  if (overdueFollowups.length > 0) {
    items.push({
      icon: <Users className="h-4 w-4" />,
      title: 'Overdue follow-ups',
      description: overdueFollowups[0]?.email || 'Contacts need attention',
      count: overdueFollowups.length,
      variant: 'destructive',
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          Needs Attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            🎉 All caught up! Nothing needs your attention.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <AttentionItem key={i} {...item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}