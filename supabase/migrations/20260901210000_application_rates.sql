-- Application-only rate table (material by client), list prices from Tarun,
-- Sep 2026, confidence H. Tiling interpolates linearly on tile area between
-- the two anchors. Stages link by application_rate_id; any stage without one
-- falls back to its labour tier application rate.

create table application_rates (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  rate numeric,
  anchor_small_area numeric,
  anchor_small_rate numeric,
  anchor_large_area numeric,
  anchor_large_rate numeric,
  source text not null default 'Tarun, Sep 2026',
  confidence confidence not null default 'H',
  sort int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger application_rates_updated_at before update on application_rates
  for each row execute function set_updated_at();

alter table application_rates enable row level security;
create policy application_rates_read on application_rates
  for select to authenticated using (true);
create policy application_rates_admin_write on application_rates
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into application_rates (slug, name, rate, sort) values
  ('waterproofing-liquid', 'Waterproofing, liquid applied, full coat system', 30, 1),
  ('epoxy-coating', 'Epoxy coating', 35, 2),
  ('sl-cementitious', 'Cementitious self-levelling 3 to 6 mm', 30, 3),
  ('screed', 'Screed', 40, 4),
  ('grinding', 'Grinding and surface preparation', 15, 5),
  ('microtopping', 'Microcement and microtopping', 150, 6);
insert into application_rates
  (slug, name, anchor_small_area, anchor_small_rate, anchor_large_area, anchor_large_rate, sort)
values
  ('tiling', 'Tiling, by tile size', 0.36, 55, 1.68, 120, 7);

alter table stages add column application_rate_id uuid references application_rates(id);

update stages set application_rate_id = (select id from application_rates where slug = 'waterproofing-liquid')
  where discipline = 'Waterproofing';
update stages set application_rate_id = (select id from application_rates where slug = 'epoxy-coating')
  where discipline = 'Epoxy flooring';
update stages set application_rate_id = (select id from application_rates where slug = 'sl-cementitious')
  where discipline = 'SL & screed' and name ilike '%level%';
update stages set application_rate_id = (select id from application_rates where slug = 'screed')
  where discipline = 'SL & screed' and name ilike '%screed%';
update stages set application_rate_id = (select id from application_rates where slug = 'grinding')
  where name ilike '%grind%';
update stages set application_rate_id = (select id from application_rates where slug = 'microtopping')
  where discipline = 'Microtopping';
update stages set application_rate_id = (select id from application_rates where slug = 'tiling')
  where discipline = 'Tiling & marble' and name ilike '%til%';

-- History for application-only pricing already exists in imported_quotes:
-- QT-000288 v1 Bugatti (Kerakoll Absolute 95, Microresina 100, Wallcrete 115,
-- all application only) and QT-000303 Foyer (Weber drywall waterproofing 30).
