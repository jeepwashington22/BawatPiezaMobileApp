import { Router } from 'express';
import { notImplemented } from '../../utils/http.js';

const router = Router();

router.get('/metrics', notImplemented('Public metrics'));

export default router;
