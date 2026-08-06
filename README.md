# L&A Construction Manager

The `development` branch is being rebuilt as a modular web application. The current milestone contains the project foundation, Supabase email/password login, and the authenticated dashboard foundation.

## Structure

- `css/` — shared and module-specific styles
- `js/modules/` — feature modules
- `js/services/` — external service adapters
- `netlify/functions/` — server-side Netlify functions
- `supabase/migrations/` — database migrations and helper functions

## Local development

Use the Netlify CLI so the frontend can reach `/.netlify/functions/supabase-config`:

```sh
netlify dev
```

Configure these environment variables in Netlify:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

The publishable key is intentionally returned to the browser. Never expose a Supabase service-role key.

## Current scope

Implemented: responsive login UI, client-side validation, password visibility control, persisted Supabase authentication, loading state, safe user-facing errors, authenticated dashboard, company and role summary, project count, and sign out.

Deferred: account creation, password recovery, onboarding, project management, reports, time clock, approvals, and user management.
