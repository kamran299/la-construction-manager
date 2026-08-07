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
- `GOOGLE_MAPS_API_KEY`

The Supabase publishable key and website-restricted Google Maps key are intentionally returned to the browser. Never expose a Supabase service-role key, and restrict the Google key to the deployed website.

## Current scope

Implemented: responsive login UI, client-side validation, persisted Supabase authentication, authenticated dashboard, company and role summary, project creation, construction phase progress, US address autocomplete, and sign out.

Deferred: account creation, password recovery, onboarding, reports, time clock, approvals, and user management.
