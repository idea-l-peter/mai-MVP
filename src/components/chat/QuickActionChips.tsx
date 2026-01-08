import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface QuickAction {
  emoji: string;
  label: string;
  prompt: string;
}

const quickActions: QuickAction[] = [
  { emoji: "📧", label: "Email", prompt: "Show me my recent emails" },
  { emoji: "📅", label: "Calendar", prompt: "What's on my calendar today?" },
  { emoji: "✅", label: "Tasks", prompt: "What tasks do I have due today?" },
  { emoji: "👤", label: "Contacts", prompt: "Show my priority contacts" },
  { emoji: "📊", label: "Briefing", prompt: "Give me my daily briefing" },
];

interface QuickActionChipsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActionChips({ onSelect, disabled }: QuickActionChipsProps) {
  return (
    <div className="w-full overflow-hidden">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => onSelect(action.prompt)}
              disabled={disabled}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 rounded-full",
                "bg-muted hover:bg-muted/80 active:bg-accent/20",
                "text-sm font-medium text-foreground",
                "transition-all duration-200 active:scale-95",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "min-h-[44px]" // Accessibility: 44px touch target
              )}
              aria-label={`Quick action: ${action.label}`}
            >
              <span className="text-base">{action.emoji}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="h-2" />
      </ScrollArea>
    </div>
  );
}
