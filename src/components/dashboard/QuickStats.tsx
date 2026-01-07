import { Mail, Calendar, CheckSquare, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardData } from '@/hooks/useDashboardData';

interface QuickStatsProps {
  data: DashboardData | null;
  loading: boolean;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  connected: boolean;
  loading: boolean;
}

function StatCard({ icon, label, value, connected, loading }: StatCardProps) {
  return (
    <Card className="p-4 flex items-center gap-4">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground truncate">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-12 mt-1" />
        ) : connected ? (
          <p className="text-2xl font-bold text-foreground">{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Not connected</p>
        )}
      </div>
    </Card>
  );
}

export function QuickStats({ data, loading }: QuickStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={<Mail className="h-6 w-6" />}
        label="Unread Emails"
        value={data?.gmail.unreadCount ?? 0}
        connected={data?.gmail.connected ?? false}
        loading={loading}
      />
      <StatCard
        icon={<Calendar className="h-6 w-6" />}
        label="Today's Events"
        value={data?.calendar.todayEvents.length ?? 0}
        connected={data?.calendar.connected ?? false}
        loading={loading}
      />
      <StatCard
        icon={<CheckSquare className="h-6 w-6" />}
        label="Tasks Due Today"
        value={data?.monday.tasksDueToday.length ?? 0}
        connected={data?.monday.connected ?? false}
        loading={loading}
      />
      <StatCard
        icon={<Users className="h-6 w-6" />}
        label="Follow-ups Due"
        value={data?.contacts.followupsDue.length ?? 0}
        connected={true}
        loading={loading}
      />
    </div>
  );
}