import { useNavigate, useLocation } from "react-router-dom";
import { Home, MessageSquare, Plug, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", icon: Home, url: "/dashboard" },
  { title: "Chat", icon: MessageSquare, url: "/conversations" },
  { title: "Integrations", icon: Plug, url: "/integrations" },
  { title: "Settings", icon: Settings, url: "/settings" },
];

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (url: string) => location.pathname === url;

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 transition-colors duration-200"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const active = isActive(item.url);
          return (
            <button
              key={item.title}
              onClick={() => navigate(item.url)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 active:scale-95",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                active ? "text-primary" : "text-muted-foreground"
              )}
              aria-label={item.title}
              aria-current={active ? "page" : undefined}
            >
              <item.icon 
                className={cn(
                  "h-6 w-6 transition-transform duration-200",
                  active && "scale-110"
                )} 
              />
              <span className={cn(
                "text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}>
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
