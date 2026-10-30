-- Run in the DEMO project's SQL editor. No changes to the full app's tables.
begin;
create table if not exists public.demo_guests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  rate_key text not null,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists demo_guests_expiry on public.demo_guests(expires_at);
create index if not exists demo_guests_rate on public.demo_guests(rate_key, created_at);
create or replace function public.demo_limit_guests() returns trigger language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(7462910);
  if (select count(*) from demo_guests) >= 1000 or
     (select count(*) from demo_guests where rate_key = new.rate_key and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Demo signup limit reached';
  end if;
  return new;
end $$;
drop trigger if exists demo_guest_quota on public.demo_guests;
create trigger demo_guest_quota before insert on public.demo_guests for each row execute function public.demo_limit_guests();
create table if not exists public.demo_quizzes (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.demo_guests(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  questions jsonb not null check (jsonb_array_length(questions) between 1 and 30),
  created_at timestamptz not null default now()
);
create index if not exists demo_quizzes_guest on public.demo_quizzes(guest_id);
create table if not exists public.demo_results (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.demo_quizzes(id) on delete cascade,
  submission_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  answers jsonb not null,
  score integer not null,
  total integer not null,
  created_at timestamptz not null default now(),
  unique(quiz_id, submission_id)
);
create index if not exists demo_results_quiz on public.demo_results(quiz_id);
alter table public.demo_guests enable row level security;
alter table public.demo_quizzes enable row level security;
alter table public.demo_results enable row level security;
revoke all on public.demo_guests, public.demo_quizzes, public.demo_results from anon, authenticated;
grant all on public.demo_guests, public.demo_quizzes, public.demo_results to service_role;
-- Serialize per-guest quiz creation and per-quiz submissions to enforce quotas.
create or replace function public.demo_limit_quizzes() returns trigger language plpgsql set search_path = public as $$
begin
  perform 1 from demo_guests where id = new.guest_id and expires_at > now() for update;
  if not found then raise exception 'Guest expired'; end if;
  if (select count(*) from demo_quizzes where guest_id = new.guest_id) >= 10 then raise exception 'Maximum 10 quizzes per guest'; end if;
  return new;
end $$;
drop trigger if exists demo_quiz_quota on public.demo_quizzes;
create trigger demo_quiz_quota before insert on public.demo_quizzes for each row execute function public.demo_limit_quizzes();
create or replace function public.demo_limit_results() returns trigger language plpgsql set search_path = public as $$
begin
  perform 1 from demo_quizzes q join demo_guests g on g.id=q.guest_id where q.id=new.quiz_id and g.expires_at > now() for update of q;
  if not found then raise exception 'Quiz expired'; end if;
  if exists(select 1 from demo_results where quiz_id=new.quiz_id and submission_id=new.submission_id) then return new; end if;
  if (select count(*) from demo_results where quiz_id=new.quiz_id) >= 100 then raise exception 'Maximum 100 results per quiz'; end if;
  return new;
end $$;
drop trigger if exists demo_result_quota on public.demo_results;
create trigger demo_result_quota before insert on public.demo_results for each row execute function public.demo_limit_results();
commit;
