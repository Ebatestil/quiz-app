# Shared portfolio demo deployment

This repository now runs the demo by default. `DEMO_ONLY` is no longer needed.

## Database setup (required)

Run `supabase/010_shared_demo.sql` in your Supabase project's SQL Editor. It
creates only `demo_guests`, `demo_quizzes`, and `demo_results`; no sample data is
inserted. It does not delete the classroom tables. You can use a separate demo
project, or the existing project whose classroom records have been cleared.
A new project only needs this file, not the old teacher migrations.

Set these environment variables locally and in the Vercel project:

```
DEMO_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
DEMO_SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVER-ONLY-SERVICE-ROLE-KEY
CRON_SECRET=YOUR-RANDOM-SECRET-AT-LEAST-32-CHARACTERS
```

Never prefix the service key with NEXT_PUBLIC_. Remove the old
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `DEMO_ONLY` variables from this demo deployment.
The production build rejects legacy credentials to catch accidental reuse.
Local `.env.local` was migrated to the demo variable names; the original file is
preserved in the full-app backup. No environment values are committed.

Deploy with normal Next.js settings (`npm run build`). `vercel.json` schedules
`/api/demo/cleanup` daily. Configure `CRON_SECRET` so the cleanup request can be
authenticated. The endpoint refuses requests without the matching bearer token.

## Visitor flow

Enter a nickname to receive a private 24-hour guest cookie. Name registration is
not identity verification. Another visitor entering the same name gets a separate
workspace. The creator must return using the same browser/cookie to see results;
there is no account recovery or cross-device creator login.

Create a quiz and save to generate a `/q/<random-uuid>` link. Anyone with that link
can answer from another browser/device. Correct answers are only loaded by the
creator workspace and the server; public quiz responses exclude the answer key.
Scoring happens on the server. Retrying the same submission is idempotent.

Links and workspace access expire 24 hours after registration (not after the last
visit). Closing or refreshing the browser does not delete data, because the user
needs to return to results. Expired rows are deleted on workspace access/signups
and by the daily cleanup job; physical deletion occurs on the next successful
cleanup, rather than exactly at expiry. End demo deletes immediately. Provider
backups/log retention is separate from live row deletion.

See [Vercel's cron documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
for the CRON_SECRET authorization header and scheduling behavior.

## Verify after setup

1. Enter a nickname. Confirm the workspace starts empty.
2. Add a quiz with each question type and save it.
3. Open the generated link in a different browser/private window.
4. Enter a participant nickname, answer, submit, and verify the score.
5. Return to the creator tab; results refresh on focus or via Refresh results.
6. Start a different guest session and confirm it cannot see the first guest's results.
7. End the original demo; its quiz link should become unavailable.
8. Verify the Vercel cron job succeeds with CRON_SECRET configured.

## Original classroom data

The full source and original configuration are backed up at
`C:\Users\ASUS\Documents\quiz-app-full-backup-2026-10-30`.
Classroom records were exported there before deletion. Accounts/profiles remain.
`RESTORE_CLASSROOM_RECORDS.sql` restores the classroom records transactionally
into the original schema, with an empty-table check. Preserve the original auth
users. The backup contains private data; keep it outside Git and public hosting.

`scripts/backup-and-clear-classroom.cjs` is a manual maintenance tool only.
It is never invoked on build, deploy, startup, or visitor requests.
