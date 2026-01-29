import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { IntegrationCard } from "./IntegrationCard";
import { GoogleWorkspaceCard } from "./GoogleWorkspaceCard";
import { WhatsAppIntegrationCard } from "./WhatsAppIntegrationCard";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { useMondayIntegration } from "@/hooks/useMondayIntegration";
import { useIntegrationStatus } from "@/hooks/useIntegrationStatus";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DASHBOARD_QUERY_KEY, fetchDashboardData } from "@/hooks/useDashboardData";
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

export function IntegrationsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [isMondayConnecting, setIsMondayConnecting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const DISCONNECT_STORAGE_KEY = "disconnect_in_progress_provider";

  // PREFETCH: Load dashboard data in the background when Integrations page mounts
  useEffect(() => {
    console.log("[Integrations] Prefetching dashboard data...");
    queryClient.prefetchQuery({
      queryKey: DASHBOARD_QUERY_KEY,
      queryFn: fetchDashboardData,
      staleTime: 2 * 60 * 1000, // 2 minutes
    });
  }, [queryClient]);

  // Use React Query for parallel fetching with 5-min staleTime
  const { 
    google: googleStatus, 
    monday: mondayStatus, 
    isLoading, 
    invalidate: invalidateIntegrations 
  } = useIntegrationStatus();

  const {
    isConnecting: isGoogleConnecting,
    initiateOAuth: initiateGoogleOAuth,
    disconnect: disconnectGoogle,
  } = useGoogleIntegration();

  const {
    initiateOAuth: initiateMondayOAuth,
    disconnect: disconnectMonday,
  } = useMondayIntegration();

  // NOTE: Google OAuth code handling is consolidated in useGoogleTokenCapture.ts

  // Listen for Auth State Changes - invalidate React Query cache
  useEffect(() => {
    console.log("[Integrations] Setting up auth state listener...");
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Integrations] Auth state changed:", event, "User:", session?.user?.email);
      
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        console.log("[Integrations] User signed in or token refreshed - invalidating cache...");
        invalidateIntegrations();
      }
    });

    return () => subscription.unsubscribe();
  }, [invalidateIntegrations]);

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
      console.log("[Integrations] Received google-integration-connected event - invalidating cache");
      invalidateIntegrations();
    };

    window.addEventListener('google-integration-connected', handleGoogleConnected);
    return () => window.removeEventListener('google-integration-connected', handleGoogleConnected);
  }, [invalidateIntegrations]);

  // Handle legacy URL params (no need to manually refresh - React Query handles it)
  useEffect(() => {
    const connected = searchParams.get("connected");
    const email = searchParams.get("email");
    const error = searchParams.get("error");

    if (connected) {
      console.log("[Integrations] Legacy connected param found:", connected, email);
      toast({
        title: "Connected!",
        description: `Successfully connected to ${connected}${email ? ` as ${email}` : ""}`,
      });
      setSearchParams({}, { replace: true });
    }

    if (error) {
      console.log("[Integrations] Error param found:", error);
      toast({
        title: "Connection failed",
        description: error,
        variant: "destructive",
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

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
        invalidateIntegrations();
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

  // ============================================================
  // BUG FIX #2: Monday.com connect handler with loading state
  // ============================================================
  const handleConnect = async (integrationId: string) => {
    console.log("[Integrations] handleConnect called for:", integrationId);
    const config = OTHER_INTEGRATION_CONFIGS.find((c) => c.id === integrationId);
    
    if (config?.provider === "monday") {
      console.log("[Integrations] Initiating Monday.com OAuth...");
      setIsMondayConnecting(true);
      try {
        await initiateMondayOAuth();
      } catch (err) {
        console.error("[Integrations] Monday OAuth error:", err);
        setIsMondayConnecting(false);
      }
      // Note: Don't reset connecting state here - page will redirect
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
        invalidateIntegrations();
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

  // Derive status from React Query data
  const getStatus = (integrationId: string): IntegrationStatus => {
    if (integrationId === "monday") {
      return mondayStatus.connected ? "connected" : "not_connected";
    }
    return "not_connected";
  };

  const getProviderEmail = (integrationId: string): string | undefined => {
    if (integrationId === "monday") {
      return mondayStatus.providerEmail;
    }
    return undefined;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Google Workspace Card - Primary integration */}
      <GoogleWorkspaceCard
        isConnected={googleStatus.connected}
        connectedEmail={googleStatus.providerEmail}
        grantedScopes={googleStatus.scopes}
        isLoading={isGoogleConnecting || isLoading}
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
          isLoading={disconnectingId === integration.id || (integration.provider === "monday" && isMondayConnecting)}
          isConnecting={integration.provider === "monday" && isMondayConnecting}
          onConnect={() => handleConnect(integration.id)}
          onDisconnect={() => handleDisconnect(integration.id)}
        />
      ))}
    </div>
  );
}
