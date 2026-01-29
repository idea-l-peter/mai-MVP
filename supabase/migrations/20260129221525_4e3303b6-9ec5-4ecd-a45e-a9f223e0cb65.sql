-- Add display_name column to user_preferences
ALTER TABLE public.user_preferences 
ADD COLUMN display_name TEXT DEFAULT NULL;