-- Run ONLY in an empty, disposable PostgreSQL database with psql -v ON_ERROR_STOP=1.
-- Minimal Supabase Auth stand-in; never run this fixture on a live Supabase project.
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
\ir ../supabase/schema.sql
\ir ../supabase/002_exam_mode.sql
\ir ../supabase/003_prevent_duplicate_exam_attempts.sql
\ir ../supabase/004_question_types_and_quiz_attempts.sql
-- Applying the upgrade twice should be safe.
\ir ../supabase/004_question_types_and_quiz_attempts.sql

\ir ../supabase/005_student_workspace_access.sql
\ir ../supabase/005_student_workspace_access.sql
\ir student-workspace-access.sql

set plpgsql.check_asserts = on;
begin;
do $$
declare
  teacher uuid := gen_random_uuid();
  student uuid := gen_random_uuid();
  quiz_a bigint; quiz_b bigint;
  token_a uuid; token_b uuid;
  tf bigint; enumeration bigint; identification bigint; mc bigint;
  attempt_a bigint; attempt_b bigint;
  payload json;
  actual boolean;
begin
  insert into auth.users(id, email) values (teacher, 'teacher@example.test'), (student, 'student@example.test');
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  insert into quizzes(user_id, title, is_published) values (teacher, 'Quiz A', true) returning id, share_token into quiz_a, token_a;
  insert into quizzes(user_id, title, is_published) values (teacher, 'Quiz B', true) returning id, share_token into quiz_b, token_b;
  insert into questions(quiz_id, type, prompt, options, correct_index) values (quiz_a, 'true_false', 'The Earth orbits the Sun.', '["True","False"]', 0) returning id into tf;
  insert into questions(quiz_id, type, prompt, answer_text) values (quiz_a, 'enumeration', 'List three colors.', E'Red\nGreen\nBlue') returning id into enumeration;
  insert into questions(quiz_id, type, prompt, answer_text) values (quiz_a, 'identification', 'Name the planet.', 'Earth') returning id into identification;
  insert into questions(quiz_id, type, prompt, options, correct_index) values (quiz_a, 'multiple_choice', 'Choose B.', '["A","B"]', 1) returning id into mc;
  insert into questions(quiz_id, type, prompt, answer_text) values (quiz_b, 'identification', 'Name the planet.', 'Earth');

  perform set_config('request.jwt.claim.sub', student::text, true);
  payload := start_public_attempt(token_a, E'  Jamie\t Santos ', null);
  attempt_a := (payload->>'id')::bigint;
  assert payload->>'student_name' = 'Jamie Santos', 'Name normalization failed';
  attempt_b := (start_public_attempt(token_b, 'JAMIE SANTOS', 'different ID')->>'id')::bigint;
  assert attempt_a <> attempt_b, 'Same student must be allowed on another quiz';
  assert (select quiz_id from attempts where id = attempt_b) = quiz_b, 'Attempt belongs to the wrong quiz';

  begin
    perform start_public_attempt(token_a, E'jamie  santos', 'changed ID');
    raise exception 'Duplicate attempt was allowed';
  exception when raise_exception then
    if sqlerrm not like 'You have already started an attempt for Quiz A%' then raise; end if;
  end;

  perform submit_answer(attempt_a, tf, 1, null);
  assert not (select is_correct from attempt_answers where attempt_id = attempt_a and question_id = tf), 'Wrong true/false answer accepted';
  perform submit_answer(attempt_a, tf, 0, null);
  assert (select is_correct from attempt_answers where attempt_id = attempt_a and question_id = tf), 'Correct true/false answer rejected';
  begin
    perform submit_answer(attempt_a, tf, -1, null);
    raise exception 'Negative index accepted';
  exception when raise_exception then
    if sqlerrm <> 'Choose a valid answer' then raise; end if;
  end;
  begin
    perform submit_answer(attempt_a, tf, 2, null);
    raise exception 'Invalid true/false index accepted';
  exception when raise_exception then
    if sqlerrm <> 'Choose a valid answer' then raise; end if;
  end;

  perform submit_answer(attempt_a, enumeration, null, E' blue \r\nRED\n\n Green ');
  assert (select is_correct from attempt_answers where attempt_id = attempt_a and question_id = enumeration), 'Reordered/case-insensitive enumeration rejected';
  perform submit_answer(attempt_a, enumeration, null, E'Red\nGreen');
  assert not (select is_correct from attempt_answers where attempt_id = attempt_a and question_id = enumeration), 'Missing item accepted';
  perform submit_answer(attempt_a, enumeration, null, E'Red\nGreen\nBlue\nYellow');
  assert not (select is_correct from attempt_answers where attempt_id = attempt_a and question_id = enumeration), 'Extra item accepted';
  perform submit_answer(attempt_a, enumeration, null, E'Red\nGreen\nGreen');
  assert not (select is_correct from attempt_answers where attempt_id = attempt_a and question_id = enumeration), 'Repeated item replaced missing item';
  perform submit_answer(attempt_a, enumeration, null, E'Red\nGreen\nBlue');
  perform submit_answer(attempt_a, identification, null, ' eArTh ');
  perform submit_answer(attempt_a, mc, 1, null);
  payload := complete_attempt(attempt_a);
  assert (payload->>'score')::int = 4 and (payload->>'total_questions')::int = 4, 'Each question must score exactly one point';
  begin
    perform submit_answer(attempt_a, tf, 1, null);
    raise exception 'Completed answer changed';
  exception when raise_exception then
    if sqlerrm <> 'Attempt already completed' then raise; end if;
  end;
  -- An anonymous session change must not let the same name retake Quiz A.
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  begin
    perform start_public_attempt(token_a, 'Jamie Santos');
    raise exception 'Completed duplicate allowed from another session';
  exception when raise_exception then
    if sqlerrm not like 'You have already started an attempt for Quiz A%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform submit_answer(attempt_b, tf, 0, null);
    raise exception 'Unauthenticated answer allowed';
  exception when raise_exception then
    if sqlerrm <> 'Not found' then raise; end if;
  end;
  raise notice 'PASS: all question types, enumeration matching, one-point scoring, per-quiz names, repeat protection, validation, authentication, repeat migration';
end $$;
rollback;
