-- Working variables, internal cash estimate, reference corrections and real
-- client names on the 11 imported quotes (docs/UPDATE_VARIABLES_CASH.md).

-- Variables that persist on the quote
alter table quotes
  add column occupied_building boolean not null default false,
  add column night_work_pct numeric,
  add column programme_days_per_week int,
  add column custom_variables jsonb not null default '[]',
  add column payment_split jsonb not null default '[50, 40, 10]';

-- Settings: occupied productivity factor, collection factor
alter table settings
  add column occupied_productivity_factor numeric not null default 0.85,
  add column collection_factor numeric not null default 1.0;

-- Reference corrections (Tarun, Sep 2026): visa flag resolved, all-in updated
update labour_reference set
  detail = 'Per 2 year contract, 700 AED per person per month across the contract.',
  flag_note = null
where item = 'Visa';
update labour_reference set
  detail = 'Average salary 1,400 to 1,500 per month. Accommodation 350 per month per person (3,500 apartment across 10). Visa 700 per month. All company paid, never deducted from salary. All in about 2,500 per month, about 96 per day.'
where item = 'Salaried staff';
update labour_reference set
  detail = '5 person mixed crew about 480 to 530 per day; at 25 sqm per day about 19 to 21 per sqm.'
where item = 'Crew reference';
insert into labour_reference (sort, item, detail, confidential)
select 7, 'Consumables', 'Blades, paddles, tape, sponges about 25 AED per crew-day. Covered inside the application rate; not part of the cost floor.', false
where not exists (select 1 from labour_reference where item = 'Consumables');

-- Tile ladder flag resolved: 60x120 and 120x60 one band, 50 to 75, midpoint 65
update tile_labour_anchors set
  band_note = 'Band 50 to 75 for 60x120 or 120x60, one band both orientations; around 80x120 use 70 to 75',
  flag_note = null
where tile_area_sqm = 0.72;

-- Real client names and dates on the 11 imported quotes (from the PDFs)
update imported_quotes set client_site = 'Design Infinity', quote_date_text = '17 Nov 2025' where quote_number = 'QT-000168';
update imported_quotes set client_site = 'Ms Marina', quote_date_text = '18 Dec 2025' where quote_number = 'QT-000184';
update imported_quotes set client_site = 'Ms Marina', quote_date_text = '05 Jan 2026' where quote_number = 'QT-000191';
update imported_quotes set client_site = 'Ahlatci Metal Refinery, JAFZA', quote_date_text = '11 Apr 2026' where quote_number = 'QT-000237';
update imported_quotes set client_site = 'White Pearl Interiors', quote_date_text = '02 May 2026' where quote_number = 'QT-000250';
update imported_quotes set client_site = 'Mr Istvan Perger, Saadiyat Island', quote_date_text = '09 May 2026' where quote_number = 'QT-000256';
update imported_quotes set client_site = 'Chalhoub Residence, Palm Jumeirah', quote_date_text = '16 May 2026' where quote_number = 'QT-000263';
update imported_quotes set client_site = 'Retail Mall Sharjah', quote_date_text = '01 Aug 2026' where quote_number = 'QT-000291';
update imported_quotes set client_site = 'Azizi Developments', quote_date_text = '12 Aug 2026' where quote_number = 'QT-000293';
update imported_quotes set client_site = 'Al Wathba Resorts', quote_date_text = '20 Aug 2026' where quote_number = 'QT-000295';
update imported_quotes set client_site = 'China Stone Construction, The Ring Palm Jumeirah', quote_date_text = '27 Aug 2026' where quote_number = 'QT-000304';
