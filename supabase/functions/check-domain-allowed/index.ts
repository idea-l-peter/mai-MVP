import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 320;

// In-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20; // 20 requests per window
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour

function getClientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ||
         req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
         "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);
  
  // Cleanup old entries periodically (1% chance)
  if (Math.random() < 0.01) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (val.resetAt < now) rateLimitMap.delete(key);
    }
  }
  
  if (limit && limit.resetAt > now) {
    if (limit.count >= RATE_LIMIT_MAX) {
      return false; // Rate limit exceeded
    }
    limit.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }
  
  return true;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp)) {
      console.log(`[Domain Check] Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later.", allowed: false }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { email } = body;
    
    // Validate email is present
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required", allowed: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email length
    if (email.length > MAX_EMAIL_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Email too long", allowed: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format", allowed: false }),
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

    console.log(`[Domain Check] IP: ${clientIp}, domain: ${domain}`);

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
    console.log(`[Domain Check] Domain ${domain} allowed: ${allowed}`);

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
