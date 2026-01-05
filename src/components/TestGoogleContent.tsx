import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Calendar, Mail } from 'lucide-react';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  description?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
}

export function TestGoogleContent() {
  const { toast } = useToast();
  
  // Calendar state
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    dateTime: '',
    duration: '60',
    description: ''
  });
  
  // Gmail state
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    body: ''
  });

  // Helper to add timeout to any promise
  const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(errorMessage)), ms)
      )
    ]);
  };

  const getValidToken = async (provider: string): Promise<string | null> => {
    console.log('>>> getValidToken ENTERED for provider:', provider);
    
    try {
      console.log('>>> getValidToken: About to call supabase.auth.getSession()...');
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        5000,
        'getSession() timed out after 5 seconds'
      );
      
      const session = sessionResult.data.session;
      const user = session?.user;
      console.log('>>> getValidToken: getSession() returned, user:', user?.id || 'NO USER');
      
      if (!user) {
        console.log('>>> getValidToken: No user, showing toast and returning null');
        toast({ title: 'Not authenticated', description: 'Please log in first', variant: 'destructive' });
        return null;
      }

      console.log('>>> getValidToken: About to invoke edge function get-valid-token...');
      const startTime = Date.now();
      
      const { data, error } = await withTimeout(
        supabase.functions.invoke('get-valid-token', {
          body: { user_id: user.id, provider }
        }),
        10000,
        'Edge function timed out after 10 seconds'
      );
      
      console.log('>>> getValidToken: Edge function returned in', Date.now() - startTime, 'ms');
      console.log('>>> getValidToken: Response data:', JSON.stringify(data));
      console.log('>>> getValidToken: Response error:', error);

      if (error) {
        console.log('>>> getValidToken: Error from edge function, throwing');
        throw error;
      }
      
      if (!data?.connected) {
        console.log('>>> getValidToken: Not connected, data:', data);
        toast({ 
          title: `${provider} not connected`, 
          description: data?.error || 'Please connect from the Integrations page',
          variant: 'destructive' 
        });
        return null;
      }

      console.log('>>> getValidToken: SUCCESS, token length:', data.access_token?.length);
      return data.access_token;
    } catch (error) {
      console.error('>>> getValidToken CATCH ERROR:', error);
      toast({ 
        title: 'Failed to get token', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
      return null;
    }
  };

  // ========== Calendar Functions ==========
  const listCalendarEvents = async () => {
    console.log('=== listCalendarEvents START ===');
    setLoadingCalendar(true);
    setCalendarEvents([]);
    
    try {
      console.log('Step 1: Getting valid token for google_calendar...');
      const token = await getValidToken('google_calendar');
      console.log('Step 2: Token result:', token ? `Got token (${token.length} chars)` : 'NO TOKEN');
      
      if (!token) {
        console.log('Step 2b: No token, returning early');
        return;
      }

      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: weekLater.toISOString(),
        maxResults: '20',
        singleEvents: 'true',
        orderBy: 'startTime'
      });

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;
      console.log('Step 3: About to fetch Google Calendar API:', url);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Step 4: Google API response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json();
        console.log('Step 4b: Error response body:', errorData);
        throw new Error(errorData.error?.message || 'Failed to fetch events');
      }

      const data = await response.json();
      console.log('Step 5: Success! Events count:', data.items?.length || 0);
      setCalendarEvents(data.items || []);
      toast({ title: `Found ${data.items?.length || 0} events` });
    } catch (error) {
      console.error('=== listCalendarEvents ERROR ===', error);
      toast({ 
        title: 'Failed to list events', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      console.log('=== listCalendarEvents END ===');
      setLoadingCalendar(false);
    }
  };

  const createCalendarEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title || !eventForm.dateTime) {
      toast({ title: 'Title and date/time are required', variant: 'destructive' });
      return;
    }

    setCreatingEvent(true);
    
    try {
      const token = await getValidToken('google_calendar');
      if (!token) return;

      const startDate = new Date(eventForm.dateTime);
      const endDate = new Date(startDate.getTime() + parseInt(eventForm.duration) * 60 * 1000);

      const event = {
        summary: eventForm.title,
        description: eventForm.description,
        start: { dateTime: startDate.toISOString() },
        end: { dateTime: endDate.toISOString() }
      };

      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to create event');
      }

      const createdEvent = await response.json();
      toast({ title: 'Event created!', description: createdEvent.summary });
      setEventForm({ title: '', dateTime: '', duration: '60', description: '' });
      listCalendarEvents();
    } catch (error) {
      console.error('Create event error:', error);
      toast({ 
        title: 'Failed to create event', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      setCreatingEvent(false);
    }
  };

  // ========== Gmail Functions ==========
  const listEmails = async () => {
    setLoadingEmails(true);
    setEmails([]);
    
    try {
      const token = await getValidToken('gmail');
      if (!token) return;

      const listResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!listResponse.ok) {
        const errorData = await listResponse.json();
        throw new Error(errorData.error?.message || 'Failed to list emails');
      }

      const listData = await listResponse.json();
      const messageIds = listData.messages || [];

      const emailDetails: GmailMessage[] = [];
      for (const msg of messageIds.slice(0, 10)) {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (msgResponse.ok) {
          const msgData = await msgResponse.json();
          const headers = msgData.payload?.headers || [];
          
          emailDetails.push({
            id: msgData.id,
            threadId: msgData.threadId,
            snippet: msgData.snippet || '',
            subject: headers.find((h: any) => h.name === 'Subject')?.value || '(No subject)',
            from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
            date: headers.find((h: any) => h.name === 'Date')?.value || ''
          });
        }
      }

      setEmails(emailDetails);
      toast({ title: `Found ${emailDetails.length} emails` });
    } catch (error) {
      console.error('List emails error:', error);
      toast({ 
        title: 'Failed to list emails', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      setLoadingEmails(false);
    }
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.to || !emailForm.subject) {
      toast({ title: 'To and Subject are required', variant: 'destructive' });
      return;
    }

    setSendingEmail(true);
    
    try {
      const token = await getValidToken('gmail');
      if (!token) return;

      const emailLines = [
        `To: ${emailForm.to}`,
        `Subject: ${emailForm.subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        emailForm.body
      ];
      const email = emailLines.join('\r\n');
      
      const encodedEmail = btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw: encodedEmail })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to send email');
      }

      toast({ title: 'Email sent!', description: `To: ${emailForm.to}` });
      setEmailForm({ to: '', subject: '', body: '' });
    } catch (error) {
      console.error('Send email error:', error);
      toast({ 
        title: 'Failed to send email', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const formatDateTime = (event: CalendarEvent) => {
    const dateStr = event.start.dateTime || event.start.date;
    if (!dateStr) return 'No date';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">Test Calendar and Gmail API functionality</p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Calendar Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Google Calendar
            </CardTitle>
            <CardDescription>Test Calendar API v3 operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={listCalendarEvents} 
              disabled={loadingCalendar}
              className="w-full"
            >
              {loadingCalendar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              List Events (Next 7 Days)
            </Button>

            {calendarEvents.length > 0 && (
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {calendarEvents.map((event) => (
                  <div key={event.id} className="p-3">
                    <p className="font-medium">{event.summary}</p>
                    <p className="text-sm text-muted-foreground">{formatDateTime(event)}</p>
                    {event.description && (
                      <p className="text-sm text-muted-foreground truncate">{event.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={createCalendarEvent} className="space-y-3 pt-4 border-t">
              <h4 className="font-medium">Create Event</h4>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={eventForm.title}
                  onChange={(e) => setEventForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Event title"
                />
              </div>
              <div>
                <Label htmlFor="dateTime">Date & Time</Label>
                <Input
                  id="dateTime"
                  type="datetime-local"
                  value={eventForm.dateTime}
                  onChange={(e) => setEventForm(f => ({ ...f, dateTime: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={eventForm.duration}
                  onChange={(e) => setEventForm(f => ({ ...f, duration: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={eventForm.description}
                  onChange={(e) => setEventForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              <Button type="submit" disabled={creatingEvent} className="w-full">
                {creatingEvent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Event
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Gmail Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Gmail
            </CardTitle>
            <CardDescription>Test Gmail API v1 operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={listEmails} 
              disabled={loadingEmails}
              className="w-full"
            >
              {loadingEmails && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              List Recent Emails (10)
            </Button>

            {emails.length > 0 && (
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {emails.map((email) => (
                  <div key={email.id} className="p-3">
                    <p className="font-medium truncate">{email.subject}</p>
                    <p className="text-sm text-muted-foreground truncate">{email.from}</p>
                    <p className="text-sm text-muted-foreground truncate">{email.snippet}</p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={sendEmail} className="space-y-3 pt-4 border-t">
              <h4 className="font-medium">Send Test Email</h4>
              <div>
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  type="email"
                  value={emailForm.to}
                  onChange={(e) => setEmailForm(f => ({ ...f, to: e.target.value }))}
                  placeholder="recipient@example.com"
                />
              </div>
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Email subject"
                />
              </div>
              <div>
                <Label htmlFor="body">Body</Label>
                <Textarea
                  id="body"
                  value={emailForm.body}
                  onChange={(e) => setEmailForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Email body"
                />
              </div>
              <Button type="submit" disabled={sendingEmail} className="w-full">
                {sendingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Email
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
