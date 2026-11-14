-- Admin (staff) accounts by e-mail allow-list, and a private bucket for staff-only tools (calculator).
-- Whoever signs in with a listed e-mail becomes staff automatically; adding an admin later is one insert:
--   insert into public.staff_emails (email) values ('meno@example.com');
-- Staff still needs MFA (aal2) before is_staff() is true, so a listed e-mail alone opens nothing.

create table public.staff_emails (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.staff_emails enable row level security;
-- No policies: only security-definer functions (and the dashboard SQL editor) read or change the list.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
begin
  if exists (select 1 from public.staff_emails where email = lower(new.email)) then
    insert into public.profiles (id, email, full_name, role) values (new.id, new.email, v_name, 'staff');
    return new;
  end if;
  insert into public.profiles (id, email, full_name, role) values (new.id, new.email, v_name, 'customer');
  insert into public.conversations (customer_id, title) values (new.id, coalesce(v_name, new.email));
  insert into public.subscriptions (customer_id) values (new.id);
  return new;
end $$;

-- A listed e-mail that already has a profile is promoted too.
create or replace function public.promote_listed_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'staff' where lower(email) = new.email and role <> 'staff';
  return new;
end $$;
create trigger promote_listed_staff after insert on public.staff_emails
  for each row execute function public.promote_listed_staff();

-- Backfill: users created before the tables existed get their profile (and, for customers, a conversation + subscription).
insert into public.profiles (id, email, role)
select u.id, u.email, 'customer' from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.staff_emails (email) values ('domo.vid001@gmail.com'), ('martinpecnik011@gmail.com')
on conflict (email) do nothing;

insert into public.conversations (customer_id, title)
select p.id, coalesce(p.full_name, p.email) from public.profiles p
where p.role = 'customer' and not exists (select 1 from public.conversations c where c.customer_id = p.id);

insert into public.subscriptions (customer_id)
select p.id from public.profiles p where p.role = 'customer'
on conflict (customer_id, category) do nothing;

-- Private bucket for staff tools; readable only by staff with MFA.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff', 'staff', false, 5242880, array['text/html'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy staff_tools_select on storage.objects for select to authenticated
  using (bucket_id = 'staff' and public.is_staff());
create policy staff_tools_write on storage.objects for insert to authenticated
  with check (bucket_id = 'staff' and public.is_staff());
create policy staff_tools_update on storage.objects for update to authenticated
  using (bucket_id = 'staff' and public.is_staff());
