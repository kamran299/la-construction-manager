# Supabase

Add versioned SQL changes to `migrations/` as each application module is implemented. Login uses Supabase Auth directly. The first migration creates the company, membership, and project foundation required by Dashboard.

Run migrations in filename order through the Supabase SQL Editor. The V6 helper functions for later modules remain available on the preserved `main` and `backup-v6` branches and will be reviewed when those modules are rebuilt.
