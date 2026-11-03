import type { RequestHandler } from 'express';
import { createHttpError } from '../middleware/errorHandler.js';

export function notImplemented(domain: string): RequestHandler {
  return (_req, _res, next) => {
    next(createHttpError(501, `${domain} API contract is not implemented yet.`));
  };
}
