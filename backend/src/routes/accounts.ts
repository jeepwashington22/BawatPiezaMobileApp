import { Router } from 'express';
import { createHash, randomBytes, randomInt } from 'crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { sendMail } from '../lib/mailer.js';
import { redis } from '../lib/redis.js';
import { createHttpError } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

const INVITE_TTL_SECONDS = 300; // 5 minutes

// ---- Forgot-password OTP flow ----
const OTP_TTL_SECONDS = 300; // OTP valid for 5 minutes
const OTP_MAX_ATTEMPTS = 5; // wrong tries allowed before the code is invalidated
const OTP_SEND_COOLDOWN_SECONDS = 60; // min gap between OTP emails
const RESET_TOKEN_TTL_SECONDS = 600; // reset token issued after OTP check

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const createAccountSchema = z.object({
  firstname: z.string().min(1),
  middlename: z.string().optional().default(''),
  lastname: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'staff']),
  contactNo: z.string().optional().default(''),
});

const setPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

/**
 * Sends the "set your password" invite email. Shared by POST / (create) and
 * POST /resend-invite. Returns true on success, false (logged) on failure so
 * the API can report `verificationEmailSent` without failing the request.
 */
async function sendInviteEmail(opts: {
  email: string;
  fullName: string;
  role: string;
  token: string;
}): Promise<boolean> {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const link = `${frontendUrl}/set-password?token=${opts.token}`;
  try {
    await sendMail({
      to: opts.email,
      subject: 'Set your BawatPieza password (valid for 5 minutes)',
      text: `Hi ${opts.fullName},\n\nAn admin created a ${opts.role.toUpperCase()} account for you.\nSet your password within 5 minutes: ${link}\n\nIf you did not expect this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0a2a4a">Welcome to BawatPieza</h2>
        <p>Hi <b>${opts.fullName}</b>, an admin created a <b>${opts.role.toUpperCase()}</b> account for you.</p>
        <p>Click below to set your password. <b>This link expires in 5 minutes.</b></p>
        <p><a href="${link}" style="background:#0a2a4a;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none">Set my password</a></p>
        <p style="color:#666;font-size:12px">If the button does not work, paste this link: ${link}</p>
      </div>`,
    });
    console.log(`[accounts] Verification email sent to ${opts.email}`);
    return true;
  } catch (mailErr) {
    console.error('[accounts] verification email failed:', (mailErr as Error).message);
    return false;
  }
}

