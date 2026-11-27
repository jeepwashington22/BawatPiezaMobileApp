# BawatPieza Core Backend

This Express service is the single backend boundary for the BawatPieza
clients. It owns the server-side Supabase database client, connection
lifecycle, migrations, authentication verification, RBAC, and third-party
integrations.

## Module layout

- `src/config` - validated environment and the single database client
- `src/middleware` - authentication, RBAC, error handling, and request policy
- `src/modules` - feature-owned API boundaries (`auth`, `telemetry`, `store`,
  `admin`, and `public`)
- `src/services` - shared infrastructure adapters
- `src/types` - API and domain contracts
- `src/utils` - cross-module helpers

The versioned API is mounted at `/api/v1`. Existing legacy routes remain
available while clients migrate. New domain endpoints that do not yet have a
reviewed data contract return `501 Not Implemented`; they do not fabricate
success responses.

## Repository boundary

Frontend applications must call this API and must not import Supabase clients,
service-role credentials, or database migrations. Keep all database access
behind `src/config/database.ts` and feature modules in this service.

## Hardware testing

Apply `supabase/migrations/057_hardware_test_settings.sql` to enable the
admin-only hardware test settings API. Admins can configure a shared UTC test
clock and battery percentage; authenticated mobile users read those values
through the API. Test mode affects the mobile dashboard display only and never
changes hardware telemetry.

## Local development

1. Copy `.env.example` to `.env` and provide backend-only credentials.
2. Run `npm run typecheck`.
3. Run `npm run dev`.
