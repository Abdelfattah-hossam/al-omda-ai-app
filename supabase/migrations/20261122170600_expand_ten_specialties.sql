-- Extend specialty validation without changing tasks, quotas, or approval rules.
begin;
alter table public.tasks drop constraint if exists tasks_specialty_check;
alter table public.tasks add constraint tasks_specialty_check check (specialty in ('business', 'development', 'design', 'marketing', 'research', 'assistant', 'content', 'social', 'education', 'finance'));

create or replace function omda_private.create_ai_task_with_quota(
  p_title text,
  p_request text,
  p_specialty text,
  p_steps jsonb,
  p_daily_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_reset timestamptz := (((now() at time zone 'utc')::date + 1)::timestamp at time zone 'utc');
  v_used integer := 0;
  v_task public.tasks%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_daily_limit is distinct from 1000
     or p_title is null or char_length(btrim(p_title)) not between 1 and 160
     or p_request is null or char_length(btrim(p_request)) not between 1 and 10000
     or p_specialty is null
     or p_specialty not in ('business', 'development', 'design', 'marketing', 'research', 'assistant', 'content', 'social', 'education', 'finance')
     or jsonb_typeof(p_steps) is distinct from 'array'
     or jsonb_array_length(p_steps) not between 1 and 8 then
    raise exception 'Invalid project task request';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
       or coalesce(char_length(item.value ->> 'id'), 0) not between 1 and 80
       or coalesce(char_length(btrim(item.value ->> 'text')), 0) not between 1 and 1200
       or coalesce(char_length(btrim(item.value ->> 'output')), 0) not between 1 and 1200
       or coalesce(char_length(btrim(item.value ->> 'complete')), 0) not between 1 and 1200
       or item.value ->> 'state' is distinct from 'pending'
       or item.value ?| array['result', 'executedAt', 'executionStatus', 'executionError']
  ) or (
    select count(distinct item.value ->> 'id')
    from jsonb_array_elements(p_steps) as item(value)
  ) <> jsonb_array_length(p_steps) then
    raise exception 'Invalid project task steps';
  end if;

  insert into public.ai_daily_usage (user_id, usage_date, units)
  values (v_user, v_today, 1)
  on conflict (user_id, usage_date) do update
    set units = public.ai_daily_usage.units + excluded.units,
        updated_at = now()
    where public.ai_daily_usage.units + excluded.units <= p_daily_limit
  returning units into v_used;

  if not found then
    select units into v_used
    from public.ai_daily_usage
    where user_id = v_user and usage_date = v_today;
    return jsonb_build_object(
      'saved', false,
      'allowed', false,
      'used', coalesce(v_used, 0),
      'remaining', greatest(0, p_daily_limit - coalesce(v_used, 0)),
      'limit', p_daily_limit,
      'resetAt', v_reset
    );
  end if;

  insert into public.tasks (user_id, title, request, specialty, steps, status)
  values (v_user, btrim(p_title), btrim(p_request), p_specialty, p_steps, 'review')
  returning * into v_task;

  return jsonb_build_object(
    'saved', true,
    'allowed', true,
    'task', to_jsonb(v_task),
    'used', v_used,
    'remaining', greatest(0, p_daily_limit - v_used),
    'limit', p_daily_limit,
    'resetAt', v_reset
  );
end;
$$;

create or replace function public.create_ai_artifact_task(
  p_title text,
  p_request text,
  p_specialty text,
  p_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_language text default 'ar'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_now timestamptz := now();
  v_is_ar boolean := coalesce(p_language, 'ar') <> 'en';
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if (
    select count(*)
      from public.tasks
     where user_id = v_user_id
       and request like '%Generated artifact:%'
       and created_at > now() - interval '1 hour'
  ) >= 40 then
    raise exception 'Chat artifact task log rate limit reached' using errcode = '54000';
  end if;

  if p_title is null or char_length(btrim(p_title)) < 1 or char_length(p_title) > 160 or p_title ~ '[[:cntrl:]]'
     or p_request is null or char_length(p_request) < 1 or char_length(p_request) > 10000
     or p_specialty is null or p_specialty not in ('business', 'development', 'design', 'marketing', 'research', 'assistant', 'content', 'social', 'education', 'finance')
     or p_filename is null or char_length(p_filename) < 1 or char_length(p_filename) > 120
     or position('/' in p_filename) > 0 or position(chr(92) in p_filename) > 0 or p_filename ~ '[[:cntrl:]]'
     or p_mime_type is null or p_mime_type not in (
       'application/pdf',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.openxmlformats-officedocument.presentationml.presentation',
       'text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/javascript',
       'text/x-python', 'application/sql', 'text/css', 'application/dxf',
       'text/html', 'application/xml', 'application/zip',
       'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'
     )
     or p_file_size is null or p_file_size < 1 or p_file_size > 26214400
     or p_language is null or p_language not in ('ar', 'en') then
    raise exception 'Invalid generated artifact metadata' using errcode = '22023';
  end if;

  insert into public.tasks (user_id, title, request, specialty, steps, status)
  values (
    v_user_id,
    btrim(p_title),
    left('Generated artifact: ' || p_filename || ' (' || p_mime_type || ', ' || p_file_size::text || ' bytes). Logged from chat; no additional AI execution was requested.' || E'\n\nUser request: ' || btrim(p_request), 10000),
    p_specialty,
    jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', case when v_is_ar then 'تجهيز محتوى الملف' else 'Prepare file content' end,
        'output', p_filename,
        'complete', case when v_is_ar then 'تم تجهيز المحتوى المطلوب' else 'Requested content is prepared' end,
        'state', 'approved',
        'result', case when v_is_ar then 'تم تجهيز المحتوى من أحدث طلب في المحادثة.' else 'Content was prepared from the latest chat request.' end,
        'executedAt', v_now,
        'executionStatus', 'succeeded'
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', case when v_is_ar then 'إنشاء الملف الفعلي' else 'Generate the actual file' end,
        'output', p_filename,
        'complete', case when v_is_ar then 'تم إنشاء ملف قابل للتنزيل' else 'A downloadable file was created' end,
        'state', 'approved',
        'result', case when v_is_ar then 'تم إنشاء ' || p_filename || ' بحجم ' || p_file_size::text || ' بايت.' else 'Created ' || p_filename || ' (' || p_file_size::text || ' bytes).' end,
        'executedAt', v_now,
        'executionStatus', 'succeeded'
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', case when v_is_ar then 'إرفاق الملف وتسجيله في سجل المهام' else 'Attach the file and record it in Task History' end,
        'output', p_filename,
        'complete', case when v_is_ar then 'ظهر الملف في المحادثة وله سجل مهمة دائم' else 'The file is attached in chat and has a persistent task log' end,
        'state', 'approved',
        'result', case when v_is_ar then 'تم ربط الملف بسجل المهام.' else 'The file was linked to Task History.' end,
        'executedAt', v_now,
        'executionStatus', 'succeeded'
      )
    ),
    'approved'
  )
  returning * into v_task;

  return to_jsonb(v_task);
end;
$$;
commit;
