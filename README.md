# Quiz App (Next.js + Supabase)

A rebuild of the original Laravel + React quiz app on **Next.js (App Router)**
and **Supabase** (Postgres database + Auth), so it can be hosted for free.

Same features as before, plus a new one:
- Register / login
- Create quizzes with multiple-choice, identification, true/false, or enumeration questions
- Publish/unpublish quizzes
- Take a quiz (questions shuffled), score tracked per attempt
- Review past attempts
- Admin panel to create/disable/enable users (the first account you register
  is automatically made an admin)
- **New: Exam Mode** — share a quiz as a link students can take with no
  account (registered first and last name + class), optionally locked down so switching
  tabs/apps auto-submits the exam. See "Exam Mode" below.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In the project dashboard, go to **SQL Editor** → **New query**, paste in
   the entire contents of [`supabase/schema.sql`](./supabase/schema.sql),
   and run it. This creates all the tables, security policies, and database
   functions the app needs.
3. Run [`supabase/002_exam_mode.sql`](./supabase/002_exam_mode.sql) the same
   way, right after. This adds the exam-link / lockdown feature (see below).
   Then run [`supabase/003_prevent_duplicate_exam_attempts.sql`](./supabase/003_prevent_duplicate_exam_attempts.sql)
   to enforce one shared-exam attempt per student name per quiz.
   Then run [`supabase/004_question_types_and_quiz_attempts.sql`](./supabase/004_question_types_and_quiz_attempts.sql)
   for true/false and enumeration grading and the updated per-quiz attempt checks.
   Finally run [`supabase/005_student_workspace_access.sql`](./supabase/005_student_workspace_access.sql)
   to restrict anonymous exam sessions to student access and protect workspace operations.
   Then run [`supabase/006_classes_and_timers.sql`](./supabase/006_classes_and_timers.sql)
   for teacher rosters, class assignments, and server-enforced timers. Existing quizzes
   must be assigned to classes before students can start new shared attempts.
   Apply these migrations before deploying the updated app. Vercel does not run SQL migrations.
4. Go to **Authentication → Providers** and enable **Anonymous Sign-Ins**.
   Students use this to take an exam without creating an account.
5. Go to **Project Settings → API**. You'll need three values from this page:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (click "reveal" — keep this one secret)
6. (Optional but recommended) Under **Authentication → Providers → Email**,
   turn **off** "Confirm email" while you're testing locally, so new teacher
   accounts can log in immediately without clicking an email link. Turn it
   back on before going live if you want email verification.

## 2. Configure environment variables

Copy the example file and fill in the three values from step 1:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only — it's used by the admin panel API
routes to create/disable/enable/delete users. Never prefix it with
`NEXT_PUBLIC_` or expose it to the browser.

## 3. Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll land on the login page. Click "Need an
account?" to register. The very first account you create becomes an admin
automatically (see the `handle_new_user()` trigger in `schema.sql`), and will
see a "Manage Users" link and `/admin/users` in the sidebar.

## 4. Deploy for free

The easiest option is **Vercel** (made by the Next.js team, free tier is
generous):

1. Push this project to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. In the project's **Settings → Environment Variables**, add the same three
   variables from your `.env.local`.
4. Deploy. Vercel builds and hosts it automatically on every push.

Supabase's free tier covers the database + auth side at no cost for small
projects.

## Exam Mode (for teachers)

Enumeration answers use one item per line. Students earn one point for the
question only when the complete list matches, in any order. Case, blank lines,
and extra whitespace are ignored; missing, extra, or incorrectly repeated items
are marked incorrect. True/false questions also count as one point.

Students can take different quizzes. A repeat is blocked per registered student
and quiz, including unfinished attempts. Each quiz has its own exam link.

Save, create, delete, copy, answer, submission, and account-management actions
show success or error notifications. Failed saves retain entered content, and
the exam-link panel reflects saved publish/lockdown settings.

Any quiz can now be turned into a shareable exam:

1. Open **Classes** and create each class/section. Register students with separate
   first and last names. Names can be edited or removed; old submissions keep their
   original student and section labels.
2. Open the quiz editor and select one or more **Assigned classes**. Optionally set
   a **Time limit (minutes)** from 1 to 480; leave it blank for no timer. Publish and save.
3. Enable **Exam Mode (lockdown)** if needed, then copy the quiz's exam link.
4. Students select their class and type their registered first and last name.
   Unregistered names and unassigned classes cannot start an attempt. No student
   number is collected.
5. Review submissions under **Results**, 15 per page, including section and expiry status.

