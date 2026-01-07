-- Add new columns to contact_profiles for occasions tracking
ALTER TABLE public.contact_profiles
ADD COLUMN IF NOT EXISTS birthday DATE,
ADD COLUMN IF NOT EXISTS anniversary_date DATE,
ADD COLUMN IF NOT EXISTS custom_dates JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS observed_holidays TEXT[] DEFAULT '{}';

-- Create holidays table with major holidays pre-populated
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('religious', 'cultural', 'national', 'international')),
  regions TEXT[] DEFAULT '{}',
  description TEXT,
  days_notice INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on holidays (publicly readable, admin only write)
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Everyone can read holidays
CREATE POLICY "Holidays are publicly readable"
ON public.holidays FOR SELECT
USING (true);

-- Only admins can modify holidays
CREATE POLICY "Admins can insert holidays"
ON public.holidays FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update holidays"
ON public.holidays FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete holidays"
ON public.holidays FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Add observed_holidays to user_preferences
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS observed_holidays UUID[] DEFAULT '{}';

-- Create index for faster birthday lookups
CREATE INDEX IF NOT EXISTS idx_contact_profiles_birthday ON public.contact_profiles(birthday);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_anniversary ON public.contact_profiles(anniversary_date);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(holiday_date);

-- Pre-populate with major holidays (using 2026 dates, will be checked by month/day)
INSERT INTO public.holidays (name, holiday_date, type, regions, description, days_notice) VALUES
-- International
('New Year''s Day', '2026-01-01', 'international', ARRAY['global'], 'Start of the new year', 3),
('Valentine''s Day', '2026-02-14', 'cultural', ARRAY['global'], 'Day of love and affection', 7),
('International Women''s Day', '2026-03-08', 'international', ARRAY['global'], 'Celebrating women worldwide', 3),
('Earth Day', '2026-04-22', 'international', ARRAY['global'], 'Environmental awareness day', 3),
('Mother''s Day', '2026-05-10', 'cultural', ARRAY['US', 'CA', 'AU'], 'Honoring mothers', 7),
('Father''s Day', '2026-06-21', 'cultural', ARRAY['US', 'CA', 'UK'], 'Honoring fathers', 7),

-- Religious/Cultural - Christian
('Easter Sunday', '2026-04-05', 'religious', ARRAY['Christian'], 'Christian celebration of resurrection', 7),
('Christmas Eve', '2026-12-24', 'religious', ARRAY['Christian', 'global'], 'Evening before Christmas', 14),
('Christmas Day', '2026-12-25', 'religious', ARRAY['Christian', 'global'], 'Celebration of Christ''s birth', 14),

-- Religious - Jewish
('Passover', '2026-04-02', 'religious', ARRAY['Jewish'], 'Jewish festival of freedom', 7),
('Rosh Hashanah', '2026-09-12', 'religious', ARRAY['Jewish'], 'Jewish New Year', 7),
('Yom Kippur', '2026-09-21', 'religious', ARRAY['Jewish'], 'Day of Atonement', 7),
('Hanukkah', '2026-12-05', 'religious', ARRAY['Jewish'], 'Festival of Lights', 7),

-- Religious - Islamic
('Eid al-Fitr', '2026-03-20', 'religious', ARRAY['Muslim'], 'End of Ramadan', 7),
('Eid al-Adha', '2026-05-27', 'religious', ARRAY['Muslim'], 'Festival of Sacrifice', 7),

-- Religious - Hindu
('Diwali', '2026-10-20', 'religious', ARRAY['Hindu', 'Indian'], 'Festival of Lights', 7),
('Holi', '2026-03-17', 'religious', ARRAY['Hindu', 'Indian'], 'Festival of Colors', 7),

-- Cultural - Asian
('Chinese New Year', '2026-02-17', 'cultural', ARRAY['Chinese', 'Asian'], 'Lunar New Year celebration', 14),
('Mid-Autumn Festival', '2026-09-25', 'cultural', ARRAY['Chinese', 'Asian'], 'Moon Festival', 7),

-- National - US
('Independence Day', '2026-07-04', 'national', ARRAY['US'], 'US Independence Day', 3),
('Thanksgiving', '2026-11-26', 'national', ARRAY['US'], 'US Thanksgiving', 7),
('Memorial Day', '2026-05-25', 'national', ARRAY['US'], 'Honoring fallen soldiers', 3),
('Labor Day', '2026-09-07', 'national', ARRAY['US'], 'Celebrating workers', 3),

-- National - Other
('Canada Day', '2026-07-01', 'national', ARRAY['CA'], 'Canadian national day', 3),
('UK Bank Holiday', '2026-08-31', 'national', ARRAY['UK'], 'Summer bank holiday', 3),
('Australia Day', '2026-01-26', 'national', ARRAY['AU'], 'Australian national day', 3);