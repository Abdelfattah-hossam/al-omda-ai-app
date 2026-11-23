begin;
-- Search stays inside the caller's RLS context and returns bounded metadata only.
create or replace function public.search_workspace(p_query text default '') returns jsonb
language sql stable security invoker set search_path='' as $$
 with needle as (select lower(left(trim(coalesce(p_query,'')),200)) q),
 project_matches as (
  select t.id,t.title,t.specialty,hit.step_text,t.created_at,hit.n
  from public.tasks t cross join needle
  cross join lateral (
   select null::text step_text,0::bigint n
   where needle.q='' or strpos(lower(t.title||' '||t.request),needle.q)>0
   union all
   select s.v->>'text',s.n from jsonb_array_elements(t.steps) with ordinality s(v,n)
   where needle.q<>'' and strpos(lower(t.title||' '||t.request),needle.q)=0
    and strpos(lower(coalesce(s.v->>'text','')||' '||coalesce(s.v->>'output','')||' '||coalesce(s.v->>'result','')),needle.q)>0
  )hit
  where t.user_id=(select auth.uid())
  order by t.created_at desc,t.id desc,hit.n limit 12
 ),asset_matches as (
  select o.name as path,split_part(o.name,'/',3) as name,o.created_at as "createdAt",
    o.metadata->>'mimetype' as "mimeType",o.metadata->'size' as size,
    nullif(split_part(o.name,'/',2),'inbox') as "projectId"
  from storage.objects o cross join needle
  where o.bucket_id='workspace-assets' and split_part(o.name,'/',1)=(select auth.uid())::text
    and array_length(string_to_array(o.name,'/'),1)=3
    and (needle.q='' or strpos(lower(split_part(o.name,'/',3)||' '||coalesce(o.metadata->>'mimetype','')),needle.q)>0)
  order by o.created_at desc,o.name desc limit 12
 )
 select jsonb_build_object(
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'specialty',p.specialty,'stepText',p.step_text) order by p.created_at desc,p.id desc,p.n) from project_matches p),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(to_jsonb(a) order by a."createdAt" desc,a.path desc) from asset_matches a),'[]'::jsonb)
 );
$$;
revoke all on function public.search_workspace(text) from public,anon;
grant execute on function public.search_workspace(text) to authenticated;
commit;
