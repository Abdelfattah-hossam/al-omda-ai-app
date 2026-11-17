insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-assets',
  'workspace-assets',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'text/html',
    'application/xml',
    'application/zip',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "workspace_assets_select_own" on storage.objects;
create policy "workspace_assets_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "workspace_assets_insert_own" on storage.objects;
create policy "workspace_assets_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "workspace_assets_update_own" on storage.objects;
create policy "workspace_assets_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "workspace_assets_delete_own" on storage.objects;
create policy "workspace_assets_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
