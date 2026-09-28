-- Run after 003_prevent_duplicate_exam_attempts.sql.
begin;

alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('multiple_choice', 'identification', 'true_false', 'enumeration'));

-- A sorted list retains duplicate counts: repeating a correct item cannot
-- substitute for a missing item. Case and extra whitespace are ignored.
create or replace function public.normalize_enumeration(p_text text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(answer order by answer), array[]::text[])
  from (
    select lower(trim(regexp_replace(line, '[[:space:]]+', ' ', 'g'))) as answer
    from regexp_split_to_table(coalesce(p_text, ''), E'\n') as line
  ) as answers
  where answer <> '';
$$;

alter table public.questions drop constraint if exists questions_true_false_valid;
alter table public.questions add constraint questions_true_false_valid check (
  type <> 'true_false' or (
    options is not null and options = '["True", "False"]'::jsonb
    and correct_index is not null and correct_index in (0, 1)
  )
);
alter table public.questions drop constraint if exists questions_enumeration_valid;
alter table public.questions add constraint questions_enumeration_valid check (
  type <> 'enumeration' or cardinality(public.normalize_enumeration(answer_text)) > 0
);

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
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if auth.uid() is null or not found or v_attempt.user_id <> auth.uid() then
    raise exception 'Not found';
  end if;
  if v_attempt.completed_at is not null then
    raise exception 'Attempt already completed';
  end if;
  if not exists (
    select 1 from public.attempt_questions
    where attempt_id = p_attempt_id and question_id = p_question_id
  ) then
    raise exception 'Question not in attempt';
  end if;

  select * into v_question from public.questions where id = p_question_id;
  if v_question.type in ('multiple_choice', 'true_false') then
    if p_selected_index is null or p_selected_index < 0
      or p_selected_index >= coalesce(jsonb_array_length(v_question.options), 0) then
      raise exception 'Choose a valid answer';
    end if;
    v_is_correct := p_selected_index = v_question.correct_index;
  elsif v_question.type = 'enumeration' then
    if cardinality(public.normalize_enumeration(p_answer_text)) = 0 then
      raise exception 'Enter at least one answer, one per line';
    end if;
    v_is_correct := public.normalize_enumeration(v_question.answer_text)
      = public.normalize_enumeration(p_answer_text);
  else
    if p_answer_text is null or trim(p_answer_text) = '' then
      raise exception 'Answer is required';
    end if;
    v_is_correct := lower(trim(v_question.answer_text)) = lower(trim(p_answer_text));
  end if;

  insert into public.attempt_answers (attempt_id, question_id, selected_index, answer_text, is_correct, answered_at)
  values (
    p_attempt_id, p_question_id,
    case when v_question.type in ('multiple_choice', 'true_false') then p_selected_index else null end,
    case when v_question.type in ('enumeration', 'identification') then trim(p_answer_text) else null end,
    v_is_correct, now()
  )
  on conflict (attempt_id, question_id) do update set
    selected_index = excluded.selected_index,
    answer_text = excluded.answer_text,
    is_correct = excluded.is_correct,
    answered_at = excluded.answered_at;

  return json_build_object('ok', true);
end;
$$;
-- Existing attempts are preserved and count
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
    select 1 from public.attempts as existing_attempt
    where existing_attempt.quiz_id = v_quiz.id
      and lower(trim(regexp_replace(existing_attempt.student_name, '[[:space:]]+', ' ', 'g'))) = lower(v_name)
  ) then
    raise exception 'You have already started an attempt for % with this name. You can still take other quizzes. Contact your teacher if you need help.', v_quiz.title;
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

commit;
