import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from '../config';

/** Encrypts small secrets (e.g. a user's mailbox password) before they are stored. */
const key = () => createHash('sha256').update(`secret-box:${config.fileUrlSecret}`).digest();
export function seal(plain: string) {
  if (!plain) return '';
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')}`;
}
export function open(sealed: string) {
  if (!sealed) return '';
  if (!sealed.startsWith('v1:')) return sealed;
  const b = Buffer.from(sealed.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
