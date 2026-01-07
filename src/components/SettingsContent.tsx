import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Shield, Smile } from "lucide-react";

const PHRASE_OPTIONS = [
  // RED (4)
  { color: "red", object: "apple", emoji: "🍎" },
  { color: "red", object: "heart", emoji: "❤️" },
  { color: "red", object: "rose", emoji: "🌹" },
  { color: "red", object: "pepper", emoji: "🌶️" },
  
  // BLUE (4)
  { color: "blue", object: "wave", emoji: "🌊" },
  { color: "blue", object: "whale", emoji: "🐋" },
  { color: "blue", object: "drop", emoji: "💧" },
  { color: "blue", object: "fish", emoji: "🐟" },
  
  // GOLD (4)
  { color: "gold", object: "star", emoji: "⭐" },
  { color: "gold", object: "crown", emoji: "👑" },
  { color: "gold", object: "bell", emoji: "🔔" },
  { color: "gold", object: "medal", emoji: "🏅" },
  
  // GREEN (4)
  { color: "green", object: "leaf", emoji: "🍃" },
  { color: "green", object: "frog", emoji: "🐸" },
  { color: "green", object: "lime", emoji: "🍈" },
  { color: "green", object: "snake", emoji: "🐍" },
  
  // ORANGE (4)
  { color: "orange", object: "fox", emoji: "🦊" },
  { color: "orange", object: "tiger", emoji: "🐅" },
  { color: "orange", object: "crab", emoji: "🦀" },
  { color: "orange", object: "fruit", emoji: "🍊" },
  
  // PURPLE (4)
  { color: "purple", object: "grape", emoji: "🍇" },
  { color: "purple", object: "iris", emoji: "🪻" },
  { color: "purple", object: "orb", emoji: "🔮" },
  { color: "purple", object: "alien", emoji: "👾" },
  
  // WHITE (4)
  { color: "white", object: "cloud", emoji: "☁️" },
  { color: "white", object: "sheep", emoji: "🐑" },
  { color: "white", object: "dove", emoji: "🕊️" },
  { color: "white", object: "egg", emoji: "🥚" },
  
  // BLACK (4)
  { color: "black", object: "cat", emoji: "🐈‍⬛" },
  { color: "black", object: "bat", emoji: "🦇" },
  { color: "black", object: "ant", emoji: "🐜" },
  { color: "black", object: "ape", emoji: "🦍" },
  
  // PINK (4)
  { color: "pink", object: "bow", emoji: "🎀" },
  { color: "pink", object: "flower", emoji: "🌸" },
  { color: "pink", object: "lotus", emoji: "🪷" },
  { color: "pink", object: "shrimp", emoji: "🦐" },
  
  // YELLOW (4)
  { color: "yellow", object: "bee", emoji: "🐝" },
  { color: "yellow", object: "lemon", emoji: "🍋" },
  { color: "yellow", object: "corn", emoji: "🌽" },
  { color: "yellow", object: "bird", emoji: "🐤" }
];

const COLORS = [...new Set(PHRASE_OPTIONS.map(p => p.color))];

const CUSTOM_EMOJIS = [
  "💎", "⭐", "❤️", "🌙", "☀️", "☁️", "🌸", "🌳", "⛰️", "🌊", "🔥", "🔑", "👑", "🛡️",
  "🦋", "🐉", "🦄", "🌈", "🍀", "🎯", "🚀", "💫", "🔮", "🎪", "🍎", "🐋", "💧", "🐟",
  "🔔", "🏅", "🍃", "🐸", "🍈", "🐍", "🦊", "🐅", "🦀", "🍊", "🍇", "🪻", "👾",
  "🐑", "🕊️", "🥚", "🐈‍⬛", "🦇", "🐜", "🦍", "🎀", "🪷", "🦐", "🐝", "🍋", "🌽", "🐤"
];

function generateRandomPhrase() {
  const option = PHRASE_OPTIONS[Math.floor(Math.random() * PHRASE_OPTIONS.length)];
  return { color: option.color, object: option.object, emoji: option.emoji };
}

function getObjectsForColor(color: string) {
  return PHRASE_OPTIONS.filter(p => p.color === color);
}

function getEmojiForPair(color: string, object: string) {
  const match = PHRASE_OPTIONS.find(p => p.color === color && p.object === object);
  return match?.emoji || "";
}

