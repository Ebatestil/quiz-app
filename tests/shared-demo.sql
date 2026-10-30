-- Run only against a disposable database after 010_shared_demo.sql.
begin;
do $$
declare
  g uuid;
  q uuid;
  i integer;
begin
  if has_table_privilege('anon', 'public.demo_quizzes', 'select') or
     has_table_privilege('authenticated', 'public.demo_results', 'select') then
    raise exception 'Public roles can read private demo data';
  end if;
  insert into public.demo_guests(token_hash,rate_key,name) values ('test-only-token','test-only-rate','SQL test') returning id into g;
  for i in 1..10 loop
    insert into public.demo_quizzes(guest_id,title,questions) values(g,'Test','[{"id":1,"type":"identification","prompt":"Planet?","answer":"Earth","options":[]}]') returning id into q;
  end loop;
  begin
    insert into public.demo_quizzes(guest_id,title,questions) values(g,'Over quota','[{}]');
    raise exception using errcode='P0002', message='Quiz quota not enforced';
  exception when sqlstate 'P0001' then null;
  end;
  for i in 1..100 loop
    insert into public.demo_results(quiz_id,submission_id,name,answers,score,total) values(q,gen_random_uuid(),'Test','["Earth"]',1,1);
  end loop;
  begin
    insert into public.demo_results(quiz_id,submission_id,name,answers,score,total) values(q,gen_random_uuid(),'Over quota','["Earth"]',1,1);
    raise exception using errcode='P0002', message='Result quota not enforced';
  exception when sqlstate 'P0001' then null;
  end;
  update public.demo_guests set expires_at=now()-interval '1 minute' where id=g;
  begin
    insert into public.demo_results(quiz_id,submission_id,name,answers,score,total) values(q,gen_random_uuid(),'Expired','[]',0,1);
    raise exception using errcode='P0002', message='Expired quiz accepted a submission';
  exception when sqlstate 'P0001' then null;
  end;
  delete from public.demo_guests where id=g;
  if exists(select 1 from public.demo_quizzes where guest_id=g) or exists(select 1 from public.demo_results where quiz_id=q) then raise exception 'Cascade cleanup failed'; end if;
end $$;
rollback;
