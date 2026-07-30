# Quiz App (Next.js + Supabase)

A rebuild of the original Laravel + React quiz app on **Next.js (App Router)**
and **Supabase** (Postgres database + Auth), so it can be hosted for free.

Same features as before:
- Register / login
- Create quizzes with multiple-choice or identification questions
- Publish/unpublish quizzes
- Take a quiz (questions shuffled), score tracked per attempt
- Review past attempts
- Admin panel to create/disable/enable users (the first account you register
  is automatically made an admin)

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In the project dashboard, go to **SQL Editor** → **New query**, paste in
   the entire contents of [`supabase/schema.sql`](./supabase/schema.sql),
   and run it. This creates all the tables, security policies, and database
   functions the app needs.
3. Go to **Project Settings → API**. You'll need three values from this page:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (click "reveal" — keep this one secret)
4. (Optional but recommended) Under **Authentication → Providers → Email**,
   turn **off** "Confirm email" while you're testing locally, so new accounts
   can log in immediately without clicking an email link. Turn it back on
   before going live if you want email verification.

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

## How it's structured

- `supabase/schema.sql` — all tables, Row Level Security policies, and
  Postgres functions (RPCs). The RPCs (`start_attempt`, `get_attempt`,
  `submit_answer`, `complete_attempt`) replicate the original Laravel
  `AttemptController` logic exactly, including keeping the correct answer
  hidden from the quiz-taker until they finish the attempt.
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
