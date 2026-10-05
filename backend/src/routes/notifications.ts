import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { createHttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /notifications
 * The signed-in user's in-app notifications, newest first. `unread` is
 * returned alongside so the bell badge does not need a second call.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.user!.id;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, reference_id, read_at, created_at')
      .eq('user_id', me)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw createHttpError(500, error.message);

    const rows = data ?? [];
    res.json({
      ok: true,
      notifications: rows,
      unread: rows.filter((n) => !n.read_at).length,
    });
  } catch (err) {
    next(err);
  }
});

const readSchema = z.object({ ids: z.array(z.string().uuid()).optional() });

/**
 * POST /notifications/read
 * Marks the caller's notifications read — all of them, or just `ids` when the
 * app knows exactly which rows were seen.
 */
router.post('/read', requireAuth, async (req, res, next) => {
  try {
    const parsed = readSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw createHttpError(400, 'Invalid payload.', parsed.error.flatten());
    }
    const me = req.user!.id;
    const now = new Date().toISOString();

    let query = supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', me)
      .is('read_at', null);
    if (parsed.data.ids?.length) {
      query = query.in('id', parsed.data.ids);
    }
    const { error } = await query;
    if (error) throw createHttpError(500, error.message);

    res.json({ ok: true, message: 'Notifications marked as read.' });
  } catch (err) {
    next(err);
  }
});

export default router;