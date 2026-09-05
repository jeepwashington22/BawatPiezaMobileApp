import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { redis } from '../lib/redis.js';
import { createHttpError } from '../middleware/errorHandler.js';

const LIVENESS_ONLY = process.env.HEALTH_LIVENESS_ONLY === 'true';

/**
 * Verifies Supabase connectivity with a cheap head count query.
 * Skipped when HEALTH_LIVENESS_ONLY=true (e.g. lightweight probes).
 */
export async function checkSupabase(_req: Request, res: Response, next: NextFunction): Promise<void> {
  if (LIVENESS_ONLY) {
    next();
    return;
  }

  try {
    const { error } = await supabase
      .from('_health_check')
      .select('count', { count: 'exact', head: true });

    // Missing table (42P01 / PGRST205) or no-rows REST result (PGRST116)
    // still proves connectivity; other errors are real failures.
    if (error && !['42P01', 'PGRST116', 'PGRST205'].includes(error.code ?? '')) {
      next(createHttpError(503, 'Supabase unreachable', error.message));
      return;
    }
    res.locals.supabase = 'ok';
    next();
  } catch (err) {
    next(createHttpError(503, 'Supabase unreachable', (err as Error).message));
  }
}

/**
 * Verifies Redis connectivity with a PING and returns the combined health report.
 */
export async function checkRedis(_req: Request, res: Response, next: NextFunction): Promise<void> {
  if (LIVENESS_ONLY) {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
    return;
  }

  try {
    const pong = await redis.ping();
    res.locals.redis = pong === 'PONG' ? 'ok' : 'degraded';
  } catch (err) {
    next(createHttpError(503, 'Redis unreachable', (err as Error).message));
    return;
  }

  if (!res.headersSent) {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      supabase: res.locals.supabase ?? 'skipped',
      redis: res.locals.redis ?? 'skipped',
      timestamp: new Date().toISOString(),
    });
  }
}
