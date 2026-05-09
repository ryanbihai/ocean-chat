// Placeholder: Proof-of-Work (Hashcash) computation
// Not yet enforced by L0 API — throws until server-side PoW is enabled
// @unimplemented — do not use in production

/** @deprecated Not yet implemented. Throws unconditionally. */
export function computeHashcash(_challenge: string, _difficulty: number): never {
  throw new Error('PoW (Proof-of-Work) is not yet implemented.');
}

/** @deprecated Not yet implemented. Throws unconditionally. */
export function verifyHashcash(_challenge: string, _nonce: string, _difficulty: number): never {
  throw new Error('PoW (Proof-of-Work) is not yet implemented.');
}
