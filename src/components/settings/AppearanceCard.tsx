import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTheme } from "@/hooks/useTheme";
import { Moon, Sun, Monitor } from "lucide-react";

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-primary dark:hidden" />
          <Moon className="h-5 w-5 text-primary hidden dark:block" />
          <CardTitle>Appearance</CardTitle>
        </div>
        <CardDescription>
          Customize how mai looks on your device
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
          className="grid grid-cols-3 gap-4"
        >
          <Label
            htmlFor="theme-light"
            className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-colors hover:bg-accent/50 ${
              theme === 'light' ? 'border-primary bg-accent/30' : 'border-border'
            }`}
          >
            <RadioGroupItem value="light" id="theme-light" className="sr-only" />
            <Sun className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Light</span>
          </Label>

          <Label
            htmlFor="theme-dark"
            className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-colors hover:bg-accent/50 ${
              theme === 'dark' ? 'border-primary bg-accent/30' : 'border-border'
            }`}
          >
            <RadioGroupItem value="dark" id="theme-dark" className="sr-only" />
            <Moon className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">Dark</span>
          </Label>

          <Label
            htmlFor="theme-system"
            className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-colors hover:bg-accent/50 ${
              theme === 'system' ? 'border-primary bg-accent/30' : 'border-border'
            }`}
          >
            <RadioGroupItem value="system" id="theme-system" className="sr-only" />
            <Monitor className="h-6 w-6 mb-2" />
            <span className="text-sm font-medium">System</span>
          </Label>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
