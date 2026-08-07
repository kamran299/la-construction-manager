-- Team invitations are managed by the team-invite Netlify function.
-- Remove the obsolete auth trigger left by the earlier application so it
-- cannot block Supabase from creating an invited Authentication user.

drop trigger if exists on_auth_user_created on auth.users;

