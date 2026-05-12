import { ErrorCode, ErrorMessages } from '../types/api';

export class ApiError extends Error {
  code: number;
  httpStatus: number;

  constructor(code: number, msg: string, httpStatus: number = 200) {
    super(msg);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }

  static fromResponse(code: number, msg: string, httpStatus: number = 200): ApiError {
    const message = ErrorMessages[code] || msg || 'unknown error';
    return new ApiError(code, message, httpStatus);
  }

  isAuthError(): boolean {
    return this.httpStatus === 401;
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
