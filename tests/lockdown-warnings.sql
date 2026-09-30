-- Disposable regression database only, after migration 007.
begin;
set local plpgsql.check_asserts = on;
do $$
declare
  teacher uuid := gen_random_uuid(); student uuid := gen_random_uuid();
  quiz bigint; question bigint; attempt bigint; event_one uuid := gen_random_uuid(); result json;
begin
  insert into auth.users(id,email) values(teacher,'warnings@example.test');
  insert into auth.users(id,is_anonymous) values(student,true);
  insert into quizzes(user_id,title,is_published,lockdown_enabled) values(teacher,'Warnings test',true,true) returning id into quiz;
  insert into questions(quiz_id,type,prompt,answer_text) values(quiz,'identification','Say yes','yes') returning id into question;
  insert into attempts(quiz_id,user_id) values(quiz,student) returning id into attempt;
  insert into attempt_questions(attempt_id,question_id,"position") values(attempt,question,0);
  perform set_config('request.jwt.claim.sub',student::text,true);
  perform submit_answer(attempt,question,null,'yes');
  result := report_violation(attempt,'blur',event_one);
  assert (result->>'violation_count')::int = 1 and result->>'completed_at' is null, 'First warning submitted';
  result := report_violation(attempt,'blur',event_one);
  assert (result->>'violation_count')::int = 1, 'Retry counted twice';
  result := report_violation(attempt,'tab_switch',gen_random_uuid());
  assert (result->>'violation_count')::int = 2 and result->>'completed_at' is null, 'Second warning submitted';
  result := report_violation(attempt,'fullscreen_exit',gen_random_uuid());
  assert (result->>'violation_count')::int = 3 and result->>'completed_at' is not null, 'Third violation did not submit';
  assert (result->>'score')::int = 1, 'Saved score lost';
  result := report_violation(attempt,'blur',gen_random_uuid());
  assert (result->>'violation_count')::int = 3 and (result->>'score')::int = 1, 'Completed attempt changed';
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  begin
    perform report_violation(attempt,'blur',gen_random_uuid());
    raise exception 'Wrong user accepted';
  exception when raise_exception then if sqlerrm <> 'Not found' then raise; end if; end;
  insert into attempts(quiz_id,user_id,expires_at) values(quiz,student,null) returning id into attempt;
  insert into attempt_questions(attempt_id,question_id,"position") values(attempt,question,0);
  update attempts set expires_at = clock_timestamp() - interval '1 second' where id=attempt;
  perform set_config('request.jwt.claim.sub',student::text,true);
  result := report_violation(attempt,'blur',gen_random_uuid());
  assert result->>'termination_reason' = 'time_expired', 'Warnings bypassed timer';
  raise notice 'PASS: two warnings, third submission, stable retry IDs, saved scores, ownership, timer priority';
end $$;
rollback;
