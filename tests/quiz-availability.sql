-- Disposable regression database only, after migration 008.
begin;
set local plpgsql.check_asserts = on;
do $$
declare teacher uuid := gen_random_uuid(); quiz bigint; section bigint; payload json; attempt bigint;
  today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  insert into auth.users(id,email) values(teacher,'schedule@example.test');
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  insert into classes(user_id,name) values(teacher,'Schedule class') returning id into section;
  insert into quizzes(user_id,title) values(teacher,'Scheduled quiz') returning id into quiz;
  insert into questions(quiz_id,type,prompt,answer_text) values(quiz,'identification','Say yes','yes');
  perform save_quiz_settings(quiz,'Scheduled quiz',null,true,false,null,array[section],today + 1);
  begin
    perform start_attempt(quiz);
    raise exception 'Future date allowed';
  exception when raise_exception then if sqlerrm not like 'This quiz is only available on %' then raise; end if; end;
  update quizzes set available_on=today-1 where id=quiz;
  begin
    perform start_attempt(quiz);
    raise exception 'Past date allowed';
  exception when raise_exception then if sqlerrm not like 'This quiz is only available on %' then raise; end if; end;
  assert not exists(select 1 from attempts where quiz_id=quiz), 'Rejected starts consumed attempts';
  update quizzes set available_on=today where id=quiz;
  payload := start_attempt(quiz);
  attempt := (payload->>'id')::bigint;
  assert (payload->>'expires_at')::timestamptz = (today+1)::timestamp at time zone 'Asia/Manila', 'Day-end deadline incorrect';
  update quizzes set time_limit_minutes=1 where id=quiz;
  payload := start_attempt(quiz);
  assert (payload->>'expires_at')::timestamptz <= (payload->>'started_at')::timestamptz + interval '1 minute', 'Timer not capped';
  update quizzes set available_on=null, time_limit_minutes=null where id=quiz;
  payload := start_attempt(quiz);
  assert payload->>'expires_at' is null, 'Unscheduled untimed quiz is restricted';
  assert (select expires_at from attempts where id=attempt) = (today+1)::timestamp at time zone 'Asia/Manila', 'Settings changed active deadline';
  raise notice 'PASS: past/future dates blocked, current day allowed, Philippine midnight deadline, timer cap, unrestricted defaults, no consumed attempt';
end $$;
rollback;
