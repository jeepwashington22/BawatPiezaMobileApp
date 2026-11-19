import { Router } from 'express';
import { notImplemented } from '../../utils/http.js';

const router = Router();

router.get('/products', notImplemented('Store'));
router.post('/checkout', notImplemented('Store'));
router.post('/payments/webhook', notImplemented('Store'));

export default router;
