import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Plug,
  Settings,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import maiLogo from "@/assets/mai-logo.png";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, url: "/dashboard" },
  { title: "Conversations", icon: MessageSquare, url: "/conversations" },
  { title: "Contacts", icon: Users, url: "/contacts" },
  { title: "Integrations", icon: Plug, url: "/integrations" },
  { title: "Settings", icon: Settings, url: "/settings" },
];

export function DashboardSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

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
          <div className="h-10 w-10 rounded-full bg-white p-1 flex items-center justify-center">
            <img src={maiLogo} alt="mai" className="h-full w-full object-contain" />
          </div>
        </button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
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
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
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