/**
 * POST /accounts
 * Admin-only. Creates a pending account (no password) and emails a
 * verification link that expires in 5 minutes. Only the recipient
 * can set their password through that emailed link.
 */
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'Invalid payload.', parsed.error.flatten());
    }
    const { firstname, middlename, lastname, email, role, contactNo } = parsed.data;
    const fullName = [firstname, middlename, lastname].filter(Boolean).join(' ');

    // Check if user already exists by email
    const { data: existing } = await supabase.auth.admin.listUsers();
    const userExists = existing?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (userExists) {
      throw createHttpError(409, `An account with email ${email} already exists. Please use a different email.`);
    }

    // Create the user WITHOUT a password - they set it via the emailed link.
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        full_name: fullName,
        firstname,
        middlename,
        lastname,
        role,
        contactNo,
      },
    });
    if (createErr) {
      console.error('[accounts] Auth create error:', createErr.message);
      throw createHttpError(409, `Failed to create auth user: ${createErr.message}`);
    }

    // Mirror the account into the user_accounts table (the DB trigger also
    // does this on auth.users insert; upsert keeps it idempotent).
    const { error: tableErr } = await supabase.from('user_accounts').upsert(
      {
        id: created.user?.id,
        firstname,
        middlename: middlename || null,
        lastname,
        role,
        contactNo: contactNo || null,
        email,
        status: 'pending',
        is_active: false,
      },
      { onConflict: 'id' },
    );
    if (tableErr) {
      throw createHttpError(500, `Account created in auth but table sync failed: ${tableErr.message}`);
    }

    // One-time invite token with a strict 5-minute life in Redis.
    const token = randomBytes(32).toString('hex');
    await redis.set(`invite:${token}`, JSON.stringify({ email, fullName, role, userId: created.user?.id }), 'EX', INVITE_TTL_SECONDS);

    const emailSent = await sendInviteEmail({ email, fullName, role, token });

    res.status(201).json({
      ok: true,
      userId: created.user?.id,
      email,
      role,
      verificationEmailSent: emailSent,
      message: emailSent
        ? `Account created. A verification email was sent to ${email}. It expires in 5 minutes.`
        : `Account created, but the verification email could not be sent to ${email}. Check the Brevo sender configuration and try again.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /accounts/set-password
 * Public. Consumes the emailed token (must still exist in Redis => within
 * 5 minutes) and sets the user's password. Only the recipient of the email
 * can do this, because only they hold the token.
 */
router.post('/set-password', async (req, res, next) => {
  try {
    const parsed = setPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'Token and a password of at least 8 characters are required.');
    }
    const { token, password } = parsed.data;

    const key = `invite:${token}`;
    const raw = await redis.get(key);
    if (!raw) {
      throw createHttpError(410, 'This link has expired or was already used. Ask an admin to resend.');
    }
    const { email, fullName, role, userId } = JSON.parse(raw) as { email: string; fullName: string; role: string; userId?: string };

    // Consume the token immediately (one-time use).
    await redis.del(key);

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId as string, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (updateErr) {
      throw createHttpError(500, updateErr.message);
    }

    // Activate the row in user_accounts.
    const { error: tableErr } = await supabase
      .from('user_accounts')
      .update({ status: 'active', is_active: true })
      .eq('id', userId as string);
    if (tableErr) {
      throw createHttpError(500, `Password set but table sync failed: ${tableErr.message}`);
    }

    res.json({ ok: true, message: 'Password set. You can now sign in.' });
  } catch (err) {
    next(err);
  }
});

/**
 * Sends the 6-digit password-reset OTP email via Brevo.
 * Returns true on success, false (logged) on failure.
 */
async function sendOtpEmail(opts: { email: string; fullName: string; otp: string }): Promise<boolean> {
  try {
    await sendMail({
      to: opts.email,
      subject: `Your BawatPieza verification code: ${opts.otp} (valid 5 minutes)`,
      text: `Hi ${opts.fullName},\n\nYour password reset code is ${opts.otp}. It expires in 5 minutes.\nIf you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0a2a4a">BawatPieza password reset</h2>
        <p>Hi <b>${opts.fullName}</b>, use the verification code below to reset your password.</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0a2a4a;background:#f6c44522;display:inline-block;padding:10px 22px;border-radius:12px">${opts.otp}</p>
        <p><b>This code expires in 5 minutes.</b> Never share it with anyone.</p>
        <p style="color:#666;font-size:12px">If you did not request a password reset, you can safely ignore this email.</p>
      </div>`,
    });
    console.log(`[accounts] OTP email sent to ${opts.email}`);
    return true;
  } catch (mailErr) {
    console.error('[accounts] OTP email failed:', (mailErr as Error).message);
    return false;
  }
}

/**
 * POST /accounts/forgot-password
 * Public. Sends a 6-digit OTP to the account email (via Brevo) that is valid
 * for 5 minutes. Limited to one email per 60 seconds and 5 verification
 * attempts per code. Responds generically so it never reveals whether the
 * email is registered.
 */
const forgotSchema = z.object({ email: z.string().email() });

router.post('/forgot-password', async (req, res, next) => {
  try {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'A valid email is required.');
    }
    const email = parsed.data.email.toLowerCase();

    // Look up the account row (mirrors auth.users).
    const { data: row, error: rowErr } = await supabase
      .from('user_accounts')
      .select('id, firstname, lastname, email')
      .eq('email', email)
      .maybeSingle();
    if (rowErr) throw createHttpError(500, rowErr.message);

    // Generic response — do not reveal account existence.
    if (!row) {
      res.json({ ok: true, otpSent: false, message: 'If that email is registered, a verification code has been sent.' });
      return;
    }

    // Simple cooldown so the inbox (and Brevo quota) cannot be spammed.
    const cooling = await redis.get(`fp:cool:${email}`);
    if (cooling) {
      throw createHttpError(429, 'Please wait a minute before requesting another code.');
    }

    const fullName = [row.firstname, row.lastname].filter(Boolean).join(' ') || email;
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');

    // Store only a hash of the OTP; attempts counter dies with it.
    await redis.set(`fp:otp:${email}`, sha256(otp), 'EX', OTP_TTL_SECONDS);
    await redis.set(`fp:att:${email}`, '0', 'EX', OTP_TTL_SECONDS);
    await redis.set(`fp:cool:${email}`, '1', 'EX', OTP_SEND_COOLDOWN_SECONDS);

    const sent = await sendOtpEmail({ email, fullName, otp });

    res.json({
      ok: true,
      otpSent: sent,
      expiresInSeconds: OTP_TTL_SECONDS,
      message: sent
        ? `A verification code was sent to ${email}. It expires in ${OTP_TTL_SECONDS / 60} minutes.`
        : `Could not send the verification email to ${email}. Please try again shortly.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /accounts/verify-otp
 * Public. Checks the emailed OTP (max 5 attempts). On success consumes the
 * OTP and returns a one-time reset token the client must present to
 * POST /accounts/reset-password within 10 minutes.
 */
const verifySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'The code must be 6 digits.'),
});

