import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Plug,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import maiLogo from "@/assets/mai-logo.png";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, url: "/dashboard" },
  { title: "Conversations", icon: MessageSquare, url: "/conversations" },
  { title: "Contacts", icon: Users, url: "/contacts" },
  { title: "Integrations", icon: Plug, url: "/integrations" },
  { title: "Settings", icon: Settings, url: "/settings" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
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
        <SheetContent side="right" className="w-[280px] bg-primary p-0">
          <SheetHeader className="border-b border-primary-foreground/20 p-6">
            <SheetTitle className="text-left">
              <button onClick={() => handleNavigation("/dashboard")} className="focus:outline-none">
                <img src={maiLogo} alt="mai" className="h-8 w-auto" />
              </button>
            </SheetTitle>
          </SheetHeader>
          
          <nav className="flex flex-col p-4">
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
          </nav>
          
          <div className="absolute bottom-0 left-0 right-0 border-t border-primary-foreground/20 p-4">
            <button
              onClick={handleLogout}
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
