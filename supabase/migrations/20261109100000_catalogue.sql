-- Catalogue: plan categories, add-ons, per-category subscriptions.

alter table public.plans
  add column category text not null default 'social' check (category in ('social','video','video_viz')),
  add column unit text not null default 'month' check (unit in ('month','once')),
  add column note text;
alter table public.plans alter column commitment_months drop not null;

insert into public.plans (code, category, unit, videos, price_net, per_video, label, popular, commitment_months, note) values
  ('10', 'social', 'month', 10, 290, 29, 'Štart – 10 videí mesačne', false, 0, null),
  ('15', 'social', 'month', 15, 390, 26, 'Rast – 15 videí mesačne', true, 0, null),
  ('30', 'social', 'month', 30, 690, 23, 'Pro – 30 videí mesačne', false, 0, 'voiceover v cene, bez AI portrétu'),
  ('video_1', 'video', 'once', 1, 50, 50, 'Video z fotiek', false, null, null),
  ('video_4', 'video', 'month', 4, 140, 35, 'Video z fotiek – 4 nehnuteľnosti mesačne', true, null, null),
  ('viz_1', 'video_viz', 'once', 1, 62, 62, 'Video s vizualizáciou', false, null, 'max. 5 vizualizácií na nehnuteľnosť'),
  ('viz_4', 'video_viz', 'month', 4, 200, 50, 'Video s vizualizáciou – 4 nehnuteľnosti mesačne', false, null, 'max. 5 vizualizácií na nehnuteľnosť')
on conflict (code) do update set
  category = excluded.category, unit = excluded.unit, videos = excluded.videos,
  price_net = excluded.price_net, per_video = excluded.per_video, popular = excluded.popular,
  commitment_months = excluded.commitment_months, note = excluded.note;

create table public.addons (
  code text primary key,
  label text,
  price_net numeric,
  unit text check (unit in ('month','video')),
  applies_to text check (applies_to in ('social','video')),
  note text,
  sort int
);
insert into public.addons (code, label, price_net, unit, applies_to, note, sort) values
  ('voice_clone', 'Klon hlasu (voiceover vaším hlasom)', 40, 'month', 'social', null, 1),
  ('digital_twin', 'Digitálne dvojča (hlas + avatar)', 110, 'month', 'social', 'obsahuje klon hlasu', 2),
  ('both_formats', 'Oba formáty 9:16 + 16:9', 10, 'video', 'video', null, 3),
  ('express', 'Expresne do 12 h', 15, 'video', 'video', null, 4)
on conflict (code) do nothing;
alter table public.addons enable row level security;
create policy addons_select on public.addons for select to authenticated using (true);
grant select on public.addons to authenticated;

alter table public.subscriptions
  add column category text not null default 'social' check (category in ('social','video','video_viz')),
  add column addons text[] not null default '{}';
alter table public.subscriptions drop constraint subscriptions_customer_id_key;
alter table public.subscriptions drop constraint subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_customer_category_key unique (customer_id, category);

create function public.validate_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.plan not in ('none','custom')
     and not exists (select 1 from public.plans where code = new.plan and category = new.category) then
    raise exception 'invalid plan for category';
  end if;
  if cardinality(new.addons) > 0 and (new.category <> 'social' or exists (
       select 1 from unnest(new.addons) a
       where not exists (select 1 from public.addons x
                         where x.code = a and x.unit = 'month' and x.applies_to = 'social'))) then
    raise exception 'invalid addon';
  end if;
  return new;
end $$;

create trigger validate_subscription before insert or update on public.subscriptions
  for each row execute function public.validate_subscription();