The timer starts when the server creates the attempt. Changing a quiz's duration
does not change active attempts. At expiry, the browser locks answers and submits
saved responses. The server rejects late answers independently of the browser.
If the student is offline or closes the page, finalization occurs on reconnection
or when the teacher loads results; the deadline remains the original expiry time.
There is no background scheduler requirement. Unsaved text is not included.
Existing untimed attempts remain untimed after migration.

**What "lockdown" actually does:** a browser can't truly *prevent* someone
from alt-tabbing or opening another app — no website has that power. What it
*can* do, and what this app does, is:
- Request fullscreen when the student starts; if unavailable or rejected, offer
  “Start without fullscreen” while keeping tab/app-switch monitoring active
- Detect the moment the student switches tabs, switches apps, minimizes the
  window, or exits fullscreen (all of these fire detectable browser events on
  both desktop and mobile)
- The instant that happens, the exam is **auto-submitted** with whatever was
  answered so far, and it's logged so you can see exactly why an attempt
  ended when you review it
- Right-click, copy/paste, and common devtools shortcuts are also blocked

This is the same approach tools like Google Forms' quiz lockdown use — it
deters and catches casual cheating, but a determined user with a second
physical device (e.g. a phone next to their laptop) can't be stopped by any
website. If you need guaranteed lockdown, that requires managed/kiosk
devices, which is outside what a web app can do.

**Known limitations:**
- Name matching ignores capitalization and extra whitespace, but not spelling
  differences. Names are checked against the selected class's roster. This is
  roster eligibility, not proof of identity: someone who knows another registered
  name can impersonate that student. Two students with identical first and last
  names in the same class need distinguishable registered names (for example,
  include a middle name in the first-name field). Reopening a link does not resume
  an unfinished attempt. Legacy submissions still count by normalized full name.
- `blur` events (used to detect app-switching) can occasionally fire from
  innocuous things like clicking a browser extension icon — treat a single
  flagged attempt as "worth a look," not automatic proof of cheating.
- Fullscreen support varies by device and browser. The app detects support.
  A failed request does not start an attempt. Students can continue without
  fullscreen; tab/app-switch monitoring stays active. Fullscreen exit is
  monitored only for exams that entered fullscreen.


## How it's structured

- `supabase/schema.sql` — all tables, Row Level Security policies, and
  Postgres functions (RPCs). The RPCs (`start_attempt`, `get_attempt`,
  `submit_answer`, `complete_attempt`) replicate the original Laravel
  `AttemptController` logic exactly, including keeping the correct answer
  hidden from the quiz-taker until they finish the attempt.
- `supabase/002_exam_mode.sql` — adds shareable exam links, anonymous
  student sign-in, and lockdown auto-submit (`start_public_attempt`,
  `report_violation`).
- `app/exam/[token]/` — the public, no-login exam page students land on.
- `app/quizzes/[id]/results/[attemptId]/` — per-question review page for a
  single attempt (teachers reviewing a student's submission).
- `app/` — Next.js App Router pages. Most pages are a small server component
  (fetches the logged-in user's profile + initial data) plus a
  `*Client.tsx` component (the interactive part, ported closely from the
  original React pages).
- `app/api/admin/` — API routes for admin-only actions that require
  Supabase's service-role key (creating/disabling/enabling/deleting users).
  Everything else (quizzes, questions, attempts) talks to Supabase directly
  from the browser, protected by Row Level Security instead of a custom API.
- `lib/supabase/` — Supabase client setup for the browser, server components,
  and the admin (service-role) client.
- `proxy.ts` — Next.js 16's replacement for `middleware.ts`. Refreshes the
  auth session on every request and redirects: signed-out users to
  `/login`, disabled accounts back to `/login` with a message, and non-admins
  away from `/admin/*`.

## Notes / things you may want to adjust

- **Disabling a user** sets `disabled_at` on their profile; `proxy.ts` checks
  this on every request and signs them out immediately. Their existing
  Supabase session JWT doesn't get force-revoked the instant you click
  "Disable" (that's a Supabase Auth limitation), but their very next request
  gets bounced to login.
- **Email confirmation**: if you leave "Confirm email" on in Supabase, new
  registrations won't get a session until they click the confirmation email link.
  The register form already handles this and tells the user to check their
  inbox.

## Database regression checks

Run `tests/database-regression.sql` only in an empty disposable PostgreSQL database.
It exercises the historical migrations, then applies migration 006 twice and runs
`tests/classes-and-timers.sql`. Never run the fixture against a live Supabase project.
