import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { storeGoogleTokensFromSession } from "@/lib/integrations/storeGoogleTokens";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Global OAuth token capture component
function OAuthTokenCapture() {
  const { toast } = useToast();
  const tokenHandledRef = useRef(false);
  const [hasMounted, setHasMounted] = useState(false);

  // Log immediately when component function is called (before any hooks)
  console.warn('[OAuth Capture] Component rendering, URL:', window.location.href);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    // Hard proof this effect ran (even if logs are filtered)
    (window as any).__OAUTH_CAPTURE_RAN = true;
    console.warn('=== OAUTH CAPTURE USEEFFECT STARTED ===');
    try {
      if (!(window as any).__OAUTH_CAPTURE_ALERTED) {
        (window as any).__OAUTH_CAPTURE_ALERTED = true;
        window.alert('OAuthTokenCapture useEffect ran');
      }
    } catch {
      // ignore alert failures (blocked by browser)
    }

    console.warn('[OAuth Capture] Component mounted');
    console.warn('[OAuth Capture] Current URL:', window.location.href);
    
    // Check if this looks like an OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const hasCode = urlParams.has('code');
    const hasError = urlParams.has('error');
    console.warn('[OAuth Capture] URL has code param:', hasCode, 'has error:', hasError);
    if (hasError) {
      console.error('[OAuth Capture] OAuth error in URL:', urlParams.get('error'), urlParams.get('error_description'));
    }

    // Check session immediately on mount
    const checkSessionForTokens = async () => {
      console.warn('[OAuth Capture] Step 1: Checking supabase.auth.getSession()...');
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      console.warn('[OAuth Capture] Step 2: getSession result:', {
        hasSession: !!session,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        providerToken: session?.provider_token ? `EXISTS (${session.provider_token.length} chars)` : 'MISSING',
        providerRefreshToken: session?.provider_refresh_token ? 'EXISTS' : 'MISSING',
        error: error?.message,
      });

      let providerToken = session?.provider_token;
      let providerRefreshToken = session?.provider_refresh_token;

      // If provider_token not in session, try reading directly from localStorage
      if (!providerToken) {
        console.warn('[OAuth Capture] Step 3: provider_token not in session, checking localStorage...');
        try {
          const storageKey = 'sb-vqunxhjgpdgpzkjescvb-auth-token';
          const storedData = localStorage.getItem(storageKey);
          console.warn('[OAuth Capture] localStorage raw data exists:', !!storedData);
          
          if (storedData) {
            const parsed = JSON.parse(storedData);
            console.warn('[OAuth Capture] localStorage parsed:', {
              hasProviderToken: !!parsed?.provider_token,
              providerTokenLength: parsed?.provider_token?.length,
              hasProviderRefreshToken: !!parsed?.provider_refresh_token,
            });
            providerToken = parsed?.provider_token;
            providerRefreshToken = parsed?.provider_refresh_token;
          }
        } catch (e) {
          console.error('[OAuth Capture] Error reading localStorage:', e);
        }
      }

      // If we have provider token and haven't handled it yet, store it
      if (providerToken && !tokenHandledRef.current) {
        console.warn('[OAuth Capture] Step 4: Found provider token, calling storeGoogleTokensFromSession...');
        tokenHandledRef.current = true;
        
        // Create a session-like object with the tokens
        const sessionWithTokens = {
          ...session,
          provider_token: providerToken,
          provider_refresh_token: providerRefreshToken,
        };
        
        const result = await storeGoogleTokensFromSession(sessionWithTokens);
        console.warn('[OAuth Capture] Step 5: storeGoogleTokensFromSession result:', result);
        
        if (result.success) {
          toast({
            title: 'Connected!',
            description: `Successfully connected Google Workspace${result.userEmail ? ` as ${result.userEmail}` : ''}`,
          });
          
          // Clean up URL (remove OAuth params)
          if (window.location.hash || window.location.search) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        } else {
          toast({
            title: 'Connection failed',
            description: result.error || 'Failed to store connection',
            variant: 'destructive',
          });
        }
      } else if (!providerToken) {
        console.warn('[OAuth Capture] No provider_token found in session or localStorage');
      } else if (tokenHandledRef.current) {
        console.warn('[OAuth Capture] Token already handled, skipping');
      }
    };

    checkSessionForTokens();
  }, [toast]);

  // Set up auth state change listener
  useEffect(() => {
    console.warn('[OAuth Capture] Setting up auth state listener...');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.warn('[OAuth Capture] Auth state changed:', event);
      console.warn('[OAuth Capture] Session in event:', {
        hasSession: !!session,
        providerToken: session?.provider_token ? 'EXISTS' : 'MISSING',
        providerRefreshToken: session?.provider_refresh_token ? 'EXISTS' : 'MISSING',
      });

      // Handle relevant auth events that could have provider tokens
      const relevantEvents = ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'];
      
      if (relevantEvents.includes(event) && session?.provider_token && !tokenHandledRef.current) {
        console.warn(`[OAuth Capture] ${event} event with provider token, storing...`);
        tokenHandledRef.current = true;
        
        const result = await storeGoogleTokensFromSession(session);
        console.warn('[OAuth Capture] Auth state change store result:', result);
        
        if (result.success) {
          toast({
            title: 'Connected!',
            description: `Successfully connected Google Workspace${result.userEmail ? ` as ${result.userEmail}` : ''}`,
          });
          
          // Clean up URL
          if (window.location.hash || window.location.search) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      }
    });

    return () => {
      console.warn('[OAuth Capture] Cleaning up auth listener');
      subscription.unsubscribe();
    };
  }, [toast]);

  return hasMounted ? (
    <div
      data-testid="oauth-capture-mounted"
      className="fixed right-3 top-3 z-[9999] h-2.5 w-2.5 rounded-full bg-destructive shadow-sm ring-2 ring-background"
      title="OAuthTokenCapture mounted"
    />
  ) : null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <OAuthTokenCapture />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/conversations" element={<Dashboard />} />
          <Route path="/contacts" element={<Dashboard />} />
          <Route path="/integrations" element={<Dashboard />} />
          <Route path="/settings" element={<Dashboard />} />
          <Route path="/test-chat" element={<Dashboard />} />
          <Route path="/test-google" element={<Dashboard />} />
          <Route path="/test-monday" element={<Dashboard />} />
          <Route path="/admin" element={<Dashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
