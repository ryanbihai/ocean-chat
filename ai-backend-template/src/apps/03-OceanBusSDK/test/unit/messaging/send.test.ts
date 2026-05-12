import { MessagingService } from '../../../src/messaging/send';
import { HttpClient } from '../../../src/client/http-client';
import type { HttpConfig } from '../../../src/types/config';
import { OceanBusError } from '../../../src/client/errors';

jest.mock('../../../src/client/http-client');

const mockHttpConfig: HttpConfig = {
  timeout: 5000,
  retry: { maxAttempts: 1, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2 },
};

describe('MessagingService', () => {
  let messaging: MessagingService;
  let mockHttp: jest.Mocked<HttpClient>;
  let getApiKey: jest.Mock;

  beforeEach(() => {
    mockHttp = new HttpClient('http://test', mockHttpConfig) as jest.Mocked<HttpClient>;
    mockHttp.post = jest.fn();
    getApiKey = jest.fn().mockReturnValue('sk_test_key');
    messaging = new MessagingService(mockHttp, getApiKey);
  });

  it('throws if not authenticated', async () => {
    getApiKey.mockReturnValue(null);
    await expect(messaging.send('openid', 'test')).rejects.toThrow('Not authenticated');
  });

  it('throws on empty toOpenid', async () => {
    await expect(messaging.send('', 'test')).rejects.toThrow('toOpenid must not be empty');
    await expect(messaging.send('   ', 'test')).rejects.toThrow('toOpenid must not be empty');
  });

  it('throws on content exceeding 2000 chars', async () => {
    const longContent = 'x'.repeat(2001);
    await expect(messaging.send('openid', longContent)).rejects.toThrow('Content exceeds');
  });

  it('accepts content at exactly 2000 chars', async () => {
    const content = 'x'.repeat(2000);
    mockHttp.post.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await messaging.send('openid', content);
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
  });

  it('sends message with correct payload', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await messaging.send('target-openid', 'hello');

    const call = mockHttp.post.mock.calls[0] as any[];
    expect(call[0]).toBe('/messages');
    const payload = call[1];
    expect(payload.to_openid).toBe('target-openid');
    expect(payload.content).toBe('hello');
    expect(payload.client_msg_id).toMatch(/^msg_\d+_/);
  });

  it('uses provided client_msg_id', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await messaging.send('openid', 'test', 'custom-msg-id');
    const payload = (mockHttp.post.mock.calls[0] as any[])[1];
    expect(payload.client_msg_id).toBe('custom-msg-id');
  });

  it('sendJson stringifies data', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 0, msg: 'success', data: {} });
    await messaging.sendJson('openid', { action: 'test', value: 42 });
    const payload = (mockHttp.post.mock.calls[0] as any[])[1];
    expect(JSON.parse(payload.content)).toEqual({ action: 'test', value: 42 });
  });
});
