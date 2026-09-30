-- Apply after 006. Existing completed attempts remain unchanged.
begin;
alter table public.attempt_violations add column if not exists event_id uuid;
create unique index if not exists violation_event_once on public.attempt_violations(attempt_id,event_id);
drop function if exists public.report_violation(bigint,text);
create or replace function public.report_violation(p_attempt_id bigint, p_type text, p_event_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare a public.attempts; n integer;
begin
  select * into a from public.attempts where id = p_attempt_id for update;
  if auth.uid() is null or not found or a.user_id <> auth.uid() then raise exception 'Not found'; end if;
  if a.completed_at is not null then return public._attempt_payload(a.id); end if;
  if a.expires_at <= clock_timestamp() then return public._finalize_attempt(a.id,'time_expired'); end if;
  if not exists(select 1 from public.quizzes where id = a.quiz_id and lockdown_enabled) then raise exception 'Lockdown is not enabled'; end if;
  if p_event_id is null or p_type is null or p_type not in ('tab_switch','blur','fullscreen_exit','devtools') then raise exception 'Invalid violation'; end if;
  insert into public.attempt_violations(attempt_id,type,event_id) values(a.id,p_type,p_event_id) on conflict(attempt_id,event_id) do nothing;
  select count(*) into n from public.attempt_violations where attempt_id=a.id;
  if n >= 3 then return public._finalize_attempt(a.id,p_type); end if;
  return public._attempt_payload(a.id);
end $$;
revoke all on function public.report_violation(bigint,text,uuid) from public,anon;
grant execute on function public.report_violation(bigint,text,uuid) to authenticated;
create or replace function public._attempt_payload(p_attempt_id bigint)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'id', a.id,
    'quiz', json_build_object('id', qz.id, 'title', qz.title, 'description', qz.description),
    'started_at', a.started_at,
    'completed_at', a.completed_at,
    'score', a.score,
    'total_questions', a.total_questions,
    'student_name', a.student_name,
    'class_name', a.class_name,
    'first_name', a.first_name, 'last_name', a.last_name,
    'expires_at', a.expires_at, 'server_now', clock_timestamp(),
    'termination_reason', a.termination_reason,
    'violation_count', (select count(*) from public.attempt_violations v where v.attempt_id = a.id),
    'questions', coalesce((
      select json_agg(json_build_object(
        'id', q.id,
        'type', q.type,
        'prompt', q.prompt,
        'options', q.options,
        'explanation', case when a.completed_at is not null then q.explanation else null end,
        'selected_index', ans.selected_index,
        'answer_text', ans.answer_text,
        'is_correct', case when a.completed_at is not null then ans.is_correct else null end
      ) order by aq."position")
      from public.attempt_questions aq
      join public.questions q on q.id = aq.question_id
      left join public.attempt_answers ans on ans.attempt_id = a.id and ans.question_id = q.id
      where aq.attempt_id = a.id
    ), '[]'::json)
  )
  into result
  from public.attempts a
  join public.quizzes qz on qz.id = a.quiz_id
  where a.id = p_attempt_id;

  return result;
end;
$$;
commit;
