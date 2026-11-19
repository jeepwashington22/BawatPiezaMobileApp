import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export interface AppError extends Error {
  status?: number;
  details?: unknown;
}

export function createHttpError(status: number, message: string, details?: unknown): AppError {
  const error: AppError = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction): void {
  const status = err.status ?? 500;
  if (status >= 500) {
    logger.error(`[error] ${err.stack ?? err.message}`);
  }
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(err.details !== undefined ? { details: err.details } : {}),
  });
}
