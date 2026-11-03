import { Router } from 'express';
import { notImplemented } from '../../utils/http.js';

const router = Router();

router.get('/summary', notImplemented('Telemetry'));
router.get('/heatmap', notImplemented('Telemetry'));
router.post('/events', notImplemented('Telemetry'));

export default router;
