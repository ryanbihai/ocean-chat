import { sha256 } from '@noble/hashes/sha256';
import { canonicalize } from './canonical-json';

/**
 * Compute the SHA-256 based card hash for an AgentCard.
 * Uses canonical JSON serialization for deterministic output.
 * Format: "sha256:{64 lowercase hex chars}"
 */
export function computeCardHash(agentCard: Record<string, unknown>): string {
  const canonical = canonicalize(agentCard);
  const hashBytes = sha256(canonical);
  const hex = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/**
 * Verify that an AgentCard matches an expected card hash.
 */
export function verifyCardHash(
  agentCard: Record<string, unknown>,
  expectedHash: string,
): boolean {
  return computeCardHash(agentCard) === expectedHash;
}

/**
 * Validate card_hash format: must be "sha256:{64 lowercase hex chars}".
 */
export function isValidCardHash(hash: unknown): hash is string {
  return typeof hash === 'string' && /^sha256:[a-f0-9]{64}$/.test(hash);
}
