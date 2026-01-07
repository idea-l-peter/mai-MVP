-- Create email_tracking table to track emails needing response
CREATE TABLE public.email_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  responded BOOLEAN NOT NULL DEFAULT false,
  response_due_by TIMESTAMP WITH TIME ZONE,
  contact_tier INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, gmail_message_id)
);

-- Enable RLS
ALTER TABLE public.email_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own email tracking"
ON public.email_tracking FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email tracking"
ON public.email_tracking FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email tracking"
ON public.email_tracking FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email tracking"
ON public.email_tracking FOR DELETE
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_email_tracking_user_id ON public.email_tracking(user_id);
CREATE INDEX idx_email_tracking_responded ON public.email_tracking(user_id, responded);
CREATE INDEX idx_email_tracking_gmail_id ON public.email_tracking(gmail_message_id);
CREATE INDEX idx_email_tracking_due ON public.email_tracking(user_id, response_due_by) WHERE responded = false;

-- Add trigger for updated_at
CREATE TRIGGER update_email_tracking_updated_at
  BEFORE UPDATE ON public.email_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();