import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, AlertCircle } from "lucide-react";

// Google "G" logo as an inline SVG
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

interface GoogleWorkspaceCardProps {
  isConnected: boolean;
  connectedEmail?: string;
  grantedScopes?: string[];
  isLoading?: boolean;
  isDisconnecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpdatePermissions: () => void;
}

// Required scopes for each feature - matching readonly scopes
const REQUIRED_SCOPES = {
  calendar: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar",
  ],
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  contacts: [
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/contacts",
  ],
};

function hasRequiredScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
  // Check if at least one of the required scopes is granted
  return requiredScopes.some(scope => grantedScopes.includes(scope));
}

export function GoogleWorkspaceCard({
  isConnected,
  connectedEmail,
  grantedScopes = [],
  isLoading = false,
  isDisconnecting = false,
  onConnect,
  onDisconnect,
  onUpdatePermissions,
}: GoogleWorkspaceCardProps) {
  const hasCalendar = hasRequiredScopes(grantedScopes, REQUIRED_SCOPES.calendar);
  const hasGmail = hasRequiredScopes(grantedScopes, REQUIRED_SCOPES.gmail);
  const hasContacts = hasRequiredScopes(grantedScopes, REQUIRED_SCOPES.contacts);
  
  const allScopesGranted = hasCalendar && hasGmail && hasContacts;
  const needsPermissionUpdate = isConnected && !allScopesGranted;

  const FeatureItem = ({ name, enabled }: { name: string; enabled: boolean }) => (
    <div className="flex items-center gap-2 text-sm">
      {enabled ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <AlertCircle className="h-4 w-4 text-amber-500" />
      )}
      <span className={enabled ? "text-foreground" : "text-muted-foreground"}>
        {name}
      </span>
    </div>
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <GoogleLogo />
            </div>
            <div>
              <CardTitle className="text-lg">Google Workspace</CardTitle>
              {connectedEmail && isConnected && (
                <p className="text-sm text-muted-foreground">{connectedEmail}</p>
              )}
            </div>
          </div>
          {isConnected ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-muted text-muted-foreground">
              Not connected
            </Badge>
          )}
        </div>
        <CardDescription className="mt-3">
          Connect Calendar, Gmail, and Contacts to let mai manage your schedule and communications
        </CardDescription>
        
        {/* Feature list when connected */}
        {isConnected && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <FeatureItem name="Calendar" enabled={hasCalendar} />
            <FeatureItem name="Gmail" enabled={hasGmail} />
            <FeatureItem name="Contacts" enabled={hasContacts} />
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-0 space-y-2">
        {!isConnected && (
          <Button onClick={onConnect} className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Google Workspace"
            )}
          </Button>
        )}
        
        {isConnected && needsPermissionUpdate && (
          <Button onClick={onUpdatePermissions} className="w-full" variant="default">
            Update Permissions
          </Button>
        )}
        
        {isConnected && (
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={onDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
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
