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

/**
 * Redis key namespace for an OTP flow. `fp` = forgot password, `lg` = login
 * two-factor. Keeping the flows in separate namespaces means a code issued for
 * one purpose can never be replayed against the other.
 */
type OtpScope = 'fp' | 'lg';

/**
 * Creates a fresh 6-digit code for `email` and stores only its SHA-256 hash,
 * plus an attempts counter that expires together with the code. Enforces a 60s
 * cooldown so the inbox (and the Brevo quota) cannot be spammed.
 *
 * Throws 429 while the cooldown is still active.
 */
async function issueOtp(scope: OtpScope, email: string): Promise<string> {
  const cooling = await redis.get(`${scope}:cool:${email}`);
  if (cooling) {
    throw createHttpError(429, 'Please wait a minute before requesting another code.');
  }

  const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await redis.set(`${scope}:otp:${email}`, sha256(otp), 'EX', OTP_TTL_SECONDS);
  await redis.set(`${scope}:att:${email}`, '0', 'EX', OTP_TTL_SECONDS);
  await redis.set(`${scope}:cool:${email}`, '1', 'EX', OTP_SEND_COOLDOWN_SECONDS);
  return otp;
}

/**
 * Checks `otp` against the stored hash, counting failed attempts, and consumes
 * the code once it matches so it cannot be replayed.
 *
 * Throws when the code is missing/expired (410), exhausted (429) or wrong (400).
 */
