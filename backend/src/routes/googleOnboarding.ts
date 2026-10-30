import { createHash, randomInt } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';

import { sendMail } from '../lib/mailer.js';
import { redis } from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { createHttpError } from '../middleware/errorHandler.js';

const router = Router();

const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SEND_COOLDOWN_SECONDS = 60;

const otpKey = (userId: string) => `google-onboarding:otp:${userId}`;
const attemptsKey = (userId: string) => `google-onboarding:attempts:${userId}`;
const cooldownKey = (userId: string) => `google-onboarding:cooldown:${userId}`;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function getPendingGoogleUser(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw createHttpError(401, 'Your sign-in session could not be verified. Please sign in again.');
  }

  const provider = (data.user.app_metadata as { provider?: string } | undefined)?.provider;
  const isGoogleUser =
    provider === 'google' ||
    data.user.identities?.some((identity) => identity.provider === 'google') === true;
  const googleIdentity = data.user.identities?.find(
    (identity) => identity.provider === 'google',
  );
  const userCreatedAt = new Date(data.user.created_at).getTime();
  const identityCreatedAt = googleIdentity?.created_at
    ? new Date(googleIdentity.created_at).getTime()
    : Number.NaN;
  const isNewGoogleAccount =
    Number.isFinite(userCreatedAt) &&
    Number.isFinite(identityCreatedAt) &&
    Math.abs(userCreatedAt - identityCreatedAt) <= 5 * 60 * 1000;
  const appMetadata = data.user.app_metadata as
    | { google_onboarding_completed?: boolean }
    | undefined;
  if (
    !isGoogleUser ||
    !isNewGoogleAccount ||
    appMetadata?.google_onboarding_completed === true
  ) {
    throw createHttpError(403, 'Google account onboarding is not pending.');
  }
  if (!data.user.email) {
    throw createHttpError(400, 'Your Google account does not have an email address.');
  }

  return {
    user: data.user,
    email: data.user.email,
    metadata: (data.user.user_metadata as Record<string, unknown> | undefined) ?? {},
  };
}

router.post('/send-otp', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { email } = await getPendingGoogleUser(userId);

    if (await redis.get(cooldownKey(userId))) {
      throw createHttpError(429, 'Please wait before requesting another verification code.');
    }

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await redis.set(otpKey(userId), sha256(otp), 'EX', OTP_TTL_SECONDS);
    await redis.set(attemptsKey(userId), '0', 'EX', OTP_TTL_SECONDS);
    await redis.set(cooldownKey(userId), '1', 'EX', OTP_SEND_COOLDOWN_SECONDS);

    try {
      await sendMail({
        to: email,
        subject: 'Your BawatPieza email verification code',
        text: `Your BawatPieza verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>BawatPieza email verification</h2><p>Enter this code in the app to finish setting up your account:</p><p style="font-size:34px;font-weight:800;letter-spacing:8px">${otp}</p><p>This code expires in 5 minutes. Never share it with anyone.</p></div>`,
      });
    } catch (error) {
      await redis.del(otpKey(userId), attemptsKey(userId), cooldownKey(userId));
      console.error('[google-onboarding] Verification email failed:', (error as Error).message);
      throw createHttpError(502, 'Could not send the verification code. Please try again shortly.');
    }

    res.json({
      ok: true,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAfterSeconds: OTP_SEND_COOLDOWN_SECONDS,
      message: `A verification code was sent to ${email}.`,
    });
  } catch (error) {
    next(error);
  }
});

const verifySchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
  termsAcceptedAt: z.string().datetime(),
  termsVersion: z.string().min(1).max(32),
});

router.post('/verify-otp', requireAuth, async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'A valid 6-digit code and Terms acceptance are required.');
    }

    const userId = req.user!.id;
    const { user, metadata } = await getPendingGoogleUser(userId);
    const storedHash = await redis.get(otpKey(userId));
    if (!storedHash) {
      throw createHttpError(410, 'This code has expired or was already used. Request a new one.');
    }

    const attempts = await redis.incr(attemptsKey(userId));
    if (attempts > OTP_MAX_ATTEMPTS) {
      await redis.del(otpKey(userId), attemptsKey(userId), cooldownKey(userId));
      throw createHttpError(429, 'Too many incorrect attempts. Request a new code.');
    }
    if (sha256(parsed.data.otp) !== storedHash) {
      throw createHttpError(400, 'Incorrect code. Check your email and try again.');
    }

    const verifiedAt = new Date().toISOString();
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...user.app_metadata,
        google_onboarding_completed: true,
      },
      user_metadata: {
        ...metadata,
        terms_accepted_at: parsed.data.termsAcceptedAt,
        terms_version: parsed.data.termsVersion,
        google_email_otp_verified_at: verifiedAt,
        google_onboarding_status: 'completed',
      },
    });
    if (error) {
      throw createHttpError(500, 'Could not finish account setup. Please try again.');
    }

    await redis.del(otpKey(userId), attemptsKey(userId), cooldownKey(userId));
    res.json({ ok: true, verifiedAt });
  } catch (error) {
    next(error);
  }
});

export default router;
