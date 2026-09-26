-- ============================================================================
-- Exam Mode migration
-- Run this in the Supabase SQL editor AFTER schema.sql. Safe to run once on
-- top of the base schema (uses IF NOT EXISTS / OR REPLACE throughout).
--
-- Adds:
--   - Shareable exam links (quizzes.share_token) students can open with no
--     account — they enter their name + student ID, taken via Supabase
--     anonymous auth under the hood.
--   - A lockdown mode: fullscreen is required, and switching tabs/apps or
--     leaving fullscreen immediately auto-submits the attempt.
--   - Teachers can see every attempt (not just their own) on quizzes they
--     own, including student name/ID and why an attempt ended.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles — allow null email (anonymous students have no email), and
-- track which profiles belong to anonymous exam-takers so the admin panel's
-- user list doesn't get cluttered with one row per student per exam.
-- ----------------------------------------------------------------------------
alter table public.profiles alter column email drop not null;
alter table public.profiles add column if not exists is_anonymous boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, is_admin, is_anonymous)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Student'
    ),
    new.email,
    (select count(*) from public.profiles) = 0,
    coalesce(new.is_anonymous, false)
  );
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. quizzes — shareable link + lockdown toggle
-- ----------------------------------------------------------------------------
alter table public.quizzes add column if not exists share_token uuid not null default gen_random_uuid();
alter table public.quizzes add column if not exists lockdown_enabled boolean not null default false;

create unique index if not exists quizzes_share_token_idx on public.quizzes (share_token);

-- ----------------------------------------------------------------------------
-- 3. attempts — student identity (for public/anonymous exam-takers) + why
-- an attempt ended.
-- ----------------------------------------------------------------------------
alter table public.attempts add column if not exists student_name text;
alter table public.attempts add column if not exists student_number text;
alter table public.attempts add column if not exists termination_reason text;

-- Teachers can now see every attempt on quizzes they own, not just their own
-- attempts (needed to review student submissions).
drop policy if exists "attempts_select_own" on public.attempts;
create policy "attempts_select_own" on public.attempts
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 4. attempt_violations — every lockdown violation, for teacher review
-- ----------------------------------------------------------------------------
create table if not exists public.attempt_violations (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts (id) on delete cascade,
  type text not null,
  occurred_at timestamptz not null default now()
);

alter table public.attempt_violations enable row level security;

drop policy if exists "attempt_violations_select" on public.attempt_violations;
create policy "attempt_violations_select" on public.attempt_violations
  for select using (
    exists (
      select 1 from public.attempts a
      join public.quizzes q on q.id = a.quiz_id
      where a.id = attempt_id and (a.user_id = auth.uid() or q.user_id = auth.uid())
    )
  );

-- Extend attempt_questions / attempt_answers select policies to quiz owners too.
drop policy if exists "attempt_questions_select_own" on public.attempt_questions;
create policy "attempt_questions_select_own" on public.attempt_questions
  for select using (
    exists (
      select 1 from public.attempts a
      join public.quizzes q on q.id = a.quiz_id
      where a.id = attempt_id and (a.user_id = auth.uid() or q.user_id = auth.uid())
    )
  );

