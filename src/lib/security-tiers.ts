/**
 * 5-Tier Security System
 * 
 * Tier 1 - Critical (2FA Required): Email/SMS verification code
 * Tier 2 - High Security (Security Phrase Required): User's phrase or emoji
 * Tier 3 - Confirm Action (Exact word or emoji): Must type the action word OR its emoji
 * Tier 4 - Quick Confirm (Any positive response): yes, yalla, go, sure, etc.
 * Tier 5 - No Confirmation: Just executes immediately
 * Blocked - Action is completely blocked
 */

export type SecurityTier = 1 | 2 | 3 | 4 | 5 | 'blocked';

export interface ActionSecurityConfig {
  id: string;
  name: string;
  description: string;
  defaultTier: SecurityTier;
  platform: 'gmail' | 'calendar' | 'contacts' | 'monday' | 'contact_intelligence' | 'whatsapp' | 'account';
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

// All action definitions with default tiers
export const ACTION_SECURITY_DEFAULTS: ActionSecurityConfig[] = [
  // ============ GMAIL ============
  // Tier 5 - Read operations
  { id: 'gmail.get_email', name: 'Get Email', description: 'Read a single email', defaultTier: 5, platform: 'gmail' },
  { id: 'gmail.list_emails', name: 'List Emails', description: 'List/search emails', defaultTier: 5, platform: 'gmail' },
  { id: 'gmail.search_emails', name: 'Search Emails', description: 'Search through emails', defaultTier: 5, platform: 'gmail' },
  { id: 'gmail.get_labels', name: 'Get Labels', description: 'View email labels', defaultTier: 5, platform: 'gmail' },
  { id: 'gmail.create_draft', name: 'Create Draft', description: 'Create email draft', defaultTier: 5, platform: 'gmail' },
  
  // Tier 4 - Low-risk modifications
  { id: 'gmail.mark_read', name: 'Mark Read', description: 'Mark email as read', defaultTier: 4, platform: 'gmail' },
  { id: 'gmail.mark_unread', name: 'Mark Unread', description: 'Mark email as unread', defaultTier: 4, platform: 'gmail' },
  { id: 'gmail.apply_label', name: 'Apply Label', description: 'Add label to email', defaultTier: 4, platform: 'gmail' },
  { id: 'gmail.remove_label', name: 'Remove Label', description: 'Remove label from email', defaultTier: 4, platform: 'gmail' },
  { id: 'gmail.star_email', name: 'Star Email', description: 'Star an email', defaultTier: 4, platform: 'gmail' },
  { id: 'gmail.unstar_email', name: 'Unstar Email', description: 'Remove star from email', defaultTier: 4, platform: 'gmail' },
  { id: 'gmail.update_draft', name: 'Update Draft', description: 'Modify email draft', defaultTier: 4, platform: 'gmail' },
  { id: 'gmail.send_to_self', name: 'Send to Self', description: 'Send email to yourself', defaultTier: 4, platform: 'gmail' },
  
  // Tier 3 - Destructive actions
  { id: 'gmail.delete_email', name: 'Delete Email', description: 'Move email to trash', defaultTier: 3, platform: 'gmail', tier3Keyword: 'delete', tier3Emoji: '🗑️' },
  { id: 'gmail.archive_email', name: 'Archive Email', description: 'Archive an email', defaultTier: 3, platform: 'gmail', tier3Keyword: 'archive', tier3Emoji: '📦' },
  
  // Tier 2 - External communication
  { id: 'gmail.send_external', name: 'Send External Email', description: 'Send email to external recipient', defaultTier: 2, platform: 'gmail' },
  { id: 'gmail.reply_external', name: 'Reply External', description: 'Reply to external email', defaultTier: 2, platform: 'gmail' },
  { id: 'gmail.forward_external', name: 'Forward External', description: 'Forward email externally', defaultTier: 2, platform: 'gmail' },
  
  // Blocked
  { id: 'gmail.empty_trash', name: 'Empty Trash', description: 'Permanently delete all trash', defaultTier: 'blocked', platform: 'gmail' },

  // ============ CALENDAR ============
  // Tier 5 - Read operations
  { id: 'calendar.get_event', name: 'Get Event', description: 'View calendar event', defaultTier: 5, platform: 'calendar' },
  { id: 'calendar.list_events', name: 'List Events', description: 'List calendar events', defaultTier: 5, platform: 'calendar' },
  { id: 'calendar.list_calendars', name: 'List Calendars', description: 'View available calendars', defaultTier: 5, platform: 'calendar' },
  { id: 'calendar.get_freebusy', name: 'Get Free/Busy', description: 'Check availability', defaultTier: 5, platform: 'calendar' },
  { id: 'calendar.find_slots', name: 'Find Slots', description: 'Find available time slots', defaultTier: 5, platform: 'calendar' },
  
  // Tier 4 - Self-only modifications
  { id: 'calendar.create_event_self', name: 'Create Event (Self)', description: 'Create personal event', defaultTier: 4, platform: 'calendar' },
  { id: 'calendar.update_event', name: 'Update Event', description: 'Modify event details', defaultTier: 4, platform: 'calendar' },
  { id: 'calendar.rsvp', name: 'RSVP', description: 'Respond to event invite', defaultTier: 4, platform: 'calendar' },
  
  // Tier 3 - External or destructive
  { id: 'calendar.create_event_external', name: 'Create Event (External)', description: 'Create event with external attendees', defaultTier: 3, platform: 'calendar', tier3Keyword: 'send', tier3Emoji: '📤' },
  { id: 'calendar.add_attendee', name: 'Add Attendee', description: 'Add attendee to event', defaultTier: 3, platform: 'calendar', tier3Keyword: 'send', tier3Emoji: '📤' },
  { id: 'calendar.cancel_event', name: 'Cancel Event', description: 'Cancel calendar event', defaultTier: 3, platform: 'calendar', tier3Keyword: 'cancel', tier3Emoji: '❌' },
  { id: 'calendar.delete_event', name: 'Delete Event', description: 'Delete calendar event', defaultTier: 3, platform: 'calendar', tier3Keyword: 'delete', tier3Emoji: '🗑️' },
  
  // Tier 2 - High impact
  { id: 'calendar.share_external', name: 'Share Calendar', description: 'Share calendar externally', defaultTier: 2, platform: 'calendar' },

  // ============ CONTACTS ============
  // Tier 5 - Read operations
  { id: 'contacts.get_contact', name: 'Get Contact', description: 'View contact details', defaultTier: 5, platform: 'contacts' },
  { id: 'contacts.list_contacts', name: 'List Contacts', description: 'List all contacts', defaultTier: 5, platform: 'contacts' },
  { id: 'contacts.search_contacts', name: 'Search Contacts', description: 'Search through contacts', defaultTier: 5, platform: 'contacts' },
  { id: 'contacts.create_contact', name: 'Create Contact', description: 'Add new contact', defaultTier: 5, platform: 'contacts' },
  
  // Tier 4 - Modifications
  { id: 'contacts.update_contact', name: 'Update Contact', description: 'Edit contact details', defaultTier: 4, platform: 'contacts' },
  { id: 'contacts.add_to_group', name: 'Add to Group', description: 'Add contact to group', defaultTier: 4, platform: 'contacts' },
  { id: 'contacts.remove_from_group', name: 'Remove from Group', description: 'Remove contact from group', defaultTier: 4, platform: 'contacts' },
  
  // Tier 3 - Destructive
  { id: 'contacts.delete_contact', name: 'Delete Contact', description: 'Remove contact', defaultTier: 3, platform: 'contacts', tier3Keyword: 'delete', tier3Emoji: '🗑️' },
  { id: 'contacts.merge_contacts', name: 'Merge Contacts', description: 'Merge duplicate contacts', defaultTier: 3, platform: 'contacts', tier3Keyword: 'merge', tier3Emoji: '🔗' },
  
  // Blocked
  { id: 'contacts.export_contacts', name: 'Export Contacts', description: 'Export all contacts', defaultTier: 'blocked', platform: 'contacts' },

  // ============ MONDAY.COM ============
  // Tier 5 - Read operations
  { id: 'monday.get_boards', name: 'Get Boards', description: 'List all boards', defaultTier: 5, platform: 'monday' },
  { id: 'monday.get_items', name: 'Get Items', description: 'List board items', defaultTier: 5, platform: 'monday' },
  { id: 'monday.add_comment', name: 'Add Comment', description: 'Comment on item', defaultTier: 5, platform: 'monday' },
  
  // Tier 4 - Modifications
  { id: 'monday.create_item', name: 'Create Item', description: 'Create new item', defaultTier: 4, platform: 'monday' },
  { id: 'monday.update_item', name: 'Update Item', description: 'Modify item', defaultTier: 4, platform: 'monday' },
  { id: 'monday.change_status', name: 'Change Status', description: 'Update item status', defaultTier: 4, platform: 'monday' },
  { id: 'monday.assign_item', name: 'Assign Item', description: 'Assign item to person', defaultTier: 4, platform: 'monday' },
  { id: 'monday.move_item', name: 'Move Item', description: 'Move item between groups', defaultTier: 4, platform: 'monday' },
  
  // Tier 3 - Destructive
  { id: 'monday.delete_item', name: 'Delete Item', description: 'Delete board item', defaultTier: 3, platform: 'monday', tier3Keyword: 'delete', tier3Emoji: '🗑️' },
  { id: 'monday.archive_item', name: 'Archive Item', description: 'Archive board item', defaultTier: 3, platform: 'monday', tier3Keyword: 'archive', tier3Emoji: '📦' },
  
  // Blocked
  { id: 'monday.delete_board', name: 'Delete Board', description: 'Delete entire board', defaultTier: 'blocked', platform: 'monday' },

  // ============ CONTACT INTELLIGENCE ============
  // Tier 5 - Read operations
  { id: 'intel.get_profile', name: 'Get Profile', description: 'View contact profile', defaultTier: 5, platform: 'contact_intelligence' },
  { id: 'intel.get_tags', name: 'Get Tags', description: 'View contact tags', defaultTier: 5, platform: 'contact_intelligence' },
  { id: 'intel.get_tier', name: 'Get Tier', description: 'View contact tier', defaultTier: 5, platform: 'contact_intelligence' },
  { id: 'intel.add_note', name: 'Add Note', description: 'Add note to contact', defaultTier: 5, platform: 'contact_intelligence' },
  { id: 'intel.create_tag', name: 'Create Tag', description: 'Create new tag', defaultTier: 5, platform: 'contact_intelligence' },
  
  // Tier 4 - Modifications
  { id: 'intel.set_tier', name: 'Set Tier', description: 'Change contact tier', defaultTier: 4, platform: 'contact_intelligence' },
  { id: 'intel.set_followup', name: 'Set Follow-up', description: 'Schedule follow-up', defaultTier: 4, platform: 'contact_intelligence' },
  { id: 'intel.tag_contact', name: 'Tag Contact', description: 'Apply tag to contact', defaultTier: 4, platform: 'contact_intelligence' },
  { id: 'intel.untag_contact', name: 'Untag Contact', description: 'Remove tag from contact', defaultTier: 4, platform: 'contact_intelligence' },
  
  // Tier 3 - Destructive
  { id: 'intel.delete_tag', name: 'Delete Tag', description: 'Delete a tag', defaultTier: 3, platform: 'contact_intelligence', tier3Keyword: 'delete', tier3Emoji: '🗑️' },

  // ============ WHATSAPP ============
  // Tier 5 - Read operations
  { id: 'whatsapp.get_messages', name: 'Get Messages', description: 'View messages', defaultTier: 5, platform: 'whatsapp' },
  { id: 'whatsapp.read_messages', name: 'Read Messages', description: 'Read message history', defaultTier: 5, platform: 'whatsapp' },
  
  // Tier 3 - Sending
  { id: 'whatsapp.send_message', name: 'Send Message', description: 'Send WhatsApp message', defaultTier: 3, platform: 'whatsapp', tier3Keyword: 'send', tier3Emoji: '📤' },
  { id: 'whatsapp.reply', name: 'Reply', description: 'Reply to message', defaultTier: 3, platform: 'whatsapp', tier3Keyword: 'send', tier3Emoji: '📤' },
  { id: 'whatsapp.send_template', name: 'Send Template', description: 'Send template message', defaultTier: 3, platform: 'whatsapp', tier3Keyword: 'send', tier3Emoji: '📤' },

  // ============ ACCOUNT ============
  // Tier 5 - View
  { id: 'account.view_settings', name: 'View Settings', description: 'View account settings', defaultTier: 5, platform: 'account' },
  
  // Tier 4 - Preferences
  { id: 'account.update_preferences', name: 'Update Preferences', description: 'Change preferences', defaultTier: 4, platform: 'account' },
  
  // Tier 1 - Critical
  { id: 'account.change_security_phrase', name: 'Change Security Phrase', description: 'Modify security phrase', defaultTier: 1, platform: 'account' },
  { id: 'account.disconnect_integration', name: 'Disconnect Integration', description: 'Disconnect service', defaultTier: 1, platform: 'account' },
  { id: 'account.delete_account', name: 'Delete Account', description: 'Permanently delete account', defaultTier: 1, platform: 'account' },
];

// Group actions by platform
export function getActionsByPlatform(): Record<string, ActionSecurityConfig[]> {
  const grouped: Record<string, ActionSecurityConfig[]> = {};
  for (const action of ACTION_SECURITY_DEFAULTS) {
    if (!grouped[action.platform]) {
      grouped[action.platform] = [];
    }
    grouped[action.platform].push(action);
  }
  return grouped;
}

// Get action by ID
export function getActionById(actionId: string): ActionSecurityConfig | undefined {
  return ACTION_SECURITY_DEFAULTS.find(a => a.id === actionId);
}

// Get effective tier (considering user overrides)
export function getEffectiveTier(
  actionId: string, 
  overrides: Record<string, SecurityTier> | null | undefined
): SecurityTier {
  const action = getActionById(actionId);
  if (!action) return 5; // Default to no confirmation for unknown actions
  
  if (overrides && actionId in overrides) {
    return overrides[actionId];
  }
  
  return action.defaultTier;
}

// Check if a response is a valid Tier 4 positive confirmation
export function isValidTier4Response(response: string): boolean {
  const normalized = response.toLowerCase().trim();
  return TIER_4_POSITIVE_RESPONSES.some(r => 
    normalized === r.toLowerCase() || normalized.includes(r.toLowerCase())
  );
}

// Check if a response is a valid Tier 3 confirmation for a specific action
export function isValidTier3Response(
  response: string, 
  actionId: string, 
  emojiEnabled: boolean
): boolean {
  const action = getActionById(actionId);
  if (!action?.tier3Keyword) return false;
  
  const normalized = response.toLowerCase().trim();
  const config = TIER_3_CONFIRMATIONS[action.tier3Keyword];
  if (!config) return false;
  
  // Check word match
  if (normalized === config.word || normalized.includes(config.word)) {
    return true;
  }
  
  // Check emoji match if enabled
  if (emojiEnabled && response.includes(config.emoji)) {
    return true;
  }
  
  return false;
}

// Check if a response is a valid Tier 2 security phrase confirmation
export function isValidTier2Response(
  response: string,
  phraseColor: string | null,
  phraseObject: string | null,
  phraseEmoji: string | null,
  emojiEnabled: boolean
): boolean {
  if (!phraseColor || !phraseObject) return false;
  
  const normalized = response.toLowerCase().trim();
  const expectedPhrase = `${phraseColor} ${phraseObject}`.toLowerCase();
  
  // Check phrase match
  if (normalized === expectedPhrase || normalized.includes(expectedPhrase)) {
    return true;
  }
  
  // Check emoji match if enabled
  if (emojiEnabled && phraseEmoji && response.includes(phraseEmoji)) {
    return true;
  }
  
  return false;
}

// Platform display names
export const PLATFORM_NAMES: Record<string, string> = {
  gmail: 'Gmail',
  calendar: 'Calendar',
  contacts: 'Contacts',
  monday: 'Monday.com',
  contact_intelligence: 'Contact Intelligence',
  whatsapp: 'WhatsApp',
  account: 'Account',
};

// Tier display info
export const TIER_INFO: Record<SecurityTier, { name: string; description: string; color: string }> = {
  1: { name: 'Critical (2FA)', description: 'Requires email/SMS verification code', color: 'text-red-500' },
  2: { name: 'High Security', description: 'Requires security phrase', color: 'text-orange-500' },
  3: { name: 'Confirm Action', description: 'Type action word or emoji', color: 'text-yellow-500' },
  4: { name: 'Quick Confirm', description: 'Any positive response', color: 'text-blue-500' },
  5: { name: 'No Confirmation', description: 'Executes immediately', color: 'text-green-500' },
  blocked: { name: 'Blocked', description: 'Action is disabled', color: 'text-gray-500' },
};

// Generate prompt instructions for the AI
export function generateSecurityPromptInstructions(
  overrides: Record<string, SecurityTier> | null | undefined,
  securityPhraseSet: boolean,
  emojiEnabled: boolean
): string {
  const actionsByPlatform = getActionsByPlatform();
  
  let prompt = `## Action Security Tiers

Before executing any action, check its security tier and request appropriate confirmation:

**Tier Behaviors:**
- **Tier 1 (Critical)**: Request 2FA verification code sent to email/SMS
- **Tier 2 (High Security)**: Request the user's security phrase${securityPhraseSet ? '' : ' (NOT SET - treat as Tier 3)'}
- **Tier 3 (Confirm Action)**: Request exact word OR emoji (e.g., "delete" or 🗑️)${emojiEnabled ? '' : ' (emoji disabled, word only)'}
- **Tier 4 (Quick Confirm)**: Accept any positive response (yes, ok, go, yalla, etc.)
- **Tier 5 (No Confirmation)**: Execute immediately without asking
- **Blocked**: Refuse to execute, explain action is disabled

**NEVER reveal the user's security phrase in chat.**

**Action Tiers by Platform:**
`;

  for (const [platform, actions] of Object.entries(actionsByPlatform)) {
    prompt += `\n### ${PLATFORM_NAMES[platform]}\n`;
    
    for (const action of actions) {
      const effectiveTier = getEffectiveTier(action.id, overrides);
      const tierLabel = effectiveTier === 'blocked' ? 'BLOCKED' : `Tier ${effectiveTier}`;
      const confirmInfo = action.tier3Keyword 
        ? ` (confirm: "${action.tier3Keyword}"${emojiEnabled && action.tier3Emoji ? ` or ${action.tier3Emoji}` : ''})` 
        : '';
      prompt += `- ${action.name}: ${tierLabel}${effectiveTier === 3 ? confirmInfo : ''}\n`;
    }
  }

  prompt += `
**Rate Limiting:** After 3 failed confirmation attempts, lock user out for 15 minutes.
`;

  return prompt;
}
