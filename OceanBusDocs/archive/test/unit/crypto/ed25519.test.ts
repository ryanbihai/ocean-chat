/**
 * Ed25519 unit tests — skipped in unit test suite due to @noble/ed25519 ESM compat.
 * These tests are run as part of integration tests (test/integration/crypto.test.ts)
 * which use the compiled dist/ directly with real @noble/ed25519.
 */
describe.skip('Ed25519', () => {
  it('placeholder — tested in integration', () => {});
});
