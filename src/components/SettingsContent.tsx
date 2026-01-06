import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Shield, Smile } from "lucide-react";

const COLORS = [
  "red", "orange", "yellow", "green", "blue", "purple", "pink", "black", "white", "gold", "silver"
];

const OBJECTS = [
  "diamond", "star", "heart", "moon", "sun", "cloud", "flower", "tree", "mountain", "ocean", "fire", "key", "crown", "shield"
];

const EMOJIS = [
  "💎", "⭐", "❤️", "🌙", "☀️", "☁️", "🌸", "🌳", "⛰️", "🌊", "🔥", "🔑", "👑", "🛡️",
  "🦋", "🐉", "🦄", "🌈", "🍀", "🎯", "🚀", "💫", "🔮", "🎪"
];

function generateRandomPhrase() {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const object = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
  const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  return { color, object, emoji };
}

export function SettingsContent() {
  const { preferences, isLoading, updatePreferences } = useUserPreferences();
  const { toast } = useToast();
  
  const [emojiEnabled, setEmojiEnabled] = useState(true);
  const [phraseColor, setPhraseColor] = useState<string>("");
  const [phraseObject, setPhraseObject] = useState<string>("");
  const [phraseEmoji, setPhraseEmoji] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state with fetched preferences
  useEffect(() => {
    if (preferences) {
      setEmojiEnabled(preferences.emoji_confirmations_enabled);
      setPhraseColor(preferences.security_phrase_color || "");
      setPhraseObject(preferences.security_phrase_object || "");
      setPhraseEmoji(preferences.security_phrase_emoji || "");
    }
  }, [preferences]);

  // Track changes
  useEffect(() => {
    if (!preferences) return;
    const changed = 
      emojiEnabled !== preferences.emoji_confirmations_enabled ||
      phraseColor !== (preferences.security_phrase_color || "") ||
      phraseObject !== (preferences.security_phrase_object || "") ||
      phraseEmoji !== (preferences.security_phrase_emoji || "");
    setHasChanges(changed);
  }, [emojiEnabled, phraseColor, phraseObject, phraseEmoji, preferences]);

  const handleGenerateRandom = () => {
    const { color, object, emoji } = generateRandomPhrase();
    setPhraseColor(color);
    setPhraseObject(object);
    setPhraseEmoji(emoji);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const success = await updatePreferences({
      emoji_confirmations_enabled: emojiEnabled,
      security_phrase_color: phraseColor || null,
      security_phrase_object: phraseObject || null,
      security_phrase_emoji: phraseEmoji || null,
    });
    setIsSaving(false);

    if (success) {
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated.",
      });
      setHasChanges(false);
    } else {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const securityPhrasePreview = phraseColor && phraseObject 
    ? `${phraseColor} ${phraseObject}${emojiEnabled && phraseEmoji ? ` ${phraseEmoji}` : ""}`
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Emoji Confirmations Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smile className="h-5 w-5 text-primary" />
            <CardTitle>Confirmation Style</CardTitle>
          </div>
          <CardDescription>
            Choose how you confirm sensitive actions with mai
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="emoji-toggle">Use emoji confirmations</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, you can confirm actions with emojis or text. When disabled, only text confirmations work.
              </p>
            </div>
            <Switch
              id="emoji-toggle"
              checked={emojiEnabled}
              onCheckedChange={setEmojiEnabled}
            />
          </div>
          
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">Example confirmations:</p>
            {emojiEnabled ? (
              <>
                <p className="text-sm text-muted-foreground">• Delete action: Reply 🗑️ or type "delete"</p>
                <p className="text-sm text-muted-foreground">• Cancel action: Reply 🚫 or type "cancel"</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">• Delete action: Type "delete"</p>
                <p className="text-sm text-muted-foreground">• Cancel action: Type "cancel"</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security Phrase Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Security Phrase</CardTitle>
          </div>
          <CardDescription>
            Set a personal phrase for high-impact confirmations like sending external emails or bulk deletions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            variant="outline" 
            onClick={handleGenerateRandom}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Generate Random Phrase
          </Button>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={phraseColor} onValueChange={setPhraseColor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select color" />
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map((color) => (
                    <SelectItem key={color} value={color}>
                      {color.charAt(0).toUpperCase() + color.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Object</Label>
              <Select value={phraseObject} onValueChange={setPhraseObject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select object" />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTS.map((obj) => (
                    <SelectItem key={obj} value={obj}>
                      {obj.charAt(0).toUpperCase() + obj.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {emojiEnabled && (
              <div className="space-y-2">
                <Label>Emoji</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      {phraseEmoji || "Pick emoji"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <div className="grid grid-cols-6 gap-2">
                      {EMOJIS.map((emoji) => (
                        <Button
                          key={emoji}
                          variant={phraseEmoji === emoji ? "default" : "ghost"}
                          size="sm"
                          className="h-10 w-10 p-0 text-lg"
                          onClick={() => setPhraseEmoji(emoji)}
                        >
                          {emoji}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {securityPhrasePreview && (
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">Your security phrase:</p>
              <p className="text-lg font-semibold">{securityPhrasePreview}</p>
              <p className="text-sm text-muted-foreground">
                {emojiEnabled && phraseEmoji
                  ? `Confirm with: "${phraseColor} ${phraseObject}" OR ${phraseEmoji}`
                  : `Confirm with: "${phraseColor} ${phraseObject}"`}
              </p>
            </div>
          )}

          <Button 
            onClick={handleSave} 
            disabled={isSaving || !hasChanges}
            className="w-full sm:w-auto"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
