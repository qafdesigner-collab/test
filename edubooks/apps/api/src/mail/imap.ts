import * as net from 'net';
import * as tls from 'tls';

/**
 * A small read-only IMAP client: log in, open INBOX and download the newest messages.
 * Kept dependency-free on purpose (cPanel updates keep the installed node_modules).
 */
export interface ImapConfig { host: string; port: number; secure: boolean; username: string; password: string }
export interface FetchedMail { uid: number; seen: boolean; raw: Buffer }

class Conn {
  private buf = Buffer.alloc(0);
  private waiters: (() => void)[] = [];
  private closed: Error | null = null;
  private n = 0;
  constructor(public sock: net.Socket) { this.attach(sock); }
  attach(sock: net.Socket) {
    this.sock = sock;
    sock.on('data', (d: Buffer) => { this.buf = Buffer.concat([this.buf, d]); this.wake(); });
    sock.on('error', (e) => { this.closed = e; this.wake(); });
    sock.on('close', () => { this.closed ??= new Error('The mail server closed the connection'); this.wake(); });
  }
  private wake() { const w = this.waiters; this.waiters = []; w.forEach((f) => f()); }
  private wait() { return new Promise<void>((res) => this.waiters.push(res)); }

  /** One response line, with any {n} literals that belong to it. */
  async line(): Promise<{ text: string; literals: Buffer[] }> {
    let text = ''; const literals: Buffer[] = [];
    for (;;) {
      let i: number;
      while ((i = this.buf.indexOf('\r\n')) < 0) { if (this.closed) throw this.closed; await this.wait(); }
      const part = this.buf.subarray(0, i).toString('latin1'); this.buf = this.buf.subarray(i + 2);
      const m = /\{(\d+)\}$/.exec(part);
      if (!m) return { text: text + part, literals };
      const size = Number(m[1]);
      while (this.buf.length < size) { if (this.closed) throw this.closed; await this.wait(); }
      literals.push(Buffer.from(this.buf.subarray(0, size))); this.buf = this.buf.subarray(size);
      text += part + '\u0000';
    }
  }

  /** Sends a command; returns the untagged lines. Throws when the server answers NO/BAD. */
  async cmd(c: string, secret = false) {
    const tag = `K${++this.n}`; this.sock.write(`${tag} ${c}\r\n`);
    const out: { text: string; literals: Buffer[] }[] = [];
    for (;;) {
      const l = await this.line();
      if (l.text.startsWith(`${tag} `)) {
        if (!/^\S+ OK/i.test(l.text)) throw new Error(secret ? 'The mail server did not accept the login (check the username and password)' : l.text.slice(tag.length + 1).slice(0, 200));
        return out;
      }
      out.push(l);
    }
  }
}

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function connect(c: ImapConfig, timeoutMs: number): Promise<net.Socket> {
  return new Promise((res, rej) => {
    const s: net.Socket = c.secure ? tls.connect({ host: c.host, port: c.port, servername: c.host }) : net.connect({ host: c.host, port: c.port });
    s.setTimeout(timeoutMs, () => s.destroy(new Error('The mail server did not answer in time')));
    s.once(c.secure ? 'secureConnect' : 'connect', () => res(s));
    s.once('error', rej);
  });
}

/** Downloads messages with UID above `afterUid` (or the newest `max` when afterUid is 0). */
export async function fetchInbox(c: ImapConfig, afterUid: number, max = 30, timeoutMs = 20_000): Promise<{ messages: FetchedMail[]; uidValidity: number }> {
  let sock = await connect(c, timeoutMs);
  const conn = new Conn(sock);
  try {
    const hello = await conn.line();
    if (!/^\* (OK|PREAUTH)/i.test(hello.text)) throw new Error('This does not look like an IMAP mail server');
    if (!c.secure) {
      const caps = (await conn.cmd('CAPABILITY')).map((l) => l.text).join(' ');
      if (/STARTTLS/i.test(caps)) {
        await conn.cmd('STARTTLS');
        sock.removeAllListeners('data');
        sock = await new Promise<net.Socket>((res, rej) => { const t = tls.connect({ socket: sock, servername: c.host }, () => res(t)); t.once('error', rej); });
        conn.attach(sock);
      }
    }
    await conn.cmd(`LOGIN ${q(c.username)} ${q(c.password)}`, true);
    const sel = await conn.cmd('EXAMINE INBOX');
    const exists = Number(sel.map((l) => /^\* (\d+) EXISTS/i.exec(l.text)?.[1]).find(Boolean) ?? 0);
    const uidValidity = Number(sel.map((l) => /UIDVALIDITY (\d+)/i.exec(l.text)?.[1]).find(Boolean) ?? 0);
    if (!exists) { await conn.cmd('LOGOUT').catch(() => undefined); return { messages: [], uidValidity }; }
    const what = '(UID FLAGS BODY.PEEK[]<0.400000>)';
    const lines = afterUid > 0
      ? await conn.cmd(`UID FETCH ${afterUid + 1}:* ${what}`)
      : await conn.cmd(`FETCH ${Math.max(1, exists - max + 1)}:${exists} ${what}`);
    const messages: FetchedMail[] = [];
    for (const l of lines) {
      if (!/^\* \d+ FETCH/i.test(l.text) || !l.literals.length) continue;
      const uid = Number(/UID (\d+)/i.exec(l.text)?.[1] ?? 0);
      if (!uid || uid <= afterUid) continue;
      messages.push({ uid, seen: /\\Seen/i.test(l.text), raw: l.literals[l.literals.length - 1] });
    }
    await conn.cmd('LOGOUT').catch(() => undefined);
    return { messages: messages.sort((a, b) => a.uid - b.uid).slice(-max), uidValidity };
  } finally { sock.destroy(); }
}

