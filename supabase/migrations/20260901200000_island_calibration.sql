-- Calibration against QT-000299 (Tarun, 1 Sep 2026).
-- Default factors: noise restriction off, upper floor off, island premium
-- carried by the site profile alone.
--
-- Island multiplier 2.0 came from a single tiling comparison and stacked with
-- a noise uplift and a demolition rate that was itself back-solved partly from
-- the island quote (QT-000299 at 85.7). Corrections:
-- 1. Demolition tier back to the mainland evidence only (QT-000269 at 75).
-- 2. Island profile noise flag off; noise is not a default factor.
-- 3. Island labour multiplier 1.55, back-solved from QT-000299 win prices at
--    floor parity on waterproofing and tiling. Single project evidence,
--    confidence M; revisit when a second island job lands.

update labour_tiers
set derived_application_rate_per_sqm = 75,
    notes = trim(both ' ' from coalesce(notes, '') ||
      ' Rate 75 from mainland evidence QT-000269 only; the QT-000299 island figure of 85.7 is excluded so the site multiplier does not double count.')
where name = 'Demolition';

update site_profiles
set labour_multiplier = 1.55,
    noise_restricted = false
where name = 'Island / restricted';

-- Assistant runs on Claude Fable 5 (Tarun, 1 Sep 2026)
update settings set assistant_model = 'claude-fable-5';
