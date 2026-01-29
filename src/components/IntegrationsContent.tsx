import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { IntegrationCard } from "./IntegrationCard";
import { GoogleWorkspaceCard } from "./GoogleWorkspaceCard";
import { WhatsAppIntegrationCard } from "./WhatsAppIntegrationCard";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { useMondayIntegration } from "@/hooks/useMondayIntegration";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import mondayLogo from "@/assets/monday-logo.svg";

type IntegrationStatus = "connected" | "not_connected" | "pending";

// Full Google Workspace scopes - requesting broad access
const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// Storage key for localStorage
const SUPABASE_AUTH_KEY = 'sb-vqunxhjgpdgpzkjescvb-auth-token';

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
];

interface IntegrationState {
  status: IntegrationStatus;
  providerEmail?: string;
  scopes?: string[];
}

export function IntegrationsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [googleState, setGoogleState] = useState<IntegrationState>({ status: "not_connected" });
  const [integrationStates, setIntegrationStates] = useState<Record<string, IntegrationState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Ref to prevent double processing
  const tokenProcessedRef = useRef(false);

  const DISCONNECT_STORAGE_KEY = "disconnect_in_progress_provider";

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

  // Token capture on mount - store provider_token after OAuth redirect
  useEffect(() => {
    if (tokenProcessedRef.current) return;

    const captureToken = async () => {
      console.log("[TokenCapture] Starting token capture check...");

      const codeFromQuery = searchParams.get("code");
      if (codeFromQuery) {
        tokenProcessedRef.current = true; // Prevent re-running
        console.log("[TokenCapture] Found ?code= in URL. Exchanging for session...");
        const { data, error } = await supabase.auth.exchangeCodeForSession(codeFromQuery);

        if (error) {
          console.error("[TokenCapture] exchangeCodeForSession error:", error);
          toast({ title: "Google connection failed", description: error.message, variant: "destructive" });
          return;
        }

        console.log("[TokenCapture] exchangeCodeForSession OK. Session:", data.session);

        // Clean the URL
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("code");
        nextParams.delete("state");
        setSearchParams(nextParams, { replace: true });

        const providerToken = data.session?.provider_token;
        const providerRefreshToken = data.session?.provider_refresh_token;

        if (!providerToken) {
          console.error("[TokenCapture] No provider_token in session after exchange!");
          toast({ title: "Connection Failed", description: "Could not retrieve Google token after login.", variant: "destructive" });
          return;
        }

        console.log("[TokenCapture] Calling store-google-tokens edge function...");
        const { data: storeData, error: storeError } = await supabase.functions.invoke("store-google-tokens", {
          body: {
            provider: "google",
            provider_token: providerToken,
            provider_refresh_token: providerRefreshToken || null,
            scopes: GOOGLE_WORKSPACE_SCOPES,
          },
        });

        if (storeError || !storeData?.success) {
          console.error("[TokenCapture] Failed to save token to DB:", storeError || storeData?.error);
          toast({ 
            title: "Connection failed: could not save credentials", 
            description: storeError?.message || storeData?.error || "Database error while storing Google tokens. Please try again.", 
            variant: "destructive" 
          });
          return;
        }

        console.log("[TokenCapture] Token stored successfully!");
        toast({ title: "Google Connected!", description: `Successfully connected as ${storeData.provider_email}` });
        await refreshIntegrations();
      }
    };

    void captureToken();
  }, [searchParams, setSearchParams, refreshIntegrations, toast]);

  // Clear any stale disconnect-in-progress flag on page load
  useEffect(() => {
    try {
      sessionStorage.removeItem(DISCONNECT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Listen for the custom event when Google tokens are stored
  useEffect(() => {
    const handleGoogleConnected = () => {
      refreshIntegrations();
    };

    window.addEventListener('google-integration-connected', handleGoogleConnected);
    return () => {
      window.removeEventListener('google-integration-connected', handleGoogleConnected);
    };
  }, [refreshIntegrations]);

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
    await initiateGoogleOAuth("google", GOOGLE_WORKSPACE_SCOPES);
  };

  const handleGoogleUpdatePermissions = async () => {
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
      
      {/* WhatsApp Integration Card */}
      <WhatsAppIntegrationCard />
      
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
