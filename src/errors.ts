// =============================================
// @relayon/sdk — Error Types
// =============================================

export class RelayonError extends Error {
  /** HTTP status code */
  statusCode: number;
  /** Error code from the API (e.g., VALIDATION_ERROR, NOT_FOUND) */
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'RelayonError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
