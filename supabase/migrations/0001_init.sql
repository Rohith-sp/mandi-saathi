-- Mandi Saathi initial schema
-- Apply with: supabase db push   (or the Supabase SQL editor)

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------- reference data ----------
create table crops (
  id text primary key,                          -- 'ragi', 'tur', 'tomato'
  name_en text not null,
  name_kn text not null,
  storable boolean not null,
  transit_loss_pct numeric not null default 0,
  storage_loss_pct_per_month numeric not null default 0
);

create table crop_aliases (                     -- data.gov.in commodity name -> crop
  alias text primary key,
  crop_id text not null references crops(id)
);

create table fpos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  created_at timestamptz not null default now()
);

create table operators (                        -- dashboard users
  user_id uuid primary key references auth.users(id) on delete cascade,
  fpo_id uuid not null references fpos(id),
  name text
);

create table villages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_kn text,
  taluk text,
  district text not null,
  location geography(point, 4326) not null,
  fpo_id uuid references fpos(id)
);
create index villages_name_idx on villages (lower(name));
create index villages_loc_idx on villages using gist (location);

create table mandis (
  id uuid primary key default gen_random_uuid(),
  name text not null,                           -- must match data.gov.in "market"
  district text not null,
  location geography(point, 4326) not null,
  commission_pct numeric                        -- null -> config default
);
create unique index mandis_name_district on mandis (name, district);
create index mandis_loc_idx on mandis using gist (location);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location geography(point, 4326) not null,
  wdra_registered boolean not null default false,
  charge_per_qtl_month numeric,
  capacity_qtl numeric
);

-- ---------- prices and forecasts ----------
create table prices (
  mandi_id uuid not null references mandis(id),
  crop_id text not null references crops(id),
  price_date date not null,
  min_price numeric not null,
  max_price numeric not null,
  modal_price numeric not null,
  source text not null default 'data.gov.in',
  primary key (mandi_id, crop_id, price_date),
  check (min_price > 0 and modal_price between min_price and max_price)
);

create table forecasts (
  mandi_id uuid not null references mandis(id),
  crop_id text not null references crops(id),
  iso_week int not null check (iso_week between 1 and 53),
  horizon_weeks int not null default 4,
  r10 numeric not null, r50 numeric not null, r90 numeric not null,  -- fractional change
  years_of_data int not null,
  computed_at timestamptz not null default now(),
  primary key (mandi_id, crop_id, iso_week, horizon_weeks)
);

-- ---------- farmers and requests ----------
create table farmers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,                   -- E.164
  village_id uuid references villages(id),
  fpo_id uuid references fpos(id),
  created_at timestamptz not null default now()
);

create table sale_requests (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id),
  fpo_id uuid references fpos(id),
  call_id text unique,                          -- Bolna execution id
  crop_id text not null references crops(id),
  quantity_qtl numeric not null check (quantity_qtl > 0),
  debt_rupees integer not null default 0,
  location geography(point, 4326) not null,
  sale_week date not null,                      -- Monday of the target week (IST)
  options jsonb not null,                       -- full /api/advise output
  pool_interest boolean,                        -- from post-call extraction
  status text not null default 'open' check (status in ('open','pooled','closed')),
  call_duration_s int,
  created_at timestamptz not null default now()
);
create index sale_requests_pool_idx on sale_requests (crop_id, sale_week, status);
create index sale_requests_loc_idx on sale_requests using gist (location);

create table pools (
  id uuid primary key default gen_random_uuid(),
  fpo_id uuid references fpos(id),
  crop_id text not null references crops(id),
  type text not null check (type in ('truck','warehouse')),
  target_mandi_id uuid references mandis(id),
  target_warehouse_id uuid references warehouses(id),
  total_qtl numeric not null,
  sale_week date not null,
  status text not null default 'proposed'
    check (status in ('proposed','confirming','confirmed','cancelled')),
  pickup_date date, pickup_place text, vehicle_note text,
  created_at timestamptz not null default now()
);

create table pool_members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  sale_request_id uuid not null references sale_requests(id),
  response text not null default 'pending' check (response in ('pending','yes','no','no_answer')),
  responded_at timestamptz,
  unique (pool_id, sale_request_id)
);

create table sms_log (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid references farmers(id),
  kind text not null,                           -- 'advice' | 'pool_confirm'
  provider_id text,
  status text not null,                         -- 'queued' | 'failed'
  error text,
  created_at timestamptz not null default now()
);

-- ---------- row level security ----------
-- Server routes use the service-role key (bypasses RLS).
-- The dashboard uses the anon key + user session, so these policies apply.
alter table farmers enable row level security;
alter table sale_requests enable row level security;
alter table pools enable row level security;
alter table pool_members enable row level security;
alter table sms_log enable row level security;

create function current_fpo() returns uuid language sql stable security definer as $$
  select fpo_id from operators where user_id = auth.uid()
$$;

create policy fpo_farmers on farmers for select using (fpo_id = current_fpo());
create policy fpo_requests on sale_requests for select using (fpo_id = current_fpo());
create policy fpo_pools_r on pools for select using (fpo_id = current_fpo());
create policy fpo_members on pool_members for select
  using (exists (select 1 from pools p where p.id = pool_id and p.fpo_id = current_fpo()));

-- Reference tables are readable by any signed-in operator
alter table mandis enable row level security;
alter table prices enable row level security;
alter table crops enable row level security;
create policy read_mandis on mandis for select using (auth.uid() is not null);
create policy read_prices on prices for select using (auth.uid() is not null);
create policy read_crops on crops for select using (auth.uid() is not null);

-- ---------- seed: crops ----------
insert into crops values
  ('ragi',   'Ragi',   'ರಾಗಿ',     true,  0,    0.005),
  ('tur',    'Tur',    'ತೊಗರಿ',    true,  0,    0.005),
  ('tomato', 'Tomato', 'ಟೊಮೇಟೊ', false, 0.03, 0);

insert into crop_aliases values
  ('Ragi (Finger Millet)', 'ragi'),
  ('Arhar (Tur/Red Gram)(Whole)', 'tur'),
  ('Tomato', 'tomato');
-- Verify alias spellings against live data.gov.in rows before relying on them.
