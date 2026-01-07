import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface IntelligenceRequest {
  action: string;
  user_id: string;
  params?: Record<string, unknown>;
}

interface ContactProfile {
  id: string;
  user_id: string;
  google_contact_id: string;
  email: string | null;
  tier: number | null;
  notes: string | null;
  last_contact_date: string | null;
  next_followup_date: string | null;
  birthday: string | null;
  anniversary_date: string | null;
  custom_dates: Array<{ name: string; date: string }> | null;
  observed_holidays: string[] | null;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
}

interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

interface Holiday {
  id: string;
  name: string;
  holiday_date: string;
  type: string;
  regions: string[];
  description: string | null;
  days_notice: number;
}

interface OutreachSuggestion {
  type: 'birthday' | 'holiday' | 'anniversary' | 'custom_date' | 'cold_contact';
  contact?: ContactProfile;
  holiday?: Holiday;
  date: string;
  days_until: number;
  reason: string;
}

// ============= Helper Functions =============

function getSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Ensure default tags exist for a user
async function ensureDefaultTags(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  
  // Check if user has any tags
  const { data: existingTags } = await supabase
    .from('contact_tags')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  
  if (!existingTags || existingTags.length === 0) {
    // Create default tags using the database function
    await supabase.rpc('create_default_contact_tags', { p_user_id: userId });
    console.log(`[ContactIntelligence] Created default tags for user: ${userId}`);
  }
}

// Get or create a contact profile
async function getOrCreateProfile(
  userId: string, 
  googleContactId: string, 
  email?: string
): Promise<ContactProfile> {
  const supabase = getSupabaseClient();
  
  // Try to get existing profile
  let { data: profile, error } = await supabase
    .from('contact_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('google_contact_id', googleContactId)
    .maybeSingle();
  
  if (error) throw error;
  
  if (!profile) {
    // Create new profile
    const { data: newProfile, error: insertError } = await supabase
      .from('contact_profiles')
      .insert({
        user_id: userId,
        google_contact_id: googleContactId,
        email: email || null,
      })
      .select()
      .single();
    
    if (insertError) throw insertError;
    profile = newProfile;
  }
  
  return profile as ContactProfile;
}

// ============= Action Handlers =============

async function getContactProfile(
  userId: string, 
  googleContactId: string
): Promise<ContactProfile | null> {
  console.log(`[ContactIntelligence] Getting profile for: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  const { data: profile, error } = await supabase
    .from('contact_profiles')
    .select(`
      *,
      contact_profile_tags (
        tag_id,
        contact_tags (
          id, name, color
        )
      )
    `)
    .eq('user_id', userId)
    .eq('google_contact_id', googleContactId)
    .maybeSingle();
  
  if (error) throw error;
  
  if (profile) {
    // Flatten tags
    const tags = profile.contact_profile_tags?.map((pt: { contact_tags: Tag }) => pt.contact_tags) || [];
    return { ...profile, tags, contact_profile_tags: undefined };
  }
  
  return null;
}

async function setContactTier(
  userId: string, 
  googleContactId: string, 
  tier: number,
  email?: string
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Setting tier ${tier} for: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  if (tier < 1 || tier > 5) {
    throw new Error('Tier must be between 1 and 5');
  }
  
  // Get or create profile
  const profile = await getOrCreateProfile(userId, googleContactId, email);
  
  // Update tier
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ tier })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

async function addContactNote(
  userId: string, 
  googleContactId: string, 
  note: string,
  email?: string
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Adding note for: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  const profile = await getOrCreateProfile(userId, googleContactId, email);
  
  // Append or replace note
  const existingNote = profile.notes || '';
  const timestamp = new Date().toISOString().split('T')[0];
  const newNote = existingNote 
    ? `${existingNote}\n\n[${timestamp}] ${note}`
    : `[${timestamp}] ${note}`;
  
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ notes: newNote })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

async function setFollowup(
  userId: string, 
  googleContactId: string, 
  followupDate: string,
  email?: string
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Setting followup for: ${googleContactId} to ${followupDate}`);
  const supabase = getSupabaseClient();
  
  const profile = await getOrCreateProfile(userId, googleContactId, email);
  
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ next_followup_date: followupDate })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

