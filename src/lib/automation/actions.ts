/**
 * CRM 3.0 — Automation action handlers.
 *
 * Every handler performs a real, account-scoped CRM operation. Failures are
 * surfaced (never swallowed) so the engine can record an accurate step log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutionContext, WorkflowStep } from './types';
import { interpolate } from './template';
import { isSafeWebhookUrl } from './validation';
import { sendProviderMessage, type Channel } from './messaging';

export interface StepResult {
  status: 'completed' | 'failed' | 'skipped';
  detail: string;
  /** Set when the workflow must pause (durable scheduling handled by engine). */
  waitMs?: number;
  /** Set when the workflow should terminate after this step. */
  end?: boolean;
}

type Db = SupabaseClient;

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function templateCtx(ctx: ExecutionContext) {
  return {
    contact: ctx.contact ?? null,
    account: (ctx.trigger_data?.account as Record<string, unknown>) ?? null,
    conversation: ctx.conversation ?? null,
    deal: ctx.deal ?? null,
    trigger: ctx.trigger_data,
  };
}

async function loadContactTags(db: Db, accountId: string, contactId: string): Promise<string[]> {
  const { data } = await db
    .from('contacts')
    .select('tags')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .single();
  const tags = (data?.tags as string[] | null) ?? [];
  return Array.isArray(tags) ? tags : [];
}

