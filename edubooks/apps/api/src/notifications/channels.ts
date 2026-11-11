/**
 * Outgoing messages (WhatsApp / SMS). Choose with NOTIFY_CHANNEL:
 *   whatsapp — Meta WhatsApp Cloud API: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, optional WHATSAPP_TEMPLATE (+ WHATSAPP_TEMPLATE_LANG)
 *   sms      — Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *   webhook  — any SMS/WhatsApp gateway: NOTIFY_WEBHOOK_URL receives POST {to, body, kind} (optional NOTIFY_WEBHOOK_TOKEN as Bearer)
 * Without a channel, messages are kept in the outbox as SKIPPED and only in-app notifications are shown.
 */
export type SendResult = { status: 'SENT' | 'SKIPPED'; detail?: string };
const env = (k: string) => (process.env[k] ?? '').trim();

export function channelInfo() {
  const ch = env('NOTIFY_CHANNEL').toLowerCase();
  const need: Record<string, string[]> = {
    whatsapp: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'], sms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'], webhook: ['NOTIFY_WEBHOOK_URL'],
  };
  if (!need[ch]) return { channel: 'none', configured: false, missing: [] as string[] };
  const missing = need[ch].filter((k) => !env(k));
  return { channel: ch, configured: !missing.length, missing };
}

/** International format without "+": 0300 1234567 → 923001234567 (DEFAULT_COUNTRY_CODE, default 92). */
export function normalisePhone(raw: string) {
  let s = String(raw || '').trim();
  const plus = s.startsWith('+');
  s = s.replace(/\D/g, '');
  if (!s) return '';
  if (plus) return s;
  if (s.startsWith('00')) return s.slice(2);
  if (s.startsWith('0')) return (env('DEFAULT_COUNTRY_CODE') || '92') + s.slice(1);
  return s;
}

export async function sendMessage(toRaw: string, body: string, kind: string): Promise<SendResult> {
  const info = channelInfo();
  if (!info.configured) return { status: 'SKIPPED', detail: info.channel === 'none' ? 'No WhatsApp/SMS service configured' : `Missing settings: ${info.missing.join(', ')}` };
  const to = normalisePhone(toRaw);
  if (to.length < 8) return { status: 'SKIPPED', detail: `Invalid phone number “${toRaw}”` };
  const text = body.slice(0, 1000);
  let res: Response;
  if (info.channel === 'whatsapp') {
    const tpl = env('WHATSAPP_TEMPLATE');
    const payload = tpl
      ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl, language: { code: env('WHATSAPP_TEMPLATE_LANG') || 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text }] }] } }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
    res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(env('WHATSAPP_PHONE_NUMBER_ID'))}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    });
  } else if (info.channel === 'sms') {
    const sid = env('TWILIO_ACCOUNT_SID');
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: `+${to}`, From: env('TWILIO_FROM'), Body: text }).toString(),
    });
  } else {
    res = await fetch(env('NOTIFY_WEBHOOK_URL'), {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', ...(env('NOTIFY_WEBHOOK_TOKEN') ? { Authorization: `Bearer ${env('NOTIFY_WEBHOOK_TOKEN')}` } : {}) },
      body: JSON.stringify({ to, body: text, kind }),
    });
  }
  if (!res.ok) throw new Error(`${info.channel} answered HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return { status: 'SENT' };
}
