# StudyDesk Supabase setup

1. Open the StudyDesk project in the Supabase dashboard and select **SQL Editor**.
2. Create a new query, paste the contents of
   `migrations/202611030001_studydesk_sync.sql`, and run it. The setup is safe to
   reapply; it recreates the same owner-scoped policies and guards Realtime
   publication membership.
3. In **Authentication → URL Configuration**, add both local development and
   production URLs:

   - `http://localhost:3000/**`
   - `https://arun-v-p.github.io/StudyDesk/**`

4. In **Authentication → Sign In / Providers**, enable Email (passwordless
   email links) and Google. Configure the Google OAuth client ID and secret in
   Supabase, and use the callback URL shown by Supabase as an authorized
   redirect URI in Google Cloud. Keep the Google client secret in Supabase; it
   is not a Vite environment variable. Add the app's local and production
   return URLs to Supabase's redirect allow list above.
5. For GitHub Pages deployments, define `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` as GitHub Actions repository variables. The
   deployment workflow passes them to the production build and stops a
   production deployment if either is missing. Both are public browser
   configuration; never put a Supabase service-role key in a Vite variable or
   GitHub Pages build.

StudyDesk provides Google OAuth and passwordless email-link sign-in from its
account menu. It does not manage Google account details or implement
password-reset flows.

## Sync model

Each planner record is stored with an authenticated user ID, an item ID, a
client revision time, and a tombstone for deletion. The SQL sync function only
accepts a change whose timestamp is at least as new as the stored revision and
returns the authoritative row. The client reconciles timestamp ties and
server-side no-op writes before removing an outbox entry. A durable per-user
outbox retries writes after reconnecting.

Per-user initialization progress is stored locally. First-device uploads record
progress per item and can resume after interruption; partial cloud contents are
not treated as a completed backup. Restoring applies cloud records and
tombstones individually, preserving local-only records and merging singleton
metadata rather than clearing the device's complete local documents.

Study Material metadata syncs with the planner. Attachment bytes intentionally
remain local in this release: ZIP backups with SHA-256 integrity checks (not
application encryption) are the transfer mechanism until a separate private
Storage migration adds resumable uploads, quotas, file deletion lifecycle, and
end-to-end attachment tests.
