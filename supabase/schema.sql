-- ============================================================================
-- Quiz App — Supabase schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles — extends auth.users with app-specific fields
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null,
  is_admin boolean not null default false,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read/update their own profile row.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and is_admin = (select is_admin from public.profiles where id = auth.uid()));

-- Auto-create a profile row whenever a new auth user signs up.
-- The first user to ever sign up becomes an admin automatically so you have
-- someone to manage the app with; everyone after that is a normal user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    (select count(*) from public.profiles) = 0
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. quizzes
-- ----------------------------------------------------------------------------
create table if not exists public.quizzes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quizzes_user_id_idx on public.quizzes (user_id);

alter table public.quizzes enable row level security;

create policy "quizzes_select" on public.quizzes
  for select using (auth.uid() = user_id or is_published = true);

create policy "quizzes_insert_own" on public.quizzes
  for insert with check (auth.uid() = user_id);

create policy "quizzes_update_own" on public.quizzes
  for update using (auth.uid() = user_id);

create policy "quizzes_delete_own" on public.quizzes
  for delete using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quizzes_set_updated_at on public.quizzes;
create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. questions — only the quiz owner can read/write these directly.
-- Non-owners never query this table straight; they only see sanitized data
-- returned by the RPC functions below while taking a quiz.
-- ----------------------------------------------------------------------------
create table if not exists public.questions (
  id bigint generated always as identity primary key,
  quiz_id bigint not null references public.quizzes (id) on delete cascade,
  type text not null default 'multiple_choice' check (type in ('multiple_choice', 'identification')),
  prompt text not null,
  options jsonb,
  correct_index int,
  answer_text text,
  explanation text,
  created_at timestamptz not null default now()
);

create index if not exists questions_quiz_id_idx on public.questions (quiz_id);

alter table public.questions enable row level security;

create policy "questions_select_owner" on public.questions
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid())
  );

create policy "questions_insert_owner" on public.questions
  for insert with check (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid())
  );

create policy "questions_update_owner" on public.questions
  for update using (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid())
  );

create policy "questions_delete_owner" on public.questions
  for delete using (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 4. attempts / attempt_questions / attempt_answers
-- ----------------------------------------------------------------------------
create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  quiz_id bigint not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  score int,
  total_questions int
);

create index if not exists attempts_user_id_idx on public.attempts (user_id);
create index if not exists attempts_quiz_id_idx on public.attempts (quiz_id);

alter table public.attempts enable row level security;

create policy "attempts_select_own" on public.attempts
  for select using (auth.uid() = user_id);

