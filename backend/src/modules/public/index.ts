import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { supabase } from '../../lib/supabase.js';
import { createHttpError } from '../../middleware/errorHandler.js';
import { notImplemented } from '../../utils/http.js';

const router = Router();

router.get('/metrics', notImplemented('Public metrics'));

router.get('/hardware-test-settings', requireAuth, async (_request, response, next) => {
  try {
    const { data, error } = await supabase
      .from('hardware_test_settings')
      .select('enabled, simulated_at, battery_percentage, updated_at')
      .eq('id', 1)
      .single();
    if (error) throw createHttpError(502, 'Hardware test settings could not be loaded.', error.message);
    response.json({ settings: data });
  } catch (error) {
    next(error);
  }
});

export default router;
