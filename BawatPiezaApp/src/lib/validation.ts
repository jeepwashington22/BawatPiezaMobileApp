/**
 * Shared form validation and auth-error messaging.
 *
 * Every message returned here is written for the person using the app: it says
 * what went wrong and what to do next. Keep the copy in one place so the login
 * and sign-up screens stay consistent.
 */

/** Accepts name@domain.tld — deliberately practical rather than RFC-strict. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Supabase's own minimum is 6; the app asks for a stronger 8. */
export const PASSWORD_MIN_LENGTH = 8;
export const LOGIN_PASSWORD_MIN_LENGTH = 6;

export type FieldError = string | null;

/* ------------------------------ form checks ------------------------------ */

export function validateEmail(email: string): FieldError {
  const value = email.trim();
  if (!value) return 'Email address is required.';
  if (!EMAIL_PATTERN.test(value)) {
    return 'Invalid email address. Use a valid address such as name@company.com.';
  }
  return null;
}

export function validateFullName(name: string): FieldError {
  const value = name.trim();
  if (!value) return 'Full name is required.';
  if (value.length < 2) return 'Enter your full name (at least 2 characters).';
  return null;
}

export function validateNamePart(value: string, label: string): FieldError {
  const name = value.trim();
  if (!name) return `${label} is required.`;
  if (name.length < 2) return `${label} must be at least 2 characters.`;
  if (!/^[\p{L}][\p{L}\s'’-]*$/u.test(name)) {
    return `${label} can only contain letters, spaces, apostrophes, or hyphens.`;
  }
  return null;
}

export function validateContactNumber(value: string): FieldError {
  const contact = value.trim();
  if (!contact) return 'Contact number is required.';
  if (!/^\+639\d{9}$/.test(contact)) {
    return 'Use a Philippine number in this format: +639XXXXXXXXX.';
  }
  return null;
}

export function validatePasswordStrength(password: string): FieldError {
  if (!password) return 'Password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
  if (!/\d/.test(password)) return 'Add at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add at least one special character.';
  return null;
}

/** Login only needs the field present — never lecture on length when signing in. */
export function validateLoginPassword(password: string): FieldError {
  if (!password) return 'Password is required.';
  if (password.length < LOGIN_PASSWORD_MIN_LENGTH) {
    return `Password is too short. Passwords are at least ${LOGIN_PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function validateNewPassword(password: string, confirm: string): FieldError {
  const strengthError = validatePasswordStrength(password);
  if (strengthError) return strengthError;
  if (!confirm) return 'Please confirm your password.';
  if (password !== confirm) return 'Password does not match. Please re-enter both passwords.';
  return null;
}

/* --------------------------- Supabase auth errors -------------------------- */

export type AuthErrorLike = { message?: string; code?: string; status?: number } | null | undefined;

export type AuthContext = 'login' | 'signup' | 'password' | 'generic';

/** Shown when Supabase refuses credentials and we cannot tell which half was wrong. */
export const LOGIN_CREDENTIALS_MESSAGE =
  'No account found for this email, or the password is incorrect.';

/**
 * Turns a Supabase auth error into something a user can act on.
 *
 * `code` is preferred when present (auth-js v2 sets it), with a message-text
 * fallback so older responses and proxy errors are still handled.
 */
export function describeAuthError(error: AuthErrorLike, context: AuthContext = 'generic'): string {
  const code = error?.code ?? '';
  const raw = (error?.message ?? '').trim();
  const text = raw.toLowerCase();

  if (!error && !raw) return 'Something went wrong. Please try again.';

  // Network / transport problems — no HTTP status and no known code.
  if (
    !code &&
    (!error?.status ||
      text.includes('failed to fetch') ||
      text.includes('network request failed') ||
      text.includes('timeout') ||
      text.includes('aborted'))
  ) {
    return 'Network error. Check your internet connection and try again.';
  }

  switch (code) {
    case 'invalid_credentials':
    case 'invalid_grant':
      return context === 'login' ? LOGIN_CREDENTIALS_MESSAGE : 'Incorrect email or password.';

    case 'email_not_confirmed':
      return 'Your email address has not been verified yet. Open the confirmation link we emailed you, then sign in again.';

    case 'email_exists':
    case 'user_already_exists':
      return 'Email already used. Sign in instead, or register with a different email address.';

    case 'weak_password':
      return `That password is too weak. Use at least ${PASSWORD_MIN_LENGTH} characters, mixing letters and numbers.`;

    case 'same_password':
      return 'Your new password must be different from your current password.';

    case 'user_not_found':
      return 'No account found for this email. Please check the address or sign up first.';

    case 'user_banned':
      return 'This account has been suspended. Please contact support.';

    case 'signup_disabled':
      return 'New registrations are currently closed. Please contact support.';

    case 'provider_disabled':
      return 'This sign-in method is not available right now. Use email and password instead.';

    case 'validation_failed':
      return 'Please check the details you entered and try again.';

    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'Too many attempts. Please wait a few minutes before trying again.';

    case 'otp_expired':
      return 'That link or code has expired. Please request a new one.';

    default:
      break;
  }

  if (error?.status === 429 || text.includes('rate limit') || text.includes('too many')) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  if (text.includes('already registered') || text.includes('already exists')) {
    return 'Email already used. Sign in instead, or register with a different email address.';
  }
  if (text.includes('password') && text.includes('least')) {
    return `Password is too short. Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (text.includes('invalid login credentials')) {
    return context === 'login' ? LOGIN_CREDENTIALS_MESSAGE : 'Incorrect email or password.';
  }
  if (text.includes('email not confirmed')) {
    return 'Your email address has not been verified yet. Open the confirmation link we emailed you, then sign in again.';
  }
  if (text.includes('not a valid') || text.includes('unable to validate email')) {
    return 'Invalid email address. Use a valid address such as name@company.com.';
  }

  return raw || 'Something went wrong. Please try again.';
}