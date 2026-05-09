// Deterministic JSON serialization for Ed25519 signing
// Alphabetical key sort, no indentation, no trailing commas, UTF-8

export function canonicalize(obj: unknown): string {
  return serialize(obj);
}

function serialize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite numbers not allowed in canonical JSON');
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((v) => serialize(v)).join(',');
    return `[${items}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map((k) => {
      const v = (value as Record<string, unknown>)[k];
      // undefined values would cause signature collisions — disallow them
      if (v === undefined) {
        throw new Error(`Cannot canonicalize: key "${k}" has undefined value`);
      }
      return `${JSON.stringify(k)}:${serialize(v)}`;
    });
    return `{${pairs.join(',')}}`;
  }
  throw new Error(`Unsupported type: ${typeof value}`);
}
