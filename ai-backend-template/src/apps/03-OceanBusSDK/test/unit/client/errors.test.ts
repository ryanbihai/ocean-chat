import { ApiError, NetworkError, OceanBusError } from '../../../src/client/errors';
import { ErrorCode } from '../../../src/types/api';

describe('ApiError', () => {
  it('creates from response', () => {
    const err = ApiError.fromResponse(1001, 'missing field');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(1001);
    expect(err.message).toBe('missing required field');
    expect(err.httpStatus).toBe(200);
  });

  it('creates from response with HTTP status', () => {
    const err = ApiError.fromResponse(-1, 'unauthorized', 401);
    expect(err.httpStatus).toBe(401);
    expect(err.isAuthError()).toBe(true);
    expect(err.isBusinessError()).toBe(false);
  });

  it('detects business errors', () => {
    const err = ApiError.fromResponse(1004, 'content too long');
    expect(err.isAuthError()).toBe(false);
    expect(err.isBusinessError()).toBe(true);
  });

  it('uses known error message', () => {
    const err = ApiError.fromResponse(ErrorCode.INVALID_OPENID, '');
    expect(err.message).toBe('invalid to_openid');
  });

  it('falls back to provided message for unknown codes', () => {
    const err = ApiError.fromResponse(9999, 'custom error');
    expect(err.message).toBe('custom error');
  });
});

describe('NetworkError', () => {
  it('wraps original error', () => {
    const original = new Error('connect ECONNREFUSED');
    const err = new NetworkError('HTTP request failed', original);
    expect(err.message).toBe('HTTP request failed');
    expect(err.originalError).toBe(original);
  });
});

describe('OceanBusError', () => {
  it('creates simple error', () => {
    const err = new OceanBusError('something went wrong');
    expect(err.message).toBe('something went wrong');
    expect(err.name).toBe('OceanBusError');
  });
});