// ------------------------------------------------------------------ MIME (enough for reading mail)
export interface ParsedMail { subject: string; fromName: string; fromEmail: string; to: string; date: Date | null; messageId: string; text: string }

function headers(raw: string) {
  const end = raw.search(/\r?\n\r?\n/);
  const head = end < 0 ? raw : raw.slice(0, end);
  const body = end < 0 ? '' : raw.slice(end).replace(/^\r?\n\r?\n/, '');
  const h: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':'); if (i < 1) continue;
    const k = line.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = line.slice(i + 1).trim();
  }
  return { h, body };
}
const param = (v: string, name: string) => new RegExp(`${name}\\*?=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(v)?.slice(1).find((x) => x !== undefined) ?? '';

function charsetDecode(bytes: Buffer, charset: string) {
  const cs = (charset || 'utf-8').toLowerCase().replace(/^(us-ascii|ascii)$/, 'utf-8');
  try { return new TextDecoder(cs).decode(bytes); } catch { return bytes.toString('utf8'); }
}
function qp(s: string) {
  const bytes: number[] = []; const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(t.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}
/** =?utf-8?B?...?= words in headers. */
export function decodeWords(s: string) {
  // Some mailers put raw UTF-8 in headers (we read them as latin1 bytes).
  if (/[\x80-\xff]/.test(s)) { try { s = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(s, 'latin1')); } catch { /* really latin1 */ } }
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, (_m, cs, enc, txt) =>
    charsetDecode(enc.toUpperCase() === 'B' ? Buffer.from(txt, 'base64') : qp(txt.replace(/_/g, ' ')), cs));
}
function bodyBytes(body: string, cte: string) {
  const e = cte.toLowerCase();
  if (e === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64');
  if (e === 'quoted-printable') return qp(body);
  return Buffer.from(body, 'latin1');
}
export function htmlToText(html: string) {
  return html.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Finds the best text of a (possibly multipart) body: text/plain first, else text/html turned into text. */
function textOf(raw: string, depth = 0): { plain?: string; html?: string } {
  const { h, body } = headers(raw);
  const ct = h['content-type'] || 'text/plain'; const type = ct.split(';')[0].trim().toLowerCase();
  if (type.startsWith('multipart/') && depth < 6) {
    const b = param(ct, 'boundary'); if (!b) return {};
    const parts = body.split(new RegExp(`\\r?\\n?--${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`)).slice(1);
    const out: { plain?: string; html?: string } = {};
    for (const p of parts) {
      if (!p.trim()) continue;
      const r = textOf(p, depth + 1);
      out.plain ??= r.plain; out.html ??= r.html;
    }
    return out;
  }
  if (/attachment/i.test(h['content-disposition'] ?? '')) return {};
  if (type !== 'text/plain' && type !== 'text/html') return {};
  const text = charsetDecode(bodyBytes(body, h['content-transfer-encoding'] ?? ''), param(ct, 'charset'));
  return type === 'text/html' ? { html: text } : { plain: text };
}

export function parseMail(raw: Buffer): ParsedMail {
  const s = raw.toString('latin1');
  const { h } = headers(s);
  const from = decodeWords(h['from'] ?? '');
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from);
  const t = textOf(s);
  const text = (t.plain ?? (t.html ? htmlToText(t.html) : '')).replace(/\r\n/g, '\n').trim();
  const d = h['date'] ? new Date(h['date']) : null;
  return {
    subject: decodeWords(h['subject'] ?? '').slice(0, 300), fromName: (m?.[1] ?? '').trim().slice(0, 200), fromEmail: (m?.[2] ?? from).trim().slice(0, 200),
    to: decodeWords(h['to'] ?? '').slice(0, 500), date: d && !isNaN(d.getTime()) ? d : null, messageId: (h['message-id'] ?? '').slice(0, 300), text: text.slice(0, 100_000),
  };
}