drop policy if exists "attempt_answers_select_own" on public.attempt_answers;
create policy "attempt_answers_select_own" on public.attempt_answers
  for select using (
    exists (
      select 1 from public.attempts a
      join public.quizzes q on q.id = a.quiz_id
      where a.id = attempt_id and (a.user_id = auth.uid() or q.user_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 5. RPC updates
-- ----------------------------------------------------------------------------

-- _attempt_payload now also returns student identity + termination reason.
create or replace function public._attempt_payload(p_attempt_id bigint)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'id', a.id,
    'quiz', json_build_object('id', qz.id, 'title', qz.title, 'description', qz.description),
    'started_at', a.started_at,
    'completed_at', a.completed_at,
    'score', a.score,
    'total_questions', a.total_questions,
    'student_name', a.student_name,
    'student_number', a.student_number,
    'termination_reason', a.termination_reason,
    'questions', coalesce((
      select json_agg(json_build_object(
        'id', q.id,
        'type', q.type,
        'prompt', q.prompt,
        'options', q.options,
        'explanation', case when a.completed_at is not null then q.explanation else null end,
        'selected_index', ans.selected_index,
        'answer_text', ans.answer_text,
        'is_correct', case when a.completed_at is not null then ans.is_correct else null end
      ) order by aq."position")
      from public.attempt_questions aq
      join public.questions q on q.id = aq.question_id
      left join public.attempt_answers ans on ans.attempt_id = a.id and ans.question_id = q.id
      where aq.attempt_id = a.id
    ), '[]'::json)
  )
  into result
  from public.attempts a
  join public.quizzes qz on qz.id = a.quiz_id
  where a.id = p_attempt_id;

  return result;
end;
$$;

-- get_attempt now also allows the quiz's owner to view any attempt (review).
create or replace function public.get_attempt(p_attempt_id bigint)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_quiz_owner uuid;
begin
  select a.user_id, q.user_id into v_owner, v_quiz_owner
  from public.attempts a join public.quizzes q on q.id = a.quiz_id
  where a.id = p_attempt_id;

  if v_owner is null then
    raise exception 'Not found';
  end if;

  if auth.uid() <> v_owner and auth.uid() <> v_quiz_owner then
    raise exception 'Not found';
  end if;

  return public._attempt_payload(p_attempt_id);
end;
$$;

-- New: start an exam attempt via a public share link (no login — student is
-- signed in anonymously by the client right before this is called).
create or replace function public.start_public_attempt(
  p_share_token uuid,
  p_student_name text,
  p_student_number text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_quiz record;
  v_attempt_id bigint;
  v_question_ids bigint[];
begin
  if p_student_name is null or trim(p_student_name) = '' then
    raise exception 'Name is required';
  end if;

  select * into v_quiz from public.quizzes where share_token = p_share_token;
  if not found or not v_quiz.is_published then
    raise exception 'This exam is not available';
  end if;

  select array_agg(id order by random()) into v_question_ids
  from public.questions where quiz_id = v_quiz.id;

  if v_question_ids is null or array_length(v_question_ids, 1) = 0 then
    raise exception 'This exam has no questions yet';
  end if;

  insert into public.attempts (quiz_id, user_id, started_at, student_name, student_number)
  values (v_quiz.id, auth.uid(), now(), trim(p_student_name), nullif(trim(coalesce(p_student_number, '')), ''))
  returning id into v_attempt_id;

  insert into public.attempt_questions (attempt_id, question_id, "position")
  select v_attempt_id, qid, ord - 1
  from unnest(v_question_ids) with ordinality as t(qid, ord);

  return public._attempt_payload(v_attempt_id);
end;
$$;

-- Shared finalize logic used by both a normal "Finish Quiz" and a lockdown violation.
create or replace function public._finalize_attempt(p_attempt_id bigint, p_reason text default null)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_attempt record;
  v_total int;
  v_score int;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found then
    raise exception 'Not found';
  end if;

  if v_attempt.completed_at is not null then
    return public._attempt_payload(p_attempt_id);
  end if;

  insert into public.attempt_answers (attempt_id, question_id, selected_index, answer_text, is_correct, answered_at)
  select p_attempt_id, aq.question_id, null, null, false, null
  from public.attempt_questions aq
  where aq.attempt_id = p_attempt_id
    and not exists (
      select 1 from public.attempt_answers ans
      where ans.attempt_id = p_attempt_id and ans.question_id = aq.question_id
    );

  select count(*) into v_total from public.attempt_questions where attempt_id = p_attempt_id;
  select count(*) into v_score from public.attempt_answers where attempt_id = p_attempt_id and is_correct = true;

  update public.attempts
  set completed_at = now(), score = v_score, total_questions = v_total,
      termination_reason = coalesce(p_reason, termination_reason)
  where id = p_attempt_id;

  return public._attempt_payload(p_attempt_id);
end;
$$;

create or replace function public.complete_attempt(p_attempt_id bigint)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not found';
  end if;

  return public._finalize_attempt(p_attempt_id, null);
end;
$$;

-- New: called the instant a lockdown violation is detected (tab switch,
-- exiting fullscreen, etc). Logs it and immediately auto-submits.
create or replace function public.report_violation(p_attempt_id bigint, p_type text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not found';
  end if;

  insert into public.attempt_violations (attempt_id, type) values (p_attempt_id, p_type);

  return public._finalize_attempt(p_attempt_id, p_type);
end;
$$;

revoke execute on function public._finalize_attempt(bigint, text) from public, anon, authenticated;

grant execute on function public.start_public_attempt(uuid, text, text) to authenticated;
grant execute on function public.report_violation(bigint, text) to authenticated;

-- ============================================================================
-- Done. Next: in the Supabase dashboard, go to Authentication -> Providers,
-- and make sure "Allow anonymous sign-ins" is enabled (Authentication ->
-- Sign In / Providers -> Anonymous). Students use this to take an exam
-- without creating an account.
-- ============================================================================
