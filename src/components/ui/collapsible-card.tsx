import { useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleCard({ 
  title, 
  icon, 
  children, 
  defaultOpen = true,
  className 
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={cn("transition-all duration-200", className)}>
      <CardHeader 
        className="pb-3 cursor-pointer select-none active:bg-muted/50 transition-colors rounded-t-lg"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        aria-expanded={isOpen}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {icon}
            {title}
          </CardTitle>
          <ChevronDown 
            className={cn(
              "h-5 w-5 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )} 
          />
        </div>
      </CardHeader>
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <CardContent className="pt-0">
            {children}
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
