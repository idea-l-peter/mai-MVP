import { useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatFABProps {
  className?: string;
}

export function ChatFAB({ className }: ChatFABProps) {
  const navigate = useNavigate();

  return (
    <Button
      onClick={() => navigate("/conversations")}
      className={cn(
        "fixed z-40 h-14 w-14 rounded-full shadow-lg",
        "bg-primary hover:bg-primary/90 text-primary-foreground",
        "transition-all duration-200 hover:scale-105 active:scale-95",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      style={{
        bottom: 'calc(5rem + env(safe-area-inset-bottom))',
        right: '1rem',
      }}
      aria-label="Open chat with mai"
    >
      <MessageSquare className="h-6 w-6" />
    </Button>
  );
}
