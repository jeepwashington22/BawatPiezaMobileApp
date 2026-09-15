// Type declarations for Deno globals used in Supabase Edge Functions.
// This lets your editor / TypeScript resolve `Deno` so you don't get
// "cannot find name 'Deno'" errors while writing Edge Functions.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): { [key: string]: string };
  };
  const args: string[];
  const exit: (code?: number) => never;
  const cwd: () => string;
  const chdir: (directory: string) => void;
  const writeFileSync: (path: string, data: Uint8Array | string) => void;
  const readFileSync: (path: string) => Uint8Array;
}

declare interface Request {
  // Supabase edge functions often read the raw body differently; add if needed.
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): {
    auth: {
      getUser: () => Promise<{ data: { user: { email?: string } | null }; error: unknown }>;
      signInWithPassword: (p: { email: string; password: string }) => Promise<{ error?: unknown }>;
    };
    from: (table: string) => Record<string, unknown>;
  };
}