-- Defense in depth: remove any direct anon grant as well as PUBLIC execution.
revoke all on function public.create_ai_task_with_quota(text, text, text, jsonb, integer) from public;
revoke all on function public.create_ai_task_with_quota(text, text, text, jsonb, integer) from anon;
grant execute on function public.create_ai_task_with_quota(text, text, text, jsonb, integer) to authenticated;