router.post('/verify-otp', async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'Email and the 6-digit code are required.');
    }
    const email = parsed.data.email.toLowerCase();
    const { otp } = parsed.data;

    const otpHash = await redis.get(`fp:otp:${email}`);
    if (!otpHash) {
      throw createHttpError(410, 'This code has expired or was already used. Request a new one.');
    }

    // Count attempts; invalidate the code after too many wrong tries.
    const attempts = await redis.incr(`fp:att:${email}`);
    if (attempts !== null && attempts > OTP_MAX_ATTEMPTS) {
      await redis.del(`fp:otp:${email}`, `fp:att:${email}`);
      throw createHttpError(429, 'Too many incorrect attempts. Please request a new code.');
    }
    if (sha256(otp) !== otpHash) {
      throw createHttpError(400, 'Incorrect code. Please check the email and try again.');
    }

    // OTP is correct — consume it and mint a one-time reset token.
    await redis.del(`fp:otp:${email}`, `fp:att:${email}`);

    const { data: row, error: rowErr } = await supabase
      .from('user_accounts')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (rowErr || !row) throw createHttpError(500, 'Account lookup failed.');

    const resetToken = randomBytes(32).toString('hex');
    await redis.set(`fp:reset:${resetToken}`, JSON.stringify({ userId: row.id, email }), 'EX', RESET_TOKEN_TTL_SECONDS);

    res.json({
      ok: true,
      resetToken,
      expiresInSeconds: RESET_TOKEN_TTL_SECONDS,
      message: 'Code verified. You may now set a new password.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /accounts/reset-password
 * Public. Completes the forgot-password flow: consumes the one-time reset
 * token (issued only after a correct OTP) and sets the new password.
 * Also confirms the email and activates the account, so a pending user who
 * proves mailbox ownership this way can recover too.
 */
const resetSchema = z.object({
  resetToken: z.string().min(10),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'A reset token and a password of at least 8 characters are required.');
    }
    const { resetToken, password } = parsed.data;

    const raw = await redis.get(`fp:reset:${resetToken}`);
    if (!raw) {
      throw createHttpError(410, 'This reset session has expired or was already used. Please start again.');
    }
    const { userId } = JSON.parse(raw) as { userId: string; email: string };

    // Consume immediately (one-time use).
    await redis.del(`fp:reset:${resetToken}`);

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateErr) throw createHttpError(500, updateErr.message);

    const { error: tableErr } = await supabase
      .from('user_accounts')
      .update({ status: 'active', is_active: true })
      .eq('id', userId);
    if (tableErr) throw createHttpError(500, `Password reset but table sync failed: ${tableErr.message}`);

    res.json({ ok: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /accounts/resend-invite
 * Admin-only. Re-issues a fresh 5-minute invite token for a pending account
 * and re-sends the verification email. Use when the original email failed,
 * landed in spam, or the 5-minute window expired before the password was set.
 */
const resendSchema = z.object({ email: z.string().email() });

router.post('/resend-invite', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const parsed = resendSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'A valid email is required.');
    }
    const { email } = parsed.data;

    // Look up the pending account row.
    const { data: row, error: rowErr } = await supabase
      .from('user_accounts')
      .select('id, firstname, lastname, role, status, email')
      .eq('email', email)
      .maybeSingle();
    if (rowErr) throw createHttpError(500, rowErr.message);
    if (!row) throw createHttpError(404, `No account found for ${email}.`);
    if (row.status === 'active') {
      throw createHttpError(409, `${email} is already active. No invite needed.`);
    }

    const fullName = [row.firstname, row.lastname].filter(Boolean).join(' ') || email;

    // Fresh one-time token (invalidates nothing — old tokens simply expire).
    const token = randomBytes(32).toString('hex');
    await redis.set(
      `invite:${token}`,
      JSON.stringify({ email, fullName, role: row.role, userId: row.id }),
      'EX',
      INVITE_TTL_SECONDS,
    );

    const emailSent = await sendInviteEmail({ email, fullName, role: row.role, token });

    res.json({
      ok: true,
      email,
      verificationEmailSent: emailSent,
      message: emailSent
        ? `A new verification email was sent to ${email}. It expires in ${INVITE_TTL_SECONDS / 60} minutes.`
        : `Could not send the verification email to ${email}. Check the Brevo configuration and backend logs.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /accounts
 * Admin-only. Lists accounts from the user_accounts table (synced with auth.users).
 */
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
            .from('user_accounts')
      .select('id, firstname, middlename, lastname, role, contactNo, email, status, is_active, created_at')
      .order('created_at', { ascending: false });
    if (error) throw createHttpError(500, error.message);

    res.json({
      ok: true,
      accounts: (data ?? []).map((a) => ({
        id: a.id,
        firstname: a.firstname,
        middlename: a.middlename ?? '',
        lastname: a.lastname,
        name: [a.firstname, a.lastname].filter(Boolean).join(' '),
        role: a.role,
        contactNo: a.contactNo ?? '',
        email: a.email,
        status: a.status,
        is_active: a.is_active,
        created_at: a.created_at,
        created: a.created_at,
        createdTime: new Date(a.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
