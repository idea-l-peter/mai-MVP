import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { IntegrationCard } from "./IntegrationCard";
import { GoogleWorkspaceCard } from "./GoogleWorkspaceCard";
import { WhatsAppLogo } from "./icons";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { useMondayIntegration } from "@/hooks/useMondayIntegration";
import { useToast } from "@/hooks/use-toast";
import mondayLogo from "@/assets/monday-logo.svg";

type IntegrationStatus = "connected" | "not_connected" | "pending";

// Full Google Workspace scopes - requesting broad access
const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

interface IntegrationConfig {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  defaultStatus: IntegrationStatus;
  showConnectButton: boolean;
  provider?: string;
  scopes?: string[];
}

const OTHER_INTEGRATION_CONFIGS: IntegrationConfig[] = [
  {
    id: "monday",
    title: "monday.com",
    description: "Sync tasks and projects with monday.com",
    icon: <img src={mondayLogo} alt="Monday.com" className="h-auto w-6" />,
    defaultStatus: "not_connected",
    showConnectButton: true,
    provider: "monday",
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    description: "Your mai WhatsApp number for external communications",
    icon: <WhatsAppLogo className="h-7 w-7" />,
    defaultStatus: "pending",
    showConnectButton: false,
  },
];

interface IntegrationState {
  status: IntegrationStatus;
  providerEmail?: string;
  scopes?: string[];
}

export function IntegrationsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [googleState, setGoogleState] = useState<IntegrationState>({ status: "not_connected" });
  const [integrationStates, setIntegrationStates] = useState<Record<string, IntegrationState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const { toast } = useToast();

  const DISCONNECT_STORAGE_KEY = "disconnect_in_progress_provider";

  // Clear any stale disconnect-in-progress flag on page load
  useEffect(() => {
    try {
      sessionStorage.removeItem(DISCONNECT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const {
    isConnecting: isGoogleConnecting,
    initiateOAuth: initiateGoogleOAuth,
    disconnect: disconnectGoogle,
    checkConnection: checkGoogleConnection,
  } = useGoogleIntegration();

  const {
    initiateOAuth: initiateMondayOAuth,
    disconnect: disconnectMonday,
    checkConnection: checkMondayConnection,
  } = useMondayIntegration();

  // Check connection status for all integrations from database
  const refreshIntegrations = useCallback(async () => {
    setIsLoading(true);
    try {
      // Check Google Workspace connection
      const googleIntegration = await checkGoogleConnection("google");
      if (googleIntegration?.connected) {
        setGoogleState({
          status: "connected",
          providerEmail: googleIntegration.provider_email || undefined,
          scopes: (googleIntegration as { scopes?: string[] }).scopes || [],
        });
      } else {
        setGoogleState({ status: "not_connected" });
      }

      // Check other integrations
      const states: Record<string, IntegrationState> = {};
      for (const config of OTHER_INTEGRATION_CONFIGS) {
        if (config.provider === "monday") {
          const integration = await checkMondayConnection();
          if (integration?.connected) {
            states[config.id] = {
              status: "connected",
              providerEmail: integration.provider_email || undefined,
            };
          } else {
            states[config.id] = { status: "not_connected" };
          }
        } else {
          states[config.id] = { status: config.defaultStatus };
        }
      }

      setIntegrationStates(states);
    } finally {
      setIsLoading(false);
    }
  }, [checkGoogleConnection, checkMondayConnection]);

  // On mount, check for legacy URL params and refresh integrations
  useEffect(() => {
    const connected = searchParams.get("connected");
    const email = searchParams.get("email");
    const error = searchParams.get("error");

    if (connected) {
      toast({
        title: "Connected!",
        description: `Successfully connected to ${connected}${email ? ` as ${email}` : ""}`,
      });
      setSearchParams({});
    }

    if (error) {
      toast({
        title: "Connection failed",
        description: error,
        variant: "destructive",
      });
      setSearchParams({});
    }

    // Always refresh integrations from database
    refreshIntegrations();
  }, [searchParams, setSearchParams, refreshIntegrations, toast]);

  const handleGoogleConnect = async () => {
    console.log("1. Connect button clicked");
    await initiateGoogleOAuth("google", GOOGLE_WORKSPACE_SCOPES);
  };

  const handleGoogleUpdatePermissions = async () => {
    console.log("1. Update permissions clicked");
    await initiateGoogleOAuth("google", GOOGLE_WORKSPACE_SCOPES);
  };

  const handleGoogleDisconnect = async () => {
    try {
      sessionStorage.setItem(DISCONNECT_STORAGE_KEY, "google");
    } catch {
      // ignore
    }

    setDisconnectingId("google");

    const failSafe = window.setTimeout(() => {
      setDisconnectingId((current) => (current === "google" ? null : current));
    }, 12000);

    try {
      const success = await disconnectGoogle("google");
      if (success) {
        setGoogleState({ status: "not_connected" });
      }
    } finally {
      window.clearTimeout(failSafe);
      setDisconnectingId(null);
      try {
        sessionStorage.removeItem(DISCONNECT_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  const handleConnect = (integrationId: string) => {
    const config = OTHER_INTEGRATION_CONFIGS.find((c) => c.id === integrationId);
    if (config?.provider === "monday") {
      initiateMondayOAuth();
    } else {
      console.log(`No OAuth configured for ${integrationId}`);
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    const config = OTHER_INTEGRATION_CONFIGS.find((c) => c.id === integrationId);
    if (!config?.provider) return;

    try {
      sessionStorage.setItem(DISCONNECT_STORAGE_KEY, config.provider);
    } catch {
      // ignore
    }

    setDisconnectingId(integrationId);

    const failSafe = window.setTimeout(() => {
      setDisconnectingId((current) => (current === integrationId ? null : current));
    }, 12000);

    try {
      let success = false;
      if (config.provider === "monday") {
        success = await disconnectMonday();
      }
      if (success) {
        setIntegrationStates((prev) => ({
          ...prev,
          [integrationId]: { status: "not_connected" },
        }));
      }
    } finally {
      window.clearTimeout(failSafe);
      setDisconnectingId(null);
      try {
        sessionStorage.removeItem(DISCONNECT_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  const getStatus = (integrationId: string): IntegrationStatus => {
    return integrationStates[integrationId]?.status || 
           OTHER_INTEGRATION_CONFIGS.find((c) => c.id === integrationId)?.defaultStatus || 
           "not_connected";
  };

  const getProviderEmail = (integrationId: string): string | undefined => {
    return integrationStates[integrationId]?.providerEmail;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Google Workspace Card - Primary integration */}
      <GoogleWorkspaceCard
        isConnected={googleState.status === "connected"}
        connectedEmail={googleState.providerEmail}
        grantedScopes={googleState.scopes}
        isLoading={isGoogleConnecting}
        isDisconnecting={disconnectingId === "google"}
        onConnect={handleGoogleConnect}
        onDisconnect={handleGoogleDisconnect}
        onUpdatePermissions={handleGoogleUpdatePermissions}
      />
      
      {/* Other integrations */}
      {OTHER_INTEGRATION_CONFIGS.map((integration) => (
        <IntegrationCard
          key={integration.id}
          title={integration.title}
          description={integration.description}
          icon={integration.icon}
          status={getStatus(integration.id)}
          showConnectButton={integration.showConnectButton}
          connectedEmail={getProviderEmail(integration.id)}
          isLoading={disconnectingId === integration.id}
          onConnect={() => handleConnect(integration.id)}
          onDisconnect={() => handleDisconnect(integration.id)}
        />
      ))}
    </div>
  );
}
