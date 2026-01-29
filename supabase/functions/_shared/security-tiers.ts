/**
 * 5-Tier Security System for Edge Functions
 * 
 * This is the server-side validation of security tiers
 */

export type SecurityTier = 1 | 2 | 3 | 4 | 5 | 'blocked';

export interface ActionSecurityConfig {
  id: string;
  defaultTier: SecurityTier;
  tier3Keyword?: string;
  tier3Emoji?: string;
}

// Tier 3 confirmation mappings
export const TIER_3_CONFIRMATIONS: Record<string, { word: string; emoji: string }> = {
  delete: { word: 'delete', emoji: '🗑️' },
  archive: { word: 'archive', emoji: '📦' },
  cancel: { word: 'cancel', emoji: '❌' },
  send: { word: 'send', emoji: '📤' },
  merge: { word: 'merge', emoji: '🔗' },
  remove: { word: 'remove', emoji: '➖' },
};

// Tier 4 positive responses - case insensitive
export const TIER_4_POSITIVE_RESPONSES = [
  'yes', 'yep', 'yeah', 'yup', 'ya', 'y',
  'ok', 'okay', 'k', 'kk',
  'sure', 'surely',
  'go', 'go ahead', 'go for it',
  'do it', 'proceed',
  'confirmed', 'confirm',
  'approved', 'approve',
  'yalla', 'let\'s go', 'lets go',
  'affirmative', 'aye',
  'absolutely', 'definitely',
  'please', 'pls',
  '👍', '✅', '👌',
];

// Default tier mappings - action_id to default tier
export const ACTION_DEFAULTS: Record<string, { tier: SecurityTier; keyword?: string; emoji?: string }> = {
  // Gmail
  'gmail.get_email': { tier: 5 },
  'gmail.list_emails': { tier: 5 },
  'gmail.search_emails': { tier: 5 },
  'gmail.get_labels': { tier: 5 },
  'gmail.create_draft': { tier: 5 },
  'gmail.mark_read': { tier: 4 },
  'gmail.mark_unread': { tier: 4 },
  'gmail.apply_label': { tier: 4 },
  'gmail.remove_label': { tier: 4 },
  'gmail.star_email': { tier: 4 },
  'gmail.unstar_email': { tier: 4 },
  'gmail.update_draft': { tier: 4 },
  'gmail.send_to_self': { tier: 4 },
  'gmail.delete_email': { tier: 3, keyword: 'delete', emoji: '🗑️' },
  'gmail.archive_email': { tier: 3, keyword: 'archive', emoji: '📦' },
  'gmail.send_external': { tier: 2 },
  'gmail.reply_external': { tier: 2 },
  'gmail.forward_external': { tier: 2 },
  'gmail.empty_trash': { tier: 'blocked' },
  
  // Calendar
  'calendar.get_event': { tier: 5 },
  'calendar.list_events': { tier: 5 },
  'calendar.list_calendars': { tier: 5 },
  'calendar.get_freebusy': { tier: 5 },
  'calendar.find_slots': { tier: 5 },
  'calendar.create_event_self': { tier: 4 },
  'calendar.update_event': { tier: 4 },
  'calendar.rsvp': { tier: 4 },
  'calendar.create_event_external': { tier: 3, keyword: 'send', emoji: '📤' },
  'calendar.add_attendee': { tier: 3, keyword: 'send', emoji: '📤' },
  'calendar.cancel_event': { tier: 3, keyword: 'cancel', emoji: '❌' },
  'calendar.delete_event': { tier: 3, keyword: 'delete', emoji: '🗑️' },
  'calendar.share_external': { tier: 2 },
  
  // Contacts
  'contacts.get_contact': { tier: 5 },
  'contacts.list_contacts': { tier: 5 },
  'contacts.search_contacts': { tier: 5 },
  'contacts.create_contact': { tier: 5 },
  'contacts.update_contact': { tier: 4 },
  'contacts.add_to_group': { tier: 4 },
  'contacts.remove_from_group': { tier: 4 },
  'contacts.delete_contact': { tier: 3, keyword: 'delete', emoji: '🗑️' },
  'contacts.merge_contacts': { tier: 3, keyword: 'merge', emoji: '🔗' },
  'contacts.export_contacts': { tier: 'blocked' },
  
  // Monday
  'monday.get_boards': { tier: 5 },
  'monday.get_items': { tier: 5 },
  'monday.add_comment': { tier: 5 },
  'monday.create_item': { tier: 4 },
  'monday.update_item': { tier: 4 },
  'monday.change_status': { tier: 4 },
  'monday.assign_item': { tier: 4 },
  'monday.move_item': { tier: 4 },
  'monday.delete_item': { tier: 3, keyword: 'delete', emoji: '🗑️' },
  'monday.archive_item': { tier: 3, keyword: 'archive', emoji: '📦' },
  'monday.delete_board': { tier: 'blocked' },
  
  // Contact Intelligence
  'intel.get_profile': { tier: 5 },
  'intel.get_tags': { tier: 5 },
  'intel.get_tier': { tier: 5 },
  'intel.add_note': { tier: 5 },
  'intel.create_tag': { tier: 5 },
  'intel.set_tier': { tier: 4 },
  'intel.set_followup': { tier: 4 },
  'intel.tag_contact': { tier: 4 },
  'intel.untag_contact': { tier: 4 },
  'intel.delete_tag': { tier: 3, keyword: 'delete', emoji: '🗑️' },
  
  // WhatsApp
  'whatsapp.get_messages': { tier: 5 },
  'whatsapp.read_messages': { tier: 5 },
  'whatsapp.send_message': { tier: 3, keyword: 'send', emoji: '📤' },
  'whatsapp.reply': { tier: 3, keyword: 'send', emoji: '📤' },
  'whatsapp.send_template': { tier: 3, keyword: 'send', emoji: '📤' },
  
  // Account
  'account.view_settings': { tier: 5 },
  'account.update_preferences': { tier: 4 },
  'account.change_security_phrase': { tier: 1 },
  'account.disconnect_integration': { tier: 1 },
  'account.delete_account': { tier: 1 },
};

