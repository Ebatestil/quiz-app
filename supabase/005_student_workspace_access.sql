-- Run after 004_question_types_and_quiz_attempts.sql.
begin;

-- Check trusted Auth records, not editable profile metadata or client input.
create or replace function public.is_workspace_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = auth.uid() and not coalesce(u.is_anonymous, false)
      and not p.is_anonymous and p.disabled_at is null
  );
$$;
revoke execute on function public.is_workspace_user() from public, anon;
grant execute on function public.is_workspace_user() to authenticated;

-- Restrictive policies combine with existing ownership rules. Published exam
-- metadata and the student attempt RPCs remain available.
drop policy if exists workspace_quiz_insert on public.quizzes;
create policy workspace_quiz_insert on public.quizzes as restrictive for insert to authenticated
  with check (public.is_workspace_user());
drop policy if exists workspace_quiz_update on public.quizzes;
create policy workspace_quiz_update on public.quizzes as restrictive for update to authenticated
  using (public.is_workspace_user()) with check (public.is_workspace_user());
drop policy if exists workspace_quiz_delete on public.quizzes;
create policy workspace_quiz_delete on public.quizzes as restrictive for delete to authenticated
  using (public.is_workspace_user());
drop policy if exists workspace_questions on public.questions;
create policy workspace_questions on public.questions as restrictive for all to authenticated
  using (public.is_workspace_user()) with check (public.is_workspace_user());
drop policy if exists workspace_profile_update on public.profiles;
create policy workspace_profile_update on public.profiles as restrictive for update to authenticated
  using (public.is_workspace_user()) with check (public.is_workspace_user());

-- Anonymous exams must never bootstrap the first administrator.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, is_admin, is_anonymous)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Student'),
    new.email,
    not coalesce(new.is_anonymous, false)
      and not exists (select 1 from auth.users u where u.id <> new.id and not coalesce(u.is_anonymous, false)),
    coalesce(new.is_anonymous, false)
  );
  return new;
end;
$$;
update public.profiles p set is_admin = false
from auth.users u where p.id = u.id and u.is_anonymous = true and p.is_admin = true;

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
  if not public.is_workspace_user() then
    raise exception 'A workspace account is required. Students must use the exam link.' using errcode = '42501';
  end if;
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
commit;
