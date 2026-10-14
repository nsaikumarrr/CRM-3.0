/**
 * CRM 3.0 — Outbound messaging adapter.
 *
 * The CRM persists an outbound message row and then hands it to a channel
 * provider. When a provider is not configured (no credentials), the message
 * is stored with status `pending` and reported honestly as queued — we never
 * claim a delivery that did not happen.
 *
 * Provider credentials are read from server env only and never logged.
 */

export type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'telegram' | 'email' | 'web' | 'sms';

export interface OutboundMessage {
  channel: Channel;
  to: string | null;
  text: string;
  templateName?: string | null;
  list?: { header?: string; button?: string; items: string[] } | null;
}

export interface ProviderResult {
  /** True when the provider accepted the message for delivery. */
  delivered: boolean;
  /** True when the message was persisted and is awaiting provider delivery. */
  queued: boolean;
  providerId?: string | null;
  channel: Channel;
  reason?: string;
}

function providerConfigured(channel: Channel): boolean {
  switch (channel) {
    case 'whatsapp':
      return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    case 'email':
      return Boolean(process.env.EMAIL_SMTP_HOST && process.env.EMAIL_SMTP_USER);
    case 'telegram':
      return Boolean(process.env.TELEGRAM_BOT_TOKEN);
    default:
      return false;
  }
}

/**
 * Hand a message to the channel provider. This is the only place outbound
 * delivery is attempted. Unconfigured channels return `queued: true`.
 */
export async function sendProviderMessage(msg: OutboundMessage): Promise<ProviderResult> {
  if (!providerConfigured(msg.channel)) {
    return {
      delivered: false,
      queued: true,
      channel: msg.channel,
      reason: `No ${msg.channel} provider configured — message stored as pending`,
    };
  }

  try {
    if (msg.channel === 'whatsapp') {
      const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const body = msg.list
        ? {
            messaging_product: 'whatsapp',
            to: msg.to,
            type: 'interactive',
            interactive: {
              type: 'list',
              header: msg.list.header ? { type: 'text', text: msg.list.header } : undefined,
              body: { text: msg.text },
              action: {
                button: msg.list.button || 'Options',
                sections: [{ title: 'Options', rows: msg.list.items.map((t) => ({ id: t.toLowerCase().slice(0, 24), title: t.slice(0, 24) })) }],
              },
            },
          }
        : msg.templateName
          ? {
              messaging_product: 'whatsapp',
              to: msg.to,
              type: 'template',
              template: { name: msg.templateName, language: { code: 'en_US' } },
            }
          : { messaging_product: 'whatsapp', to: msg.to, type: 'text', text: { body: msg.text } };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
        if (!res.ok) {
          return { delivered: false, queued: false, channel: msg.channel, reason: json.error?.message ?? `HTTP ${res.status}` };
        }
        return { delivered: true, queued: false, channel: msg.channel, providerId: json.messages?.[0]?.id ?? null };
      } finally {
        clearTimeout(timeout);
      }
    }

    // Other providers are not implemented against a live API in this build.
    return { delivered: false, queued: true, channel: msg.channel, reason: `${msg.channel} provider is queued for a future release` };
  } catch (err) {
    return {
      delivered: false,
      queued: false,
      channel: msg.channel,
      reason: err instanceof Error ? err.message : 'Provider request failed',
    };
  }
}
