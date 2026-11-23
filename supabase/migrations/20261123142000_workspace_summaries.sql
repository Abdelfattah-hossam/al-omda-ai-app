begin;
-- Project lists omit result bodies, revision copies and comments. RLS remains active.
create or replace function public.get_workspace_summaries(p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc),'[]'::jsonb)
 from (
  select t.id,t.title,t.request,t.specialty,t.status,t.created_at,t.updated_at,
   (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',s.v->'id','text',s.v->'text','state',s.v->'state','executionStatus',s.v->'executionStatus',
    'hasResult',coalesce(length(s.v->>'result')>0,false)
   )) order by s.n),'[]'::jsonb) from jsonb_array_elements(t.steps) with ordinality s(v,n)) as steps
  from public.tasks t where t.user_id=(select auth.uid())
  order by t.created_at desc,t.id desc limit 101 offset greatest(0,least(p_offset,2147483647))
 )p;
$$;
revoke all on function public.get_workspace_summaries(integer) from public,anon;
grant execute on function public.get_workspace_summaries(integer) to authenticated;
commit;
