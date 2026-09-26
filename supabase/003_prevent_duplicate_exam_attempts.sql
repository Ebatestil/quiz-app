-- Run after 002_exam_mode.sql. Existing attempts are preserved and count
-- toward the one-attempt-per-name rule, including unfinished attempts.
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
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in before starting the exam';
  end if;

  v_name := trim(regexp_replace(coalesce(p_student_name, ''), '[[:space:]]+', ' ', 'g'));
  if v_name = '' then
    raise exception 'Name is required';
  end if;

  select * into v_quiz from public.quizzes where share_token = p_share_token;
  if not found or not v_quiz.is_published then
    raise exception 'This exam is not available';
  end if;

  -- Serialize starts for this quiz/name, including requests from different
  -- anonymous sessions. The lock is released on transaction completion.
  perform pg_advisory_xact_lock(hashtextextended(v_quiz.id::text || ':' || lower(v_name), 0));

  if exists (
    select 1 from public.attempts
    where quiz_id = v_quiz.id
      and lower(trim(regexp_replace(student_name, '[[:space:]]+', ' ', 'g'))) = lower(v_name)
  ) then
    raise exception 'An attempt has already been started for this name on this quiz. Only one attempt is allowed. Contact your teacher if you need help.';
  end if;

  select array_agg(id order by random()) into v_question_ids
  from public.questions where quiz_id = v_quiz.id;

  if v_question_ids is null or array_length(v_question_ids, 1) = 0 then
    raise exception 'This exam has no questions yet';
  end if;

  insert into public.attempts (quiz_id, user_id, started_at, student_name, student_number)
  values (v_quiz.id, auth.uid(), now(), v_name, nullif(trim(coalesce(p_student_number, '')), ''))
  returning id into v_attempt_id;

  insert into public.attempt_questions (attempt_id, question_id, "position")
  select v_attempt_id, qid, ord - 1
  from unnest(v_question_ids) with ordinality as t(qid, ord);

  return public._attempt_payload(v_attempt_id);
end;
$$;

revoke execute on function public.start_public_attempt(uuid, text, text) from public, anon;
grant execute on function public.start_public_attempt(uuid, text, text) to authenticated;
