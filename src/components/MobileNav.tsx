import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Plug,
  Settings,
  LogOut,
  Menu,
  Zap,
  Calendar,
  List,
  ChevronDown,
  ChevronRight,
  Wrench,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import maiLogo from "@/assets/mai-logo.png";
import maiLogoWhite from "@/assets/mai-logo-white.png";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, url: "/dashboard" },
  { title: "Conversations", icon: MessageSquare, url: "/conversations" },
  { title: "Contacts", icon: Users, url: "/contacts" },
  { title: "Integrations", icon: Plug, url: "/integrations" },
  { title: "Settings", icon: Settings, url: "/settings" },
];

const devItems = [
  { title: "Test Chat", icon: Zap, url: "/test-chat" },
  { title: "Test Google", icon: Calendar, url: "/test-google" },
  { title: "Test monday.com", icon: List, url: "/test-monday" },
  { title: "Test WhatsApp", icon: MessageSquare, url: "/dev-tools" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAdminCheck();
  const isDevToolActive = devItems.some(item => location.pathname === item.url);

  const handleLogout = async () => {
    console.log("[Logout] Starting sign out...");
    try {
      const { error } = await supabase.auth.signOut();
      console.log("[Logout] signOut completed, error:", error);
      if (error) {
        toast({
          title: "Error",
          description: "Failed to sign out",
          variant: "destructive",
        });
      } else {
        console.log("[Logout] Navigating to /auth");
        navigate("/auth");
      }
    } catch (err) {
      console.error("[Logout] Exception during signOut:", err);
      toast({
        title: "Error",
        description: "Logout failed unexpectedly",
        variant: "destructive",
      });
    }
  };

  const handleNavigation = (url: string) => {
    navigate(url);
    setOpen(false);
  };

  const isActive = (url: string) => location.pathname === url;

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <button onClick={() => navigate("/dashboard")} className="focus:outline-none">
        <img src={maiLogo} alt="mai" className="h-8 w-auto" />
      </button>
      
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-foreground">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[280px] bg-primary p-0 flex flex-col">
          <SheetHeader className="border-b border-primary-foreground/20 p-6">
            <SheetTitle className="text-left">
              <button onClick={() => handleNavigation("/dashboard")} className="focus:outline-none">
                <img src={maiLogoWhite} alt="mai" className="h-8 w-auto" />
              </button>
            </SheetTitle>
          </SheetHeader>
          
          <nav className="flex flex-col p-4 flex-1 overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.title}
                onClick={() => handleNavigation(item.url)}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-primary-foreground transition-colors ${
                  isActive(item.url)
                    ? "bg-primary-foreground/20"
                    : "hover:bg-primary-foreground/10"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.title}</span>
              </button>
            ))}

            {/* Developer Tools Section */}
            <Collapsible open={devToolsOpen || isDevToolActive} onOpenChange={setDevToolsOpen} className="mt-4">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between px-4 py-3 text-primary-foreground/60 hover:bg-primary-foreground/10 rounded-lg cursor-pointer">
                  <span className="flex items-center gap-3 text-sm font-medium">
                    <Wrench className="h-4 w-4" />
                    Developer Tools
                  </span>
                  {devToolsOpen || isDevToolActive ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-4">
                  {devItems.map((item) => (
                    <button
                      key={item.title}
                      onClick={() => handleNavigation(item.url)}
                      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-primary-foreground transition-colors w-full ${
                        isActive(item.url)
                          ? "bg-primary-foreground/20"
                          : "hover:bg-primary-foreground/10"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.title}</span>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Admin link if admin */}
            {isAdmin && (
              <button
                onClick={() => handleNavigation("/admin")}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-primary-foreground transition-colors mt-2 ${
                  isActive("/admin")
                    ? "bg-primary-foreground/20"
                    : "hover:bg-primary-foreground/10"
                }`}
              >
                <Shield className="h-5 w-5" />
                <span className="font-medium">Admin</span>
              </button>
            )}
          </nav>
          
          <div className="border-t border-primary-foreground/20 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleLogout();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
