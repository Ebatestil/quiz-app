# Quiz App — portfolio demo

A focused Next.js + Supabase demo: enter a name, create a quiz, share its link on
any device, answer it, and return to the creator workspace to see the score.

- Starts empty, with no sample classes or student records.
- Four question types, one point per question. Enumeration answers match in any order.
- Guest access uses a private HttpOnly cookie, not a shared name/password account.
- Guest workspaces and public links expire after 24 hours.
- Results refresh when the creator returns to the tab, or clicks Refresh results.
- End demo deletes that guest's quizzes/results immediately.
- Up to 10 quizzes per guest, 30 questions per quiz, 100 submissions per quiz.
- The full teacher app's routes and APIs are disabled in this repository.

See [DEMO_DEPLOYMENT.md](./DEMO_DEPLOYMENT.md) for the required database migration,
environment variables, deployment, and cleanup configuration.

## Development

Run `npm ci`, configure `.env.local`, run `supabase/010_shared_demo.sql` in the
Supabase SQL editor, then run `npm run dev`. Open `/` to enter the demo.

Checks: `npm run lint`, `npm run build`, and `node --test tests/*.cjs`.

## Full app backup

The original app, Git history, and original environment configuration were copied
to `C:\Users\ASUS\Documents\quiz-app-full-backup-2026-10-30` before this conversion.
The backup excludes rebuildable `node_modules` and `.next` directories; run
`npm ci` there before using it.

Existing classroom records were exported and verified before clearing them.
The backup contains `classroom-records-before-clear.json` and
`RESTORE_CLASSROOM_RECORDS.sql`. Teacher accounts/profiles were preserved.
Use that SQL in the original project to restore records into empty classroom
tables. Do not commit or publish the backup: it contains private data and keys.
