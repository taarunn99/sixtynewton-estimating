-- Follow-up mail automation (UPDATE_FINAL_RATEBOOK_MAIL.md part 2): quote
-- lifecycle states, follow-up log, reminder send log, recipients in settings.

alter type quote_status add value if not exists 'followed_up';
alter type quote_status add value if not exists 'expired';

create table quote_followups (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references quotes(id) on delete cascade,
  at timestamptz not null default now(),
  note text,
  created_by uuid references auth.users(id)
);
create index quote_followups_quote_idx on quote_followups (quote_id, at desc);
alter table quote_followups enable row level security;
create policy quote_followups_read on quote_followups
  for select to authenticated using (true);
create policy quote_followups_insert on quote_followups
  for insert to authenticated with check (auth.uid() = created_by);

-- One row per (quote, day mark, anchor date): the dedupe guarantee
create table reminder_log (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references quotes(id) on delete cascade,
  day_mark int not null,
  anchor_date date not null,
  sent_at timestamptz not null default now(),
  resend_id text,
  unique (quote_id, day_mark, anchor_date)
);
alter table reminder_log enable row level security;
create policy reminder_log_read on reminder_log
  for select to authenticated using (true);

-- Reminder recipients, admin editable, never hardcoded
alter table settings add column reminder_recipients jsonb not null default '["ashrat@60newton.com"]';
