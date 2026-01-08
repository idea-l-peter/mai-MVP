/**
 * Tool to Action ID mapping for security tier enforcement
 * Maps AI tool names to their corresponding security action IDs
 */

export const TOOL_TO_ACTION_MAP: Record<string, string> = {
  // Gmail
  get_emails: 'gmail.list_emails',
  send_email: 'gmail.send_external',
  delete_email: 'gmail.delete_email',
  archive_email: 'gmail.archive_email',
  create_draft: 'gmail.create_draft',
  update_draft: 'gmail.update_draft',
  mark_email_read: 'gmail.mark_read',
  mark_email_unread: 'gmail.mark_unread',
  reply_to_email: 'gmail.reply_external',
  forward_email: 'gmail.forward_external',
  get_labels: 'gmail.get_labels',
  apply_label: 'gmail.apply_label',
  remove_label: 'gmail.remove_label',
  
  // Calendar
  get_calendar_events: 'calendar.list_events',
  create_calendar_event: 'calendar.create_event_self', // Will be upgraded to external if has attendees
  update_calendar_event: 'calendar.update_event',
  delete_calendar_event: 'calendar.delete_event',
  get_calendars: 'calendar.list_calendars',
  get_free_busy: 'calendar.get_freebusy',
  find_available_slots: 'calendar.find_slots',
  create_event_on_calendar: 'calendar.create_event_self',
  rsvp_to_event: 'calendar.rsvp',
  get_event_attendees: 'calendar.get_event',
  create_recurring_event: 'calendar.create_event_self',
  update_single_occurrence: 'calendar.update_event',
  
  // Contacts
  get_contacts: 'contacts.list_contacts',
  search_contacts: 'contacts.search_contacts',
  get_contact: 'contacts.get_contact',
  create_contact: 'contacts.create_contact',
  update_contact: 'contacts.update_contact',
  delete_contact: 'contacts.delete_contact',
  get_contact_groups: 'contacts.list_contacts',
  add_contact_to_group: 'contacts.add_to_group',
  remove_contact_from_group: 'contacts.remove_from_group',
  
  // Monday.com
  monday_get_boards: 'monday.get_boards',
  monday_get_board: 'monday.get_boards',
  monday_get_items: 'monday.get_items',
  monday_get_item: 'monday.get_items',
  monday_search_items: 'monday.get_items',
  monday_get_me: 'monday.get_boards',
  monday_create_item: 'monday.create_item',
  monday_update_item: 'monday.update_item',
  monday_delete_item: 'monday.delete_item',
  monday_archive_item: 'monday.archive_item',
  monday_move_item: 'monday.move_item',
  monday_add_update: 'monday.add_comment',
  monday_change_column_value: 'monday.change_status',
  monday_get_columns: 'monday.get_boards',
  
  // Contact Intelligence
  get_contact_profile: 'intel.get_profile',
  update_contact_profile: 'intel.set_tier',
  get_contact_tags: 'intel.get_tags',
  create_contact_tag: 'intel.create_tag',
  tag_contact: 'intel.tag_contact',
  untag_contact: 'intel.untag_contact',
  delete_contact_tag: 'intel.delete_tag',
  
  // User Preferences
  get_user_preferences: 'account.view_settings',
};

// Actions that are always blocked
export const BLOCKED_ACTIONS = [
  'gmail.empty_trash',
  'contacts.export_contacts',
  'monday.delete_board',
];

// Check if action involves external recipients (upgrades tier)
export function checkExternalRecipients(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName === 'send_email' || toolName === 'reply_to_email' || toolName === 'forward_email') {
    // Check if sending to external email
    const to = args.to as string;
    // If there's a recipient, it's considered external unless it's sending to self
    return !!to;
  }
  
  if (toolName === 'create_calendar_event' || toolName === 'create_event_on_calendar' || toolName === 'create_recurring_event') {
    // Check if event has external attendees
    const attendees = args.attendees as string[] | undefined;
    return !!(attendees && attendees.length > 0);
  }
  
  return false;
}

// Get adjusted action ID based on context
export function getAdjustedActionId(toolName: string, args: Record<string, unknown>): string {
  const baseAction = TOOL_TO_ACTION_MAP[toolName];
  if (!baseAction) return 'unknown';
  
  // Upgrade calendar events to external tier if they have attendees
  if (toolName === 'create_calendar_event' || toolName === 'create_event_on_calendar' || toolName === 'create_recurring_event') {
    const attendees = args.attendees as string[] | undefined;
    if (attendees && attendees.length > 0) {
      return 'calendar.create_event_external';
    }
  }
  
  return baseAction;
}
