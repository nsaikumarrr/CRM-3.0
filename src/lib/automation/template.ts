/**
 * CRM 3.0 — Message template interpolation (pure, dependency-free).
 *
 * Supports whitelisted `{{scope.key}}` tokens only. Unknown tokens are
 * resolved to an empty string so a bad variable can never leak raw
 * template syntax to a customer.
 */

export interface TemplateContext {
  contact?: Record<string, unknown> | null;
  account?: Record<string, unknown> | null;
  conversation?: Record<string, unknown> | null;
  deal?: Record<string, unknown> | null;
  trigger?: Record<string, unknown> | null;
}

export interface VariableDef {
  token: string;
  label: string;
  group: string;
}

export const TEMPLATE_VARIABLES: VariableDef[] = [
  { token: '{{contact.name}}', label: 'Full name', group: 'Contact' },
  { token: '{{contact.first_name}}', label: 'First name', group: 'Contact' },
  { token: '{{contact.email}}', label: 'Email', group: 'Contact' },
  { token: '{{contact.phone}}', label: 'Phone', group: 'Contact' },
  { token: '{{contact.company}}', label: 'Company', group: 'Contact' },
  { token: '{{contact.lead_status}}', label: 'Lead status', group: 'Contact' },
  { token: '{{account.name}}', label: 'Business name', group: 'Account' },
  { token: '{{conversation.platform}}', label: 'Channel', group: 'Conversation' },
  { token: '{{deal.title}}', label: 'Deal title', group: 'Deal' },
  { token: '{{deal.value}}', label: 'Deal value', group: 'Deal' },
];

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function extractVariables(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) found.add(m[1]);
  return Array.from(found);
}

function firstWord(name: unknown): string {
  const s = typeof name === 'string' ? name.trim() : '';
  return s ? s.split(/\s+/)[0] : '';
}

function toStringValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function resolveToken(token: string, ctx: TemplateContext): string {
  const [scope, key] = token.split('.');
  const bag =
    scope === 'contact' ? ctx.contact :
    scope === 'account' ? ctx.account :
    scope === 'conversation' ? ctx.conversation :
    scope === 'deal' ? ctx.deal :
    scope === 'trigger' ? ctx.trigger :
    null;

  if (!bag) return '';

  if (scope === 'contact' && key === 'first_name') {
    return firstWord(bag.name);
  }
  return toStringValue((bag as Record<string, unknown>)[key]);
}

export function interpolate(text: string, ctx: TemplateContext): string {
  if (!text) return '';
  return text.replace(TOKEN_RE, (_m, token: string) => resolveToken(token, ctx));
}

/** Return tokens that are not part of the supported variable catalogue. */
export function findUnknownVariables(text: string): string[] {
  const supported = new Set(TEMPLATE_VARIABLES.map((v) => v.token.slice(2, -2)));
  return extractVariables(text).filter((t) => !supported.has(t));
}
