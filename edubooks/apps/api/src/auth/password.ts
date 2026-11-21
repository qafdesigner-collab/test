import { hash, verify } from '@node-rs/argon2';
// Argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (pw: string) => hash(pw, OPTS);
export const verifyPassword = async (h: string, pw: string) => { try { return await verify(h, pw); } catch { return false; } };
// Used when the user does not exist, so response time doesn't reveal valid usernames.
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword('not-a-real-password-' + Math.random()));
