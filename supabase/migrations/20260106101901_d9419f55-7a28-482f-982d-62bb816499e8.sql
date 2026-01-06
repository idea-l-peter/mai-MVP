-- Add missing UPDATE policy on allowed_domains table for completeness
CREATE POLICY "Admins can update domains"
ON public.allowed_domains
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));