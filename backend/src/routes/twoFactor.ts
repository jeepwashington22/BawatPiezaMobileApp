import { Router, type Request } from 'express';
import { createHash, randomBytes, randomInt } from 'crypto';
import { z } from 'zod';
import { sendMail } from '../lib/mailer.js';
import { redis } from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';
import { supabaseAuth } from '../lib/supabaseAuth.js';
import { createHttpError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * Two-factor authentication (email OTP) for password sign-in.
 *
 * Flow
 * ----
 *  1. POST /accounts/2fa/login   { email, password }
 *       Verifies the credentials with Supabase using the anon key. If they are
 *       valid, Supabase hands us a real session — but we deliberately do NOT
 *       return it yet. We stash the tokens in Redis behind a random
 *       `challengeId`, email a 6-digit code, and return only the challengeId.
 *  2. POST /accounts/2fa/verify  { challengeId, otp }
 *       Checks the code (max 5 attempts) and, only then, releases the session
 *       tokens so the app can call `supabase.auth.setSession(...)`.
 *  3. POST /accounts/2fa/resend  { challengeId }
 *       Re-issues a fresh code for an existing challenge (60s cooldown).
 *
 * Because no session exists until step 2 succeeds, the app's SIGNED_IN
 * listener cannot short-circuit the second factor, and the plaintext password
 * is never written to Redis, logs, or the database.
 */

const OTP_TTL_SECONDS = 300; // the emailed code lives for 5 minutes
const OTP_MAX_ATTEMPTS = 5; // wrong tries before the challenge is burned
const OTP_SEND_COOLDOWN_SECONDS = 60; // min gap between OTP emails
const LOGIN_FAILURE_WINDOW_SECONDS = 900; // brute-force window (15 minutes)
const LOGIN_MAX_FAILURES = 10; // bad passwords tolerated per window

/* --------------------------- fraud alert settings ------------------------- */
// After this many consecutive bad-password attempts for one account, the owner
// gets a "someone may be trying to open your account" email with the device,
// IP, and approximate location of the attempts.
const FRAUD_ALERT_THRESHOLD = 5;
const FRAUD_ALERT_WINDOW_SECONDS = 900; // consecutive-failure window (15 min)
const FRAUD_ALERT_COOLDOWN_SECONDS = 900; // min gap between two alert emails

const fraudCountKey = (email: string) => `2fa:fraud:${email}`;
const fraudSentKey = (email: string) => `2fa:fraud:sent:${email}`;

/** Best-effort client metadata extracted from the request. */
function requestMeta(req: Request): { ip: string; device: string } {
  const fwd = req.headers['x-forwarded-for'];
  const ip =
    (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown';
  const rawDevice = req.headers['x-device-info'];
  const device = typeof rawDevice === 'string' && rawDevice.trim() ? rawDevice.trim() : 'Unknown device';
  return { ip, device };
}

/** Free, key-less IP geolocation (ip-api.com). Returns null on any failure. */
async function geolocateIp(ip: string): Promise<{ city: string; regionName: string; country: string } | null> {
  const isPrivate =
    ip === 'unknown' || ip === '::1' ||
    /^(10|127)\./.test(ip) || /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  if (isPrivate) return null; // LAN / loopback addresses cannot be geolocated
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=city,regionName,country`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { city?: string; regionName?: string; country?: string };
    return {
      city: data.city ?? '',
      regionName: data.regionName ?? '',
      country: data.country ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Supabase reports the same error for an unknown email and a wrong password, so
 * this wording stays deliberately ambiguous — it must not reveal whether an
 * account exists. The app pairs it with its own "is this email registered?"
 * check to give a specific hint, exactly as it does today.
 */
const GENERIC_CREDENTIALS_ERROR = 'No account found for this email, or the password is incorrect.';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifySchema = z.object({
  challengeId: z.string().min(10),
  otp: z.string().regex(/^\d{6}$/, 'The code must be 6 digits.'),
});

const resendSchema = z.object({
  challengeId: z.string().min(10),
});

/** Session tokens held server-side until the second factor is satisfied. */
interface PendingChallenge {
  email: string;
  fullName: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Emails the account owner that repeated failed sign-ins were detected.
 * Never throws — the alert is best-effort and must not change the HTTP reply.
 */
async function sendFraudAlertEmail(opts: {
  email: string;
  fullName: string;
  failures: number;
  ip: string;
  device: string;
}): Promise<void> {
  const when = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Manila' });
  const geo = await geolocateIp(opts.ip);
  const location = geo
    ? [geo.city, geo.regionName, geo.country].filter(Boolean).join(', ') || 'Unavailable'
    : 'Unavailable (private or unrecognized address)';

  const rows: Array<[string, string]> = [
    ['Device', opts.device],
    ['IP address', opts.ip],
    ['Approximate location', location],
    ['Failed attempts', `${opts.failures} in the last 15 minutes`],
    ['Latest attempt (PHT)', when],
  ];
  const tableHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#0a2a4a;font-weight:700">${label}</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${value}</td></tr>`,
    )
    .join('');

  try {
    await sendMail({
      to: opts.email,
      subject: 'Security alert: repeated failed sign-in attempts on your BawatPieza account',
      text:
        `Hi ${opts.fullName},\n\n` +
        `We detected ${opts.failures} consecutive failed sign-in attempts on your BawatPieza account.\n\n` +
        `Device: ${opts.device}\nIP address: ${opts.ip}\nApproximate location: ${location}\n` +
        `Latest attempt: ${when}\n\n` +
        `If this was you (for example a mistyped password), you can ignore this email.\n` +
        `If you do NOT recognize this activity, change your password immediately:\n` +
        `1. Open the BawatPieza app and use "Forgot password?", or\n` +
        `2. Sign in and change your password from your profile.\n\n` +
        `— BawatPieza Security`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">` +
        `<h2 style="color:#b91c1c">Security alert — repeated failed sign-ins</h2>` +
        `<p>Hi <b>${opts.fullName}</b>,</p>` +
        `<p>Someone tried to open your BawatPieza account with a wrong password <b>${opts.failures} times in a row</b>. Here is what we recorded:</p>` +
        `<table style="border-collapse:collapse;width:100%">${tableHtml}</table>` +
        `<p style="margin-top:16px"><b>If this was you</b> (a mistyped password, for example), you can ignore this email.</p>` +
        `<p><b>If you do NOT recognize this activity:</b></p>` +
        `<ol><li>Open the BawatPieza app and tap <b>Forgot password?</b> on the sign-in screen, or</li>` +
        `<li>Sign in and change your password from your profile right away.</li></ol>` +
        `<p style="color:#666;font-size:12px">You are receiving this because failed sign-in alerts are enabled for your account.</p>` +
        `<p>— BawatPieza Security</p></div>`,
    });
    console.log(`[2fa] fraud alert email sent to ${opts.email} (ip=${opts.ip})`);
  } catch (mailErr) {
    console.error('[2fa] fraud alert email failed:', (mailErr as Error).message);
  }
}

/**
 * Counts a failed attempt and, at FRAUD_ALERT_THRESHOLD consecutive failures,
 * emails the account owner a security alert. All errors are swallowed so the
 * alert can never break the sign-in response.
 */
async function recordFailureAndMaybeAlert(opts: {
  email: string;
  ip: string;
  device: string;
}): Promise<void> {
  try {
    const failures = await redis.incr(fraudCountKey(opts.email));
    if (failures === 1) {
      await redis.expire(fraudCountKey(opts.email), FRAUD_ALERT_WINDOW_SECONDS);
    }

    if (failures < FRAUD_ALERT_THRESHOLD) return;
    // Already alerted recently — do not spam the mailbox.
    if (await redis.get(fraudSentKey(opts.email))) return;

    // Resolve a display name for the alert (service-role client, safe on failure).
    let fullName = opts.email;
    try {
      const { data: row } = await supabase
        .from('user_accounts')
        .select('firstname, lastname')
        .eq('email', opts.email)
        .maybeSingle();
      const joined = [row?.firstname, row?.lastname].filter(Boolean).join(' ');
      if (joined) fullName = joined;
    } catch {
      /* keep the email as the name */
    }

    await redis.set(fraudSentKey(opts.email), '1', 'EX', FRAUD_ALERT_COOLDOWN_SECONDS);
    await sendFraudAlertEmail({ ...opts, fullName, failures });
  } catch (err) {
    console.error('[2fa] fraud alert flow failed:', (err as Error).message);
  }
}

/**
 * Sends the 6-digit sign-in verification code via Brevo.
 * Returns true on success, false (logged) on failure so the request can still
 * report a useful status instead of failing wholesale.
 */
async function sendLoginOtpEmail(opts: { email: string; fullName: string; otp: string }): Promise<boolean> {
  try {
    await sendMail({
      to: opts.email,
      subject: `Your BawatPieza sign-in code: ${opts.otp} (valid 5 minutes)`,
      text: `Hi ${opts.fullName},\n\nYour BawatPieza sign-in verification code is ${opts.otp}. It expires in 5 minutes.\nIf you did not try to sign in, change your password immediately.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#0a2a4a">BawatPieza sign-in verification</h2>
        <p>Hi <b>${opts.fullName}</b>, use the code below to finish signing in to your account.</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0a2a4a;background:#f6c44522;display:inline-block;padding:10px 22px;border-radius:12px">${opts.otp}</p>
        <p><b>This code expires in 5 minutes.</b> Never share it with anyone.</p>
        <p style="color:#666;font-size:12px">If you did not try to sign in, ignore this email and change your password.</p>
      </div>`,
    });
    console.log(`[2fa] sign-in OTP sent to ${opts.email}`);
    return true;
  } catch (mailErr) {
    console.error('[2fa] sign-in OTP email failed:', (mailErr as Error).message);
    return false;
  }
}

/* --------------------------------- keys ---------------------------------- */

const challengeKey = (id: string) => `2fa:challenge:${id}`;
const otpKey = (id: string) => `2fa:otp:${id}`;
const attemptsKey = (id: string) => `2fa:att:${id}`;
const cooldownKey = (id: string) => `2fa:cool:${id}`;
const failureKey = (email: string) => `2fa:fail:${email}`;

/* ------------------------------- step 1: login ---------------------------- */

/**
 * POST /accounts/2fa/login
 * Public. Verifies the email + password, then emails a 6-digit code.
 *
 * The Supabase session that a correct password produces is parked in Redis
 * under a random `challengeId` and is NOT returned here — that is what makes the
 * second factor mandatory rather than advisory. The response carries only the
 * challengeId, which is useless without the code.
 */
router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'A valid email and password are required.');
    }
    const email = parsed.data.email.toLowerCase();
    const { password } = parsed.data;

    // Brute-force guard: count failures per email over a rolling window.
    const failures = Number((await redis.get(failureKey(email))) ?? '0');
    if (failures >= LOGIN_MAX_FAILURES) {
      throw createHttpError(429, 'Too many failed sign-in attempts. Please wait 15 minutes and try again.');
    }

    // Verify the credentials with the anon key. The service-role client in
    // lib/supabase.ts cannot do this: it bypasses RLS and would sign anyone in.
    const { data, error: signInErr } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (signInErr) {
      const authErr = signInErr as { status?: number; code?: string; message?: string };
      const code = authErr.code ?? '';
      const raw = (authErr.message ?? '').toLowerCase();

      // Supabase answers `invalid_credentials` (HTTP 400) for BOTH an unknown
      // email and a wrong password. Those are the only failures we keep
      // indistinguishable — and the only ones that count toward the
      // brute-force lock. Everything else is a service/configuration problem
      // that retyping the password cannot fix, so it must never surface as
      // "No account found for this email, or the password is incorrect."
      const badCredentials =
        code === 'invalid_credentials' ||
        raw.includes('invalid login credentials') ||
        raw.includes('invalid credentials');

      if (badCredentials) {
        const next = await redis.incr(failureKey(email));
        if (next === 1) {
          await redis.expire(failureKey(email), LOGIN_FAILURE_WINDOW_SECONDS);
        }
        // Fraud watch: count the attempt and alert the owner at the threshold.
        const meta = requestMeta(req);
        void recordFailureAndMaybeAlert({ email, ...meta });
        // Unknown email and wrong password must stay indistinguishable.
        throw createHttpError(401, GENERIC_CREDENTIALS_ERROR);
      }

      // Log the real reason server-side: masking it as bad credentials once
      // turned a broken deployment into a misleading "not found" on the
      // sign-in screen.
      console.error('[2fa] signInWithPassword failed:', {
        status: authErr.status,
        code,
        message: authErr.message,
      });

      if (code === 'email_not_confirmed' || raw.includes('email not confirmed')) {
        throw createHttpError(
          403,
          'Your email address has not been verified yet. Open the confirmation link we emailed you, then sign in again.',
        );
      }
      if (authErr.status === 429 || raw.includes('rate limit') || raw.includes('too many')) {
        throw createHttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
      }

      // Invalid API key, disabled email provider, Supabase outage, network
      // failure, ... — the sign-in service itself is not working right now.
      throw createHttpError(502, 'The sign-in service is temporarily unavailable. Please try again in a moment.');
    }

    if (!data.session) {
      console.error('[2fa] signInWithPassword returned no session and no error');
      throw createHttpError(502, 'The sign-in service is temporarily unavailable. Please try again in a moment.');
    }

    // Credentials are good — clear the failure counter and the fraud watch.
    await redis.del(failureKey(email), fraudCountKey(email));

    // Prefer the app's own table for the display name; fall back to the
    // Supabase user metadata, then to the address itself.
    const { data: row } = await supabase.from('user_accounts')
      .select('firstname, lastname')
      .eq('email', email)
      .maybeSingle();

    const meta = (data.session.user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      [row?.firstname, row?.lastname].filter(Boolean).join(' ') ||
      (typeof meta.full_name === 'string' ? meta.full_name : '') ||
      email;

    // Park the session and issue the code.
    const challengeId = randomBytes(24).toString('hex');
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');

    const challenge: PendingChallenge = {
      email,
      fullName,
      userId: data.session.user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };

    await redis.set(challengeKey(challengeId), JSON.stringify(challenge), 'EX', OTP_TTL_SECONDS);
    await redis.set(otpKey(challengeId), sha256(otp), 'EX', OTP_TTL_SECONDS);
    await redis.set(attemptsKey(challengeId), '0', 'EX', OTP_TTL_SECONDS);
    await redis.set(cooldownKey(challengeId), '1', 'EX', OTP_SEND_COOLDOWN_SECONDS);

    const sent = await sendLoginOtpEmail({ email, fullName, otp });

    if (!sent) {
      // Never leave a usable challenge behind when the email never went out.
      await redis.del(challengeKey(challengeId), otpKey(challengeId), attemptsKey(challengeId));
      throw createHttpError(502, `Could not send the verification code to ${email}. Please try again shortly.`);
    }

    res.json({
      ok: true,
      challengeId,
      expiresInSeconds: OTP_TTL_SECONDS,
      message: `A 6-digit verification code was sent to ${email}. It expires in ${OTP_TTL_SECONDS / 60} minutes.`,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ step 2: verify --------------------------- */

/**
 * POST /accounts/2fa/verify
 * Public. Checks the emailed code (max 5 attempts) and only then releases the
 * parked session so the app can call `supabase.auth.setSession(...)`.
 *
 * Both the code and the challenge are single-use: they are deleted the moment
 * the sign-in succeeds, so a captured code cannot be replayed.
 */
router.post('/verify', async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'The 6-digit code and the sign-in attempt id are required.');
    }
    const { challengeId, otp } = parsed.data;

    const raw = await redis.get(challengeKey(challengeId));
    const otpHash = await redis.get(otpKey(challengeId));

    // Expired, already used, or unknown challenge.
    if (!raw || !otpHash) {
      throw createHttpError(410, 'This sign-in attempt has expired. Please enter your password again.');
    }

    // Count attempts; burn the code after too many wrong tries.
    const attempts = await redis.incr(attemptsKey(challengeId));
    if (attempts > OTP_MAX_ATTEMPTS) {
      await redis.del(challengeKey(challengeId), otpKey(challengeId), attemptsKey(challengeId));
      throw createHttpError(429, 'Too many incorrect codes. Please sign in again.');
    }

    if (sha256(otp) !== otpHash) {
      throw createHttpError(400, 'Incorrect code. Check the email and try again.');
    }

    const challenge = JSON.parse(raw) as PendingChallenge;

    // Correct code — consume both, making this a one-shot exchange.
    await redis.del(
      challengeKey(challengeId),
      otpKey(challengeId),
      attemptsKey(challengeId),
      cooldownKey(challengeId),
    );

    res.json({
      ok: true,
      userId: challenge.userId,
      message: 'Code verified. Signing you in.',
      session: {
        access_token: challenge.accessToken,
        refresh_token: challenge.refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ step 3: resend --------------------------- */

/**
 * POST /accounts/2fa/resend
 * Public. Issues a fresh code for an existing challenge (one email per 60
 * seconds). The parked session is deliberately left untouched, so a slow
 * email does not force the user to retype their password.
 */
router.post('/resend', async (req, res, next) => {
  try {
    const parsed = resendSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, 'The sign-in attempt id is required.');
    }
    const { challengeId } = parsed.data;

    const raw = await redis.get(challengeKey(challengeId));
    if (!raw) {
      throw createHttpError(410, 'This sign-in attempt has expired. Please enter your password again.');
    }

    if (await redis.get(cooldownKey(challengeId))) {
      throw createHttpError(429, `Please wait ${OTP_SEND_COOLDOWN_SECONDS} seconds before requesting another code.`);
    }

    const challenge = JSON.parse(raw) as PendingChallenge;
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');

    await redis.set(otpKey(challengeId), sha256(otp), 'EX', OTP_TTL_SECONDS);
    await redis.set(attemptsKey(challengeId), '0', 'EX', OTP_TTL_SECONDS);
    await redis.set(cooldownKey(challengeId), '1', 'EX', OTP_SEND_COOLDOWN_SECONDS);

    const sent = await sendLoginOtpEmail({ email: challenge.email, fullName: challenge.fullName, otp });

    if (!sent) {
      throw createHttpError(502, `Could not send the verification code to ${challenge.email}. Please try again shortly.`);
    }

    res.json({
      ok: true,
      expiresInSeconds: OTP_TTL_SECONDS,
      message: `A new 6-digit code was sent to ${challenge.email}.`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
