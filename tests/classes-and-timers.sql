-- Run only after migration 006 in the disposable database-regression fixture.
begin;
set local plpgsql.check_asserts = on;
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
do $$
declare
  teacher uuid := gen_random_uuid(); other_teacher uuid := gen_random_uuid(); student uuid := gen_random_uuid();
  class_a bigint; class_b bigint; other_class bigint; quiz bigint; quiz_b bigint; token uuid; token_b uuid;
  question bigint; student_id bigint; attempt bigint; second_attempt bigint; payload json; original_deadline timestamptz;
begin
  insert into auth.users(id,email) values(teacher,'roster@example.test'),(other_teacher,'other@example.test');
  insert into auth.users(id,is_anonymous) values(student,true);
  perform set_config('request.jwt.claim.sub',other_teacher::text,true);
  insert into classes(user_id,name) values(other_teacher,'Other class') returning id into other_class;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  set local role authenticated;
  insert into classes(user_id,name) values(teacher,'Section A') returning id into class_a;
  insert into classes(user_id,name) values(teacher,'Section B') returning id into class_b;
  insert into class_students(class_id,first_name,last_name) values(class_a,'Juan Miguel','Dela Cruz') returning id into student_id;
  insert into class_students(class_id,first_name,last_name) values(class_b,'Juan Miguel','Dela Cruz');
  begin
    insert into class_students(class_id,first_name,last_name) values(class_a,' JUAN  MIGUEL ','dela cruz');
    raise exception 'Duplicate roster name allowed';
  exception when unique_violation then null; end;
  begin
    insert into class_students(class_id,first_name,last_name) values(other_class,'Bad','Access');
    raise exception 'Another teacher roster changed';
  exception when insufficient_privilege then null; end;
  insert into quizzes(user_id,title) values(teacher,'Roster quiz') returning id,share_token into quiz,token;
  insert into quizzes(user_id,title) values(teacher,'Second quiz') returning id,share_token into quiz_b,token_b;
  insert into questions(quiz_id,type,prompt,answer_text) values(quiz,'identification','Say yes','yes') returning id into question;
  insert into questions(quiz_id,type,prompt,answer_text) values(quiz_b,'identification','Say yes','yes');
  perform save_quiz_settings(quiz,'Roster quiz',null,true,false,5,array[class_a,class_b]);
  perform save_quiz_settings(quiz_b,'Second quiz',null,true,false,null,array[class_a]);
  begin
    perform save_quiz_settings(quiz,'Bad update',null,true,false,5,array[other_class]);
    raise exception 'Assigned another teacher class';
  exception when raise_exception then if sqlerrm <> 'Choose your own classes' then raise; end if; end;
  assert (select title from quizzes where id=quiz) = 'Roster quiz', 'Failed save changed quiz';
  reset role;
  perform set_config('request.jwt.claim.sub',student::text,true);
  set local role authenticated;
  assert (select count(*) from class_students) = 0, 'Anonymous student can browse roster';
  assert (select count(*) from exam_classes(token)) = 2, 'Assigned sections unavailable';
  begin
    perform start_public_attempt(token,class_a,'Unknown','Student');
    raise exception 'Unregistered student allowed';
  exception when raise_exception then if sqlerrm not like 'Your name is not registered%' then raise; end if; end;
  begin
    perform start_public_attempt(token,other_class,'Juan Miguel','Dela Cruz');
    raise exception 'Unassigned class allowed';
  exception when raise_exception then if sqlerrm not like 'Your class is not assigned%' then raise; end if; end;
  payload := start_public_attempt(token,class_a,' JUAN  MIGUEL ','dela CRUZ');
  attempt := (payload->>'id')::bigint;
  original_deadline := (payload->>'expires_at')::timestamptz;
  assert payload->>'student_name' = 'Juan Miguel Dela Cruz', 'Roster spelling not used';
  assert payload->>'class_name' = 'Section A', 'Section missing';
  assert original_deadline = (payload->>'started_at')::timestamptz + interval '5 minutes', 'Incorrect timer duration';
  begin
    perform start_public_attempt(token,class_a,'Juan Miguel','Dela Cruz');
    raise exception 'Duplicate quiz attempt allowed';
  exception when raise_exception then if sqlerrm not like 'You have already started%' then raise; end if; end;
  payload := start_public_attempt(token_b,class_a,'Juan Miguel','Dela Cruz');
  assert payload->>'expires_at' is null, 'Untimed quiz has deadline';
  second_attempt := (start_public_attempt(token,class_b,'Juan Miguel','Dela Cruz')->>'id')::bigint;
  perform submit_answer(attempt,question,null,'yes');
  reset role;
  update quizzes set time_limit_minutes = 10 where id=quiz;
  assert (select expires_at from attempts where id=attempt) = original_deadline, 'Editing timer changed active attempt';
  update attempts set expires_at = clock_timestamp() - interval '1 second' where id=attempt;
  set local role authenticated;
  payload := submit_answer(attempt,question,null,'wrong');
  assert (payload->>'expired')::boolean, 'Late answer accepted';
  payload := get_attempt(attempt);
  assert payload->>'termination_reason' = 'time_expired', 'Expiry reason missing';
  assert (payload->>'score')::int = 1, 'Late answer changed saved score';
  reset role;
  update attempts set expires_at = clock_timestamp() - interval '1 second' where id=second_attempt;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  set local role authenticated;
  perform expire_quiz_attempts(quiz);
  payload := get_attempt(second_attempt);
  assert payload->>'completed_at' is not null and (payload->>'score')::int = 0, 'Offline expiry not finalized in results';
  delete from class_students where id=student_id;
  assert (get_attempt(attempt)->>'student_name') = 'Juan Miguel Dela Cruz', 'Roster removal changed history';
  reset role;
  assert to_regprocedure('public.start_public_attempt(uuid,text,text)') is null, 'Legacy roster bypass still exists';
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  assert (select count(*) from exam_classes(token)) = 2, 'Public section list failed';
  reset role;
  raise notice 'PASS: roster RLS, name matching, multiple sections, quiz-scoped duplicates, timer snapshot, late answer rejection, offline expiry, preserved history';
end $$;
rollback;
