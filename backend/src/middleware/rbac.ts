import type { NextFunction, Request, Response } from 'express';
import { createHttpError } from './errorHandler.js';
import type { UserRole } from '../types/api.js';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(createHttpError(401, 'Unauthorized.'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(createHttpError(403, 'You do not have permission to access this resource.'));
      return;
    }
    next();
  };
}
