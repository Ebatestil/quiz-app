-- Apply after 008. Only the quiz owner can delete an attempt for a retake.
begin;
drop policy if exists attempts_delete_teacher on public.attempts;
create policy attempts_delete_teacher on public.attempts for delete to authenticated
  using (public.is_workspace_user() and exists (
    select 1 from public.quizzes q where q.id = attempts.quiz_id and q.user_id = auth.uid()
  ));
grant delete on public.attempts to authenticated;
-- Existing foreign keys cascade deletion to answers, question order and warnings.
commit;
