-- Apply after 007. Dates use Asia/Manila (Philippine time).
begin;
alter table public.quizzes add column if not exists available_on date;
drop function if exists public.save_quiz_settings(bigint,text,text,boolean,boolean,integer,bigint[]);
create or replace function public.save_quiz_settings(p_quiz_id bigint, p_title text, p_description text, p_published boolean, p_lockdown boolean, p_minutes integer, p_classes bigint[], p_available_on date default null)
returns public.quizzes language plpgsql security definer set search_path = public as $$
declare v_quiz public.quizzes;
begin
  if not public.is_workspace_user() then raise exception 'Workspace account required'; end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id and user_id = auth.uid() for update;
  if not found then raise exception 'Quiz not found'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Enter a quiz title'; end if;
  if exists(select 1 from unnest(p_classes) cid where not exists(select 1 from public.classes c where c.id = cid and c.user_id = auth.uid())) then raise exception 'Choose your own classes'; end if;
  if p_published and coalesce(cardinality(p_classes), 0) = 0 then raise exception 'Assign at least one class before publishing'; end if;
  update public.quizzes set title = trim(p_title), description = nullif(trim(p_description), ''), is_published = p_published, lockdown_enabled = p_lockdown, time_limit_minutes = p_minutes, available_on = p_available_on where id = p_quiz_id returning * into v_quiz;
  delete from public.quiz_classes where quiz_id = p_quiz_id;
  insert into public.quiz_classes select p_quiz_id, cid from (select distinct unnest(p_classes) cid) s;
  return v_quiz;
end $$;
revoke all on function public.save_quiz_settings(bigint,text,text,boolean,boolean,integer,bigint[],date) from public,anon;
grant execute on function public.save_quiz_settings(bigint,text,text,boolean,boolean,integer,bigint[],date) to authenticated;

-- Every entry point creates attempts through this trigger. The deadline is
-- snapshotted: timer or midnight at the end of the assigned day, whichever is earlier.
create or replace function public.set_attempt_deadline() returns trigger
language plpgsql security definer set search_path = public as $$
declare q public.quizzes; closing timestamptz;
begin
  select * into q from public.quizzes where id = new.quiz_id;
  new.started_at := clock_timestamp();
  if q.available_on is not null and (new.started_at at time zone 'Asia/Manila')::date <> q.available_on then
    raise exception 'This quiz is only available on % (Philippine time).', to_char(q.available_on,'FMMonth DD, YYYY');
  end if;
  new.expires_at := case when q.time_limit_minutes is null then null else new.started_at + make_interval(mins => q.time_limit_minutes) end;
  if q.available_on is not null then
    closing := (q.available_on + 1)::timestamp at time zone 'Asia/Manila';
    new.expires_at := least(new.expires_at, closing);
  end if;
  return new;
end $$;
commit;
