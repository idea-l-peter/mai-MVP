import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import maiLogo from "@/assets/mai-logo.png";

// Basic scopes for sign-in only - Workspace scopes are requested on Integrations page
const GOOGLE_SIGN_IN_SCOPES = [
  "openid",
  "email", 
  "profile",
];

// Check domain against database via edge function
const checkDomainAllowed = async (email: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.functions.invoke("check-domain-allowed", {
      body: { email },
    });
    if (error) {
      console.error("Error checking domain:", error);
      return false;
    }
    return data?.allowed === true;
  } catch (err) {
    console.error("Error calling check-domain-allowed:", err);
    return false;
  }
};

const getAuthRedirectOrigin = () => {
  // Lovable preview URLs (id-preview--*.lovable.app) may enforce Lovable platform auth.
  // For OAuth/email redirects, prefer the public project domain to keep app auth fully Supabase-based.
  if (typeof window === "undefined") return "";

  const { protocol, hostname } = window.location;

  if (hostname.startsWith("id-preview--") && hostname.endsWith(".lovable.app")) {
    const publicHost = hostname
      .replace(/^id-preview--/, "")
      .replace(/\.lovable\.app$/, ".lovableproject.com");

    return `${protocol}//${publicHost}`;
  }

  return window.location.origin;
};

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const domainCheckDone = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Only process SIGNED_IN events and prevent duplicate checks
      if (event === 'SIGNED_IN' && session?.user?.email && !domainCheckDone.current) {
        domainCheckDone.current = true;
        
        // Check domain for OAuth signins (email/password already checked before signup)
        const isAllowed = await checkDomainAllowed(session.user.email);
        if (!isAllowed) {
          // Sign out user and show error
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "Your email domain is not authorized. Contact your administrator for access.",
            variant: "destructive",
          });
          domainCheckDone.current = false;
          return;
        }
        
        navigate("/dashboard");
      } else if (event === 'SIGNED_OUT') {
        domainCheckDone.current = false;
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user?.email && !domainCheckDone.current) {
        domainCheckDone.current = true;
        
        // Verify domain on page load too (in case user bookmarked with active session)
        const isAllowed = await checkDomainAllowed(session.user.email);
        if (!isAllowed) {
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "Your email domain is not authorized.",
            variant: "destructive",
          });
          domainCheckDone.current = false;
          return;
        }
        
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast({ title: "Welcome back!", description: "You've successfully signed in." });
      } else {
        // Check email domain restriction for signups
        const isAllowed = await checkDomainAllowed(email);
        if (!isAllowed) {
          throw new Error("Signups are restricted to approved email domains. Contact your administrator for access.");
        }
        
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${getAuthRedirectOrigin()}/dashboard`,
          },
        });
        if (error) throw error;
        toast({
          title: "Account created!",
          description: "Check your email to confirm your account, or sign in if email confirmation is disabled.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      console.log('[Auth] Starting Google OAuth sign-in with basic scopes only');

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${getAuthRedirectOrigin()}/dashboard`,
          scopes: GOOGLE_SIGN_IN_SCOPES.join(' '),
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign in with Google",
        variant: "destructive",
      });
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          {/* Logo */}
          <div className="flex items-center justify-center">
            <img src={maiLogo} alt="mai" className="h-[60px] w-auto" />
          </div>
          <div>
            <CardTitle className="text-2xl">
              {isLogin ? "Sign in to your account" : "Create your account"}
            </CardTitle>
            <CardDescription className="mt-2">
              {isLogin
                ? "Enter your credentials to access your dashboard"
                : "Get started with your AI assistant management"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Loading..." : isLogin ? "Sign in" : "Sign up"}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Google Sign In Button */}
          <Button
            type="button"
            variant="outline"
            className="w-full bg-white border-border hover:bg-muted"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {googleLoading ? "Signing in..." : "Continue with Google"}
          </Button>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
