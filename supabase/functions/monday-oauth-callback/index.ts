import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONDAY_CLIENT_ID = Deno.env.get("MONDAY_CLIENT_ID")!;
const MONDAY_CLIENT_SECRET = Deno.env.get("MONDAY_CLIENT_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_BASE_URL = Deno.env.get("APP_BASE_URL");

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // This is a GET request from Monday's redirect
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    console.log("Received OAuth callback from Monday.com");
    console.log("Has code:", !!code);
    console.log("Has state:", !!state);
    console.log("Error from Monday:", error);
    console.log("Has MONDAY_CLIENT_SECRET:", Boolean(MONDAY_CLIENT_SECRET));

    // Decode state early if present so we can always redirect back to the right app URL
    let stateData: { user_id: string; provider: string; app_redirect_uri: string } | null = null;
    if (state) {
      try {
        stateData = JSON.parse(atob(state));
      } catch (e) {
        console.error("Failed to decode state:", e);
      }
    }

    const redirectToApp = (params: { error?: string; connected?: string; email?: string }) => {
      const base = stateData?.app_redirect_uri ?? `${APP_BASE_URL}/integrations`;
      const target = new URL(base);
      if (params.error) target.searchParams.set("error", params.error);
      if (params.connected) target.searchParams.set("connected", params.connected);
      if (params.email) target.searchParams.set("email", params.email);
      return Response.redirect(target.toString(), 302);
    };

    if (error) {
      console.error("Monday OAuth error:", error);
      return redirectToApp({ error });
    }

    if (!code || !state || !stateData) {
      return redirectToApp({ error: "Missing or invalid OAuth state" });
    }

    if (!MONDAY_CLIENT_SECRET) {
      return redirectToApp({ error: "Server misconfigured: MONDAY_CLIENT_SECRET is missing" });
    }

    const { user_id, provider, app_redirect_uri } = stateData;

    if (!user_id || !provider || !app_redirect_uri) {
      return redirectToApp({ error: "Invalid OAuth state" });
    }

    // The redirect_uri used for token exchange must match what was sent to Monday
    const callbackUrl = `${SUPABASE_URL}/functions/v1/monday-oauth-callback`;

    // Exchange authorization code for tokens
    console.log("Exchanging code for tokens...");
    const tokenResponse = await fetch("https://auth.monday.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: MONDAY_CLIENT_ID,
        client_secret: MONDAY_CLIENT_SECRET,
        redirect_uri: callbackUrl,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Monday token error:", tokenData);
      return redirectToApp({ error: tokenData.error_description || tokenData.error });
    }

    console.log("Successfully obtained tokens from Monday.com");

    const { access_token } = tokenData;

    // Monday.com tokens don't expire, so we set a far-future date
    const token_expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // Get user info from Monday.com GraphQL API
    console.log("Fetching user info from Monday.com...");
    const userInfoResponse = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        Authorization: access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "{ me { id name email } }",
      }),
    });

    const userInfoData = await userInfoResponse.json();
    const userInfo = userInfoData.data?.me || {};

    console.log(`Got user info for: ${userInfo.email || "unknown"}`);

    // Create service role client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Encrypt token using application-level encryption
    console.log("Encrypting token...");
    const encryptedAccessToken = await encrypt(access_token);

    // Store encrypted token
    console.log("Storing encrypted token...");

    // Upsert access token
    const { error: accessTokenError } = await supabase
      .from("encrypted_integration_tokens")
      .upsert(
        {
          user_id,
          provider,
          token_type: "access_token",
          encrypted_value: encryptedAccessToken,
        },
        { onConflict: "user_id,provider,token_type" }
      );

    if (accessTokenError) {
      console.error("Error storing access token:", accessTokenError);
      return redirectToApp({ error: "Failed to store access token" });
    }

    // Upsert integration record (metadata only)
    const { error: upsertError } = await supabase
      .from("user_integrations")
      .upsert(
        {
          user_id,
          provider,
          token_expires_at,
          scopes: [],
          provider_user_id: userInfo.id?.toString(),
          provider_email: userInfo.email,
        },
        {
          onConflict: "user_id,provider",
        }
      );

    if (upsertError) {
      console.error("Error upserting integration:", upsertError);
      return redirectToApp({ error: "Failed to save integration" });
    }

    console.log(`Successfully saved ${provider} integration for user ${user_id}`);

    // Redirect back to the app with success
    return redirectToApp({ connected: provider, email: userInfo.email });
  } catch (error: unknown) {
    console.error("OAuth callback error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // Fallback redirect (if we can't decode state)
    const errorRedirect = new URL(`${APP_BASE_URL}/integrations`);
    errorRedirect.searchParams.set("error", message);
    return Response.redirect(errorRedirect.toString(), 302);
  }
});
