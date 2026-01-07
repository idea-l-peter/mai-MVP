-- Add DELETE policy for user_preferences table
CREATE POLICY "Users can delete their own preferences"
ON public.user_preferences
FOR DELETE
USING (auth.uid() = user_id);