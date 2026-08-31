-- Sixty Newton estimating: initial schema (spec section 3)

create extension if not exists "uuid-ossp";

-- Enums
create type user_role as enum ('admin', 'estimator');
create type pack_unit as enum ('kg', 'L', 'sqm', 'lm', 'pcs');
create type cost_flag as enum ('ok', 'zero_cost', 'duplicate_suspect');
create type family_driver as enum ('coverage', 'thickness', 'roll', 'board', 'linear', 'each', 'bought_in', 'labour_only');
create type unit_of_sale as enum ('sqm', 'lm', 'nos', 'lump');
create type coverage_source as enum ('tds', 'quote', 'manual');
create type confidence as enum ('H', 'M', 'L');
create type client_type as enum ('main_contractor', 'developer', 'villa_owner', 'hotel', 'consultant');
create type quote_status as enum ('draft', 'issued', 'revised', 'won', 'lost');
create type tax_mode as enum ('exclusive');
create type pricing_rule as enum ('fixed', 'per_day', 'per_trip', 'per_sqm');

-- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles (roles for RLS)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'estimator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();

-- Settings (single row)
create table settings (
  id uuid primary key default uuid_generate_v4(),
  intercompany_factor numeric not null default 1.09,
  vat_rate numeric not null default 0.05,
  default_margin numeric not null default 0.25,
  default_overhead numeric not null default 0.12,
  default_waste numeric not null default 0.05,
  working_hours_per_day numeric not null default 8,
  working_days_per_week int not null default 6,
  congestion_loss_per_extra_crew numeric not null default 0.10,
  assistant_model text not null default 'claude-sonnet-4-6',
  nudge_model text not null default 'claude-haiku-4-5',
  assistant_token_budget int not null default 200000,
  company_address text not null default 'Shop 12, 14 Street, Al Quoz Industrial Area 4, Dubai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index settings_single_row on settings ((true));
create trigger settings_updated_at before update on settings for each row execute function set_updated_at();
insert into settings default values;

-- Products (synced from Zoho Books)
create table products (
  id uuid primary key default uuid_generate_v4(),
  books_item_id text unique,
  name text not null,
  sku text,
  brand text,
  unit_raw text,
  pack_qty numeric,
  pack_unit pack_unit,
  books_cost numeric,
  books_sell numeric,
  stock_on_hand numeric,
  family_id uuid,
  is_colour_variant boolean not null default false,
  active boolean not null default true,
  cost_flag cost_flag not null default 'ok',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger products_updated_at before update on products for each row execute function set_updated_at();

-- Product families (curated, seeded from workbook Coverage tab)
create table product_families (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  brand text,
  discipline text,
  stage_group text,
  driver family_driver not null,
  representative_product_id uuid references products(id),
  representative_item_name text,
  representative_sku text,
  variants_in_books int,
  pack_qty numeric,
  pack_unit pack_unit,
  coverage_value numeric,
  coverage_unit text,
  default_multiplier numeric,
  waste_pct numeric,
  coverage_source coverage_source,
  coverage_confidence confidence,
  coverage_note text,
  manual_cost numeric,
  manual_pack_qty numeric,
  manual_pack_unit pack_unit,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger product_families_updated_at before update on product_families for each row execute function set_updated_at();

alter table products
  add constraint products_family_fk foreign key (family_id) references product_families(id);

-- Labour tiers
create table labour_tiers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  crew_size int,
  crew_day_cost numeric,
  derived_application_rate_per_sqm numeric,
  rate_confidence confidence default 'M',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger labour_tiers_updated_at before update on labour_tiers for each row execute function set_updated_at();

-- Equipment
create table equipment (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  daily_hire_cost numeric,
  mobilisation_cost numeric,
  owned boolean not null default false,
  consumable_per_sqm numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger equipment_updated_at before update on equipment for each row execute function set_updated_at();

-- Stages (seeded from workbook Stage Catalogue tab)
create table stages (
  id uuid primary key default uuid_generate_v4(),
  sort_order int,
  discipline text not null,
  name text not null,
  driver text,
  unit_of_sale unit_of_sale,
  unit_of_sale_raw text,
  material_formula_shape text,
  default_family_id uuid references product_families(id),
  secondary_family_ids uuid[] not null default '{}',
  labour_tier_id uuid references labour_tiers(id),
  default_productivity_sqm_per_crew_day numeric,
  productivity_confidence confidence,
  cure_days numeric,
  equipment_ids uuid[] not null default '{}',
  consumable_per_sqm numeric,
  books_families_note text,
  observed_rate_note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (discipline, name)
);
create trigger stages_updated_at before update on stages for each row execute function set_updated_at();

-- Site profiles
create table site_profiles (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  allowed_hours_per_day numeric not null default 8,
  allowed_days_per_week int not null default 6,
  noise_restricted boolean not null default false,
  night_work_allowed boolean not null default false,
  mobilisation_multiplier numeric not null default 1.0,
  transport_per_trip numeric not null default 0,
  permit_lump numeric not null default 0,
  parking_per_day numeric not null default 0,
  labour_multiplier numeric not null default 1.0,
  protection_required boolean not null default false,
  garbage_disposal_included boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger site_profiles_updated_at before update on site_profiles for each row execute function set_updated_at();

-- Lump items
create table lump_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  default_amount numeric,
  pricing_rule pricing_rule not null default 'fixed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger lump_items_updated_at before update on lump_items for each row execute function set_updated_at();

-- Clients and sites
create table clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  trn text,
  address text,
  type client_type,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger clients_updated_at before update on clients for each row execute function set_updated_at();

create table sites (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  client_id uuid references clients(id),
  emirate text,
  community text,
  is_island boolean not null default false,
  site_profile_id uuid references site_profiles(id),
  bill_to_client_id uuid references clients(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger sites_updated_at before update on sites for each row execute function set_updated_at();

-- Quotes
create table quotes (
  id uuid primary key default uuid_generate_v4(),
  number text not null,
  revision int not null default 1,
  status quote_status not null default 'draft',
  site_id uuid references sites(id),
  client_id uuid references clients(id),
  quote_date date not null default current_date,
  valid_days int not null default 15,
  tax_mode tax_mode not null default 'exclusive',
  payment_terms text not null default '50% advance, 40% at half completion, 10% on completion',
  programme_days_requested numeric,
  programme_hours_per_day numeric,
  totals jsonb,
  pdf_url text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (number, revision)
);
create trigger quotes_updated_at before update on quotes for each row execute function set_updated_at();

-- Quote lines
create table quote_lines (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references quotes(id) on delete cascade,
  sort int not null default 0,
  stage_id uuid references stages(id),
  family_id uuid references product_families(id),
  description text not null default '',
  qty numeric,
  unit unit_of_sale,
  included boolean not null default true,
  inputs jsonb not null default '{}',
  breakdown jsonb,
  unit_price numeric,
  line_total numeric,
  is_rate_only boolean not null default false,
  nudges jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index quote_lines_quote_idx on quote_lines (quote_id, sort);
create trigger quote_lines_updated_at before update on quote_lines for each row execute function set_updated_at();

-- Imported past quotes (workbook Observed Rates tab, 50 rate points from 19 quotes)
create table imported_quotes (
  id uuid primary key default uuid_generate_v4(),
  imported boolean not null default true,
  stage_name text not null,
  stage_id uuid references stages(id),
  family_id uuid references product_families(id),
  rate numeric,
  unit text,
  quote_number text,
  client_site text,
  quote_date_text text,
  quote_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (stage_name, quote_number, rate)
);
create trigger imported_quotes_updated_at before update on imported_quotes for each row execute function set_updated_at();

-- Assistant messages
create table assistant_messages (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references quotes(id) on delete cascade,
  role text not null,
  content text not null default '',
  tool_calls jsonb,
  tokens_in int,
  tokens_out int,
  model text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index assistant_messages_quote_idx on assistant_messages (quote_id, created_at);

-- Sync review queue (Books items that could not be parsed or matched)
create table sync_review_queue (
  id uuid primary key default uuid_generate_v4(),
  books_item_id text not null unique,
  item_name text not null,
  reason text not null,
  resolved boolean not null default false,
  resolved_family_id uuid references product_families(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sync_review_queue_updated_at before update on sync_review_queue for each row execute function set_updated_at();

-- sn_cost view: Sixty Newton cost is Books cost times the intercompany factor
create view products_with_sn_cost as
select
  p.*,
  case when p.books_cost is null then null
       else round(p.books_cost * s.intercompany_factor, 2)
  end as sn_cost
from products p
cross join settings s;

-- Assistant history lookup: lines of issued quotes
create materialized view quote_line_history as
select
  ql.id as line_id,
  ql.stage_id,
  ql.family_id,
  ql.unit,
  ql.unit_price,
  ql.qty,
  s.site_profile_id,
  s.emirate,
  q.number as quote_number,
  q.revision,
  q.quote_date
from quote_lines ql
join quotes q on q.id = ql.quote_id
left join sites s on s.id = q.site_id
where q.status in ('issued', 'revised', 'won', 'lost')
  and ql.included;
create index quote_line_history_idx on quote_line_history (stage_id, family_id);
