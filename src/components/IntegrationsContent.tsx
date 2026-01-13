import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { IntegrationCard } from "./IntegrationCard";
import { GoogleWorkspaceCard } from "./GoogleWorkspaceCard";
import { WhatsAppLogo } from "./icons";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { useMondayIntegration } from "@/hooks/useMondayIntegration";
import { useToast } from "@/hooks/use-toast";
import { storeGoogleTokensFromSession } from "@/lib/integrations/storeGoogleTokens";
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
  const location = useLocation();
  const [googleState, setGoogleState] = useState<IntegrationState>({ status: "not_connected" });
  const [integrationStates, setIntegrationStates] = useState<Record<string, IntegrationState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [tokenCaptureStatus, setTokenCaptureStatus] = useState<string>("idle");
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

  // CRITICAL: Token capture on mount - store provider_token after OAuth redirect
  // NOTE: We intentionally DO NOT call supabase.auth.getSession() here because it can hang.
  useEffect(() => {
    console.warn("=== INTEGRATIONS TOKEN CAPTURE STARTED (localStorage-only) ===");
    setTokenCaptureStatus("checking localStorage...");

    if (tokenProcessedRef.current) {
      console.warn("[TokenCapture] Already processed, skipping");
      setTokenCaptureStatus("already_processed");
      return;
    }

    const captureToken = async () => {
      try {
        setTokenCaptureStatus("reading localStorage...");
        console.warn("[TokenCapture] Step 1: Reading localStorage key:", SUPABASE_AUTH_KEY);

        const authData = localStorage.getItem(SUPABASE_AUTH_KEY);
        console.warn("[TokenCapture] Step 1b: localStorage.getItem result:", {
          hasValue: !!authData,
          length: authData?.length,
        });

        if (!authData) {
          setTokenCaptureStatus("error: no auth data in localStorage");
          return;
        }

        setTokenCaptureStatus("parsing localStorage...");
        let parsed: any;
        try {
          parsed = JSON.parse(authData);
        } catch (e) {
          console.warn("[TokenCapture] Step 2: JSON.parse failed:", e);
          setTokenCaptureStatus("error: failed to parse localStorage");
          return;
        }

        console.warn("[TokenCapture] Step 2b: Parsed auth object summary:", {
          keys: Object.keys(parsed || {}),
          hasProviderToken: !!parsed?.provider_token,
          providerTokenLength: parsed?.provider_token?.length,
          hasProviderRefreshToken: !!parsed?.provider_refresh_token,
          hasUser: !!parsed?.user,
          userId: parsed?.user?.id,
          userEmail: parsed?.user?.email,
        });

        const providerToken: string | undefined = parsed?.provider_token;
        const providerRefreshToken: string | undefined = parsed?.provider_refresh_token;

        if (!providerToken) {
          console.warn("[TokenCapture] Step 3: No provider_token found in parsed localStorage");
          setTokenCaptureStatus("error: no provider_token in localStorage");
          return;
        }

        const userId: string | undefined = parsed?.user?.id;
        if (!userId) {
          console.warn("[TokenCapture] Step 3b: provider_token exists but parsed.user.id is missing");
          setTokenCaptureStatus("error: provider_token found but no user id");
          return;
        }

        setTokenCaptureStatus("storing token...");
        console.warn("[TokenCapture] Step 4: About to call storeGoogleTokensFromSession (localStorage-only)");

        tokenProcessedRef.current = true;

        // Build a minimal Session-like object from localStorage data.
        // storeGoogleTokensFromSession requires: session.user.id and session.provider_token.
        const sessionLike = {
          access_token: parsed?.access_token,
          refresh_token: parsed?.refresh_token,
          expires_at: parsed?.expires_at,
          expires_in: parsed?.expires_in,
          token_type: parsed?.token_type,
          provider_token: providerToken,
          provider_refresh_token: providerRefreshToken,
          user: parsed?.user,
        };

        console.warn("[TokenCapture] Step 4b: sessionLike summary:", {
          hasAccessToken: !!sessionLike.access_token,
          hasRefreshToken: !!sessionLike.refresh_token,
          hasProviderToken: !!sessionLike.provider_token,
          providerTokenLength: (sessionLike.provider_token as string | undefined)?.length,
          userId: sessionLike.user?.id,
          userEmail: sessionLike.user?.email,
        });

        const result = await storeGoogleTokensFromSession(sessionLike as any);
        console.warn("[TokenCapture] Step 5: storeGoogleTokensFromSession result:", result);

        if (!result.success) {
          const msg = result.error || "Failed to store Google tokens";
          setTokenCaptureStatus(`error: ${msg}`);
          toast({
            title: "Connection Issue",
            description: msg,
            variant: "destructive",
          });
          return;
        }

        setTokenCaptureStatus("success!");
        toast({
          title: "Google Connected!",
          description: `Successfully connected as ${result.userEmail || parsed?.user?.email || "your account"}`,
        });

        // Clear provider tokens from localStorage now that they're stored in DB.
        try {
          const latestAuthData = localStorage.getItem(SUPABASE_AUTH_KEY);
          if (latestAuthData) {
            const latestParsed = JSON.parse(latestAuthData);
            delete latestParsed.provider_token;
            delete latestParsed.provider_refresh_token;
            localStorage.setItem(SUPABASE_AUTH_KEY, JSON.stringify(latestParsed));
            console.warn("[TokenCapture] Step 6: Cleared provider tokens from localStorage");
          }
        } catch (e) {
          console.warn("[TokenCapture] Step 6b: Failed to clear localStorage provider tokens:", e);
        }

        // Clean URL if it has hash from OAuth
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }

        // Refresh integration status
        refreshIntegrations();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.warn("[TokenCapture] Unexpected error (outer catch):", e);
        setTokenCaptureStatus(`error: ${msg}`);
      }
    };

    void captureToken();
  }, [refreshIntegrations, toast]);

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
      console.log('[IntegrationsContent] Received google-integration-connected event, refreshing...');
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
      {/* Debug indicator - shows token capture status */}
      <div className="col-span-full text-xs text-muted-foreground bg-muted/50 p-2 rounded">
        Token Capture Status: <strong>{tokenCaptureStatus}</strong>
      </div>
      
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
