-- Labour reference model, upper floor factor and logistics suggestions.
-- Correction (1 Sep 2026, Tarun): crew day maths never prices a line. The
-- calculated price stays material plus the tier application rate plus site
-- factors and margin. Crew day cost is a reference shown in the breakdown only,
-- and feeds programme crew-day estimates. All values below are suggestions,
-- source manual, confidence L, editable in admin.

-- Settings: crew reference baseline, upper floor factor, logistics rates
alter table settings
  add column baseline_productivity_sqm_per_crew_day numeric not null default 25,
  add column upper_floor_factor numeric not null default 1.15,
  add column logistics_pickup_cost numeric not null default 0,
  add column logistics_truck_cost numeric not null default 2000,
  add column logistics_truck_capacity_tons numeric not null default 4,
  add column logistics_barge_per_ton numeric not null default 200;

-- The upper floor or roof factor is editable up to 1.20 only
alter table settings
  add constraint settings_upper_floor_factor_range
  check (upper_floor_factor >= 1.0 and upper_floor_factor <= 1.20);

-- Stages: speed weights for programme crew-day estimates only, confidence L.
-- speed_weight scales the baseline productivity (25 sqm per crew-day at 1.0).
-- subsequent_coat_factor is the share of first-coat time each further coat takes.
alter table stages
  add column speed_weight numeric,
  add column speed_weight_confidence confidence default 'L',
  add column subsequent_coat_factor numeric;

-- Site profiles: island flag drives the barge leg of the logistics suggestion
alter table site_profiles
  add column is_island boolean not null default false;
update site_profiles set is_island = true where name ilike '%island%';

-- Crew reference suggestion (source: Tarun, 1 Sep 2026, confidence L):
-- crew of 5, 12,200 AED per month all in (wages 8,200 plus 800 per head for
-- visa, insurance and accommodation), 26 working days, 470 per crew-day.
-- Reference only, never applied to price.
update labour_tiers
set crew_size = coalesce(crew_size, 5),
    crew_day_cost = coalesce(crew_day_cost, 470),
    notes = trim(both ' ' from coalesce(notes, '') ||
      ' Crew reference suggestion, source Tarun 1 Sep 2026, confidence L: crew of 5 at 12,200 AED per month all in, 26 working days, 470 per crew-day. Reference only, never priced.');

-- Speed weight suggestions by discipline (source: Tarun, 1 Sep 2026, confidence L)
update stages set speed_weight = 0.8, subsequent_coat_factor = 1.0
  where discipline in ('Waterproofing', 'Bitumen WP');
update stages set speed_weight = 0.9 where discipline = 'SL & screed';
update stages set speed_weight = 1.0 where discipline = 'Tiling & marble';
update stages set speed_weight = 1.2, subsequent_coat_factor = 0.4
  where discipline = 'Epoxy flooring';
update stages set speed_weight = 1.1 where name ilike '%grind%';
