import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { supabase } from '../../lib/supabase.js';
import { createHttpError } from '../../middleware/errorHandler.js';
import { notImplemented } from '../../utils/http.js';

const router = Router();

async function assertActiveBusinessAdmin(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('business_accounts')
    .select('role, status, is_active')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw createHttpError(502, 'Business access could not be verified.', error.message);
  if (!data || data.role !== 'admin' || data.status !== 'active' || !data.is_active) {
    throw createHttpError(403, 'Only active business admins can manage hardware test settings.');
  }
}

router.get('/hardware-test-settings', requireAuth, async (request, response, next) => {
  try {
    const userId = request.user?.id;
    if (!userId) throw createHttpError(401, 'Unauthorized.');
    await assertActiveBusinessAdmin(userId);

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

router.put('/hardware-test-settings', requireAuth, async (request, response, next) => {
  try {
    const userId = request.user?.id;
    if (!userId) throw createHttpError(401, 'Unauthorized.');
    await assertActiveBusinessAdmin(userId);

    const { enabled, simulatedAt, batteryPercentage } = request.body ?? {};
    const timestamp = typeof simulatedAt === 'string' ? Date.parse(simulatedAt) : Number.NaN;
    if (
      typeof enabled !== 'boolean' ||
      typeof simulatedAt !== 'string' ||
      !Number.isFinite(timestamp) ||
      !simulatedAt.endsWith('Z') ||
      typeof batteryPercentage !== 'number' ||
      !Number.isFinite(batteryPercentage) ||
      batteryPercentage < 0 ||
      batteryPercentage > 100
    ) {
      throw createHttpError(400, 'Enter a valid test date and time, battery percentage from 0 to 100, and mode.');
    }

    const { data, error } = await supabase
      .from('hardware_test_settings')
      .upsert({
        id: 1,
        enabled,
        simulated_at: new Date(timestamp).toISOString(),
        battery_percentage: batteryPercentage,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }, { onConflict: 'id' })
      .select('enabled, simulated_at, battery_percentage, updated_at')
      .single();
    if (error) throw createHttpError(502, 'Hardware test settings could not be saved.', error.message);
    response.json({ settings: data });
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth, requireRole('admin', 'staff'));
router.get('/overview', notImplemented('Admin'));
router.get('/sales', notImplemented('Admin'));
router.get('/devices', notImplemented('Admin'));

export default router;
