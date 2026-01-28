import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DevTools from "./pages/DevTools";
import NotFound from "./pages/NotFound";
import { useGoogleTokenCapture } from "./hooks/useGoogleTokenCapture";

const queryClient = new QueryClient();

// Component to run global hooks
function GlobalHooks() {
  useGoogleTokenCapture();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          <Route path="/dev-tools" element={<DevTools />} />
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
