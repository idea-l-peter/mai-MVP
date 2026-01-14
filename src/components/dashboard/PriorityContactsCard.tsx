import { Users, Calendar, Clock, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardData } from '@/hooks/useDashboardData';

interface PriorityContactsCardProps {
  data: DashboardData | null;
  loading: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function formatDate(dateString?: string): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffDays < 0) {
    // Future date
    const futureDays = Math.abs(diffDays);
    if (futureDays === 0) return 'Today';
    if (futureDays === 1) return 'Tomorrow';
    return `In ${futureDays} days`;
  }
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isOverdue(dateString?: string): boolean {
  if (!dateString) return false;
  return new Date(dateString) < new Date();
}

export function PriorityContactsCard({ data, loading, onRefresh, refreshing }: PriorityContactsCardProps) {
  const headerContent = (
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-primary" />
          Priority Contacts
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
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Combine priority contacts and due followups, dedup by id
  const contactsMap = new Map();
  data?.contacts.priorityContacts.forEach(c => contactsMap.set(c.id, c));
  data?.contacts.followupsDue.forEach(c => {
    if (!contactsMap.has(c.id)) contactsMap.set(c.id, c);
  });
  const contacts = Array.from(contactsMap.values()).slice(0, 5);

  return (
    <Card>
      {headerContent}
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No priority contacts yet. Use mai to set contact tiers.
          </p>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="border rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {contact.email || contact.googleContactId}
                      </p>
                      {contact.tier && (
                        <Badge variant="outline" className="text-[10px]">
                          Tier {contact.tier}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {contact.tags?.map((tag: { name: string; color: string }, i: number) => (
                        <Badge 
                          key={i} 
                          variant="secondary" 
                          className="text-[10px] px-1.5 py-0"
                          style={{ backgroundColor: tag.color + '20', color: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  {contact.lastContactDate && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Last: {formatDate(contact.lastContactDate)}</span>
                    </div>
                  )}
                  {contact.nextFollowupDate && (
                    <div className={`flex items-center gap-1 ${isOverdue(contact.nextFollowupDate) ? 'text-destructive' : ''}`}>
                      <Calendar className="h-3 w-3" />
                      <span>Follow-up: {formatDate(contact.nextFollowupDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
