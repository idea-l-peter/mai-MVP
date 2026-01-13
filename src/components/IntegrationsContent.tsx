import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { IntegrationCard } from "./IntegrationCard";
import { GoogleWorkspaceCard } from "./GoogleWorkspaceCard";
import { WhatsAppLogo } from "./icons";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { useMondayIntegration } from "@/hooks/useMondayIntegration";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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

  // CRITICAL: Token capture on mount - this is where we capture the provider_token after OAuth redirect
  useEffect(() => {
    // Immediate logging
    console.warn("=== INTEGRATIONS TOKEN CAPTURE STARTED ===");
    setTokenCaptureStatus("checking");

    // Prevent double processing
    if (tokenProcessedRef.current) {
      console.warn("[TokenCapture] Already processed, skipping");
      setTokenCaptureStatus("already_processed");
      return;
    }

    const captureToken = async () => {
      // Catch absolutely everything in this async flow
      try {
        setTokenCaptureStatus("getting session...");
        console.warn("[TokenCapture] Step 1: Calling supabase.auth.getSession()...");

        // Protect against a hung getSession() so the UI doesn't stay stuck on "checking"
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null }; error: Error }>((_, reject) =>
            window.setTimeout(() => reject(new Error("getSession() timeout after 10s")), 10000)
          ),
        ]);

        // Type narrowing for the Promise.race result
        const { data, error } = sessionResult as Awaited<ReturnType<typeof supabase.auth.getSession>>;
        const session = data.session;

        console.warn("[TokenCapture] Step 1b: getSession result:", {
          hasSession: !!session,
          hasError: !!error,
          userId: session?.user?.id,
          userEmail: session?.user?.email,
          hasProviderToken: !!session?.provider_token,
          providerTokenLength: session?.provider_token?.length,
          hasProviderRefreshToken: !!session?.provider_refresh_token,
        });

        if (error) {
          console.warn("[TokenCapture] Step 1c: getSession error:", error);
          setTokenCaptureStatus(`error: ${error.message || "getSession failed"}`);
          return;
        }

        // If provider token isn't present in the returned session, IMMEDIATELY check localStorage
        setTokenCaptureStatus("checking localStorage...");
        console.warn("[TokenCapture] Step 2: Checking provider_token (session first, then localStorage)...");

        let providerToken = session?.provider_token;
        let providerRefreshToken = session?.provider_refresh_token;

        if (!providerToken) {
          console.warn("[TokenCapture] Step 2b: No provider_token in session; reading localStorage key:", SUPABASE_AUTH_KEY);

          try {
            const storedData = localStorage.getItem(SUPABASE_AUTH_KEY);
            console.warn("[TokenCapture] Step 2c: localStorage getItem result:", {
              hasValue: !!storedData,
              length: storedData?.length,
            });

            if (storedData) {
              const parsed = JSON.parse(storedData);
              console.warn("[TokenCapture] Step 2d: Parsed localStorage auth object:", {
                keys: Object.keys(parsed || {}),
                hasProviderToken: !!parsed?.provider_token,
                providerTokenLength: parsed?.provider_token?.length,
                hasProviderRefreshToken: !!parsed?.provider_refresh_token,
              });

              providerToken = parsed?.provider_token;
              providerRefreshToken = parsed?.provider_refresh_token;
            }
          } catch (e) {
            console.warn("[TokenCapture] Step 2e: localStorage parse/read error:", e);
          }
        } else {
          console.warn("[TokenCapture] Step 2f: provider_token was present in session (no localStorage needed)");
        }

        // If we have a provider token, we still NEED a session w/ user_id to store it.
        if (!providerToken) {
          console.warn("[TokenCapture] Step 3: No provider_token found in session or localStorage");
          setTokenCaptureStatus("error: no provider_token found");
          return;
        }

        if (!session?.user?.id) {
          console.warn("[TokenCapture] Step 3b: provider_token exists, but session/user is missing:", {
            hasSession: !!session,
            hasUser: !!session?.user,
            providerTokenLength: providerToken.length,
          });
          setTokenCaptureStatus("error: provider_token found but no session user");
          return;
        }

        console.warn("[TokenCapture] Step 4: FOUND provider_token! Length:", providerToken.length);
        setTokenCaptureStatus("storing token...");

        // Mark as processed to prevent duplicates
        tokenProcessedRef.current = true;

        // Create a session-like object with the tokens
        const sessionWithTokens = {
          ...session,
          provider_token: providerToken,
          provider_refresh_token: providerRefreshToken,
        };

        console.warn("[TokenCapture] Step 5: About to call storeGoogleTokensFromSession");

        try {
          const result = await storeGoogleTokensFromSession(sessionWithTokens);
          console.warn("[TokenCapture] Step 6: storeGoogleTokensFromSession result:", result);

          if (result.success) {
            setTokenCaptureStatus("success!");
            toast({
              title: "Google Connected!",
              description: `Successfully connected as ${result.userEmail || session.user?.email}`,
            });

            // Clear provider_token from localStorage since it's now stored securely
            try {
              const storedData = localStorage.getItem(SUPABASE_AUTH_KEY);
              if (storedData) {
                const parsed = JSON.parse(storedData);
                delete parsed.provider_token;
                delete parsed.provider_refresh_token;
                localStorage.setItem(SUPABASE_AUTH_KEY, JSON.stringify(parsed));
                console.warn("[TokenCapture] Cleared provider tokens from localStorage");
              }
            } catch (e) {
              console.warn("[TokenCapture] Failed to clear localStorage:", e);
            }

            // Clean URL if it has hash from OAuth
            if (window.location.hash) {
              window.history.replaceState(null, "", window.location.pathname);
            }

            // Refresh integration status
            refreshIntegrations();
          } else {
            const msg = result.error || "Failed to store Google tokens";
            setTokenCaptureStatus(`error: ${msg}`);
            console.warn("[TokenCapture] Store failed:", msg);
            toast({
              title: "Connection Issue",
              description: msg,
              variant: "destructive",
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          console.warn("[TokenCapture] storeGoogleTokensFromSession THREW:", e);
          setTokenCaptureStatus(`error: ${msg}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.warn("[TokenCapture] Unexpected error (outer catch):", e);
        setTokenCaptureStatus(`error: ${msg}`);
      }
    };

    captureToken();
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
