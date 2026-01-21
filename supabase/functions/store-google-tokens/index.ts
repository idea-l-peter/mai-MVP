import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Body = {
  provider?: string; // defaults to 'google'
  provider_token?: string;
  provider_refresh_token?: string | null;
  scopes?: string[];
};

serve(async (req) => {
  console.log("[store-google-tokens] Request received", { method: req.method });
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[store-google-tokens] Validating auth...");
    
    // Validate JWT authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[store-google-tokens] Missing auth header");
      return new Response(JSON.stringify({ error: "Unauthorized: Missing or invalid authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use getUser instead of getClaims - it's faster and more reliable
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    console.log("[store-google-tokens] Calling getUser...");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    
    if (userError || !userData?.user?.id) {
      console.error("[store-google-tokens] Auth failed:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract user_id from authenticated user - NEVER trust request body
    const user_id = userData.user.id;
    console.log("[store-google-tokens] User authenticated:", user_id.slice(0, 8) + "...");

    const body = (await req.json()) as Body;
    const provider = body.provider || "google";
    const provider_token = body.provider_token;
    const provider_refresh_token = body.provider_refresh_token ?? null;
    const scopes = body.scopes || [];

    console.log("[store-google-tokens] request", {
      provider,
      has_provider_token: !!provider_token,
      has_provider_refresh_token: !!provider_refresh_token,
      scopes_count: scopes.length,
      user_id,
    });

    if (!provider_token) {
      return new Response(JSON.stringify({ error: "Missing provider_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[store-google-tokens] Creating service client...");
    // Service role client for DB writes
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    console.log("[store-google-tokens] Service client ready");

    // Optionally validate token + fetch Google user email (nice for UI)
    let provider_email: string | null = null;
    let provider_user_id: string | null = null;
    try {
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${provider_token}` },
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        provider_email = userInfo?.email ?? null;
        provider_user_id = userInfo?.id ?? null;
      } else {
        console.warn("[store-google-tokens] userinfo fetch failed", userInfoResponse.status);
      }
    } catch (e) {
      console.warn("[store-google-tokens] userinfo fetch error", e);
    }

    // Encrypt tokens using application-level encryption (NOT Supabase Vault)
    console.log("[store-google-tokens] encrypting tokens...");
    const encryptedAccessToken = await encrypt(provider_token);
    const encryptedRefreshToken = provider_refresh_token ? await encrypt(provider_refresh_token) : null;

    console.log("[store-google-tokens] storing encrypted tokens...");

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
      console.error("[store-google-tokens] access token upsert failed", accessTokenError);
      throw new Error(accessTokenError.message);
    }

    if (encryptedRefreshToken) {
      const { error: refreshTokenError } = await supabase
        .from("encrypted_integration_tokens")
        .upsert(
          {
            user_id,
            provider,
            token_type: "refresh_token",
            encrypted_value: encryptedRefreshToken,
          },
          { onConflict: "user_id,provider,token_type" }
        );

      if (refreshTokenError) {
        // Non-fatal: access token is still stored.
        console.warn("[store-google-tokens] refresh token upsert failed", refreshTokenError);
      }
    }

    // Set expiry ~1 hour from now (Google access tokens)
    const token_expires_at = new Date(Date.now() + 3600 * 1000).toISOString();

    const { error: integrationError } = await supabase
      .from("user_integrations")
      .upsert(
        {
          user_id,
          provider,
          provider_email,
          provider_user_id,
          token_expires_at,
          scopes,
          metadata: {
            source: "client_provider_token",
            has_refresh_token: !!provider_refresh_token,
          },
        },
        { onConflict: "user_id,provider" }
      );

    if (integrationError) {
      console.error("[store-google-tokens] user_integrations upsert failed", integrationError);
      throw new Error(integrationError.message);
    }

    console.log("[store-google-tokens] success", { user_id, provider, provider_email });

    return new Response(
      JSON.stringify({ success: true, provider_email, token_expires_at }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[store-google-tokens] error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
