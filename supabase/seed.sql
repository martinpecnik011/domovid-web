-- Minimal columns only (id, email, raw_user_meta_data); real Supabase fills the rest by default.
-- The signup trigger creates profiles + conversations.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a0', 'staff@domovid.test', '{"full_name":"Domovid Staff"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@domovid.test', '{"full_name":"Customer A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@domovid.test', '{"full_name":"Customer B"}');

update public.profiles set role = 'staff' where email = 'staff@domovid.test';

insert into public.messages (conversation_id, sender_id, kind, body)
select c.id, c.customer_id, 'text', 'Ahoj, tu je moje zadanie.' from public.conversations c
 where c.customer_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.messages (conversation_id, sender_id, kind, body, video_ref, timecode)
select c.id, '00000000-0000-0000-0000-0000000000a0', 'edit_request', 'Skrátime úvod.', 'video-1', '00:12'
  from public.conversations c where c.customer_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.messages (conversation_id, sender_id, kind, body)
select c.id, c.customer_id, 'text', 'Dobrý deň, B tu.' from public.conversations c
 where c.customer_id = '00000000-0000-0000-0000-0000000000b1';

update public.subscriptions set plan = '15', videos_included = 15
 where customer_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.content_items (customer_id, title, kind, due_date) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ponuka bytu Bratislava', 'ponuka', current_date + 3),
  ('00000000-0000-0000-0000-0000000000a1', 'Tip: ako sa pripraviť na obhliadku', 'tip', current_date + 7);
