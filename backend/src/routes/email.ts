import { Router } from 'express';
import { sendNotification, testConnection } from '../controllers/emailController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Sending notifications and testing SMTP require a signed-in user.
router.post('/send', requireAuth, sendNotification);
router.get('/test', requireAuth, testConnection);

export default router;