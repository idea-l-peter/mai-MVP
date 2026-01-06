-- Create user_preferences table for settings
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  emoji_confirmations_enabled BOOLEAN NOT NULL DEFAULT true,
  security_phrase_color TEXT,
  security_phrase_object TEXT,
  security_phrase_emoji TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read their own preferences
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert their own preferences"
ON public.user_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update their own preferences"
ON public.user_preferences
FOR UPDATE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add metadata column to user_integrations for storing timezone and other provider-specific data
ALTER TABLE public.user_integrations 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;