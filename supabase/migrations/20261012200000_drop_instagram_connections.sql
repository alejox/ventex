-- Remove the Instagram feed integration (see odd/tasks/remove-instagram-feed.md).
-- Meta requires Business Verification + App Review before non-tester accounts
-- can connect, so the feature was removed from the app. This drops everything
-- `20261010120000_instagram_connections.sql` created. Instagram as a profile
-- link in the site's contact/social config is unrelated and stays.

drop function if exists public.public_instagram_permalinks(text);
drop function if exists public.disconnect_instagram();
drop table if exists public.instagram_connections;
