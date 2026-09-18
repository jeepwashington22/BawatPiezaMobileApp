import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client that authenticates with the PUBLIC anon key.
 *
 * `lib/supabase.ts` uses the service-role key, which bypasses Row Level
 * Security and must never be used to sign a user in: it cannot tell us whether
 * a *user's* password is correct. Verifying an email/password pair is exactly
 * what `signInWithPassword` does, and that call requires the anon key.
 *
 * No session is persisted here — the tokens are read once and handed to the
 * two-factor challenge store instead (see routes/twoFactor.ts).
 */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration for password sign-in. Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.',
  );
}

export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