async function findConversation(db: Db, accountId: string, contactId: string) {
  const { data } = await db
    .from('conversations')
    .select('id, platform, status, contact_id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; platform: string | null; status: string } | null;
}

/** Insert an outbound message, tolerating the `content`/`content_text` divergence. */
async function persistMessage(
  db: Db,
  accountId: string,
  conversationId: string,
  text: string,
  contentType: 'text' | 'template' | 'interactive'
): Promise<{ ok: boolean; error?: string }> {
  const base = {
    account_id: accountId,
    conversation_id: conversationId,
    sender_type: 'bot',
    content_type: contentType,
    status: 'pending',
    metadata: { source: 'automation' },
  };
  const first = await db.from('messages').insert({ ...base, content: text }).select('id').single();
  if (!first.error) return { ok: true };
  const second = await db.from('messages').insert({ ...base, content_text: text }).select('id').single();
  if (!second.error) return { ok: true };
  return { ok: false, error: second.error.message };
}

function resolveRecipient(channel: Channel, contact: Record<string, unknown> | null | undefined): string | null {
  if (!contact) return null;
  switch (channel) {
    case 'whatsapp': return asString(contact.phone) || null;
    case 'email': return asString(contact.email) || null;
    case 'telegram': return asString(contact.telegram_chat_id) || null;
    case 'instagram': return asString(contact.instagram_user_id) || null;
    default: return asString(contact.phone) || asString(contact.email) || null;
  }
}

async function handleSend(
  db: Db,
  accountId: string,
  contactId: string,
  cfg: Record<string, unknown>,
  ctx: ExecutionContext,
  kind: 'text' | 'list'
): Promise<StepResult> {
  const channel = (asString(cfg.channel) || 'whatsapp') as Channel;
  const qctx = templateCtx(ctx);
  const text = interpolate(asString(cfg.message), qctx).trim();
  if (!text) return { status: 'failed', detail: 'Message body is empty after templating.' };

  const conversation = await findConversation(db, accountId, contactId);
  if (!conversation) {
    return { status: 'failed', detail: 'No conversation exists for this contact — cannot send a message.' };
  }

  const list = kind === 'list'
    ? {
        header: interpolate(asString(cfg.header), qctx) || undefined,
        button: asString(cfg.button) || 'Options',
        items: asString(cfg.items).split('\n').map((s) => s.trim()).filter(Boolean),
      }
    : null;

  if (list && list.items.length === 0) {
    return { status: 'failed', detail: 'Interactive list has no items.' };
  }

  const persisted = await persistMessage(db, accountId, conversation.id, text, list ? 'interactive' : 'text');
  if (!persisted.ok) return { status: 'failed', detail: `Could not store message: ${persisted.error}` };

  const recipient = resolveRecipient(channel, ctx.contact);
  const result = await sendProviderMessage({
    channel,
    to: recipient,
    text,
    templateName: asString(cfg.template_name) || null,
    list,
  });

  if (result.delivered) {
    return { status: 'completed', detail: `Message sent via ${channel}${result.providerId ? ` (id ${result.providerId})` : ''}.` };
  }
  if (result.queued) {
    return { status: 'completed', detail: `Message stored and queued for ${channel} delivery${result.reason ? ` — ${result.reason}` : ''}.` };
  }
  return { status: 'failed', detail: `Provider rejected the ${channel} message${result.reason ? `: ${result.reason}` : ''}.` };
}

/**
 * Execute a single action step. Conditions are handled by the engine.
 */
export async function executeAction(
  db: Db,
  accountId: string,
  step: WorkflowStep,
  ctx: ExecutionContext
): Promise<StepResult> {
  const cfg = (step.config ?? {}) as Record<string, unknown>;
  const contactId = ctx.contact_id;
  const qctx = templateCtx(ctx);

  switch (step.step_type) {
    case 'send_message':
      if (!contactId) return { status: 'failed', detail: 'No contact in context.' };
      return handleSend(db, accountId, contactId, cfg, ctx, 'text');

    case 'send_welcome_message': {
      if (!contactId) return { status: 'failed', detail: 'No contact in context.' };
      // Idempotency: a unique event_key guarantees one welcome per automation+contact.
      const eventKey = `welcome:${step.id ?? 'step'}:${contactId}`;
      const claim = await db.from('crm3_automation_events').insert({
        account_id: accountId,
        event_key: eventKey,
        event_type: 'welcome_guard',
        automation_id: ctx.trigger_data?.automation_id ?? null,
        contact_id: contactId,
        payload: {},
        status: 'completed',
      });
      if (claim.error && /duplicate|unique/i.test(claim.error.message)) {
        return { status: 'skipped', detail: 'Welcome message already sent to this contact.' };
      }
      return handleSend(db, accountId, contactId, cfg, ctx, 'text');
    }

    case 'send_list':
      if (!contactId) return { status: 'failed', detail: 'No contact in context.' };
      return handleSend(db, accountId, contactId, cfg, ctx, 'list');

    case 'add_tag': {
      if (!contactId) return { status: 'failed', detail: 'No contact in context.' };
      const tag = asString(cfg.tag).trim();
      if (!tag) return { status: 'failed', detail: 'No tag specified.' };
      const tags = await loadContactTags(db, accountId, contactId);
      if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        return { status: 'skipped', detail: `Tag "${tag}" already present.` };
      }
      const { error } = await db.from('contacts').update({ tags: [...tags, tag], updated_at: new Date().toISOString() })
        .eq('id', contactId).eq('account_id', accountId);
      return error ? { status: 'failed', detail: error.message } : { status: 'completed', detail: `Tag "${tag}" added.` };
    }

    case 'remove_tag': {
      if (!contactId) return { status: 'failed', detail: 'No contact in context.' };
      const tag = asString(cfg.tag).trim();
      if (!tag) return { status: 'failed', detail: 'No tag specified.' };
      const tags = await loadContactTags(db, accountId, contactId);
      const next = tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      if (next.length === tags.length) return { status: 'skipped', detail: `Tag "${tag}" was not present.` };
      const { error } = await db.from('contacts').update({ tags: next, updated_at: new Date().toISOString() })
        .eq('id', contactId).eq('account_id', accountId);
      return error ? { status: 'failed', detail: error.message } : { status: 'completed', detail: `Tag "${tag}" removed.` };
    }

    case 'assign_contact': {
      if (!contactId) return { status: 'failed', detail: 'No contact in context.' };
      const assignee = asString(cfg.assignee_id).trim();
      if (!assignee) return { status: 'failed', detail: 'No assignee specified.' };
      const { error } = await db.from('conversations')
        .update({ assigned_agent_id: assignee, updated_at: new Date().toISOString() })
        .eq('account_id', accountId).eq('contact_id', contactId);
      return error ? { status: 'failed', detail: error.message } : { status: 'completed', detail: 'Conversation assigned.' };
    }

    case 'update_lead_status': {
      if (!contactId) return { status: 'failed', detail: 'No contact in context.' };
      const status = asString(cfg.status);
      if (!LEAD_STATUSES.includes(status)) return { status: 'failed', detail: `Invalid lead status "${status}".` };
      const { error } = await db.from('contacts')
        .update({ lead_status: status, updated_at: new Date().toISOString() })
        .eq('id', contactId).eq('account_id', accountId);
      return error ? { status: 'failed', detail: error.message } : { status: 'completed', detail: `Lead status set to "${status}".` };
    }

    case 'create_follow_up': {
      const title = interpolate(asString(cfg.title) || 'Follow up', qctx).trim();
      const days = Number(cfg.days ?? 1);
      const due = new Date(Date.now() + (Number.isFinite(days) ? days : 1) * 86_400_000).toISOString();
      const { error } = await db.from('follow_ups').insert({
        account_id: accountId,
        contact_id: contactId,
        user_id: null,
        title,
        notes: interpolate(asString(cfg.notes), qctx) || null,
        due_date: due,
        status: 'pending',
      });
      if (error) return { status: 'failed', detail: error.message };
      return { status: 'completed', detail: `Follow-up "${title}" due ${due.split('T')[0]}.` };
    }

    case 'add_note': {
      if (!contactId) return { status: 'failed', detail: 'No contact in context.' };
      const note = interpolate(asString(cfg.note), qctx).trim();
      if (!note) return { status: 'failed', detail: 'Note is empty.' };
      const { data: row } = await db.from('contacts').select('custom_fields').eq('id', contactId).eq('account_id', accountId).single();
      const custom = (row?.custom_fields as Record<string, unknown> | null) ?? {};
      const notes = Array.isArray(custom.automation_notes) ? (custom.automation_notes as unknown[]) : [];
      const next = [...notes, { note, at: new Date().toISOString() }].slice(-50);
      const { error } = await db.from('contacts')
        .update({ custom_fields: { ...custom, automation_notes: next }, updated_at: new Date().toISOString() })
        .eq('id', contactId).eq('account_id', accountId);
      return error ? { status: 'failed', detail: error.message } : { status: 'completed', detail: 'Note added.' };
    }

    case 'wait': {
      const amount = Number(cfg.amount ?? 1);
      const unit = asString(cfg.unit) || 'hours';
      const factor = unit === 'minutes' ? 60_000 : unit === 'days' ? 86_400_000 : 3_600_000;
      const ms = (Number.isFinite(amount) && amount > 0 ? amount : 1) * factor;
      return { status: 'completed', detail: `Waiting ${amount} ${unit} before continuing.`, waitMs: ms };
    }

    case 'webhook': {
      const rawUrl = interpolate(asString(cfg.url), qctx).trim();
      const safe = isSafeWebhookUrl(rawUrl);
      if (!safe.ok) return { status: 'failed', detail: `Blocked webhook: ${safe.reason}.` };
      const method = (asString(cfg.method) || 'POST').toUpperCase();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(rawUrl, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            automation_id: ctx.trigger_data?.automation_id ?? null,
            trigger: ctx.trigger_type,
            contact_id: contactId,
            payload: ctx.trigger_data,
          }),
          redirect: 'manual',
          signal: controller.signal,
        });
        if (res.status >= 300 && res.status < 400) {
          return { status: 'failed', detail: `Webhook returned a redirect (HTTP ${res.status}) which is not followed.` };
        }
        return res.ok
          ? { status: 'completed', detail: `Webhook ${method} responded HTTP ${res.status}.` }
          : { status: 'failed', detail: `Webhook ${method} responded HTTP ${res.status}.` };
      } catch (err) {
        return { status: 'failed', detail: err instanceof Error ? err.message : 'Webhook request failed.' };
      } finally {
        clearTimeout(timer);
      }
    }

    case 'end_workflow':
      return { status: 'completed', detail: 'Workflow ended.', end: true };

    default:
      return { status: 'failed', detail: `Unknown action "${step.step_type}".` };
  }
}
