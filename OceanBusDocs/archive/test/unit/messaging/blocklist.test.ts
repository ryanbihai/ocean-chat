import { BlocklistManager } from '../../../src/messaging/blocklist';
import { HttpClient } from '../../../src/client/http-client';
import type { HttpConfig } from '../../../src/types/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.mock('../../../src/client/http-client');

const mockHttpConfig: HttpConfig = {
  timeout: 5000,
  retry: { maxAttempts: 1, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2 },
};

describe('BlocklistManager', () => {
  let blocklist: BlocklistManager;
  let mockHttp: jest.Mocked<HttpClient>;
  let getApiKey: jest.Mock;
  let filePath: string;

  beforeEach(() => {
    filePath = path.join(os.tmpdir(), `blocklist-test-${Date.now()}.json`);
    mockHttp = new HttpClient('http://test', mockHttpConfig) as jest.Mocked<HttpClient>;
    mockHttp.post = jest.fn();
    mockHttp.get = jest.fn();
    mockHttp.del = jest.fn();
    getApiKey = jest.fn().mockReturnValue('sk_test');
    blocklist = new BlocklistManager(mockHttp, getApiKey, filePath);
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ok */ }
  });

  it('starts empty', async () => {
    await blocklist.loadLocal();
    expect(blocklist.getBlocklist()).toEqual([]);
    expect(blocklist.isBlocked('anyone')).toBe(false);
  });

  it('blocks a sender (server + local)', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await blocklist.block('spammer-openid');

    expect(blocklist.isBlocked('spammer-openid')).toBe(true);
    expect(mockHttp.post).toHaveBeenCalledWith(
      '/messages/block',
      { from_openid: 'spammer-openid' },
      expect.anything()
    );
  });

  it('unblocks locally and tries server', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await blocklist.block('spammer-openid');
    expect(blocklist.isBlocked('spammer-openid')).toBe(true);

    mockHttp.del.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await blocklist.unblock('spammer-openid');
    expect(blocklist.isBlocked('spammer-openid')).toBe(false);
  });

  it('unblock survives server error', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await blocklist.block('spammer');

    mockHttp.del.mockRejectedValueOnce(new Error('endpoint not found'));
    await blocklist.unblock('spammer');
    expect(blocklist.isBlocked('spammer')).toBe(false); // still unblocked locally
  });

  it('reverse lookup resolves openid', async () => {
    mockHttp.get.mockResolvedValueOnce({
      code: 0, msg: 'success',
      data: { real_agent_id: 'abc-123-def' },
    });
    const result = await blocklist.reverseLookup('some-openid');
    expect(result.real_agent_id).toBe('abc-123-def');
  });

  it('persists blocklist to disk', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await blocklist.block('blocked-1');

    // Load in new instance
    const bl2 = new BlocklistManager(mockHttp, getApiKey, filePath);
    await bl2.loadLocal();
    expect(bl2.getBlocklist()).toEqual(['blocked-1']);
  });
});
