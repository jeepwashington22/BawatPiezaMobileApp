export type UserRole = 'admin' | 'staff' | 'customer' | 'device';

export interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}
