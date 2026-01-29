-- Create user_phone_mappings table
CREATE TABLE IF NOT EXISTS public.user_phone_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  phone_number TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.user_phone_mappings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for full CRUD access
CREATE POLICY "Users can view their own phone mapping" 
ON public.user_phone_mappings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own phone mapping" 
ON public.user_phone_mappings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own phone mapping" 
ON public.user_phone_mappings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own phone mapping" 
ON public.user_phone_mappings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_phone_mappings_user_id ON public.user_phone_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_phone_mappings_phone ON public.user_phone_mappings(phone_number);