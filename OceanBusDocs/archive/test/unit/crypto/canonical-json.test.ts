import { canonicalize } from '../../../src/crypto/canonical-json';

describe('canonicalize', () => {
  it('sorts keys alphabetically', () => {
    expect(canonicalize({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it('sorts nested keys', () => {
    expect(canonicalize({ b: { z: 1, a: 2 }, a: 1 })).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  it('serializes null', () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
  });

  it('serializes booleans', () => {
    expect(canonicalize({ a: true, b: false })).toBe('{"a":true,"b":false}');
  });

  it('serializes strings', () => {
    expect(canonicalize({ name: 'hello' })).toBe('{"name":"hello"}');
  });

  it('serializes arrays', () => {
    expect(canonicalize({ items: [1, 2, 3] })).toBe('{"items":[1,2,3]}');
  });

  it('throws on undefined values', () => {
    expect(() => canonicalize({ a: undefined })).toThrow('Cannot canonicalize');
  });

  it('throws on non-finite numbers', () => {
    expect(() => canonicalize({ a: Infinity })).toThrow('Non-finite numbers');
    expect(() => canonicalize({ a: NaN })).toThrow('Non-finite numbers');
  });

  it('throws on unsupported types', () => {
    expect(() => canonicalize({ a: Symbol('test') })).toThrow('Unsupported type');
    expect(() => canonicalize({ a: () => {} })).toThrow('Unsupported type');
  });

  it('produces deterministic output for same data', () => {
    const a = { x: 1, y: 2, nested: { b: 1, a: 2 } };
    const b = { y: 2, x: 1, nested: { a: 2, b: 1 } };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
});
