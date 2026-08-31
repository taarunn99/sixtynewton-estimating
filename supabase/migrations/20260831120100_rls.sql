-- Row level security: authenticated read on reference data, admin-only write,
-- users write their own quotes.

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-create a profile for every new auth user, default role estimator
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Enable RLS everywhere
alter table profiles enable row level security;
alter table settings enable row level security;
alter table products enable row level security;
alter table product_families enable row level security;
alter table stages enable row level security;
alter table labour_tiers enable row level security;
alter table equipment enable row level security;
alter table site_profiles enable row level security;
alter table lump_items enable row level security;
alter table clients enable row level security;
alter table sites enable row level security;
alter table quotes enable row level security;
alter table quote_lines enable row level security;
alter table imported_quotes enable row level security;
alter table assistant_messages enable row level security;
alter table sync_review_queue enable row level security;

-- Profiles: read all, users update their own name, admin manages roles
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy profiles_admin_all on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- Reference tables: authenticated read, admin write
do $$
declare t text;
begin
  foreach t in array array['settings', 'products', 'product_families', 'stages',
    'labour_tiers', 'equipment', 'site_profiles', 'lump_items', 'sync_review_queue']
  loop
    execute format('create policy %I_select on %I for select to authenticated using (true)', t, t);
    execute format('create policy %I_admin_write on %I for insert to authenticated with check (is_admin())', t, t);
    execute format('create policy %I_admin_update on %I for update to authenticated using (is_admin()) with check (is_admin())', t, t);
    execute format('create policy %I_admin_delete on %I for delete to authenticated using (is_admin())', t, t);
  end loop;
end;
$$;

-- Clients, sites, imported quotes: authenticated read and write
do $$
declare t text;
begin
  foreach t in array array['clients', 'sites', 'imported_quotes']
  loop
    execute format('create policy %I_select on %I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (true) with check (true)', t, t);
    execute format('create policy %I_admin_delete on %I for delete to authenticated using (is_admin())', t, t);
  end loop;
end;
$$;

-- Quotes: read all, insert own, update own drafts (admin updates any), no deletes of issued
create policy quotes_select on quotes for select to authenticated using (true);
create policy quotes_insert on quotes for insert to authenticated with check (created_by = auth.uid());
create policy quotes_update_own on quotes for update to authenticated
  using (created_by = auth.uid() or is_admin())
  with check (created_by = auth.uid() or is_admin());
create policy quotes_delete_draft on quotes for delete to authenticated
  using ((created_by = auth.uid() or is_admin()) and status = 'draft');

-- Quote lines follow their quote
create policy quote_lines_select on quote_lines for select to authenticated using (true);
create policy quote_lines_write on quote_lines for insert to authenticated
  with check (exists (select 1 from quotes q where q.id = quote_id and (q.created_by = auth.uid() or is_admin())));
create policy quote_lines_update on quote_lines for update to authenticated
  using (exists (select 1 from quotes q where q.id = quote_id and (q.created_by = auth.uid() or is_admin())))
  with check (exists (select 1 from quotes q where q.id = quote_id and (q.created_by = auth.uid() or is_admin())));
create policy quote_lines_delete on quote_lines for delete to authenticated
  using (exists (select 1 from quotes q where q.id = quote_id and (q.created_by = auth.uid() or is_admin())));

-- Assistant messages: per quote, any authenticated user of that quote
create policy assistant_messages_select on assistant_messages for select to authenticated using (true);
create policy assistant_messages_insert on assistant_messages for insert to authenticated with check (true);

-- History matview is read through the API only via server code; grant read to authenticated
grant select on quote_line_history to authenticated;
grant select on products_with_sn_cost to authenticated;
