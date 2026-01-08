import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardData } from '@/hooks/useDashboardData';
import { QuickStats } from './QuickStats';
import { NeedsAttentionCard } from './NeedsAttentionCard';
import { TodayScheduleCard } from './TodayScheduleCard';
import { RecentEmailsCard } from './RecentEmailsCard';
import { PriorityContactsCard } from './PriorityContactsCard';
import { UpcomingOccasionsCard } from './UpcomingOccasionsCard';
import { QuickActions } from './QuickActions';
import { ChatFAB } from './ChatFAB';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useIsMobile } from '@/hooks/use-mobile';

export function DashboardContent() {
  const { data, loading, error, refresh } = useDashboardData();
  const isMobile = useIsMobile();

  const handleRefresh = async () => {
    await refresh();
  };

  const content = (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Intelligence Hub</h2>
          <p className="text-sm text-muted-foreground">
            Your unified view of what needs attention today
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={refresh}
          disabled={loading}
          className="gap-2 hidden md:flex"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg animate-fade-in">
          {error}
        </div>
      )}

      {/* Quick Stats */}
      <QuickStats data={data} loading={loading} />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <NeedsAttentionCard data={data} loading={loading} />
          <TodayScheduleCard data={data} loading={loading} />
          <UpcomingOccasionsCard data={data} loading={loading} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <RecentEmailsCard data={data} loading={loading} />
          <PriorityContactsCard data={data} loading={loading} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pt-2">
        <h3 className="text-sm font-medium text-foreground mb-3">Quick Actions</h3>
        <QuickActions />
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <PullToRefresh onRefresh={handleRefresh} className="min-h-[calc(100dvh-12rem)]">
          {content}
        </PullToRefresh>
      ) : (
        content
      )}
      
      {/* Floating Action Button for mobile */}
      {isMobile && <ChatFAB />}
    </>
  );
}