// Get effective tier considering user overrides
export function getEffectiveTier(
  actionId: string, 
  overrides: Record<string, SecurityTier> | null | undefined
): SecurityTier {
  if (overrides && actionId in overrides) {
    return overrides[actionId];
  }
  return ACTION_DEFAULTS[actionId]?.tier ?? 5;
}

// Check if response is valid Tier 4 confirmation
export function isValidTier4Response(response: string): boolean {
  const normalized = response.toLowerCase().trim();
  return TIER_4_POSITIVE_RESPONSES.some(r => 
    normalized === r.toLowerCase() || normalized.includes(r.toLowerCase())
  );
}

// Check if response is valid Tier 3 confirmation
export function isValidTier3Response(
  response: string, 
  actionId: string, 
  emojiEnabled: boolean
): boolean {
  const actionConfig = ACTION_DEFAULTS[actionId];
  if (!actionConfig?.keyword) return false;
  
  const normalized = response.toLowerCase().trim();
  const config = TIER_3_CONFIRMATIONS[actionConfig.keyword];
  if (!config) return false;
  
  if (normalized === config.word || normalized.includes(config.word)) {
    return true;
  }
  
  if (emojiEnabled && response.includes(config.emoji)) {
    return true;
  }
  
  return false;
}

// Check if response is valid Tier 2 security phrase
// Handles compound emojis with ZWJ (Zero-Width Joiner) via Unicode normalization
export function isValidTier2Response(
  response: string,
  phraseColor: string | null,
  phraseObject: string | null,
  phraseEmoji: string | null,
  emojiEnabled: boolean
): boolean {
  if (!phraseColor || !phraseObject) return false;
  
  // Normalize Unicode for compound emoji support (ZWJ sequences like 🐈‍⬛)
  const normalizedResponse = response.trim().normalize('NFC');
  const phraseText = `${phraseColor} ${phraseObject}`;
  const phraseTextLower = phraseText.toLowerCase();
  
  // Debug logging for emoji comparison
  if (phraseEmoji) {
    console.log('[Security] Response bytes:', [...normalizedResponse].map(c => c.codePointAt(0)));
    console.log('[Security] Emoji bytes:', [...phraseEmoji.normalize('NFC')].map(c => c.codePointAt(0)));
    console.log('[Security] Phrase text:', phraseTextLower);
  }
  
  // Check 1: Text-only match (case-insensitive) - e.g., "black cat"
  if (normalizedResponse.toLowerCase() === phraseTextLower) {
    console.log('[Security] ✓ Text-only match');
    return true;
  }
  
  // Check 2: Emoji-only match (if enabled)
  if (emojiEnabled && phraseEmoji) {
    const emojiNormalized = phraseEmoji.normalize('NFC');
    if (normalizedResponse === emojiNormalized) {
      console.log('[Security] ✓ Emoji-only match');
      return true;
    }
  }
  
  // Check 3: Full phrase with emoji - e.g., "black cat 🐈‍⬛"
  if (emojiEnabled && phraseEmoji) {
    const emojiNormalized = phraseEmoji.normalize('NFC');
    const fullPhrase = `${phraseTextLower} ${emojiNormalized}`;
    const fullPhraseAlt = `${emojiNormalized} ${phraseTextLower}`; // emoji first
    const respLower = normalizedResponse.toLowerCase();
    
    if (respLower === fullPhrase || respLower === fullPhraseAlt) {
      console.log('[Security] ✓ Full phrase match');
      return true;
    }
    
    // Check if response contains the emoji (handles partial matches)
    if (normalizedResponse.includes(emojiNormalized) && respLower.includes(phraseTextLower)) {
      console.log('[Security] ✓ Contains both text and emoji');
      return true;
    }
  }
  
  // Check 4: Loose text inclusion (fallback for partial input)
  if (normalizedResponse.toLowerCase().includes(phraseTextLower)) {
    console.log('[Security] ✓ Text inclusion match');
    return true;
  }
  
  console.log('[Security] ✗ No match found');
  return false;
}

// Get action info for prompts
export function getActionInfo(actionId: string): { keyword?: string; emoji?: string } | null {
  return ACTION_DEFAULTS[actionId] || null;
}

// Rate limiting constants
export const RATE_LIMIT = {
  MAX_FAILED_ATTEMPTS: 3,
  LOCKOUT_MINUTES: 15,
};

// Check if user is locked out
export function isLockedOut(lockoutUntil: string | null): boolean {
  if (!lockoutUntil) return false;
  return new Date(lockoutUntil) > new Date();
}

// Calculate lockout end time
export function getLockoutEndTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + RATE_LIMIT.LOCKOUT_MINUTES);
  return now.toISOString();
}
