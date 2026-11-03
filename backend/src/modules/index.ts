import { Router } from 'express';
import authRouter from './auth/index.js';
import telemetryRouter from './telemetry/index.js';
import storeRouter from './store/index.js';
import adminRouter from './admin/index.js';
import publicRouter from './public/index.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/telemetry', telemetryRouter);
router.use('/store', storeRouter);
router.use('/admin', adminRouter);
router.use('/public', publicRouter);

export default router;
