import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  RefreshCw, 
  User, 
  Mail, 
  Phone, 
  Building2,
  Users,
  AlertCircle
} from 'lucide-react';

interface ContactFromApi {
  resourceName: string;
  name?: string;
  emails?: string[];
  phones?: string[];
  organization?: string;
  photoUrl?: string;
}

interface Contact {
  resourceName: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  photoUrl?: string;
}

export function ContactsContent() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  // Check Google connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsConnected(false);
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from('user_integrations')
          .select('provider')
          .eq('user_id', user.id)
          .eq('provider', 'google')
          .maybeSingle();

        setIsConnected(!!data);
      } catch (err) {
        console.error('[Contacts] Connection check error:', err);
        setIsConnected(false);
      }
    };

    checkConnection();
  }, []);

  const fetchContacts = useCallback(async () => {
    if (isConnected === false) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      console.log('[Contacts] Fetching contacts...');
      
      const { data, error: fetchError } = await supabase.functions.invoke('google-contacts', {
        body: { 
          action: 'get_contacts',
          params: { page_size: 200 }
        }
      });

      if (fetchError) {
        console.error('[Contacts] Fetch error:', fetchError);
        throw fetchError;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to fetch contacts');
      }

      // Map API response to component interface
      const apiContacts: ContactFromApi[] = data.data?.contacts || [];
      const mappedContacts: Contact[] = apiContacts.map((c) => ({
        resourceName: c.resourceName,
        name: c.name,
        email: c.emails?.[0],
        phone: c.phones?.[0],
        company: c.organization,
        photoUrl: c.photoUrl,
      }));

      console.log('[Contacts] Fetched', mappedContacts.length, 'contacts');
      setContacts(mappedContacts);
      setFilteredContacts(mappedContacts);
    } catch (err) {
      console.error('[Contacts] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (isConnected !== null) {
      fetchContacts();
    }
  }, [fetchContacts, isConnected]);

  // Filter contacts based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredContacts(contacts);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = contacts.filter(contact => 
      contact.name?.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.phone?.includes(query) ||
      contact.company?.toLowerCase().includes(query)
    );
    setFilteredContacts(filtered);
  }, [searchQuery, contacts]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchContacts();
  };

  // Not connected state
  if (isConnected === false) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="bg-muted/50 rounded-full p-4 mb-4">
          <Users className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Connect Google Account</h3>
        <p className="text-muted-foreground text-center max-w-md mb-4">
          Connect your Google account to view and manage your contacts. 
          Go to Integrations to connect your Google Workspace.
        </p>
        <Button variant="outline" onClick={() => window.location.href = '/integrations'}>
          Go to Integrations
        </Button>
      </div>
    );
  }

  // Loading state
  if (loading || isConnected === null) {
    return (
      <div className="space-y-4">
        {/* Search bar skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-10" />
        </div>
        
        {/* Contact cards skeleton */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="bg-destructive/10 rounded-full p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Contacts</h3>
        <p className="text-muted-foreground text-center max-w-md mb-4">{error}</p>
        <Button onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Refresh Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button 
          variant="outline" 
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      </div>

      {/* Empty state */}
      {filteredContacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="bg-muted/50 rounded-full p-4 mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {searchQuery ? 'No Matches Found' : 'No Contacts Yet'}
          </h3>
          <p className="text-muted-foreground text-center max-w-md">
            {searchQuery 
              ? `No contacts match "${searchQuery}". Try a different search term.`
              : 'Your Google Contacts will appear here once synced.'
            }
          </p>
        </div>
      ) : (
        /* Contact Grid */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredContacts.map((contact) => (
            <Card key={contact.resourceName} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {contact.photoUrl ? (
                      <img 
                        src={contact.photoUrl} 
                        alt={contact.name || 'Contact'} 
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Contact Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium text-foreground truncate">
                      {contact.name || 'Unknown'}
                    </p>
                    
                    {contact.email && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    )}
                    
                    {contact.phone && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{contact.phone}</span>
                      </div>
                    )}
                    
                    {contact.company && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <Badge variant="secondary" className="text-xs truncate max-w-[150px]">
                          {contact.company}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