async function updateLastContact(
  userId: string, 
  googleContactId: string,
  contactDate?: string,
  email?: string
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Updating last contact for: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  const profile = await getOrCreateProfile(userId, googleContactId, email);
  
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ last_contact_date: contactDate || new Date().toISOString() })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

async function getTags(userId: string): Promise<Tag[]> {
  console.log(`[ContactIntelligence] Getting tags for user`);
  const supabase = getSupabaseClient();
  
  // Ensure default tags exist
  await ensureDefaultTags(userId);
  
  const { data: tags, error } = await supabase
    .from('contact_tags')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  
  if (error) throw error;
  return tags as Tag[];
}

async function createTag(
  userId: string, 
  name: string, 
  color: string = '#6B7280'
): Promise<Tag> {
  console.log(`[ContactIntelligence] Creating tag: ${name}`);
  const supabase = getSupabaseClient();
  
  const { data: tag, error } = await supabase
    .from('contact_tags')
    .insert({ user_id: userId, name, color })
    .select()
    .single();
  
  if (error) {
    if (error.code === '23505') { // Unique constraint violation
      throw new Error(`Tag "${name}" already exists`);
    }
    throw error;
  }
  
  return tag as Tag;
}

async function addTagToContact(
  userId: string, 
  googleContactId: string, 
  tagId: string,
  email?: string
): Promise<{ success: boolean; profile: ContactProfile }> {
  console.log(`[ContactIntelligence] Adding tag ${tagId} to: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  const profile = await getOrCreateProfile(userId, googleContactId, email);
  
  // Add tag association
  const { error } = await supabase
    .from('contact_profile_tags')
    .insert({ contact_profile_id: profile.id, tag_id: tagId })
    .select();
  
  if (error) {
    if (error.code === '23505') { // Already tagged
      console.log(`[ContactIntelligence] Contact already has this tag`);
    } else {
      throw error;
    }
  }
  
  // Return updated profile with tags
  const updatedProfile = await getContactProfile(userId, googleContactId);
  return { success: true, profile: updatedProfile! };
}

async function removeTagFromContact(
  userId: string, 
  googleContactId: string, 
  tagId: string
): Promise<{ success: boolean }> {
  console.log(`[ContactIntelligence] Removing tag ${tagId} from: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  // Get the profile
  const { data: profile } = await supabase
    .from('contact_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('google_contact_id', googleContactId)
    .maybeSingle();
  
  if (!profile) {
    return { success: true }; // Nothing to remove
  }
  
  const { error } = await supabase
    .from('contact_profile_tags')
    .delete()
    .eq('contact_profile_id', profile.id)
    .eq('tag_id', tagId);
  
  if (error) throw error;
  return { success: true };
}

async function getContactsByTier(
  userId: string, 
  tier: number
): Promise<ContactProfile[]> {
  console.log(`[ContactIntelligence] Getting contacts at tier: ${tier}`);
  const supabase = getSupabaseClient();
  
  const { data: profiles, error } = await supabase
    .from('contact_profiles')
    .select(`
      *,
      contact_profile_tags (
        contact_tags (
          id, name, color
        )
      )
    `)
    .eq('user_id', userId)
    .eq('tier', tier)
    .order('updated_at', { ascending: false });
  
  if (error) throw error;
  
  // Flatten tags
  return (profiles || []).map((p: ContactProfile & { contact_profile_tags?: { contact_tags: Tag }[] }) => ({
    ...p,
    tags: p.contact_profile_tags?.map((pt) => pt.contact_tags) || [],
    contact_profile_tags: undefined,
  }));
}

async function getContactsByTag(
  userId: string, 
  tagId: string
): Promise<ContactProfile[]> {
  console.log(`[ContactIntelligence] Getting contacts with tag: ${tagId}`);
  const supabase = getSupabaseClient();
  
  const { data: profiles, error } = await supabase
    .from('contact_profiles')
    .select(`
      *,
      contact_profile_tags!inner (
        tag_id,
        contact_tags (
          id, name, color
        )
      )
    `)
    .eq('user_id', userId)
    .eq('contact_profile_tags.tag_id', tagId)
    .order('updated_at', { ascending: false });
  
  if (error) throw error;
  
  return (profiles || []).map((p: ContactProfile & { contact_profile_tags?: { contact_tags: Tag }[] }) => ({
    ...p,
    tags: p.contact_profile_tags?.map((pt) => pt.contact_tags) || [],
    contact_profile_tags: undefined,
  }));
}

async function getFollowupsDue(
  userId: string, 
  daysAhead: number = 7
): Promise<ContactProfile[]> {
  console.log(`[ContactIntelligence] Getting followups due in next ${daysAhead} days`);
  const supabase = getSupabaseClient();
  
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysAhead);
  
  const { data: profiles, error } = await supabase
    .from('contact_profiles')
    .select(`
      *,
      contact_profile_tags (
        contact_tags (
          id, name, color
        )
      )
    `)
    .eq('user_id', userId)
    .not('next_followup_date', 'is', null)
    .lte('next_followup_date', endDate.toISOString())
    .order('next_followup_date', { ascending: true });
  
  if (error) throw error;
  
  return (profiles || []).map((p: ContactProfile & { contact_profile_tags?: { contact_tags: Tag }[] }) => ({
    ...p,
    tags: p.contact_profile_tags?.map((pt) => pt.contact_tags) || [],
    contact_profile_tags: undefined,
  }));
}

// Get overdue followups (today and past)
async function getOverdueFollowups(userId: string): Promise<ContactProfile[]> {
  console.log(`[ContactIntelligence] Getting overdue followups`);
  const supabase = getSupabaseClient();
  
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today
  
  const { data: profiles, error } = await supabase
    .from('contact_profiles')
    .select(`
      *,
      contact_profile_tags (
        contact_tags (
          id, name, color
        )
      )
    `)
    .eq('user_id', userId)
    .not('next_followup_date', 'is', null)
    .lte('next_followup_date', today.toISOString())
    .order('next_followup_date', { ascending: true });
  
  if (error) throw error;
  
  return (profiles || []).map((p: ContactProfile & { contact_profile_tags?: { contact_tags: Tag }[] }) => ({
    ...p,
    tags: p.contact_profile_tags?.map((pt) => pt.contact_tags) || [],
    contact_profile_tags: undefined,
  }));
}

// Snooze a followup by N days
async function snoozeFollowup(
  userId: string,
  googleContactId: string,
  days: number
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Snoozing followup for ${googleContactId} by ${days} days`);
  const supabase = getSupabaseClient();
  
  const { data: profile, error: fetchError } = await supabase
    .from('contact_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('google_contact_id', googleContactId)
    .maybeSingle();
  
  if (fetchError) throw fetchError;
  if (!profile) throw new Error('Contact profile not found');
  
  const newDate = new Date();
  newDate.setDate(newDate.getDate() + days);
  
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ next_followup_date: newDate.toISOString() })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

// Complete a followup and optionally set next one
async function completeFollowup(
  userId: string,
  googleContactId: string,
  nextFollowupDays?: number
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Completing followup for ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  const { data: profile, error: fetchError } = await supabase
    .from('contact_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('google_contact_id', googleContactId)
    .maybeSingle();
  
  if (fetchError) throw fetchError;
  if (!profile) throw new Error('Contact profile not found');
  
  let nextFollowupDate: string | null = null;
  if (nextFollowupDays && nextFollowupDays > 0) {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + nextFollowupDays);
    nextFollowupDate = newDate.toISOString();
  }
  
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ 
      next_followup_date: nextFollowupDate,
      last_contact_date: new Date().toISOString()
    })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

// Get cold contacts (Tier 1-2 not contacted in X days)
async function getColdContacts(
  userId: string,
  daysSinceContact: number = 30
): Promise<ContactProfile[]> {
  console.log(`[ContactIntelligence] Getting cold contacts (${daysSinceContact}+ days)`);
  const supabase = getSupabaseClient();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceContact);
  
  const { data: profiles, error } = await supabase
    .from('contact_profiles')
    .select(`
      *,
      contact_profile_tags (
        contact_tags (
          id, name, color
        )
      )
    `)
    .eq('user_id', userId)
    .in('tier', [1, 2])
    .or(`last_contact_date.is.null,last_contact_date.lt.${cutoffDate.toISOString()}`)
    .order('last_contact_date', { ascending: true, nullsFirst: true });
  
  if (error) throw error;
  
  return (profiles || []).map((p: ContactProfile & { contact_profile_tags?: { contact_tags: Tag }[] }) => ({
    ...p,
    tags: p.contact_profile_tags?.map((pt) => pt.contact_tags) || [],
    contact_profile_tags: undefined,
  }));
}

// Get daily briefing summary (enhanced with occasions)
async function getDailyBriefing(userId: string): Promise<{
  followupsDue: ContactProfile[];
  coldContacts: ContactProfile[];
  upcomingBirthdays: ContactProfile[];
  upcomingHolidays: Holiday[];
  upcomingAnniversaries: ContactProfile[];
  summary: {
    followupsCount: number;
    coldContactsCount: number;
    birthdaysCount: number;
    holidaysCount: number;
    anniversariesCount: number;
  };
}> {
  console.log(`[ContactIntelligence] Getting daily briefing`);
  
  const followupsDue = await getOverdueFollowups(userId);
  const coldContacts = await getColdContacts(userId, 30);
  const upcomingBirthdays = await getUpcomingBirthdays(userId, 7);
  const upcomingHolidays = await getUpcomingHolidays(userId, 7);
  const upcomingAnniversaries = await getUpcomingAnniversaries(userId, 7);
  
  return {
    followupsDue,
    coldContacts,
    upcomingBirthdays,
    upcomingHolidays,
    upcomingAnniversaries,
    summary: {
      followupsCount: followupsDue.length,
      coldContactsCount: coldContacts.length,
      birthdaysCount: upcomingBirthdays.length,
      holidaysCount: upcomingHolidays.length,
      anniversariesCount: upcomingAnniversaries.length,
    },
  };
}

// ============= Occasions Functions =============

// Get upcoming birthdays
async function getUpcomingBirthdays(
  userId: string,
  daysAhead: number = 7
): Promise<ContactProfile[]> {
  console.log(`[ContactIntelligence] Getting birthdays in next ${daysAhead} days`);
  const supabase = getSupabaseClient();
  
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Get all contacts with birthdays
  const { data: profiles, error } = await supabase
    .from('contact_profiles')
    .select(`
      *,
      contact_profile_tags (
        contact_tags (
          id, name, color
        )
      )
    `)
    .eq('user_id', userId)
    .not('birthday', 'is', null);
  
  if (error) throw error;
  
  // Filter by upcoming dates (comparing month/day)
  const upcoming = (profiles || []).filter((p: ContactProfile) => {
    if (!p.birthday) return false;
    const bday = new Date(p.birthday);
    // Create date in current year for comparison
    const thisYearBday = new Date(currentYear, bday.getMonth(), bday.getDate());
    // If already passed this year, check next year
    if (thisYearBday < today) {
      thisYearBday.setFullYear(currentYear + 1);
    }
    const daysUntil = Math.ceil((thisYearBday.getTime() - today.getTime()) / 86400000);
    return daysUntil >= 0 && daysUntil <= daysAhead;
  });
  
  return upcoming.map((p: ContactProfile & { contact_profile_tags?: { contact_tags: Tag }[] }) => ({
    ...p,
    tags: p.contact_profile_tags?.map((pt) => pt.contact_tags) || [],
    contact_profile_tags: undefined,
  }));
}

// Get upcoming holidays for user
async function getUpcomingHolidays(
  userId: string,
  daysAhead: number = 7
): Promise<Holiday[]> {
  console.log(`[ContactIntelligence] Getting holidays in next ${daysAhead} days`);
  const supabase = getSupabaseClient();
  
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Get user's observed holidays from preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('observed_holidays')
    .eq('user_id', userId)
    .maybeSingle();
  
  const observedHolidayIds = prefs?.observed_holidays || [];
  
  // Get all holidays
  const { data: holidays, error } = await supabase
    .from('holidays')
    .select('*');
  
  if (error) throw error;
  
  // Filter by upcoming dates and optionally by observed holidays
  const upcoming = (holidays || []).filter((h: Holiday) => {
    const hdate = new Date(h.holiday_date);
    // Create date in current year for comparison
    const thisYearDate = new Date(currentYear, hdate.getMonth(), hdate.getDate());
    // If already passed this year, check next year
    if (thisYearDate < today) {
      thisYearDate.setFullYear(currentYear + 1);
    }
    const daysUntil = Math.ceil((thisYearDate.getTime() - today.getTime()) / 86400000);
    const isUpcoming = daysUntil >= 0 && daysUntil <= daysAhead;
    
    // If user has set observed holidays, filter by those
    if (observedHolidayIds.length > 0) {
      return isUpcoming && observedHolidayIds.includes(h.id);
    }
    // Otherwise return global holidays
    return isUpcoming && (h.regions.includes('global') || h.type === 'international');
  });
  
  return upcoming;
}

// Get all holidays (for selection)
async function getAllHolidays(): Promise<Holiday[]> {
  console.log(`[ContactIntelligence] Getting all holidays`);
  const supabase = getSupabaseClient();
  
  const { data: holidays, error } = await supabase
    .from('holidays')
    .select('*')
    .order('name');
  
  if (error) throw error;
  return holidays || [];
}

// Get upcoming anniversaries
async function getUpcomingAnniversaries(
  userId: string,
  daysAhead: number = 7
): Promise<ContactProfile[]> {
  console.log(`[ContactIntelligence] Getting anniversaries in next ${daysAhead} days`);
  const supabase = getSupabaseClient();
  
  const today = new Date();
  const currentYear = today.getFullYear();
  
  const { data: profiles, error } = await supabase
    .from('contact_profiles')
    .select(`
      *,
      contact_profile_tags (
        contact_tags (
          id, name, color
        )
      )
    `)
    .eq('user_id', userId)
    .not('anniversary_date', 'is', null);
  
  if (error) throw error;
  
  const upcoming = (profiles || []).filter((p: ContactProfile) => {
    if (!p.anniversary_date) return false;
    const anniv = new Date(p.anniversary_date);
    const thisYearAnniv = new Date(currentYear, anniv.getMonth(), anniv.getDate());
    if (thisYearAnniv < today) {
      thisYearAnniv.setFullYear(currentYear + 1);
    }
    const daysUntil = Math.ceil((thisYearAnniv.getTime() - today.getTime()) / 86400000);
    return daysUntil >= 0 && daysUntil <= daysAhead;
  });
  
  return upcoming.map((p: ContactProfile & { contact_profile_tags?: { contact_tags: Tag }[] }) => ({
    ...p,
    tags: p.contact_profile_tags?.map((pt) => pt.contact_tags) || [],
    contact_profile_tags: undefined,
  }));
}

// Set birthday for a contact
async function setBirthday(
  userId: string,
  googleContactId: string,
  birthday: string,
  email?: string
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Setting birthday for: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  const profile = await getOrCreateProfile(userId, googleContactId, email);
  
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ birthday })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

// Set anniversary for a contact
async function setAnniversary(
  userId: string,
  googleContactId: string,
  anniversaryDate: string,
  email?: string
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Setting anniversary for: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  const profile = await getOrCreateProfile(userId, googleContactId, email);
  
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ anniversary_date: anniversaryDate })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

// Add custom date for a contact
async function addCustomDate(
  userId: string,
  googleContactId: string,
  name: string,
  date: string,
  email?: string
): Promise<ContactProfile> {
  console.log(`[ContactIntelligence] Adding custom date "${name}" for: ${googleContactId}`);
  const supabase = getSupabaseClient();
  
  const profile = await getOrCreateProfile(userId, googleContactId, email);
  
  const currentDates = (profile.custom_dates || []) as Array<{ name: string; date: string }>;
  const newDates = [...currentDates.filter(d => d.name !== name), { name, date }];
  
  const { data: updated, error } = await supabase
    .from('contact_profiles')
    .update({ custom_dates: newDates })
    .eq('id', profile.id)
    .select()
    .single();
  
  if (error) throw error;
  return updated as ContactProfile;
}

// Get outreach suggestions (combines all occasion types)
async function getOutreachSuggestions(
  userId: string,
  daysAhead: number = 7
): Promise<OutreachSuggestion[]> {
  console.log(`[ContactIntelligence] Getting outreach suggestions`);
  
  const suggestions: OutreachSuggestion[] = [];
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Get birthdays
  const birthdays = await getUpcomingBirthdays(userId, daysAhead);
  for (const contact of birthdays) {
    if (!contact.birthday) continue;
    const bday = new Date(contact.birthday);
    const thisYearBday = new Date(currentYear, bday.getMonth(), bday.getDate());
    if (thisYearBday < today) thisYearBday.setFullYear(currentYear + 1);
    const daysUntil = Math.ceil((thisYearBday.getTime() - today.getTime()) / 86400000);
    
    suggestions.push({
      type: 'birthday',
      contact,
      date: thisYearBday.toISOString().split('T')[0],
      days_until: daysUntil,
      reason: daysUntil === 0 ? `Birthday today` : `Birthday in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
    });
  }
  
  // Get anniversaries
  const anniversaries = await getUpcomingAnniversaries(userId, daysAhead);
  for (const contact of anniversaries) {
    if (!contact.anniversary_date) continue;
    const anniv = new Date(contact.anniversary_date);
    const thisYearAnniv = new Date(currentYear, anniv.getMonth(), anniv.getDate());
    if (thisYearAnniv < today) thisYearAnniv.setFullYear(currentYear + 1);
    const daysUntil = Math.ceil((thisYearAnniv.getTime() - today.getTime()) / 86400000);
    
    suggestions.push({
      type: 'anniversary',
      contact,
      date: thisYearAnniv.toISOString().split('T')[0],
      days_until: daysUntil,
      reason: daysUntil === 0 ? `Anniversary today` : `Anniversary in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
    });
  }
  
  // Get holidays
  const holidays = await getUpcomingHolidays(userId, daysAhead);
  for (const holiday of holidays) {
    const hdate = new Date(holiday.holiday_date);
    const thisYearDate = new Date(currentYear, hdate.getMonth(), hdate.getDate());
    if (thisYearDate < today) thisYearDate.setFullYear(currentYear + 1);
    const daysUntil = Math.ceil((thisYearDate.getTime() - today.getTime()) / 86400000);
    
    suggestions.push({
      type: 'holiday',
      holiday,
      date: thisYearDate.toISOString().split('T')[0],
      days_until: daysUntil,
      reason: daysUntil === 0 ? `${holiday.name} is today` : `${holiday.name} in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
    });
  }
  
  // Get cold contacts
  const coldContacts = await getColdContacts(userId, 30);
  for (const contact of coldContacts) {
    const lastContact = contact.last_contact_date ? new Date(contact.last_contact_date) : null;
    const daysSince = lastContact 
      ? Math.floor((today.getTime() - lastContact.getTime()) / 86400000)
      : null;
    
    suggestions.push({
      type: 'cold_contact',
      contact,
      date: today.toISOString().split('T')[0],
      days_until: 0,
      reason: daysSince 
        ? `Haven't contacted in ${daysSince} days (Tier ${contact.tier})`
        : `No contact history (Tier ${contact.tier})`,
    });
  }
  
  // Sort by days_until
  suggestions.sort((a, b) => a.days_until - b.days_until);
  
  return suggestions;
}

