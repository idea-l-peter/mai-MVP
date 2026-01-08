import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  className?: string;
}

export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div className={cn("flex gap-1 items-center", className)}>
      <span 
        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" 
        style={{ animationDelay: "-0.3s", animationDuration: "0.6s" }}
      />
      <span 
        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" 
        style={{ animationDelay: "-0.15s", animationDuration: "0.6s" }}
      />
      <span 
        className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
        style={{ animationDuration: "0.6s" }}
      />
    </div>
  );
}
