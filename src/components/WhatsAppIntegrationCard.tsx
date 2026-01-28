import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WhatsAppLogo } from "./icons";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { CheckCircle, ExternalLink } from "lucide-react";

// WhatsApp Business phone number (from environment/secrets)
const WHATSAPP_DISPLAY_NUMBER = "+1 (555) 188-6656";

export function WhatsAppIntegrationCard() {
  const { checkConnection } = useWhatsAppIntegration();
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const connected = await checkConnection();
      setIsConnected(connected);
      setIsChecking(false);
    };
    check();
  }, [checkConnection]);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#25D366]/10">
              <WhatsAppLogo className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp Business</CardTitle>
              {isConnected && (
                <p className="text-sm text-muted-foreground">{WHATSAPP_DISPLAY_NUMBER}</p>
              )}
            </div>
          </div>
          {isChecking ? (
            <Badge variant="secondary" className="bg-muted text-muted-foreground">
              Checking...
            </Badge>
          ) : isConnected ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              Pending setup
            </Badge>
          )}
        </div>
        <CardDescription className="mt-3">
          Send and receive WhatsApp messages through your mai-connected business number.
          {isConnected && " Messages sync automatically."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isConnected ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Webhook configured and receiving messages</span>
            </div>
            <Button variant="outline" className="w-full" asChild>
              <a href="/dev-tools" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Open Dev Tools
              </a>
            </Button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">WhatsApp Business API requires:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Meta Business Account</li>
              <li>WhatsApp Business API access</li>
              <li>Configured webhook endpoint</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
