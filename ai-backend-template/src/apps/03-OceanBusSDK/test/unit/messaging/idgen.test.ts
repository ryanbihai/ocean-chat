import { generateClientMsgId, generateRequestId } from '../../../src/messaging/idgen';

describe('idgen', () => {
  it('generates unique client message IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateClientMsgId());
    }
    expect(ids.size).toBe(100);
  });

  it('generates unique request IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  it('uses correct prefix', () => {
    expect(generateClientMsgId()).toMatch(/^msg_\d+_/);
    expect(generateRequestId()).toMatch(/^req_\d+_/);
  });

  it('includes UUID portion', () => {
    const id = generateClientMsgId();
    const parts = id.split('_');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    // Last part should be UUID-like (hex with dashes)
    expect(parts[parts.length - 1]).toMatch(/^[0-9a-f-]+$/);
  });
});
