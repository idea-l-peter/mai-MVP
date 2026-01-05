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
  Zap,
  Calendar,
  List,
  ChevronDown,
  ChevronRight,
  Wrench,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
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
];

export function DashboardSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAdminCheck();
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const isDevToolActive = devItems.some(item => location.pathname === item.url);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    } else {
      navigate("/auth");
    }
  };

  const isActive = (url: string) => location.pathname === url;

  return (
    <Sidebar className="w-60 border-r-0">
      <SidebarHeader className="p-6">
        <button onClick={() => navigate("/dashboard")} className="focus:outline-none">
          <img src={maiLogoWhite} alt="mai" className="h-10 w-auto" />
        </button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onPointerDown={(e) => {
                      e.preventDefault();
                      navigate(item.url);
                    }}
                    isActive={isActive(item.url)}
                    className="w-full justify-start gap-3 px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent"
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Collapsible Developer Tools Section */}
        <SidebarGroup className="mt-auto">
          <Collapsible open={devToolsOpen || isDevToolActive} onOpenChange={setDevToolsOpen}>
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="px-4 py-2 text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent rounded-md cursor-pointer flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Developer Tools
                </span>
                {devToolsOpen || isDevToolActive ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {devItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        onClick={() => navigate(item.url)}
                        isActive={isActive(item.url)}
                        className="w-full justify-start gap-3 px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent"
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onPointerDown={(e) => {
                  e.preventDefault();
                  navigate("/admin");
                }}
                isActive={isActive("/admin")}
                className="w-full justify-start gap-3 px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent"
              >
                <Shield className="h-5 w-5" />
                <span>Admin</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onPointerDown={(e) => {
                e.preventDefault();
                handleLogout();
              }}
              className="w-full justify-start gap-3 px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
