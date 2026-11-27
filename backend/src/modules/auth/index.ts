import { Router } from 'express';
import accountsRouter from '../../routes/accounts.js';
import googleOnboardingRouter from '../../routes/googleOnboarding.js';
import twoFactorRouter from '../../routes/twoFactor.js';

const router = Router();

router.use('/accounts/2fa', twoFactorRouter);
router.use('/accounts/google-onboarding', googleOnboardingRouter);
router.use('/accounts', accountsRouter);

export default router;
