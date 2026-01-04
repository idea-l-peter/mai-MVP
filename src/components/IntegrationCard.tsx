import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReactNode } from "react";

type IntegrationStatus = "connected" | "not_connected" | "pending";

interface IntegrationCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  status: IntegrationStatus;
  onConnect?: () => void;
  showConnectButton?: boolean;
}

export function IntegrationCard({
  title,
  description,
  icon,
  status,
  onConnect,
  showConnectButton = true,
}: IntegrationCardProps) {
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
            </div>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription className="mt-3">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {showConnectButton && status === "not_connected" && (
          <Button onClick={onConnect} className="w-full">
            Connect {title}
          </Button>
        )}
        {showConnectButton && status === "connected" && (
          <Button variant="outline" className="w-full">
            Manage Connection
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
