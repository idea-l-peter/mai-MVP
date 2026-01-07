-- Create contact_profiles table for mai's relationship intelligence
CREATE TABLE public.contact_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_contact_id TEXT NOT NULL,
  email TEXT,
  tier INTEGER CHECK (tier >= 1 AND tier <= 5),
  notes TEXT,
  last_contact_date TIMESTAMP WITH TIME ZONE,
  next_followup_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, google_contact_id)
);

-- Create contact_tags table
CREATE TABLE public.contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Create junction table for contact profiles and tags
CREATE TABLE public.contact_profile_tags (
  contact_profile_id UUID NOT NULL REFERENCES public.contact_profiles(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.contact_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_profile_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.contact_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_profile_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies for contact_profiles
CREATE POLICY "Users can view their own contact profiles"
ON public.contact_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contact profiles"
ON public.contact_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contact profiles"
ON public.contact_profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contact profiles"
ON public.contact_profiles FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for contact_tags
CREATE POLICY "Users can view their own tags"
ON public.contact_tags FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tags"
ON public.contact_tags FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
ON public.contact_tags FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
ON public.contact_tags FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for contact_profile_tags (junction table)
-- Users can manage tags on their own contact profiles
CREATE POLICY "Users can view their own contact profile tags"
ON public.contact_profile_tags FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.contact_profiles
    WHERE id = contact_profile_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own contact profile tags"
ON public.contact_profile_tags FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contact_profiles
    WHERE id = contact_profile_id AND user_id = auth.uid()
  )
  AND
  EXISTS (
    SELECT 1 FROM public.contact_tags
    WHERE id = tag_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own contact profile tags"
ON public.contact_profile_tags FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.contact_profiles
    WHERE id = contact_profile_id AND user_id = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX idx_contact_profiles_user_id ON public.contact_profiles(user_id);
CREATE INDEX idx_contact_profiles_tier ON public.contact_profiles(user_id, tier);
CREATE INDEX idx_contact_profiles_google_id ON public.contact_profiles(google_contact_id);
CREATE INDEX idx_contact_profiles_email ON public.contact_profiles(email);
CREATE INDEX idx_contact_profiles_followup ON public.contact_profiles(user_id, next_followup_date);
CREATE INDEX idx_contact_tags_user_id ON public.contact_tags(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_contact_profiles_updated_at
  BEFORE UPDATE ON public.contact_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create default tags for a user
CREATE OR REPLACE FUNCTION public.create_default_contact_tags(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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