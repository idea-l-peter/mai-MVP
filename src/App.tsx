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
  console.log('[OAuth Capture] Component rendering, URL:', window.location.href);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    console.log('[OAuth Capture] Component mounted');
    console.log('[OAuth Capture] Current URL:', window.location.href);
    console.log('[OAuth Capture] Hash:', window.location.hash);
    console.log('[OAuth Capture] Search:', window.location.search);
    
    // Check if this looks like an OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const hasCode = urlParams.has('code');
    const hasError = urlParams.has('error');
    console.log('[OAuth Capture] URL has code param:', hasCode, 'has error:', hasError);
    if (hasError) {
      console.error('[OAuth Capture] OAuth error in URL:', urlParams.get('error'), urlParams.get('error_description'));
    }

    // Check session immediately on mount
    const checkSessionForTokens = async () => {
      console.log('[OAuth Capture] Checking session for provider tokens...');
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      console.log('[OAuth Capture] Session check result:', {
        hasSession: !!session,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        providerToken: session?.provider_token ? 'EXISTS' : 'MISSING',
        providerRefreshToken: session?.provider_refresh_token ? 'EXISTS' : 'MISSING',
        error: error?.message,
      });

      // If we have provider tokens and haven't handled them yet, store them
      if (session?.provider_token && !tokenHandledRef.current) {
        console.log('[OAuth Capture] Found provider token on mount, storing...');
        tokenHandledRef.current = true;
        
        const result = await storeGoogleTokensFromSession(session);
        
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
      } else if (hasCode && !session?.provider_token) {
        // We have a code but no provider token - Supabase may still be processing
        console.log('[OAuth Capture] Code present but no provider_token yet - waiting for auth state change...');
      }
    };

    checkSessionForTokens();
  }, [toast]);

  // Set up auth state change listener
  useEffect(() => {
    console.log('[OAuth Capture] Setting up auth state listener...');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[OAuth Capture] Auth state changed:', event);
      console.log('[OAuth Capture] Session in event:', {
        hasSession: !!session,
        providerToken: session?.provider_token ? 'EXISTS' : 'MISSING',
        providerRefreshToken: session?.provider_refresh_token ? 'EXISTS' : 'MISSING',
      });

      // Handle relevant auth events that could have provider tokens
      const relevantEvents = ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'];
      
      if (relevantEvents.includes(event) && session?.provider_token && !tokenHandledRef.current) {
        console.log(`[OAuth Capture] ${event} event with provider token, storing...`);
        tokenHandledRef.current = true;
        
        const result = await storeGoogleTokensFromSession(session);
        
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
      console.log('[OAuth Capture] Cleaning up auth listener');
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
