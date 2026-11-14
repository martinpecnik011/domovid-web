-- Subscriptions, content plan, plans catalogue, staff MFA (aal2) gate.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.profiles on delete cascade,
  plan text not null default 'none' check (plan in ('none','10','15','30','custom')),
  videos_included int not null default 0,
  videos_used int not null default 0 check (videos_used >= 0),
  period_start date,
  period_end date,
  commitment_until date,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','overdue')),
  price_net numeric(10,2),
  note text,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles on delete cascade,
  title text not null,
  kind text not null default 'ine' check (kind in ('ponuka','osobna_znacka','tip','nabor','ine')),
  due_date date,
  status text not null default 'planned' check (status in ('planned','in_production','for_approval','approved','published')),
  video_ref text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index content_items_customer_due_idx on public.content_items (customer_id, due_date);

create table public.plans (
  code text primary key,
  videos int,
  price_net numeric,
  per_video numeric,
  label text,
  popular bool,
  commitment_months int
);
insert into public.plans (code, videos, price_net, per_video, label, popular, commitment_months) values
  ('10', 10, 290, 29, 'Štart – 10 videí mesačne', false, 3),
  ('15', 15, 390, 26, 'Rast – 15 videí mesačne', true, 3),
  ('30', 30, 690, 23, 'Pro – 30 videí mesačne', false, 3)
on conflict do nothing;

-- updated_at (+ updated_by on subscriptions)
create function public.touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_table_name = 'subscriptions' and auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

create trigger touch_updated before update on public.subscriptions
  for each row execute function public.touch_updated();
create trigger touch_updated before update on public.content_items
  for each row execute function public.touch_updated();

-- Signup also creates a subscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name');
begin
  insert into public.profiles (id, email, full_name, role) values (new.id, new.email, v_name, 'customer');
  insert into public.conversations (customer_id, title) values (new.id, coalesce(v_name, new.email));
  insert into public.subscriptions (customer_id) values (new.id);
  return new;
end $$;

insert into public.subscriptions (customer_id) select id from public.profiles on conflict (customer_id) do nothing;

-- Staff requires MFA (aal2); all existing policies/guards call is_staff()
create or replace function public.is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff')
     and coalesce(auth.jwt()->>'aal', '') = 'aal2';
$$;

-- Role only (no aal): for the app to decide whether to prompt MFA. Never use in policies.
create function public.is_staff_role() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff');
$$;

-- RLS
alter table public.subscriptions enable row level security;
alter table public.content_items enable row level security;
alter table public.plans enable row level security;

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());
create policy subscriptions_insert on public.subscriptions for insert to authenticated
  with check (public.is_staff());
create policy subscriptions_update on public.subscriptions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy subscriptions_delete on public.subscriptions for delete to authenticated
  using (public.is_staff());

create policy content_items_select on public.content_items for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());
create policy content_items_insert on public.content_items for insert to authenticated
  with check (public.is_staff());
create policy content_items_update on public.content_items for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy content_items_delete on public.content_items for delete to authenticated
  using (public.is_staff());

create policy plans_select on public.plans for select to authenticated using (true);

grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.content_items to authenticated;
grant select on public.plans to authenticated;

-- Realtime (idempotent, guarded)
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['subscriptions','content_items'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
