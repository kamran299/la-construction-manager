# Supabase

Add versioned SQL changes to `migrations/` as each application module is implemented. Login currently uses Supabase Auth directly and does not require a custom database migration.

The V6 helper functions for company, project, and report features remain available on the preserved `main` and `backup-v6` branches. They will be reviewed and migrated when those modules are rebuilt.
