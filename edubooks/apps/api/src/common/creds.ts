import { randomInt } from 'crypto';
// Unambiguous alphabet (no 0/O, 1/l/I) — easy for young children and parents to type.
const ALPHA = 'abcdefghjkmnpqrstuvwxyz'; const DIGITS = '23456789';
export function friendlyPassword() {
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[randomInt(s.length)]).join('');
  return `${pick(ALPHA, 4)}${pick(DIGITS, 4)}`;
}
export const slugUser = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'user';
export const ROLES_STAFF = { ADMIN: 'PUBLISHER_ADMIN', EDITOR: 'PUBLISHER_EDITOR', SALES: 'PUBLISHER_SALES' } as const;
