import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { ReactNode } from "react";

type IntegrationStatus = "connected" | "not_connected" | "pending";

interface IntegrationCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  status: IntegrationStatus;
  onConnect?: () => void;
  onDisconnect?: () => void;
  showConnectButton?: boolean;
  connectedEmail?: string;
  isLoading?: boolean;
  isConnecting?: boolean;
}

export function IntegrationCard({
  title,
  description,
  icon,
  status,
  onConnect,
  onDisconnect,
  showConnectButton = true,
  connectedEmail,
  isLoading = false,
  isConnecting = false,
}: IntegrationCardProps) {
  const handleConnectClick = () => {
    console.log(`[IntegrationCard] Connect button clicked for: ${title}`);
    if (onConnect) {
      onConnect();
    } else {
      console.warn(`[IntegrationCard] No onConnect handler for: ${title}`);
    }
  };
  const getStatusBadge = () => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            Connected
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
            Pending setup
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">
            Not connected
          </Badge>
        );
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              {connectedEmail && status === "connected" && (
                <p className="text-sm text-muted-foreground">{connectedEmail}</p>
              )}
            </div>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription className="mt-3">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {showConnectButton && status === "not_connected" && (
          <Button 
            onClick={handleConnectClick} 
            className="w-full"
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              `Connect ${title}`
            )}
          </Button>
        )}
        {showConnectButton && status === "connected" && (
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={onDisconnect}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Disconnecting...
              </>
            ) : (
              "Disconnect"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
