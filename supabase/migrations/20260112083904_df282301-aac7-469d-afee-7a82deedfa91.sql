-- Fix SECURITY DEFINER function to add authorization check
CREATE OR REPLACE FUNCTION public.create_default_contact_tags(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is owner or service role (service role calls have auth.uid() = NULL)
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot create tags for other users';
  END IF;

  INSERT INTO public.contact_tags (user_id, name, color)
  VALUES
    (p_user_id, 'VIP Client', '#F59E0B'),
    (p_user_id, 'Family', '#EF4444'),
    (p_user_id, 'Close Friend', '#3B82F6'),
    (p_user_id, 'Colleague', '#10B981'),
    (p_user_id, 'Responds Slowly', '#F97316'),
    (p_user_id, 'High Maintenance', '#8B5CF6'),
    (p_user_id, 'Potential Lead', '#14B8A6')
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;