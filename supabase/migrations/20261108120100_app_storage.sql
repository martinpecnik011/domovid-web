-- Private "chat" bucket. Path: <conversation_id>/<message_id>/<filename>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 524288000, array['image/*','video/*','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy chat_select on storage.objects for select to authenticated
  using (bucket_id = 'chat' and (public.is_staff()
         or (storage.foldername(name))[1] = public.my_conversation_id()::text));
create policy chat_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (public.is_staff()
         or (storage.foldername(name))[1] = public.my_conversation_id()::text));
create policy chat_update_staff on storage.objects for update to authenticated
  using (bucket_id = 'chat' and public.is_staff());
create policy chat_delete_staff on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and public.is_staff());
