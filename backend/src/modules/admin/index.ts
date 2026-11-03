import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { notImplemented } from '../../utils/http.js';

const router = Router();

router.use(requireAuth, requireRole('admin', 'staff'));
router.get('/overview', notImplemented('Admin'));
router.get('/sales', notImplemented('Admin'));
router.get('/devices', notImplemented('Admin'));

export default router;
