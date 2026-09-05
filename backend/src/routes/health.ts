import { Router } from 'express';
import { checkSupabase, checkRedis } from '../controllers/healthController.js';

const router = Router();

router.get('/', checkSupabase, checkRedis);

export default router;
