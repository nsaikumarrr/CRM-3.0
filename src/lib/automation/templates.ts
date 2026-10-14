/**
 * CRM 3.0 — Built-in automation templates.
 * Starter workflows that use only available triggers and real actions.
 */

import type { WorkflowStep } from './types';

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: 'lead_nurture' | 'sales' | 'support' | 'onboarding' | 'retention' | 'ai_powered' | 'general';
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
  ai_nodes: unknown[];
  tags: string[];
  is_builtin: boolean;
}

function step(step_type: string, position: number, config: Record<string, unknown> = {}): WorkflowStep {
  return { step_type, position, config };
}

export const BUILTIN_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'tpl-welcome',
    name: 'Welcome new contacts',
    description: 'Greet every new contact and check in the next day.',
    category: 'onboarding',
    trigger_type: 'contact_created',
    trigger_config: {},
    steps: [
      step('send_welcome_message', 0, { channel: 'whatsapp', message: 'Hi {{contact.first_name}}! Welcome — how can we help you today?' }),
      step('wait', 1, { amount: 1, unit: 'days' }),
      step('send_message', 2, { channel: 'whatsapp', message: 'Just checking in, {{contact.first_name}}. Any questions we can answer?' }),
    ],
    ai_nodes: [],
    tags: ['welcome', 'onboarding'],
    is_builtin: true,
  },
  {
    id: 'tpl-hot-lead',
    name: 'Hot lead follow-up',
    description: 'When a lead score crosses 70, tag and create a follow-up task.',
    category: 'ai_powered',
    trigger_type: 'lead_score_changed',
    trigger_config: { operator: 'greater_than', threshold: 70 },
    steps: [
      step('add_tag', 0, { tag: 'hot-lead' }),
      step('create_follow_up', 1, { title: 'Call hot lead', days: 0, notes: 'Lead score crossed 70.' }),
    ],
    ai_nodes: [],
    tags: ['ai', 'lead', 'hot'],
    is_builtin: true,
  },
  {
    id: 'tpl-pricing',
    name: 'Pricing keyword auto-reply',
    description: 'Reply instantly when a message mentions pricing.',
    category: 'sales',
    trigger_type: 'keyword_match',
    trigger_config: { keywords: 'price, pricing, cost, how much', match: 'contains' },
    steps: [
      step('send_message', 0, { channel: 'whatsapp', message: 'Thanks for your interest, {{contact.first_name}}! Our pricing starts at $29/mo — happy to send details.' }),
      step('add_tag', 1, { tag: 'pricing-interest' }),
    ],
    ai_nodes: [],
    tags: ['pricing', 'sales', 'auto-reply'],
    is_builtin: true,
  },
  {
    id: 'tpl-first-message',
    name: 'First message welcome',
    description: 'Send a one-time intro the first time a contact messages you.',
    category: 'onboarding',
    trigger_type: 'first_inbound_message',
    trigger_config: {},
    steps: [
      step('send_welcome_message', 0, { channel: 'whatsapp', message: 'Welcome {{contact.first_name}}! Thanks for reaching out.' }),
      step('add_tag', 1, { tag: 'engaged' }),
    ],
    ai_nodes: [],
    tags: ['welcome', 'first-message'],
    is_builtin: true,
  },
  {
    id: 'tpl-deal-won',
    name: 'Deal won thank-you',
    description: 'When a deal is won, update the lead and thank the customer.',
    category: 'sales',
    trigger_type: 'deal_won',
    trigger_config: {},
    steps: [
      step('update_lead_status', 0, { status: 'won' }),
      step('send_message', 1, { channel: 'whatsapp', message: 'Thank you for choosing us, {{contact.first_name}}! We are excited to work together.' }),
    ],
    ai_nodes: [],
    tags: ['deal', 'won', 'sales'],
    is_builtin: true,
  },
  {
    id: 'tpl-reengage',
    name: 'Re-engage inactive contacts',
    description: 'Win back contacts with no interaction for 30 days.',
    category: 'retention',
    trigger_type: 'inactivity',
    trigger_config: { days: 30 },
    steps: [
      step('add_tag', 0, { tag: 're-engagement' }),
      step('send_message', 1, { channel: 'whatsapp', message: 'Hi {{contact.first_name}}, it has been a while! Is there anything we can help with?' }),
    ],
    ai_nodes: [],
    tags: ['retention', 'inactive'],
    is_builtin: true,
  },
  {
    id: 'tpl-followup-due',
    name: 'Follow-up due alert',
    description: 'Tag contacts when a follow-up task becomes due.',
    category: 'general',
    trigger_type: 'follow_up_due',
    trigger_config: {},
    steps: [
      step('add_tag', 0, { tag: 'follow-up-due' }),
    ],
    ai_nodes: [],
    tags: ['follow-up', 'task'],
    is_builtin: true,
  },
  {
    id: 'tpl-unanswered',
    name: 'Escalate unanswered conversations',
    description: 'Assign and note conversations left unanswered.',
    category: 'support',
    trigger_type: 'conversation_unanswered',
    trigger_config: { hours: 24 },
    steps: [
      step('add_note', 0, { note: 'Conversation unanswered for 24h — automation escalation.' }),
    ],
    ai_nodes: [],
    tags: ['support', 'sla', 'escalation'],
    is_builtin: true,
  },
];

export function getBuiltinTemplate(id: string): AutomationTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
