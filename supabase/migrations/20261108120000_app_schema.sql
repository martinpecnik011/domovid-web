-- Domovid customer app: schema, triggers, RLS, helpers, realtime, export view.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  phone text,
  company text,
  role text not null default 'customer' check (role in ('customer','staff')),
  created_at timestamptz default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid unique references public.profiles on delete cascade,
  title text,
  status text default 'open',
  last_message_at timestamptz,
  created_at timestamptz default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid references public.profiles,
  kind text default 'text' check (kind in ('text','edit_request','link','file','system')),
  body text,
  link_url text,
  video_ref text,
  timecode text,
  created_at timestamptz default now(),
  read_by_staff_at timestamptz,
  read_by_customer_at timestamptz
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages on delete cascade,
  conversation_id uuid references public.conversations,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  original_name text,
  created_at timestamptz default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index attachments_message_idx on public.attachments (message_id);

-- Helpers (security definer so policies do not recurse into RLS)
create function public.is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff');
$$;

create function public.my_conversation_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from public.conversations where customer_id = auth.uid();
$$;

-- Signup: profile + conversation
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
begin
  insert into public.profiles (id, email, full_name, role) values (new.id, new.email, v_name, 'customer');
  insert into public.conversations (customer_id, title) values (new.id, coalesce(v_name, new.email));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Message insert bumps conversation
create function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

create trigger on_message_created after insert on public.messages
  for each row execute function public.touch_conversation();

-- Guards. Calls without a JWT user (seed, service_role, dashboard) are not restricted.
create function public.guard_profile_update() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_staff() then
    raise exception 'only staff can change role';
  end if;
  if new.email is distinct from old.email and auth.uid() is not null and not public.is_staff() then
    raise exception 'only staff can change email';
  end if;
  return new;
end $$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

create function public.guard_message_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_staff()
     and (to_jsonb(new) - 'read_by_customer_at') is distinct from (to_jsonb(old) - 'read_by_customer_at') then
    raise exception 'customers may only update read_by_customer_at';
  end if;
  return new;
end $$;

create trigger guard_message_update before update on public.messages
  for each row execute function public.guard_message_update();

-- RLS
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_staff on public.profiles for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy conversations_select on public.conversations for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());
create policy conversations_update_staff on public.conversations for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy messages_select on public.messages for select to authenticated
  using (conversation_id = public.my_conversation_id() or public.is_staff());
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and (conversation_id = public.my_conversation_id() or public.is_staff()));
create policy messages_update_staff on public.messages for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy messages_update_customer on public.messages for update to authenticated
  using (conversation_id = public.my_conversation_id()) with check (conversation_id = public.my_conversation_id());
create policy messages_delete_staff on public.messages for delete to authenticated
  using (public.is_staff());

create policy attachments_select on public.attachments for select to authenticated
  using (conversation_id = public.my_conversation_id() or public.is_staff());
create policy attachments_insert on public.attachments for insert to authenticated
  with check (message_id is not null and exists (
    select 1 from public.messages m
    where m.id = message_id and m.conversation_id = attachments.conversation_id
      and (public.is_staff() or (m.sender_id = auth.uid() and m.conversation_id = public.my_conversation_id()))));
create policy attachments_delete_staff on public.attachments for delete to authenticated
  using (public.is_staff());

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, delete on public.attachments to authenticated;

-- Export view (staff only)
create view public.export_messages with (security_invoker = true) as
select m.id, m.conversation_id, p.email as customer_email, p.full_name as customer_full_name,
       m.kind, m.body, m.link_url, m.video_ref, m.timecode, m.created_at, s.role as sender_role
from public.messages m
join public.conversations c on c.id = m.conversation_id
join public.profiles p on p.id = c.customer_id
left join public.profiles s on s.id = m.sender_id
where public.is_staff();

grant select on public.export_messages to authenticated;

-- Realtime (idempotent, guarded)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
