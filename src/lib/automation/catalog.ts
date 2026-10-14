/**
 * CRM 3.0 — Automation trigger & action catalogue.
 * Single source of truth shared by the API (validation) and the builder UI.
 */

import type { TriggerDef, ActionDef, ConfigField } from './types';
import { CONDITION_FIELDS, OPERATORS } from './conditions';

export const CHANNELS: ConfigField['options'] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
  { value: 'web', label: 'Web chat' },
];

export const LEAD_STATUSES: ConfigField['options'] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

/**
 * Triggers are grouped by area. `available` reflects whether the CRM can
 * currently detect the event. Unavailable triggers are shown but cannot be
 * activated, so the UI never pretends a feature works when it does not.
 */
export const TRIGGERS: TriggerDef[] = [
  // ── Contact ────────────────────────────────────────────────
  {
    type: 'contact_created', label: 'Contact created', category: 'contact', kind: 'event',
    description: 'Fires when a new contact is added to the CRM.',
    available: true, fields: [],
  },
  {
    type: 'contact_updated', label: 'Contact updated', category: 'contact', kind: 'event',
    description: 'Fires when a contact record changes.',
    available: true, fields: [],
  },
  {
    type: 'contact_tagged', label: 'Contact tagged', category: 'contact', kind: 'event',
    description: 'Fires when a specific tag is applied to a contact.',
    available: true,
    fields: [{ key: 'tag', label: 'Tag name', type: 'text', required: true, placeholder: 'vip' }],
  },
  {
    type: 'contact_assigned', label: 'Contact assigned', category: 'contact', kind: 'event',
    description: 'Fires when a contact is assigned to a team member.',
    available: false, fields: [],
  },

  // ── Lead ───────────────────────────────────────────────────
  {
    type: 'lead_status_changed', label: 'Lead status changed', category: 'lead', kind: 'event',
    description: 'Fires when a lead moves to a new status.',
    available: true,
    fields: [{ key: 'to', label: 'New status is', type: 'select', options: LEAD_STATUSES }],
  },
  {
    type: 'lead_score_changed', label: 'Lead score threshold', category: 'lead', kind: 'event',
    description: 'Fires when a lead score crosses a threshold.',
    available: true,
    fields: [
      { key: 'operator', label: 'Operator', type: 'select', defaultValue: 'greater_than',
        options: [
          { value: 'greater_than', label: 'Above' },
          { value: 'less_than', label: 'Below' },
        ] },
      { key: 'threshold', label: 'Score', type: 'number', required: true, defaultValue: 70, min: 0, max: 100 },
    ],
  },

  // ── Conversation ───────────────────────────────────────────
  {
    type: 'message_received', label: 'Message received', category: 'conversation', kind: 'event',
    description: 'Fires on every inbound customer message.',
    available: true,
    fields: [{ key: 'channel', label: 'Channel', type: 'select', options: CHANNELS }],
  },
  {
    type: 'first_inbound_message', label: 'First message from contact', category: 'conversation', kind: 'event',
    description: 'Fires only for the first inbound message in a conversation.',
    available: true, fields: [],
  },
  {
    type: 'keyword_match', label: 'Keyword match', category: 'conversation', kind: 'event',
    description: 'Fires when an inbound message contains one of your keywords.',
    available: true,
    fields: [
      { key: 'keywords', label: 'Keywords (comma separated)', type: 'text', required: true, placeholder: 'price, cost, buy' },
      { key: 'match', label: 'Match', type: 'select', defaultValue: 'contains',
        options: [
          { value: 'contains', label: 'Contains' },
          { value: 'exact', label: 'Exact word' },
        ] },
    ],
  },
  {
    type: 'conversation_assigned', label: 'Conversation assigned', category: 'conversation', kind: 'event',
    description: 'Fires when a conversation is assigned to an agent.',
    available: false, fields: [],
  },
  {
    type: 'conversation_unanswered', label: 'Conversation unanswered', category: 'conversation', kind: 'scheduled',
    description: 'Fires when a conversation has gone unanswered for a set time.',
    available: true,
    fields: [{ key: 'hours', label: 'Unanswered for (hours)', type: 'number', required: true, defaultValue: 24, min: 1 }],
  },

  // ── Sales ──────────────────────────────────────────────────
  {
    type: 'deal_created', label: 'Deal created', category: 'sales', kind: 'event',
    description: 'Fires when a new deal is created.',
    available: true, fields: [],
  },
  {
    type: 'deal_stage_changed', label: 'Deal stage changed', category: 'sales', kind: 'event',
    description: 'Fires when a deal enters a stage.',
    available: true, fields: [],
  },
  {
    type: 'deal_won', label: 'Deal won', category: 'sales', kind: 'event',
    description: 'Fires when a deal is marked won.',
    available: true, fields: [],
  },
  {
    type: 'deal_lost', label: 'Deal lost', category: 'sales', kind: 'event',
    description: 'Fires when a deal is marked lost.',
    available: true, fields: [],
  },

  // ── Time ───────────────────────────────────────────────────
  {
    type: 'time_based', label: 'Scheduled / recurring', category: 'time', kind: 'scheduled',
    description: 'Runs automatically on a recurring interval.',
    available: true,
    fields: [
      { key: 'every', label: 'Every', type: 'number', required: true, defaultValue: 1, min: 1 },
      { key: 'unit', label: 'Unit', type: 'select', defaultValue: 'days',
        options: [
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
          { value: 'days', label: 'Days' },
          { value: 'weeks', label: 'Weeks' },
        ] },
    ],
  },
  {
    type: 'inactivity', label: 'Contact inactive', category: 'time', kind: 'scheduled',
    description: 'Fires for contacts with no interaction for a set period.',
    available: true,
    fields: [{ key: 'days', label: 'Inactive for (days)', type: 'number', required: true, defaultValue: 30, min: 1 }],
  },
  {
    type: 'follow_up_due', label: 'Follow-up due', category: 'time', kind: 'scheduled',
    description: 'Fires when a follow-up task becomes due.',
    available: true, fields: [],
  },

  // ── Integration ────────────────────────────────────────────
  {
    type: 'webhook_received', label: 'Inbound webhook', category: 'integration', kind: 'event',
    description: 'Fires when an external system posts to your automation webhook.',
    available: true, fields: [],
  },
  {
    type: 'form_submitted', label: 'Form submitted', category: 'integration', kind: 'event',
    description: 'Fires when a connected form is submitted (requires form integration).',
    available: false, fields: [],
  },
];

