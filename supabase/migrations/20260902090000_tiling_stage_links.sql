-- Fix tiling application-rate linkage (2 Sep 2026). The tiling list rate
-- belongs on the installation stage (adhesive fixing), not on tile supply,
-- and the imported QT-000299 tile lines had no stage at all, which hid the
-- tile size inputs and the interpolated rate.

update stages set application_rate_id = null
  where name = 'Tile or stone supply' and discipline = 'Tiling & marble';

update stages
set application_rate_id = (select id from application_rates where slug = 'tiling')
where discipline = 'Tiling & marble'
  and name in ('Adhesive (notched + back-butter ≥ 95%)', 'Dry layout and cutting');

-- Imported tile installation lines get the installation stage so tile size,
-- adhesive consumption and the application-only rate all resolve.
update quote_lines
set stage_id = (
  select id from stages
  where discipline = 'Tiling & marble' and name = 'Adhesive (notched + back-butter ≥ 95%)'
)
where stage_id is null and description ilike '%tile installation%';
