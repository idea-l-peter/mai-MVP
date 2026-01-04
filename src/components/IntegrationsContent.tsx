import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { IntegrationCard } from "./IntegrationCard";
import { WhatsAppLogo } from "./icons";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import googleCalendarIcon from "@/assets/google-calendar-icon.svg";
import gmailLogo from "@/assets/gmail-logo.png";
import mondayLogo from "@/assets/monday-logo.svg";

type IntegrationStatus = "connected" | "not_connected" | "pending";

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

const INTEGRATION_CONFIGS: IntegrationConfig[] = [
  {
    id: "google-calendar",
    title: "Google Calendar",
    description: "Sync your calendar to let mai schedule meetings",
    icon: <img src={googleCalendarIcon} alt="Google Calendar" className="h-6 w-6" />,
    defaultStatus: "not_connected",
    showConnectButton: true,
    provider: "google-calendar",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
  },
  {
    id: "gmail",
    title: "Gmail",
    description: "Allow mai to read and send emails on your behalf",
    icon: <img src={gmailLogo} alt="Gmail" className="h-6 w-auto" />,
    defaultStatus: "not_connected",
    showConnectButton: true,
    provider: "gmail",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
  },
  {
    id: "monday",
    title: "monday.com",
    description: "Sync tasks and projects with monday.com",
    icon: <img src={mondayLogo} alt="Monday.com" className="h-auto w-6" />,
    defaultStatus: "not_connected",
    showConnectButton: true,
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
}

export function IntegrationsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [integrationStates, setIntegrationStates] = useState<Record<string, IntegrationState>>({});
  const [isLoading, setIsLoading] = useState(true);

  const {
    isConnecting,
    isDisconnecting,
    initiateOAuth,
    handleOAuthCallback,
    disconnect,
    checkConnection,
  } = useGoogleIntegration();

  // Check connection status for all integrations
  const refreshIntegrations = useCallback(async () => {
    setIsLoading(true);
    const states: Record<string, IntegrationState> = {};

    for (const config of INTEGRATION_CONFIGS) {
      if (config.provider) {
        const integration = await checkConnection(config.provider);
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
    setIsLoading(false);
  }, [checkConnection]);

  // Handle OAuth callback on mount
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const storedProvider = sessionStorage.getItem("oauth_provider");

    if (code && (state || storedProvider)) {
      const provider = state || storedProvider;
      sessionStorage.removeItem("oauth_provider");

      // Clear URL params
      setSearchParams({});

      // Process the callback
      handleOAuthCallback(code, provider!).then((success) => {
        if (success) {
          refreshIntegrations();
        }
      });
    } else {
      refreshIntegrations();
    }
  }, [searchParams, setSearchParams, handleOAuthCallback, refreshIntegrations]);

  const handleConnect = (integrationId: string) => {
    const config = INTEGRATION_CONFIGS.find((c) => c.id === integrationId);
    if (config?.provider && config.scopes) {
      initiateOAuth(config.provider, config.scopes);
    } else {
      console.log(`No OAuth configured for ${integrationId}`);
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    const config = INTEGRATION_CONFIGS.find((c) => c.id === integrationId);
    if (config?.provider) {
      const success = await disconnect(config.provider);
      if (success) {
        setIntegrationStates((prev) => ({
          ...prev,
          [integrationId]: { status: "not_connected" },
        }));
      }
    }
  };

  const getStatus = (integrationId: string): IntegrationStatus => {
    return integrationStates[integrationId]?.status || 
           INTEGRATION_CONFIGS.find((c) => c.id === integrationId)?.defaultStatus || 
           "not_connected";
  };

  const getProviderEmail = (integrationId: string): string | undefined => {
    return integrationStates[integrationId]?.providerEmail;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {INTEGRATION_CONFIGS.map((integration) => (
        <IntegrationCard
          key={integration.id}
          title={integration.title}
          description={integration.description}
          icon={integration.icon}
          status={getStatus(integration.id)}
          showConnectButton={integration.showConnectButton}
          connectedEmail={getProviderEmail(integration.id)}
          isLoading={isLoading || isConnecting || isDisconnecting}
          onConnect={() => handleConnect(integration.id)}
          onDisconnect={() => handleDisconnect(integration.id)}
        />
      ))}
    </div>
  );
}
