// In-house proof-of-work challenge for browsers where Cloudflare Turnstile cannot run
// (e.g. Huawei Browser without Google services). The API server issues a signed,
// single-use challenge; the browser must find a counter whose SHA-256 has the required
// leading zero bits. Pure JS SHA-256, no WebCrypto, chunked so the page stays responsive.
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const W = new Uint32Array(64);
// SHA-256 of an ASCII string shorter than 56 bytes (single block). Writes 8 words into out.
export function sha256Short(s: string, out: Uint32Array): void {
  const n = s.length;
  for (let i = 0; i < 16; i++) W[i] = 0;
  for (let i = 0; i < n; i++) W[i >> 2] |= (s.charCodeAt(i) & 0xff) << (24 - ((i & 3) << 3));
  W[n >> 2] |= 0x80 << (24 - ((n & 3) << 3));
  W[15] = n * 8;
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15], b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = 0x6a09e667, b = 0xbb67ae85, c = 0x3c6ef372, d = 0xa54ff53a, e = 0x510e527f, f = 0x9b05688c, g = 0x1f83d9ab, h = 0x5be0cd19;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const mj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + mj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  out[0] = (0x6a09e667 + a) | 0; out[1] = (0xbb67ae85 + b) | 0; out[2] = (0x3c6ef372 + c) | 0; out[3] = (0xa54ff53a + d) | 0;
  out[4] = (0x510e527f + e) | 0; out[5] = (0x9b05688c + f) | 0; out[6] = (0x1f83d9ab + g) | 0; out[7] = (0x5be0cd19 + h) | 0;
}
export function leadingZeroBits(words: Uint32Array): number {
  let bits = 0;
  for (let i = 0; i < 8; i++) {
    const w = words[i] >>> 0;
    if (w === 0) { bits += 32; continue; }
    let m = 0x80000000;
    while (!(w & m)) { bits++; m >>>= 1; }
    return bits;
  }
  return bits;
}
// Find a counter for challenge text c with at least `bits` leading zero bits.
export function solvePow(c: string, bits: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const out = new Uint32Array(8);
    let counter = 0;
    const started = Date.now();
    const step = () => {
      const stop = Date.now() + 25;
      while (Date.now() < stop) {
        for (let i = 0; i < 500; i++) {
          sha256Short(c + ':' + counter, out);
          if (leadingZeroBits(out) >= bits) { resolve(counter); return; }
          counter++;
        }
      }
      if (Date.now() - started > 120000) { reject(new Error('pow-timeout')); return; }
      setTimeout(step, 0);
    };
    step();
  });
}
export type PowSolution = { c: string; s: string; n: number };
export async function fetchAndSolvePow(base = ''): Promise<PowSolution> {
  const r = await fetch(base + '/api/auth/pow-challenge', { cache: 'no-store' });
  if (!r.ok) throw new Error('pow-challenge');
  const j = (await r.json()) as { c: string; s: string; bits: number };
  const n = await solvePow(j.c, j.bits);
  return { c: j.c, s: j.s, n };
}