async function consumeOtp(scope: OtpScope, email: string, otp: string): Promise<void> {
  const otpHash = await redis.get(`${scope}:otp:${email}`);
  if (!otpHash) {
    throw createHttpError(410, 'This code has expired or was already used. Request a new one.');
  }

  // Count attempts; invalidate the code after too many wrong tries.
  const attempts = await redis.incr(`${scope}:att:${email}`);
  if (attempts !== null && attempts > OTP_MAX_ATTEMPTS) {
    await redis.del(`${scope}:otp:${email}`, `${scope}:att:${email}`);
    throw createHttpError(429, 'Too many incorrect attempts. Please request a new code.');
  }
  if (sha256(otp) !== otpHash) {
    throw createHttpError(400, 'Incorrect code. Please check the email and try again.');
  }

  await redis.del(`${scope}:otp:${email}`, `${scope}:att:${email}`);
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
 * Sends a welcome email to a newly created account (e.g., after Google
 * Sign-In or admin-created account). Reuses the existing Brevo mailer.
 */
const welcomeSchema = z.object({
  email: z.string().email(),
  fullName: z.string().optional(),
  firstName: z.string().optional(),
});

/**
 * POST /accounts/welcome-email
 * Sends the "Welcome to BawatPieza" email. Designed to be called:
 *  - by the mobile app right after a new Google Sign-In account is created,
 *  - or by the Supabase Edge Function on the auth.users insert trigger.
 */
router.post('/welcome-email', async (req, res, next) => {
  try {
    const parsed = welcomeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'Invalid payload.', parsed.error.flatten());
    }
    const { email, fullName, firstName } = parsed.data;
    const name = firstName || fullName?.split(' ')[0] || 'there';
    const appName = 'BawatPieza';
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const subject = `Welcome to ${appName}! 🎉`;

    await sendMail({
      to: email,
      subject,
      text: `Hi ${name},\n\nWelcome to ${appName}! 🎉\n\nThank you for joining ${appName}! We're excited to have you on board.\n\nSign In: ${frontendUrl}/\n\nHappy exploring! 🚀`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#0A2A4A;padding:40px 20px;text-align:center">
        <h1 style="color:#F6C445;font-size:28px;margin:0 0 12px">Welcome to ${appName}! 🎉</h1>
        <p style="color:#fff;font-size:16px;line-height:1.6">Hi <b>${name}</b>,</p>
        <p style="color:#fff;font-size:15px;line-height:1.6">Thank you for joining <b>${appName}</b>! We're excited to have you on board.</p>
        <a href="${frontendUrl}/" style="display:inline-block;background:#F6C445;color:#0A2A4A;padding:14px 30px;border-radius:10px;text-decoration:none;font-weight:bold;margin-top:20px">Sign In to Your Account</a>
      </div>`,
    });

    res.status(202).json({ ok: true, message: `Welcome email sent to ${email}` });
  } catch (err) {
    next(err);
  }
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
 * Sends a 6-digit OTP email via Brevo.
 *
 * `purpose` picks the wording: `reset` drives the forgot-password flow, `login`
 * is the second factor asked for right after a correct password.
 * Returns true on success, false (logged) on failure.
 */
async function sendOtpEmail(opts: {
  email: string;
  fullName: string;
  otp: string;
  purpose: 'reset' | 'login';
}): Promise<boolean> {
  const isLogin = opts.purpose === 'login';
  const heading = isLogin ? 'BawatPieza sign-in verification' : 'BawatPieza password reset';
  const lead = isLogin
    ? 'use the verification code below to finish signing in.'
    : 'use the verification code below to reset your password.';
  const footer = isLogin
    ? 'If you did not try to sign in, someone may have your password. Change it right away.'
    : 'If you did not request a password reset, you can safely ignore this email.';

  try {
    await sendMail({
      to: opts.email,
      subject: `Your BawatPieza verification code: ${opts.otp} (valid 5 minutes)`,
      text: `Hi ${opts.fullName},\n\nYour ${isLogin ? 'sign-in' : 'password reset'} code is ${opts.otp}. It expires in 5 minutes.\n${footer}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0a2a4a">${heading}</h2>
        <p>Hi <b>${opts.fullName}</b>, ${lead}</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0a2a4a;background:#f6c44522;display:inline-block;padding:10px 22px;border-radius:12px">${opts.otp}</p>
        <p><b>This code expires in 5 minutes.</b> Never share it with anyone.</p>
        <p style="color:#666;font-size:12px">${footer}</p>
      </div>`,
    });
    console.log(`[accounts] ${isLogin ? 'Login' : 'Reset'} OTP email sent to ${opts.email}`);
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

    const sent = await sendOtpEmail({ email, fullName, otp, purpose: 'reset' });

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
 * Shared-user (invite) flow
 * ---------------------------------------------------------------------------
 * Two-step: the inviter picks an existing account -> a 'pending' share invite
 * plus an in-app notification for the invitee; once the invitee accepts, the
 * row flips to 'accepted' (they are now a shared user) and the inviter is
 * notified. All rows go through the service-role client, so no client-side
 * RLS policy is involved (see migration 008).
 */

/** Inserts an in-app notification row. Failures are logged, never thrown —
 * a missing badge must not roll back the invite itself. */
async function pushNotification(opts: {
  userId: string;
  actorId?: string | null;
  type: 'share_invite' | 'share_accepted' | 'share_declined';
  title: string;
  body: string;
  referenceId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: opts.userId,
    actor_id: opts.actorId ?? null,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    reference_id: opts.referenceId ?? null,
  });
  if (error) console.error('[accounts] notification insert failed:', error.message);
}

/** Display name for a user_accounts row, falling back to the email. */
function fullNameOf(row: { firstname?: string | null; lastname?: string | null; name?: string | null; email?: string | null }): string {
  return (
    row.name ?? [row.firstname, row.lastname].filter(Boolean).join(' ') ?? row.email ?? 'Someone'
  );
}

const inviteSchema = z.object({ inviteeId: z.string().uuid() });

/**
 * GET /accounts/invitable
 * Active accounts the signed-in user can still invite: excludes self and any
 * pair that already has a pending or accepted share invite (a declined invite
 * may be sent again — it just flips the existing row back to pending).
 */
router.get('/invitable', requireAuth, async (req, res, next) => {
  try {
    const me = req.user!.id;

    const { data, error } = await supabase
      .from('user_accounts')
      .select('id, firstname, middlename, lastname, role, email, status')
      .eq('status', 'active')
      .neq('id', me)
      .order('firstname', { ascending: true });
    if (error) throw createHttpError(500, error.message);

    const { data: invites, error: invErr } = await supabase
      .from('share_invites')
      .select('inviter_id, invitee_id, status')
      .or(`inviter_id.eq.${me},invitee_id.eq.${me}`);
    if (invErr) throw createHttpError(500, invErr.message);

    const blocked = new Set(
      (invites ?? [])
        .filter((i) => i.status === 'pending' || i.status === 'accepted')
        .map((i) => (i.inviter_id === me ? i.invitee_id : i.inviter_id)),
    );

    res.json({
      ok: true,
      accounts: (data ?? [])
        .filter((a) => !blocked.has(a.id))
        .map((a) => ({
          id: a.id,
          firstname: a.firstname,
          middlename: a.middlename ?? '',
          lastname: a.lastname,
          name: [a.firstname, a.lastname].filter(Boolean).join(' '),
          role: a.role,
          email: a.email,
        })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /accounts/invite
 * Creates (or re-opens) a pending share invite for an existing active account
 * and sends the invitee an in-app notification.
 */
router.post('/invite', requireAuth, async (req, res, next) => {
  try {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'A valid inviteeId (uuid) is required.', parsed.error.flatten());
    }
    const me = req.user!.id;
    const { inviteeId } = parsed.data;
    if (inviteeId === me) throw createHttpError(400, 'You cannot invite yourself.');

    const { data: invitee, error: invErr } = await supabase
      .from('user_accounts')
      .select('id, firstname, lastname, email, status')
      .eq('id', inviteeId)
      .maybeSingle();
    if (invErr) throw createHttpError(500, invErr.message);
    if (!invitee) throw createHttpError(404, 'That account no longer exists.');
    if (invitee.status !== 'active') {
      throw createHttpError(409, `${invitee.email} has not activated their account yet.`);
    }

    // Reusing a declined row is allowed; a pending/accepted pair is a 409.
    const { data: existing, error: exErr } = await supabase
      .from('share_invites')
      .select('id, status')
      .eq('inviter_id', me)
      .eq('invitee_id', inviteeId)
      .maybeSingle();
    if (exErr) throw createHttpError(500, exErr.message);
    if (existing && existing.status === 'pending') {
      throw createHttpError(409, 'You already invited this user. Waiting for their response.');
    }
    if (existing && existing.status === 'accepted') {
      throw createHttpError(409, 'This user is already one of your shared users.');
    }

    let inviteId: string;
    if (existing) {
      const { data: reopened, error: upErr } = await supabase
        .from('share_invites')
        .update({ status: 'pending', created_at: new Date().toISOString(), responded_at: null })
        .eq('id', existing.id)
        .select('id')
        .single();
      if (upErr) throw createHttpError(500, upErr.message);
      inviteId = reopened!.id;
    } else {
      const { data: created, error: insErr } = await supabase
        .from('share_invites')
        .insert({ inviter_id: me, invitee_id: inviteeId, status: 'pending' })
        .select('id')
        .single();
      if (insErr) throw createHttpError(500, insErr.message);
      inviteId = created!.id;
    }

    const { data: inviterRow } = await supabase
      .from('user_accounts')
      .select('firstname, lastname, email')
      .eq('id', me)
      .maybeSingle();

    await pushNotification({
      userId: inviteeId,
      actorId: me,
      type: 'share_invite',
      title: 'You have been invited as a shared user',
      body: `${fullNameOf(inviterRow ?? {})} invited you to share their BawatPieza account. Open Shared Users to accept or decline.`,
      referenceId: inviteId,
    });

    res.status(201).json({
      ok: true,
      invite: { id: inviteId, status: 'pending' },
      message: `${fullNameOf(invitee)} was invited. They will show as a shared user once they accept.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /accounts/invites
 * The signed-in user's invite context: `received` (pending invites awaiting
 * their response) and `sent` (everything they have sent, with status).
 */
router.get('/invites', requireAuth, async (req, res, next) => {
  try {
    const me = req.user!.id;

    const { data, error } = await supabase
      .from('share_invites')
      .select('id, inviter_id, invitee_id, status, created_at, responded_at')
      .or(`inviter_id.eq.${me},invitee_id.eq.${me}`)
      .order('created_at', { ascending: false });
    if (error) throw createHttpError(500, error.message);

    const rows = data ?? [];
    const otherIds = [...new Set(rows.map((r) => (r.inviter_id === me ? r.invitee_id : r.inviter_id)))];
    let people: { id: string; firstname: string; lastname: string; email: string }[] = [];
    if (otherIds.length) {
      const { data: found, error: pErr } = await supabase
        .from('user_accounts')
        .select('id, firstname, lastname, email')
        .in('id', otherIds);
      if (pErr) throw createHttpError(500, pErr.message);
      people = found ?? [];
    }
    const byId = new Map(people.map((p) => [p.id, p]));

    const project = (r: (typeof rows)[number], side: 'received' | 'sent') => {
      const otherId = r.inviter_id === me ? r.invitee_id : r.inviter_id;
      const person = byId.get(otherId);
      return {
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        responded_at: r.responded_at,
        counterpart: {
          id: otherId,
          name: person ? fullNameOf(person) : 'Unknown user',
          email: person?.email ?? null,
        },
        side,
      };
    };

    res.json({
      ok: true,
      received: rows.filter((r) => r.invitee_id === me && r.status === 'pending').map((r) => project(r, 'received')),
      sent: rows.filter((r) => r.inviter_id === me).map((r) => project(r, 'sent')),
    });
  } catch (err) {
    next(err);
  }
});

/** Loads one invite and asserts the caller is the pending invitee. */
async function consumeInviteForResponse(inviteId: string, userId: string) {
  const { data: invite, error } = await supabase
    .from('share_invites')
    .select('id, inviter_id, invitee_id, status')
    .eq('id', inviteId)
    .maybeSingle();
  if (error) throw createHttpError(500, error.message);
  if (!invite) throw createHttpError(404, 'This invite no longer exists.');
  if (invite.invitee_id !== userId) throw createHttpError(403, 'This invite was not sent to you.');
  if (invite.status !== 'pending') throw createHttpError(409, 'This invite has already been answered.');
  return invite;
}

/** Caller's own display name, for notification copy. */
async function callerName(userId: string): Promise<string> {
  const { data } = await supabase
    .from('user_accounts')
    .select('firstname, lastname, email')
    .eq('id', userId)
    .maybeSingle();
  return fullNameOf(data ?? {});
}

/**
 * POST /accounts/invites/:id/accept
 * The invitee accepts -> they become a shared user and the inviter is
 * notified in-app.
 */
router.post('/invites/:id/accept', requireAuth, async (req, res, next) => {
  try {
    const me = req.user!.id;
    const invite = await consumeInviteForResponse(String(req.params.id), me);

    const { error: upErr } = await supabase
      .from('share_invites')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', invite.id);
    if (upErr) throw createHttpError(500, upErr.message);

    await pushNotification({
      userId: invite.inviter_id,
      actorId: me,
      type: 'share_accepted',
      title: 'Invite accepted',
      body: `${await callerName(me)} accepted your invite and is now one of your shared users.`,
      referenceId: invite.id,
    });

    res.json({
      ok: true,
      invite: { id: invite.id, status: 'accepted' },
      message: 'Access granted — you are now a shared user.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /accounts/invites/:id/decline
 * The invitee declines; the inviter is notified in-app and may re-invite
 * later (the row flips back to pending on the next POST /accounts/invite).
 */
router.post('/invites/:id/decline', requireAuth, async (req, res, next) => {
  try {
    const me = req.user!.id;
    const invite = await consumeInviteForResponse(String(req.params.id), me);

    const { error: upErr } = await supabase
      .from('share_invites')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', invite.id);
    if (upErr) throw createHttpError(500, upErr.message);

    await pushNotification({
      userId: invite.inviter_id,
      actorId: me,
      type: 'share_declined',
      title: 'Invite declined',
      body: `${await callerName(me)} declined your shared-user invite. You can invite them again later.`,
      referenceId: invite.id,
    });

    res.json({
      ok: true,
      invite: { id: invite.id, status: 'declined' },
      message: 'Invite declined.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /accounts
 * Lists accounts from the user_accounts table (synced with auth.users).
 * Account creation and invite management remain admin-only below/above.
 * Each row carries `share`: the share-invite relationship with the caller
 * ('none' | 'pending_sent' | 'pending_received' | 'shared'), so the app can
 * badge shared users without a second request.
 *
 * `?shared=1` narrows the result to the caller's ACCEPTED share relationships
 * only (the mobile account tab's Shared Users view) — accounts that never
 * completed the handshake are not fetched at all. Without the flag the full
 * list is returned, so other consumers (web dashboard) are unaffected.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.user!.id;
    // Only the account tab opts into the narrow scope; it is the sole
    // consumer that must see accepted shared users and nothing else.
    const sharedOnly = req.query.shared === '1' || req.query.shared === 'true';

    // Share-invite rows involving the caller, folded into a per-account badge.
    // Fetched first because `?shared=1` decides WHICH accounts to load.
    const { data: invites, error: invErr } = await supabase
      .from('share_invites')
      .select('inviter_id, invitee_id, status, responded_at')
      .or(`inviter_id.eq.${me},invitee_id.eq.${me}`);
    if (invErr) throw createHttpError(500, invErr.message);

    const shareOf = new Map<string, string>();
    const sharedSince = new Map<string, string | null>();
    for (const i of invites ?? []) {
      const other = i.inviter_id === me ? i.invitee_id : i.inviter_id;
      if (i.status === 'accepted') {
        shareOf.set(other, 'shared');
        sharedSince.set(other, i.responded_at ?? null);
      } else if (i.inviter_id === me) {
        shareOf.set(other, i.status === 'pending' ? 'pending_sent' : 'declined_sent');
      } else {
        shareOf.set(other, i.status === 'pending' ? 'pending_received' : 'declined_received');
      }
    }

    if (sharedOnly) {
      // Accepted relationships only — accounts with no completed handshake
      // are never selected from user_accounts in the first place.
      const sharedIds = [...shareOf.entries()]
        .filter(([, status]) => status === 'shared')
        .map(([id]) => id);

      if (sharedIds.length === 0) {
        res.json({ ok: true, accounts: [] });
        return;
      }

      const { data, error } = await supabase
        .from('user_accounts')
        .select('id, firstname, middlename, lastname, role, contactNo, email, status, is_active, created_at')
        .in('id', sharedIds)
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
          share: 'shared',
          shared_since: sharedSince.get(a.id) ?? null,
        })),
      });
      return;
    }

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
        share: a.id === me ? 'self' : (shareOf.get(a.id) ?? 'none'),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
