-- Labour model redesign (docs/UPDATE_LABOUR_MODEL.md, Tarun Sep 2026).
-- Labour becomes an editable input with a suggestion; it leaves the cost
-- floor; a quote-level job total distributes pro rata; tile-size labour
-- ladder; labour cost reference data (internal); 11 new quotes into history.

-- Quote-level labour total (head contractor's verbal figure)
alter table quotes add column labour_job_total numeric;

-- Wall installation uplift on the tiling labour suggestion
alter table settings add column tiling_wall_uplift numeric not null default 10;

-- Tile labour ladder: application labour per sqm by tile area, floor install.
-- Interpolate linearly between anchors. Confidence M, source Tarun Sep 2026.
create table tile_labour_anchors (
  id uuid primary key default uuid_generate_v4(),
  tile_area_sqm numeric not null unique,
  labour_per_sqm numeric not null,
  band_note text,
  flag_note text,
  source text not null default 'Tarun, Sep 2026',
  confidence confidence not null default 'M',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tile_labour_anchors_updated_at before update on tile_labour_anchors
  for each row execute function set_updated_at();
alter table tile_labour_anchors enable row level security;
create policy tile_labour_anchors_read on tile_labour_anchors
  for select to authenticated using (true);
create policy tile_labour_anchors_admin_write on tile_labour_anchors
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into tile_labour_anchors (tile_area_sqm, labour_per_sqm, band_note, flag_note) values
  (0.36, 40, 'Band 40 to 60 for 60x60', null),
  (0.72, 65, 'Band 50 to 75 for 60x120 or 120x60', 'Tarun gave 50 to 70 and 70 to 75 for the two orientations; midpoint 65 used, confirm one band'),
  (1.44, 90, 'Band 80 to 100 for 120x120', null),
  (5.76, 115, 'Oversize slabs, 240x240', null);

-- Labour cost reference (admin only, internal). Confidential rows must never
-- reach any client-facing surface or PDF.
create table labour_reference (
  id uuid primary key default uuid_generate_v4(),
  sort int,
  item text not null,
  detail text not null,
  confidential boolean not null default false,
  flag_note text,
  source text not null default 'Tarun, Sep 2026',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger labour_reference_updated_at before update on labour_reference
  for each row execute function set_updated_at();
alter table labour_reference enable row level security;
create policy labour_reference_admin_only on labour_reference
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into labour_reference (sort, item, detail, confidential, flag_note) values
  (1, 'Salaried staff', 'Average salary 1,400 to 1,500 per month. Accommodation 350 per month per person (3,500 apartment across 10). All company paid, never deducted from salary. All in about 70 to 80 per day.', false, null),
  (2, 'Visa', 'Per 2 year contract recorded as 700 per person as stated.', false, 'Confirm if 700 is monthly amortisation or the total across the contract'),
  (3, 'Daily wage', 'General labour 90 to 95 per day. Masons 160 to 180 per day.', false, null),
  (4, 'Overtime', 'Paid at plain hourly rate, salary divided by monthly hours, no multiplier.', false, null),
  (5, 'Piece rate, Al Wathba', 'Paid to crew 50 per sqm with 25 to 30 sqm per day target. Linear work paid 16 per lm; normal linear charge-out 12 to 13 per lm.', true, null),
  (6, 'Crew reference', '5 person mixed crew about 430 to 480 per day; at 25 sqm per day about 17 to 19 per sqm.', false, null);

-- Saveto Vetotop CS536 (QT-000304 screed system), link Books items via queue
insert into product_families (name, discipline, driver, coverage_unit)
select 'Saveto Vetotop CS536', 'SL & screed', 'thickness', 'kg/sqm/mm'
where not exists (select 1 from product_families where name = 'Saveto Vetotop CS536');

-- 11 new quotes into history (rate points verified against the PDFs)
insert into imported_quotes (quote_number, client_site, stage_name, rate, unit, stage_id, family_id, notes)
values
  ('QT-000168', 'Screeding client', 'Screed 1 to 3.5 cm with Topcem Pronto and Eporip, application only', 100, 'sqm',
    (select id from stages where name ilike '%screed%' and discipline = 'SL & screed' limit 1), null,
    'Application only, 220 sqm'),
  ('QT-000237', 'Screed client', 'Screed application only', 60, 'sqm',
    (select id from stages where name ilike '%screed%' and discipline = 'SL & screed' limit 1), null,
    'Application only, 264 sqm, movement joints included'),
  ('QT-000304', 'Vetotop client', 'Screed up to 12 cm with Vetotop CS536, supply and apply', 115, 'sqm',
    (select id from stages where name ilike '%screed%' and discipline = 'SL & screed' limit 1),
    (select id from product_families where name = 'Saveto Vetotop CS536'),
    'Supply and apply, 9,273 sqm'),
  ('QT-000250', 'Screed and WP client', 'Screed up to 15 cm, supply and apply', 165, 'sqm',
    (select id from stages where name ilike '%screed%' and discipline = 'SL & screed' limit 1), null,
    'Supply and apply, 2,100 sqm'),
  ('QT-000250', 'Screed and WP client', 'Waterproofing supply and apply', 85, 'sqm',
    (select id from stages where discipline = 'Waterproofing' and name ilike '%membrane coat%' limit 1), null,
    'Supply and apply, 2,100 sqm'),
  ('QT-000256', 'WP client', 'Waterproofing supply and apply', 90, 'sqm',
    (select id from stages where discipline = 'Waterproofing' and name ilike '%membrane coat%' limit 1), null,
    'Supply and apply, 255 sqm'),
  ('QT-000184', 'Villa client', 'Screed up to 10 cm plus waterproofing bundle', 550, 'sqm',
    null, null, 'Bundle rate, 125 sqm, includes surface prep'),
  ('QT-000191', 'Villa client', 'Screed plus waterproofing plus tile bundle', 900, 'sqm',
    null, null, 'Bundle rate, 238 sqm, includes tile'),
  ('QT-000293', 'Bitumen client', 'Bituminous waterproofing one layer, application only', 20, 'sqm',
    (select id from stages where discipline = 'Bitumen WP' and name ilike '%membrane%' limit 1), null,
    'Application only, 14,620 sqm'),
  ('QT-000293', 'Bitumen client', 'Protection board, application only', 17, 'sqm',
    (select id from stages where discipline = 'Bitumen WP' and name ilike '%protection%' limit 1), null,
    'Application only, 1,800 sqm'),
  ('QT-000291', 'Parking structure', 'Mechanical surface preparation', 15, 'sqm',
    (select id from stages where name ilike '%grind%' limit 1), null, '19,700 sqm'),
  ('QT-000291', 'Parking structure', 'Mapefloor parking ED system, supply and install', 130, 'sqm',
    (select id from stages where discipline = 'Epoxy flooring' and name ilike '%body%' limit 1), null,
    '12,700 sqm'),
  ('QT-000291', 'Parking structure', 'Expansion joint repair and restoration', 150, 'lm',
    (select id from stages where discipline = 'Repair' limit 1), null, '3,500 lm'),
  ('QT-000291', 'Parking structure', 'Backer rod and sealant 20x20 mm', 20, 'lm',
    (select id from stages where discipline = 'Sealants' limit 1), null, '3,500 lm'),
  ('QT-000295', 'Bait Al Hanine restaurant', 'Tile 60x60 supply and install', 209, 'sqm',
    (select id from stages where discipline = 'Tiling & marble' and name ilike '%adhesive%' limit 1), null,
    '400 sqm, porcelain'),
  ('QT-000295', 'Bait Al Hanine restaurant', 'Microtopping seven layer system', 209, 'sqm',
    (select id from stages where discipline = 'Microtopping' limit 1), null, '150 sqm'),
  ('QT-000263', 'Microtopping client', 'Microtopping application, lump', 11000, 'lump',
    (select id from stages where discipline = 'Microtopping' limit 1), null, 'Lump job');
