import * as ed from '@noble/ed25519';
import { canonicalize } from './canonical-json';
import type { Ed25519KeyPair } from '../types/crypto';

export async function generateKeypair(): Promise<Ed25519KeyPair> {
  const secretKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(secretKey);
  return { publicKey, secretKey };
}

export async function sign(
  secretKey: Uint8Array,
  payload: Record<string, unknown>
): Promise<string> {
  const message = canonicalize(payload);
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = await ed.signAsync(msgBytes, secretKey);
  return `ed25519:${bufferToBase64url(sigBytes)}`;
}

export async function verify(
  publicKey: Uint8Array,
  payload: Record<string, unknown>,
  signature: string
): Promise<boolean> {
  try {
    const message = canonicalize(payload);
    const msgBytes = new TextEncoder().encode(message);

    const raw = signature.startsWith('ed25519:')
      ? signature.slice(8)
      : signature;
    const sigBytes = base64urlToBuffer(raw);

    return await ed.verifyAsync(sigBytes, msgBytes, publicKey);
  } catch {
    return false;
  }
}

// ── base64url encoding (matches backend wire format) ──

function bufferToBase64url(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64url');
}

function base64urlToBuffer(s: string): Uint8Array {
  return Buffer.from(s, 'base64url');
}

// ── key serialization (ed25519:<base64url>) ──

export function keypairToBase64url(keypair: Ed25519KeyPair): { publicKey: string; secretKey: string } {
  return {
    publicKey: `ed25519:${bufferToBase64url(keypair.publicKey)}`,
    secretKey: `ed25519:${bufferToBase64url(keypair.secretKey)}`,
  };
}

export function base64urlToKeypair(publicKeyStr: string, secretKeyStr: string): Ed25519KeyPair {
  return {
    publicKey: base64urlToBuffer(publicKeyStr.replace('ed25519:', '')),
    secretKey: base64urlToBuffer(secretKeyStr.replace('ed25519:', '')),
  };
}

// ── legacy hex helpers (kept for backward compat) ──

export function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBuffer(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** @deprecated Use keypairToBase64url instead. */
export function keypairToHex(keypair: Ed25519KeyPair): { publicKey: string; secretKey: string } {
  console.warn('[oceanbus] keypairToHex is deprecated — use keypairToBase64url instead');
  return keypairToBase64url(keypair);
}

export function hexToKeypair(publicKeyHex: string, secretKeyHex: string): Ed25519KeyPair {
  const pubStr = publicKeyHex.startsWith('ed25519:') ? publicKeyHex.slice(8) : publicKeyHex;
  const secStr = secretKeyHex.startsWith('ed25519:') ? secretKeyHex.slice(8) : secretKeyHex;
  // Try base64url first (current format), fall back to hex (legacy)
  try {
    return {
      publicKey: base64urlToBuffer(pubStr),
      secretKey: base64urlToBuffer(secStr),
    };
  } catch {
    return {
      publicKey: hexToBuffer(pubStr),
      secretKey: hexToBuffer(secStr),
    };
  }
}