// ============= Main Handler =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, user_id, params = {} } = await req.json() as IntelligenceRequest;

    console.log(`[ContactIntelligence] Action: ${action}, User: ${user_id}`);

    if (!user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'user_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    let result: unknown;

    switch (action) {
      case 'get_contact_profile':
        if (!params.google_contact_id) {
          throw new Error('google_contact_id is required');
        }
        result = await getContactProfile(user_id, params.google_contact_id as string);
        break;

      case 'set_contact_tier':
        if (!params.google_contact_id || params.tier === undefined) {
          throw new Error('google_contact_id and tier are required');
        }
        result = await setContactTier(
          user_id, 
          params.google_contact_id as string, 
          params.tier as number,
          params.email as string | undefined
        );
        break;

      case 'add_contact_note':
        if (!params.google_contact_id || !params.note) {
          throw new Error('google_contact_id and note are required');
        }
        result = await addContactNote(
          user_id, 
          params.google_contact_id as string, 
          params.note as string,
          params.email as string | undefined
        );
        break;

      case 'set_followup':
        if (!params.google_contact_id || !params.followup_date) {
          throw new Error('google_contact_id and followup_date are required');
        }
        result = await setFollowup(
          user_id, 
          params.google_contact_id as string, 
          params.followup_date as string,
          params.email as string | undefined
        );
        break;

      case 'update_last_contact':
        if (!params.google_contact_id) {
          throw new Error('google_contact_id is required');
        }
        result = await updateLastContact(
          user_id, 
          params.google_contact_id as string,
          params.contact_date as string | undefined,
          params.email as string | undefined
        );
        break;

      case 'get_tags':
        result = await getTags(user_id);
        break;

      case 'create_tag':
        if (!params.name) {
          throw new Error('name is required');
        }
        result = await createTag(
          user_id, 
          params.name as string, 
          params.color as string | undefined
        );
        break;

      case 'add_tag_to_contact':
        if (!params.google_contact_id || !params.tag_id) {
          throw new Error('google_contact_id and tag_id are required');
        }
        result = await addTagToContact(
          user_id, 
          params.google_contact_id as string, 
          params.tag_id as string,
          params.email as string | undefined
        );
        break;

      case 'remove_tag_from_contact':
        if (!params.google_contact_id || !params.tag_id) {
          throw new Error('google_contact_id and tag_id are required');
        }
        result = await removeTagFromContact(
          user_id, 
          params.google_contact_id as string, 
          params.tag_id as string
        );
        break;

      case 'get_contacts_by_tier':
        if (params.tier === undefined) {
          throw new Error('tier is required');
        }
        result = await getContactsByTier(user_id, params.tier as number);
        break;

      case 'get_contacts_by_tag':
        if (!params.tag_id) {
          throw new Error('tag_id is required');
        }
        result = await getContactsByTag(user_id, params.tag_id as string);
        break;

      case 'get_followups_due':
        result = await getFollowupsDue(
          user_id, 
          (params.days_ahead as number) || 7
        );
        break;

      case 'get_overdue_followups':
        result = await getOverdueFollowups(user_id);
        break;

      case 'snooze_followup':
        if (!params.google_contact_id || params.days === undefined) {
          throw new Error('google_contact_id and days are required');
        }
        result = await snoozeFollowup(
          user_id,
          params.google_contact_id as string,
          params.days as number
        );
        break;

      case 'complete_followup':
        if (!params.google_contact_id) {
          throw new Error('google_contact_id is required');
        }
        result = await completeFollowup(
          user_id,
          params.google_contact_id as string,
          params.next_followup_days as number | undefined
        );
        break;

      case 'get_cold_contacts':
        result = await getColdContacts(
          user_id,
          (params.days_since_contact as number) || 30
        );
        break;

      case 'get_daily_briefing':
        result = await getDailyBriefing(user_id);
        break;

      // Occasions
      case 'get_upcoming_birthdays':
        result = await getUpcomingBirthdays(
          user_id,
          (params.days_ahead as number) || 7
        );
        break;

      case 'get_upcoming_holidays':
        result = await getUpcomingHolidays(
          user_id,
          (params.days_ahead as number) || 7
        );
        break;

      case 'get_all_holidays':
        result = await getAllHolidays();
        break;

      case 'get_upcoming_anniversaries':
        result = await getUpcomingAnniversaries(
          user_id,
          (params.days_ahead as number) || 7
        );
        break;

      case 'set_birthday':
        if (!params.google_contact_id || !params.birthday) {
          throw new Error('google_contact_id and birthday are required');
        }
        result = await setBirthday(
          user_id,
          params.google_contact_id as string,
          params.birthday as string,
          params.email as string | undefined
        );
        break;

      case 'set_anniversary':
        if (!params.google_contact_id || !params.anniversary_date) {
          throw new Error('google_contact_id and anniversary_date are required');
        }
        result = await setAnniversary(
          user_id,
          params.google_contact_id as string,
          params.anniversary_date as string,
          params.email as string | undefined
        );
        break;

      case 'add_custom_date':
        if (!params.google_contact_id || !params.name || !params.date) {
          throw new Error('google_contact_id, name, and date are required');
        }
        result = await addCustomDate(
          user_id,
          params.google_contact_id as string,
          params.name as string,
          params.date as string,
          params.email as string | undefined
        );
        break;

      case 'get_outreach_suggestions':
        result = await getOutreachSuggestions(
          user_id,
          (params.days_ahead as number) || 7
        );
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ContactIntelligence] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});