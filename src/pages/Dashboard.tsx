import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { MobileNav } from "@/components/MobileNav";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

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
        <div className="text-muted-foreground">Loading...</div>
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
        return "Welcome to mai";
      case "/conversations":
        return "Conversations";
      case "/contacts":
        return "Contacts";
      case "/integrations":
        return "Integrations";
      case "/settings":
        return "Settings";
      default:
        return "Welcome to mai";
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Desktop Sidebar */}
        {!isMobile && <DashboardSidebar />}
        
        <SidebarInset className="bg-background flex-1">
          {/* Mobile Header */}
          {isMobile && <MobileNav />}
          
          <main className="flex-1 p-4 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {getPageTitle()}
            </h1>
            {location.pathname === "/dashboard" && (
              <p className="text-muted-foreground text-sm md:text-base">
                Logged in as: {user.email}
              </p>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
