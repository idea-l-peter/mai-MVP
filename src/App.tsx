import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import { useGoogleTokenCapture } from "./hooks/useGoogleTokenCapture";
import { supabase } from "./integrations/supabase/client";

const queryClient = new QueryClient();

/**
 * SINGLE "One-Brain" Auth Listener
 * This is the ONLY auth state listener in the entire app.
 * When auth state changes, it invalidates all relevant queries to refresh data.
 */
function AuthStateListener() {
  const qc = useQueryClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Refresh all cached data when user signs in or token refreshes
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        qc.invalidateQueries({ queryKey: ["integrations-status"] });
        qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      }
      
      // Clear all cached data when user signs out
      if (event === "SIGNED_OUT") {
        qc.clear();
      }
    });

    // Also listen for the custom google-integration-connected event
    const handleGoogleConnected = () => {
      qc.invalidateQueries({ queryKey: ["integrations-status"] });
      qc.invalidateQueries({ queryKey: ["dashboard-data"] });
    };

    window.addEventListener("google-integration-connected", handleGoogleConnected);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("google-integration-connected", handleGoogleConnected);
    };
  }, [qc]);

  return null;
}

// Component to run global hooks
function GlobalHooks() {
  useGoogleTokenCapture();
  return null;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthStateListener />
          <GlobalHooks />
          <Routes>
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/conversations" element={<Dashboard />} />
            <Route path="/whatsapp" element={<Dashboard />} />
            <Route path="/contacts" element={<Dashboard />} />
            <Route path="/integrations" element={<Dashboard />} />
            <Route path="/settings" element={<Dashboard />} />
            <Route path="/test-whatsapp" element={<Dashboard />} />
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
  </ErrorBoundary>
);

export default App;
