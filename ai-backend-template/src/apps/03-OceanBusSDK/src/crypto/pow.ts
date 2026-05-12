import * as crypto from 'crypto';

// Server sends difficulty in BITS (not hex characters).
// Convert to hex chars: each hex char = 4 bits, round up.
const bitsToHex = (bits: number) => Math.ceil(bits / 4);

const DEFAULT_BIT_DIFFICULTY = 20;    // 5 hex zeros ≈ 1s on modern CPU
const MAX_BIT_DIFFICULTY = 80;        // 20 hex zeros ≈ ~60s; sanity cap

/**
 * Compute Hashcash-style Proof of Work.
 * `difficulty` is in BITS — the number of leading zero bits required in the SHA-256 hash.
 * A hex character covers 4 bits, so difficulty=20 translates to 5 leading hex zeros.
 */
export function computeHashcash(challenge: string, difficulty: number = DEFAULT_BIT_DIFFICULTY): { solution: string; hash: string } {
  if (difficulty > 256) {
    throw new Error(`POW difficulty ${difficulty} exceeds SHA-256 output length (256 bits)`);
  }
  if (difficulty > MAX_BIT_DIFFICULTY) {
    throw new Error(`POW difficulty ${difficulty} bits is too high (max ${MAX_BIT_DIFFICULTY}). Try again later.`);
  }

  const hexChars = bitsToHex(difficulty);
  const prefix = '0'.repeat(hexChars);
  let solution = 0;
  let hash = '';
  while (true) {
    hash = crypto.createHash('sha256').update(challenge + solution).digest('hex');
    if (hash.startsWith(prefix)) break;
    solution++;
  }

  return { solution: String(solution), hash };
}

/**
 * Verify a Hashcash solution.
 */
export function verifyHashcash(challenge: string, solution: string, difficulty: number = DEFAULT_BIT_DIFFICULTY): boolean {
  const prefix = '0'.repeat(bitsToHex(difficulty));
  const hash = crypto.createHash('sha256').update(challenge + solution).digest('hex');
  return hash.startsWith(prefix);
}
