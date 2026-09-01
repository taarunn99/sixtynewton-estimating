-- Quote-level variables surfaced in the ledger's variables panel
alter table quotes add column if not exists programme_base_crew_days numeric;
alter table quotes add column if not exists margin_pct numeric;
alter table quotes add column if not exists overhead_pct numeric;
