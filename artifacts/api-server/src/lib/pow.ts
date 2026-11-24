import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// In-house proof-of-work challenge used when Cloudflare Turnstile cannot run on a
// browser. Challenges are stateless (HMAC-signed), expire, and are single-use via the
// caller-supplied `once` check.
export const POW_BITS = 19;
const TTL_MS = 10 * 60 * 1000;

function key(): string {
  return 'pow:' + (process.env.TURNSTILE_SECRET_KEY ?? '');
}
function sign(c: string): string {
  return createHmac('sha256', key()).update(c).digest('base64url');
}
export function issuePow(): { c: string; s: string; bits: number } {
  const c = `${Date.now().toString(36)}.${randomBytes(9).toString('base64url')}.${POW_BITS}`;
  return { c, s: sign(c), bits: POW_BITS };
}
function zeroBits(d: Buffer): number {
  let bits = 0;
  for (const byte of d) {
    if (byte === 0) { bits += 8; continue; }
    let m = 0x80;
    while (!(byte & m)) { bits++; m >>= 1; }
    return bits;
  }
  return bits;
}
// Returns the challenge nonce when the solution is valid, otherwise null.
export function verifyPow(header: string): string | null {
  const parts = header.split('|');
  if (parts.length !== 3) return null;
  const [c, s, n] = parts;
  if (c.length > 40 || !/^[a-z0-9.\-_]+$/i.test(c) || !/^\d{1,12}$/.test(n)) return null;
  const expect = Buffer.from(sign(c));
  const got = Buffer.from(s);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null;
  const [ts, nonce, bitsStr] = c.split('.');
  const born = parseInt(ts, 36);
  if (!Number.isFinite(born) || Date.now() - born > TTL_MS || born > Date.now() + 60000) return null;
  const bits = parseInt(bitsStr, 10);
  if (!(bits >= POW_BITS)) return null;
  const digest = createHash('sha256').update(`${c}:${n}`).digest();
  return zeroBits(digest) >= bits ? nonce : null;
}
