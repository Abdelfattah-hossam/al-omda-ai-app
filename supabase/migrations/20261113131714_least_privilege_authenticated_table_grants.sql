-- Rebuild authenticated table privileges from the minimum required by the application.
revoke all on all tables in schema public from authenticated;

grant select, update on public.profiles to authenticated;
grant select, update, delete on public.tasks to authenticated;
grant select on public.ai_daily_usage to authenticated;
grant select, insert, update, delete on public.ai_chat_history to authenticated;
grant select, insert, update, delete on public.ai_user_memory to authenticated;
grant select, insert, update, delete on public.ai_conversations to authenticated;