export function SettingsContent() {
  const { preferences, isLoading, updatePreferences } = useUserPreferences();
  const { toast } = useToast();
  
  const [emojiEnabled, setEmojiEnabled] = useState(true);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [phraseColor, setPhraseColor] = useState<string>("");
  const [phraseObject, setPhraseObject] = useState<string>("");
  const [phraseEmoji, setPhraseEmoji] = useState<string>("");
  const [customWord1, setCustomWord1] = useState("");
  const [customWord2, setCustomWord2] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state with fetched preferences
  useEffect(() => {
    if (preferences) {
      setEmojiEnabled(preferences.emoji_confirmations_enabled);
      const savedColor = preferences.security_phrase_color || "";
      const savedObject = preferences.security_phrase_object || "";
      const savedEmoji = preferences.security_phrase_emoji || "";
      
      // Check if saved values match a preset or are custom
      const isPreset = PHRASE_OPTIONS.some(
        p => p.color === savedColor && p.object === savedObject
      );
      
      if (isPreset || (!savedColor && !savedObject)) {
        setIsCustomMode(false);
        setPhraseColor(savedColor);
        setPhraseObject(savedObject);
        setPhraseEmoji(savedEmoji);
      } else {
        setIsCustomMode(true);
        setCustomWord1(savedColor);
        setCustomWord2(savedObject);
        setPhraseEmoji(savedEmoji);
      }
    }
  }, [preferences]);

  // Track changes
  useEffect(() => {
    if (!preferences) return;
    
    const currentColor = isCustomMode ? customWord1 : phraseColor;
    const currentObject = isCustomMode ? customWord2 : phraseObject;
    
    const changed = 
      emojiEnabled !== preferences.emoji_confirmations_enabled ||
      currentColor !== (preferences.security_phrase_color || "") ||
      currentObject !== (preferences.security_phrase_object || "") ||
      phraseEmoji !== (preferences.security_phrase_emoji || "");
    setHasChanges(changed);
  }, [emojiEnabled, phraseColor, phraseObject, phraseEmoji, customWord1, customWord2, isCustomMode, preferences]);

  // Auto-fill emoji when color+object is selected in preset mode
  useEffect(() => {
    if (!isCustomMode && phraseColor && phraseObject) {
      const emoji = getEmojiForPair(phraseColor, phraseObject);
      if (emoji) {
        setPhraseEmoji(emoji);
      }
    }
  }, [phraseColor, phraseObject, isCustomMode]);

  // Reset object when color changes (only show matching objects)
  const handleColorChange = (color: string) => {
    setPhraseColor(color);
    setPhraseObject(""); // Reset object selection
    setPhraseEmoji(""); // Reset emoji
  };

  const handleGenerateRandom = () => {
    setIsCustomMode(false);
    const { color, object, emoji } = generateRandomPhrase();
    setPhraseColor(color);
    setPhraseObject(object);
    setPhraseEmoji(emoji);
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    const colorToSave = isCustomMode ? customWord1 : phraseColor;
    const objectToSave = isCustomMode ? customWord2 : phraseObject;
    
    const success = await updatePreferences({
      emoji_confirmations_enabled: emojiEnabled,
      security_phrase_color: colorToSave || null,
      security_phrase_object: objectToSave || null,
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

  const currentColor = isCustomMode ? customWord1 : phraseColor;
  const currentObject = isCustomMode ? customWord2 : phraseObject;
  
  const securityPhrasePreview = currentColor && currentObject 
    ? `${currentColor} ${currentObject}${emojiEnabled && phraseEmoji ? ` ${phraseEmoji}` : ""}`
    : null;

  const availableObjects = phraseColor ? getObjectsForColor(phraseColor) : [];

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
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              onClick={handleGenerateRandom}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Generate Random
            </Button>
            <Button
              variant={isCustomMode ? "default" : "outline"}
              onClick={() => {
                setIsCustomMode(!isCustomMode);
                if (!isCustomMode) {
                  // Switching to custom mode
                  setCustomWord1("");
                  setCustomWord2("");
                  setPhraseEmoji("");
                } else {
                  // Switching to preset mode
                  setPhraseColor("");
                  setPhraseObject("");
                  setPhraseEmoji("");
                }
              }}
            >
              Custom Phrase
            </Button>
          </div>

          {isCustomMode ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Word 1</Label>
                <Input
                  placeholder="Enter first word"
                  value={customWord1}
                  onChange={(e) => setCustomWord1(e.target.value.toLowerCase().trim())}
                />
              </div>

              <div className="space-y-2">
                <Label>Word 2</Label>
                <Input
                  placeholder="Enter second word"
                  value={customWord2}
                  onChange={(e) => setCustomWord2(e.target.value.toLowerCase().trim())}
                />
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
                        {CUSTOM_EMOJIS.map((emoji) => (
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
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Color</Label>
                <Select value={phraseColor} onValueChange={handleColorChange}>
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
                <Select 
                  value={phraseObject} 
                  onValueChange={setPhraseObject}
                  disabled={!phraseColor}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={phraseColor ? "Select object" : "Select color first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableObjects.map((option) => (
                      <SelectItem key={option.object} value={option.object}>
                        {option.object.charAt(0).toUpperCase() + option.object.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {emojiEnabled && (
                <div className="space-y-2">
                  <Label>Emoji</Label>
                  <div className="flex items-center h-10 px-3 border rounded-md bg-muted text-lg">
                    {phraseEmoji || "—"}
                  </div>
                  <p className="text-xs text-muted-foreground">Auto-filled</p>
                </div>
              )}
            </div>
          )}

          {securityPhrasePreview && (
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">Your security phrase:</p>
              <p className="text-lg font-semibold">{securityPhrasePreview}</p>
              <p className="text-sm text-muted-foreground">
                {emojiEnabled && phraseEmoji
                  ? `Confirm with: "${currentColor} ${currentObject}" OR ${phraseEmoji}`
                  : `Confirm with: "${currentColor} ${currentObject}"`}
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