export const ACTIONS: ActionDef[] = [
  {
    type: 'send_message', label: 'Send message', color: '#4d7cff', icon: 'MessageSquare',
    description: 'Send a message to the contact on a chosen channel.',
    needsContact: true,
    fields: [
      { key: 'channel', label: 'Channel', type: 'channel', required: true, options: CHANNELS, defaultValue: 'whatsapp' },
      { key: 'message', label: 'Message', type: 'textarea', required: true,
        placeholder: 'Hi {{contact.first_name}}, thanks for reaching out!',
        help: 'Use variables like {{contact.first_name}}.' },
      { key: 'template_name', label: 'WhatsApp template name (optional)', type: 'text',
        help: 'Required by WhatsApp policy for messages outside the 24h window.' },
    ],
  },
  {
    type: 'send_welcome_message', label: 'Send welcome message', color: '#8b5cf6', icon: 'Heart',
    description: 'Send a one-time welcome message. Duplicate sends are prevented.',
    needsContact: true,
    fields: [
      { key: 'channel', label: 'Channel', type: 'channel', required: true, options: CHANNELS, defaultValue: 'whatsapp' },
      { key: 'message', label: 'Welcome message', type: 'textarea', required: true,
        placeholder: 'Welcome {{contact.first_name}}! How can we help?' },
    ],
  },
  {
    type: 'send_list', label: 'Send list', color: '#28d7df', icon: 'List',
    description: 'Send an interactive list (WhatsApp only).',
    needsContact: true,
    fields: [
      { key: 'channel', label: 'Channel', type: 'channel', required: true, options: CHANNELS, defaultValue: 'whatsapp' },
      { key: 'header', label: 'Header', type: 'text' },
      { key: 'message', label: 'Body', type: 'textarea', required: true, placeholder: 'Choose an option below' },
      { key: 'button', label: 'Menu button label', type: 'text', defaultValue: 'Options' },
      { key: 'items', label: 'List items (one per line)', type: 'textarea', required: true,
        placeholder: 'Pricing\nDemo\nSupport' },
    ],
  },
  {
    type: 'add_tag', label: 'Add tag', color: '#28c99a', icon: 'Tag',
    description: 'Add a tag to the contact.',
    needsContact: true,
    fields: [
      { key: 'tag', label: 'Tag', type: 'text', required: true, placeholder: 'vip' },
    ],
  },
  {
    type: 'remove_tag', label: 'Remove tag', color: '#f46b72', icon: 'TagOff',
    description: 'Remove a tag from the contact.',
    needsContact: true,
    fields: [
      { key: 'tag', label: 'Tag', type: 'text', required: true, placeholder: 'vip' },
    ],
  },
  {
    type: 'assign_contact', label: 'Assign contact', color: '#4f6df5', icon: 'UserPlus',
    description: 'Assign the contact to a team member.',
    needsContact: true,
    fields: [
      { key: 'assignee_id', label: 'Assign to', type: 'select', required: true, options: [] },
    ],
  },
  {
    type: 'update_lead_status', label: 'Update lead status', color: '#f4c95d', icon: 'TrendingUp',
    description: 'Move the lead to a new status.',
    needsContact: true,
    fields: [
      { key: 'status', label: 'New status', type: 'select', required: true, options: LEAD_STATUSES },
    ],
  },
  {
    type: 'create_follow_up', label: 'Create follow-up', color: '#ffb99c', icon: 'CalendarPlus',
    description: 'Create a follow-up task for the contact.',
    needsContact: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, defaultValue: 'Follow up with contact' },
      { key: 'days', label: 'Due in (days)', type: 'number', required: true, defaultValue: 1, min: 0 },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    type: 'add_note', label: 'Add note', color: '#ec78b5', icon: 'StickyNote',
    description: 'Add an internal note to the contact.',
    needsContact: true,
    fields: [
      { key: 'note', label: 'Note', type: 'textarea', required: true,
        placeholder: 'Note about {{contact.name}}' },
    ],
  },
  {
    type: 'wait', label: 'Wait / delay', color: '#8790aa', icon: 'Clock',
    description: 'Pause the workflow for a duration, then continue.',
    needsContact: false,
    fields: [
      { key: 'amount', label: 'Wait', type: 'number', required: true, defaultValue: 1, min: 1 },
      { key: 'unit', label: 'Unit', type: 'select', defaultValue: 'hours',
        options: [
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
          { value: 'days', label: 'Days' },
        ] },
    ],
  },
  {
    type: 'webhook', label: 'Call webhook', color: '#5d6682', icon: 'Webhook',
    description: 'Send an outbound HTTP request to an external URL.',
    needsContact: false,
    fields: [
      { key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://example.com/hook' },
      { key: 'method', label: 'Method', type: 'select', defaultValue: 'POST',
        options: [
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'PATCH', label: 'PATCH' },
        ] },
    ],
  },
  {
    type: 'end_workflow', label: 'End workflow', color: '#101936', icon: 'Flag',
    description: 'Stop the workflow here.',
    needsContact: false, fields: [],
  },
];

export function getTrigger(type: string): TriggerDef | undefined {
  return TRIGGERS.find((t) => t.type === type);
}
export function getAction(type: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.type === type);
}

export function actionNeedsContact(type: string): boolean {
  return getAction(type)?.needsContact ?? true;
}

export const TRIGGER_CATEGORY_LABELS: Record<string, string> = {
  contact: 'Contacts',
  lead: 'Leads',
  conversation: 'Conversations',
  sales: 'Sales',
  time: 'Timing',
  integration: 'Integrations',
};

export { CONDITION_FIELDS, OPERATORS };
