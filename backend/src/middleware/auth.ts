import type { NextFunction, Request, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { createHttpError } from './errorHandler.js';

export type AuthedUser = {
  id: string;
  email: string;
  role: 'admin' | 'staff';
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/**
 * requireAuth - blocks any request without a valid Supabase session token.
 * Attaches the resolved user (id, email, role) to req.user.
 * Use on every route that must only be reachable by signed-in users.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw createHttpError(401, 'Unauthorized. Sign in to access this resource.');
    }
    const token = header.slice('Bearer '.length);

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw createHttpError(401, 'Session is invalid or has expired. Sign in again.');
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? '',
      role: (data.user.user_metadata as { role?: string } | undefined)?.role === 'admin' ? 'admin' : 'staff',
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * requireAdmin - must run AFTER requireAuth. Blocks non-admin users (403).
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(createHttpError(401, 'Unauthorized.'));
    return;
  }
  if (req.user.role !== 'admin') {
    next(createHttpError(403, 'Admin privileges required.'));
    return;
  }
  next();
}
