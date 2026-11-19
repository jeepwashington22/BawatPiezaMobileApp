import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * The only application database client.
 * It is created in the backend process and must never be imported by clients.
 */
export const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
