import { ErrorCode, ErrorMessages } from '../types/api';

export class ApiError extends Error {
  code: number;
  httpStatus: number;
  retryAfterSeconds: number | null;

  constructor(code: number, msg: string, httpStatus: number = 200, retryAfterSeconds: number | null = null) {
    super(msg);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  static fromResponse(code: number, msg: string, httpStatus: number = 200, retryAfterSeconds: number | null = null): ApiError {
    const message = ErrorMessages[code] || msg || 'unknown error';
    return new ApiError(code, message, httpStatus, retryAfterSeconds);
  }

  isAuthError(): boolean {
    return this.httpStatus === 401 || this.httpStatus === 403;
  }

  isRateLimited(): boolean {
    return this.code === ErrorCode.RATE_LIMITED;
  }

  isBusinessError(): boolean {
    return this.httpStatus === 200 && this.code !== ErrorCode.SUCCESS;
  }
}

export class NetworkError extends Error {
  originalError: Error;

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

export class OceanBusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OceanBusError';
  }
}
