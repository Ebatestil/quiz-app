-- Included by database-regression.sql in its disposable database only.
begin;
set local plpgsql.check_asserts = on;
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
do $$
declare
  student uuid := gen_random_uuid();
  teacher uuid := gen_random_uuid();
  quiz bigint; question bigint; token uuid; attempt bigint;
begin
  insert into auth.users(id, is_anonymous) values (student, true);
  assert not (select is_admin from profiles where id = student), 'First anonymous student became admin';
  insert into auth.users(id, email) values (teacher, 'teacher-access@example.test');
  assert (select is_admin from profiles where id = teacher), 'First permanent account must bootstrap admin';
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  set local role authenticated;
  assert public.is_workspace_user(), 'Teacher denied workspace';
  insert into quizzes(user_id, title, is_published) values (teacher, 'Access test', true) returning id, share_token into quiz, token;
  insert into questions(quiz_id, type, prompt, answer_text) values (quiz, 'identification', 'Say yes', 'yes') returning id into question;
  perform start_attempt(quiz);
  reset role;
  -- A spoofed profile flag must not override the trusted Auth record.
  update profiles set is_anonymous = false where id = student;
  perform set_config('request.jwt.claim.sub', student::text, true);
  set local role authenticated;
  assert not public.is_workspace_user(), 'Student profile flag bypassed Auth check';
  begin
    insert into quizzes(user_id, title) values (student, 'Unauthorized');
    raise exception 'Student created a quiz';
  exception when insufficient_privilege then null;
  end;
  begin
    perform start_attempt(quiz);
    raise exception 'Student started a workspace attempt';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from questions where quiz_id = quiz) = 0, 'Student can read answer keys';
  attempt := (start_public_attempt(token, 'Student Access', null)->>'id')::bigint;
  perform submit_answer(attempt, question, null, 'yes');
  assert (complete_attempt(attempt)->>'score')::int = 1, 'Student exam flow failed';
  reset role;
  update profiles set disabled_at = now() where id = teacher;
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  set local role authenticated;
  assert not public.is_workspace_user(), 'Disabled teacher allowed workspace';
  reset role;
end $$;
rollback;
