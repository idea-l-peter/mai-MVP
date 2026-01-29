import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, Check, X, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function WhatsAppConnectionCard() {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load existing phone mapping
  useEffect(() => {
    async function loadPhoneMapping() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_phone_mappings')
          .select('phone_number')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading phone mapping:', error);
        }

        if (data?.phone_number) {
          setSavedPhone(data.phone_number);
          setPhoneNumber(data.phone_number);
        }
      } catch (err) {
        console.error('Failed to load phone mapping:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadPhoneMapping();
  }, []);

  const formatPhoneDisplay = (phone: string) => {
    // Simple formatting for display
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    return `+${cleaned}`;
  };

  const handleSave = async () => {
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    if (cleaned.length < 10) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number with country code (e.g., +1234567890)",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Not authenticated",
          description: "Please log in to save your phone number.",
          variant: "destructive",
        });
        return;
      }

      // Normalize phone number (remove + prefix for storage, store digits only)
      const normalizedPhone = cleaned.startsWith('+') ? cleaned.substring(1) : cleaned;

      if (savedPhone) {
        // Update existing
        const { error } = await supabase
          .from('user_phone_mappings')
          .update({ phone_number: normalizedPhone })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('user_phone_mappings')
          .insert({ user_id: user.id, phone_number: normalizedPhone });

        if (error) throw error;
      }

      setSavedPhone(normalizedPhone);
      setPhoneNumber(normalizedPhone);
      
      toast({
        title: "Phone number saved",
        description: "You can now use MAI via WhatsApp!",
      });
    } catch (err) {
      console.error('Failed to save phone mapping:', err);
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_phone_mappings')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setSavedPhone(null);
      setPhoneNumber("");
      
      toast({
        title: "Phone number removed",
        description: "WhatsApp connection has been disconnected.",
      });
    } catch (err) {
      console.error('Failed to remove phone mapping:', err);
      toast({
        title: "Failed to remove",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <CardTitle>WhatsApp Connection</CardTitle>
          {savedPhone && (
            <Badge variant="secondary">
              <Check className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
        <CardDescription>
          Link your WhatsApp number to chat with MAI directly via WhatsApp messages
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="whatsapp-phone">Phone Number (with country code)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="whatsapp-phone"
                type="tel"
                placeholder="+1 234 567 8900"
                value={phoneNumber.startsWith('+') ? phoneNumber : (phoneNumber ? `+${phoneNumber}` : '')}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter your full phone number including country code (e.g., +1 for US, +44 for UK)
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !phoneNumber.trim()}
            className="flex-1"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {savedPhone ? 'Update Number' : 'Link WhatsApp'}
          </Button>
          
          {savedPhone && (
            <Button
              variant="outline"
              onClick={handleRemove}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {savedPhone && (
          <div className="rounded-lg bg-accent/50 border border-accent p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">
              ✅ WhatsApp is connected
            </p>
            <p className="text-sm text-muted-foreground">
              Send a message to MAI's WhatsApp number to start chatting!
            </p>
            <p className="text-xs text-muted-foreground">
              Linked number: {formatPhoneDisplay(savedPhone)}
            </p>
          </div>
        )}

        {!savedPhone && (
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">How it works:</p>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Enter your WhatsApp phone number above</li>
              <li>Save to link your account</li>
              <li>Message MAI's WhatsApp number to chat anywhere</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
