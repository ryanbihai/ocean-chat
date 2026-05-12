// OceanBus API response envelope
// All L0 endpoints return HTTP 200; business errors via body.code

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export enum ErrorCode {
  SUCCESS = 0,
  MISSING_FIELD = 1001,
  INVALID_OPENID = 1002,
  INVALID_CLIENT_MSG_ID = 1003,
  CONTENT_TOO_LONG = 1004,
  INSUFFICIENT_PERMISSION = 1005,
  INVALID_OPENID_REVERSE = 1006,
  BLOCKED_RECIPIENT = 2001,
  RATE_LIMITED = 1007,
}

export const ErrorMessages: Record<number, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.MISSING_FIELD]: 'missing required field',
  [ErrorCode.INVALID_OPENID]: 'invalid to_openid',
  [ErrorCode.INVALID_CLIENT_MSG_ID]: 'invalid client_msg_id format',
  [ErrorCode.CONTENT_TOO_LONG]: 'content exceeds 128k character limit',
  [ErrorCode.INSUFFICIENT_PERMISSION]: 'insufficient permission',
  [ErrorCode.INVALID_OPENID_REVERSE]: 'invalid openid for reverse lookup',
  [ErrorCode.BLOCKED_RECIPIENT]: 'target blocked, message intercepted',
  [ErrorCode.RATE_LIMITED]: 'rate limited, check Retry-After header',
};
