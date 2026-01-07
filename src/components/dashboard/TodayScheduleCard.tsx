import { Calendar, Clock, MapPin, Video, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import type { DashboardData } from '@/hooks/useDashboardData';

interface TodayScheduleCardProps {
  data: DashboardData | null;
  loading: boolean;
}

function formatTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isAllDay(start: string, end: string): boolean {
  return !start.includes('T') && !end.includes('T');
}

export function TodayScheduleCard({ data, loading }: TodayScheduleCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            Today's Schedule
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

  if (!data?.calendar.connected) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            Today's Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Connect Google Workspace to see your schedule
          </p>
        </CardContent>
      </Card>
    );
  }

  const events = data.calendar.todayEvents;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5 text-primary" />
          Today's Schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No events scheduled for today
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const isExpanded = expandedId === event.id;
              const allDay = isAllDay(event.start, event.end);

              return (
                <div
                  key={event.id}
                  className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-16 text-xs text-muted-foreground flex-shrink-0">
                      {allDay ? (
                        <span className="font-medium">All day</span>
                      ) : (
                        <>
                          <div>{formatTime(event.start)}</div>
                          <div>{formatTime(event.end)}</div>
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground text-sm truncate">{event.summary}</p>
                        {event.hasVideoCall && (
                          <Video className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        )}
                      </div>
                      {event.responseStatus === 'needsAction' && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          Needs RSVP
                        </Badge>
                      )}
                      {isExpanded && (
                        <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                          {event.location && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}
                          {event.organizer && (
                            <div className="flex items-center gap-1.5">
                              <ExternalLink className="h-3 w-3" />
                              <span>Organized by {event.organizer}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}