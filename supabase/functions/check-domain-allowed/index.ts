import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required", allowed: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract domain from email
    const domain = email.split("@")[1]?.toLowerCase();
    
    if (!domain) {
      return new Response(
        JSON.stringify({ error: "Invalid email format", allowed: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Checking if domain is allowed:", domain);

    // Check if domain is in allowed_domains table
    const { data, error } = await supabase
      .from("allowed_domains")
      .select("id")
      .ilike("domain", domain)
      .maybeSingle();

    if (error) {
      console.error("Error checking domain:", error);
      return new Response(
        JSON.stringify({ error: "Failed to check domain", allowed: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowed = !!data;
    console.log(`Domain ${domain} allowed:`, allowed);

    return new Response(
      JSON.stringify({ allowed, domain }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in check-domain-allowed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, allowed: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
