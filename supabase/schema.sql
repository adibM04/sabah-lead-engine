-- Sabah Lead Engine: Supabase schema
-- Run once in the Supabase SQL editor.

create type lead_status as enum (
  'new',          -- scraped, draft ready, not reviewed
  'approved',     -- reviewed, ready to send
  'sent',         -- email sent from Zoho
  'whatsapp',     -- contacted via WhatsApp instead
  'replied',
  'follow_up',    -- needs a second touch
  'won',
  'lost',
  'skipped'       -- not a fit / do not contact
);

create table leads (
  id               uuid primary key default gen_random_uuid(),
  place_id         text unique not null,          -- Google place id: dedupe key across runs
  search_query     text,                          -- e.g. "dental clinic in Kota Kinabalu"
  business_name    text not null,
  category         text,
  area             text,
  address          text,
  phone            text,
  whatsapp_link    text,
  website          text,
  google_maps_url  text,
  rating           numeric(2,1),
  reviews_count    integer default 0,

  email            text,                          -- primary email, null when none found
  all_emails       text[] default '{}',
  has_whatsapp_link boolean default false,
  uses_linktree    boolean default false,

  detected_bottleneck text,
  email_subject    text,
  observation_hook text,
  custom_fix       text,
  email_draft      text,
  draft_edited     text,                          -- your tweaked version, if any

  status           lead_status not null default 'new',
  notes            text,
  sent_at          timestamptz,
  follow_up_at     date,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index leads_status_idx on leads (status);
create index leads_created_idx on leads (created_at desc);
create index leads_category_idx on leads (category);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- Row level security: only authenticated users (you) can touch leads.
-- The Python pipeline uses the service_role key, which bypasses RLS.
alter table leads enable row level security;

create policy "owner read"   on leads for select to authenticated using (true);
create policy "owner update" on leads for update to authenticated using (true) with check (true);
-- No insert/delete policy for the dashboard: the pipeline inserts, you review.