-- Inserts/updates to attempts happen only inside the SECURITY DEFINER
-- functions below (so scoring logic can't be tampered with from the client),
-- so no insert/update policy is granted to regular users here.

create table if not exists public.attempt_questions (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts (id) on delete cascade,
  question_id bigint not null references public.questions (id) on delete cascade,
  "position" int not null,
  unique (attempt_id, question_id)
);

alter table public.attempt_questions enable row level security;

create policy "attempt_questions_select_own" on public.attempt_questions
  for select using (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );

create table if not exists public.attempt_answers (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts (id) on delete cascade,
  question_id bigint not null references public.questions (id) on delete cascade,
  selected_index int,
  answer_text text,
  is_correct boolean,
  answered_at timestamptz,
  unique (attempt_id, question_id)
);

alter table public.attempt_answers enable row level security;

create policy "attempt_answers_select_own" on public.attempt_answers
  for select using (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 5. RPC functions — mirror the Laravel AttemptController exactly, including
-- keeping correct_index / answer_text hidden from the client until an
-- attempt is completed.
-- ----------------------------------------------------------------------------

-- Builds the same JSON shape the frontend expects from GET /attempts/:id
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

-- POST /quizzes/:id/attempts
create or replace function public.start_attempt(p_quiz_id bigint)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_quiz record;
  v_attempt_id bigint;
  v_question_ids bigint[];
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'Not found' using errcode = 'PGRST';
  end if;

  if not v_quiz.is_published and v_quiz.user_id <> auth.uid() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select array_agg(id order by random()) into v_question_ids
  from public.questions where quiz_id = p_quiz_id;

  if v_question_ids is null or array_length(v_question_ids, 1) = 0 then
    raise exception 'Quiz has no questions';
  end if;

  insert into public.attempts (quiz_id, user_id, started_at)
  values (p_quiz_id, auth.uid(), now())
  returning id into v_attempt_id;

  insert into public.attempt_questions (attempt_id, question_id, "position")
  select v_attempt_id, qid, ord - 1
  from unnest(v_question_ids) with ordinality as t(qid, ord);

  return public._attempt_payload(v_attempt_id);
end;
$$;

-- GET /attempts/:id
create or replace function public.get_attempt(p_attempt_id bigint)
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

  return public._attempt_payload(p_attempt_id);
end;
$$;

-- POST /attempts/:id/answer
create or replace function public.submit_answer(
  p_attempt_id bigint,
  p_question_id bigint,
  p_selected_index int default null,
  p_answer_text text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_attempt record;
  v_question record;
  v_is_correct boolean;
  v_in_attempt boolean;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found or v_attempt.user_id <> auth.uid() then
    raise exception 'Not found';
  end if;

  if v_attempt.completed_at is not null then
    raise exception 'Attempt already completed';
  end if;

  select exists(
    select 1 from public.attempt_questions
    where attempt_id = p_attempt_id and question_id = p_question_id
  ) into v_in_attempt;

  if not v_in_attempt then
    raise exception 'Question not in attempt';
  end if;

  select * into v_question from public.questions where id = p_question_id;

  if v_question.type = 'multiple_choice' then
    if p_selected_index is null then
      raise exception 'selected_index is required';
    end if;
    if p_selected_index > coalesce(jsonb_array_length(v_question.options), 0) - 1 then
      raise exception 'selected_index out of range';
    end if;
    v_is_correct := p_selected_index = v_question.correct_index;
  else
    if p_answer_text is null or trim(p_answer_text) = '' then
      raise exception 'answer_text is required';
    end if;
    v_is_correct := lower(trim(v_question.answer_text)) = lower(trim(p_answer_text));
  end if;

  insert into public.attempt_answers (attempt_id, question_id, selected_index, answer_text, is_correct, answered_at)
  values (p_attempt_id, p_question_id, p_selected_index, trim(p_answer_text), v_is_correct, now())
  on conflict (attempt_id, question_id) do update set
    selected_index = excluded.selected_index,
    answer_text = excluded.answer_text,
    is_correct = excluded.is_correct,
    answered_at = excluded.answered_at;

  return json_build_object('ok', true, 'is_correct', v_is_correct);
end;
$$;

-- POST /attempts/:id/complete
create or replace function public.complete_attempt(p_attempt_id bigint)
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
  if not found or v_attempt.user_id <> auth.uid() then
    raise exception 'Not found';
  end if;

  if v_attempt.completed_at is not null then
    return public._attempt_payload(p_attempt_id);
  end if;

  -- Fill in a blank (incorrect) answer for anything left unanswered.
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
  set completed_at = now(), score = v_score, total_questions = v_total
  where id = p_attempt_id;

  return public._attempt_payload(p_attempt_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Lock down function access
-- _attempt_payload has no ownership check of its own (the public RPCs above
-- check ownership before calling it), so it must never be callable directly
-- by a client — only revoke it, the wrapping RPCs still work because nested
-- calls run as the function owner.
-- ----------------------------------------------------------------------------
revoke execute on function public._attempt_payload(bigint) from public, anon, authenticated;

grant execute on function public.start_attempt(bigint) to authenticated;
grant execute on function public.get_attempt(bigint) to authenticated;
grant execute on function public.submit_answer(bigint, bigint, int, text) to authenticated;
grant execute on function public.complete_attempt(bigint) to authenticated;

-- ============================================================================
-- Done. Next: create your first user via the app's Register form — the very
-- first account created is automatically made an admin (see
-- handle_new_user() above).
-- ============================================================================
