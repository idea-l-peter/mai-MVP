import { Gift, Calendar, Heart, PartyPopper, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '@/hooks/useDashboardData';

interface UpcomingOccasionsCardProps {
  data: DashboardData | null;
  loading: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

interface Occasion {
  type: 'birthday' | 'holiday' | 'anniversary';
  name: string;
  date: string;
  daysUntil: number;
  contactEmail?: string;
}

function getOccasionIcon(type: string) {
  switch (type) {
    case 'birthday':
      return <Gift className="h-4 w-4 text-pink-500" />;
    case 'holiday':
      return <PartyPopper className="h-4 w-4 text-yellow-500" />;
    case 'anniversary':
      return <Heart className="h-4 w-4 text-red-500" />;
    default:
      return <Calendar className="h-4 w-4 text-primary" />;
  }
}

function getOccasionBadgeVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case 'birthday':
      return 'default';
    case 'holiday':
      return 'secondary';
    case 'anniversary':
      return 'outline';
    default:
      return 'secondary';
  }
}

function formatDaysUntil(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function UpcomingOccasionsCard({ data, loading, onRefresh, refreshing }: UpcomingOccasionsCardProps) {
  const navigate = useNavigate();

  const headerContent = (
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <PartyPopper className="h-5 w-5 text-primary" />
          Upcoming Occasions
        </CardTitle>
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefresh}
            disabled={refreshing || loading}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
    </CardHeader>
  );

  if (loading && !data) {
    return (
      <Card>
        {headerContent}
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Combine occasions from data
  const occasions: Occasion[] = [];
  const today = new Date();
  const currentYear = today.getFullYear();

  // Add birthdays from priority contacts (if they have birthday data)
  const allContacts = [
    ...(data?.contacts.priorityContacts || []),
    ...(data?.contacts.followupsDue || []),
  ];
  
  // Dedupe by id
  const seenIds = new Set<string>();
  const uniqueContacts = allContacts.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  uniqueContacts
    .filter((c) => c.birthday)
    .forEach((contact) => {
      if (!contact.birthday) return;
      const bday = new Date(contact.birthday);
      const thisYearBday = new Date(currentYear, bday.getMonth(), bday.getDate());
      if (thisYearBday < today) thisYearBday.setFullYear(currentYear + 1);
      const daysUntil = Math.ceil((thisYearBday.getTime() - today.getTime()) / 86400000);
      
      if (daysUntil >= 0 && daysUntil <= 7) {
        occasions.push({
          type: 'birthday',
          name: contact.email || 'Contact',
          date: thisYearBday.toISOString().split('T')[0],
          daysUntil,
          contactEmail: contact.email || undefined,
        });
      }
    });

  // Add anniversaries
  uniqueContacts
    .filter((c) => c.anniversaryDate)
    .forEach((contact) => {
      if (!contact.anniversaryDate) return;
      const anniv = new Date(contact.anniversaryDate);
      const thisYearAnniv = new Date(currentYear, anniv.getMonth(), anniv.getDate());
      if (thisYearAnniv < today) thisYearAnniv.setFullYear(currentYear + 1);
      const daysUntil = Math.ceil((thisYearAnniv.getTime() - today.getTime()) / 86400000);
      
      if (daysUntil >= 0 && daysUntil <= 7) {
        occasions.push({
          type: 'anniversary',
          name: contact.email || 'Contact',
          date: thisYearAnniv.toISOString().split('T')[0],
          daysUntil,
          contactEmail: contact.email || undefined,
        });
      }
    });

  // Sort by days until
  occasions.sort((a, b) => a.daysUntil - b.daysUntil);

  const handleDraftMessage = (occasion: Occasion) => {
    let prompt = '';
    if (occasion.type === 'birthday') {
      prompt = `Draft a birthday message for ${occasion.name}`;
    } else if (occasion.type === 'holiday') {
      prompt = `Draft a ${occasion.name} greeting`;
    } else {
      prompt = `Draft an anniversary message for ${occasion.name}`;
    }
    navigate(`/conversations?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <Card>
      {headerContent}
      <CardContent>
        {occasions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No upcoming occasions this week. Add birthdays and anniversaries to contacts to see them here.
          </p>
        ) : (
          <div className="space-y-3">
            {occasions.slice(0, 5).map((occasion, index) => (
              <div
                key={`${occasion.type}-${occasion.name}-${index}`}
                className="flex items-center justify-between gap-2 p-2 rounded-lg border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {getOccasionIcon(occasion.type)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{occasion.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={getOccasionBadgeVariant(occasion.type)} className="text-[10px]">
                        {occasion.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDaysUntil(occasion.daysUntil)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleDraftMessage(occasion)}
                >
                  Draft
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
