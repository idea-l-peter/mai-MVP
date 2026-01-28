import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { IntegrationsContent } from "@/components/IntegrationsContent";
import { TestGoogleContent } from "@/components/TestGoogleContent";
import { TestChatContent } from "@/components/TestChatContent";
import { TestMondayContent } from "@/components/TestMondayContent";
import { ConversationsContent } from "@/components/ConversationsContent";
import { WhatsAppConversations } from "@/components/WhatsAppConversations";
import { SettingsContent } from "@/components/SettingsContent";
import { ContactsContent } from "@/components/ContactsContent";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import Admin from "@/pages/Admin";
import maiLogo from "@/assets/mai-logo.png";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <img src={maiLogo} alt="mai" className="h-12 w-auto animate-pulse-soft" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Get page title based on route
  const getPageTitle = () => {
    switch (location.pathname) {
      case "/dashboard":
        return "Dashboard";
      case "/conversations":
        return "Chat";
      case "/whatsapp":
        return "WhatsApp";
      case "/contacts":
        return "Contacts";
      case "/integrations":
        return "Integrations";
      case "/settings":
        return "Settings";
      case "/admin":
        return "Admin";
      case "/test-google":
        return "Google API Test";
      case "/test-chat":
        return "LLM Router Test";
      case "/test-monday":
        return "Monday.com API Test";
      default:
        return "Dashboard";
    }
  };

  // Check if current route should hide bottom nav (full-screen chat)
  const isFullScreenRoute = location.pathname === "/conversations";
  const showMobileBottomNav = isMobile && !isFullScreenRoute;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full transition-colors duration-200">
        {/* Desktop Sidebar */}
        {!isMobile && <DashboardSidebar />}
        
        <SidebarInset className="bg-background flex-1 min-w-0 transition-colors duration-200">
          {/* Mobile Header - only show on non-fullscreen routes */}
          {isMobile && !isFullScreenRoute && (
            <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-card px-4 transition-colors duration-200">
              <button onClick={() => navigate("/dashboard")} className="focus:outline-none">
                <img src={maiLogo} alt="mai" className="h-8 w-auto" />
              </button>
            </header>
          )}
          
          <main 
            className={`flex-1 overflow-x-hidden animate-fade-in ${
              isFullScreenRoute 
                ? '' 
                : 'px-4 py-4 md:px-8 md:py-8'
            } ${showMobileBottomNav ? 'pb-20' : ''}`}
          >
            {/* Page title - only show on non-fullscreen routes */}
            {!isFullScreenRoute && (
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                {getPageTitle()}
              </h1>
            )}

            {/* Page-specific content */}
            <div className={isFullScreenRoute ? '' : 'mt-4 md:mt-6'}>
              {location.pathname === "/dashboard" && <DashboardContent />}
              {location.pathname === "/conversations" && <ConversationsContent />}
              {location.pathname === "/whatsapp" && <WhatsAppConversations />}
              {location.pathname === "/contacts" && <ContactsContent />}
              {location.pathname === "/admin" && <Admin />}
              {location.pathname === "/integrations" && <IntegrationsContent />}
              {location.pathname === "/settings" && <SettingsContent />}
              {location.pathname === "/test-google" && <TestGoogleContent />}
              {location.pathname === "/test-chat" && <TestChatContent />}
              {location.pathname === "/test-monday" && <TestMondayContent />}
            </div>
          </main>

          {/* Mobile Bottom Navigation */}
          {showMobileBottomNav && <MobileBottomNav />}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
