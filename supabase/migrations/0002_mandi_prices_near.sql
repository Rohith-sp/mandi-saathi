-- Mandi Saathi — PostGIS RPC for nearby mandi prices
-- Add a new numbered migration; do not edit applied migrations.

-- Returns non-stale mandi prices for a crop within p_max_km of a point.
-- Distance: straight-line (meters/1000) * 1.3 per CALC_SPEC §3 (no stored
-- road distance in schema). price_age_days computed in Asia/Kolkata.

create or replace function mandi_prices_near(
  p_crop_id text,
  p_lat double precision,
  p_lng double precision,
  p_max_km double precision default 80,
  p_stale_days int default 7
)
returns table (
  mandi_id uuid,
  mandi_name text,
  district text,
  crop_id text,
  price_date date,
  modal_price numeric,
  price_age_days int,
  commission_pct numeric,
  distance_km double precision
)
language sql stable as $$
  with latest as (
    select
      m.id as mandi_id,
      m.name as mandi_name,
      m.district as district,
      p.crop_id as crop_id,
      p.price_date as price_date,
      p.modal_price as modal_price,
      m.commission_pct as commission_pct,
      -- straight-line km * 1.3 road factor
      (st_distance(
        m.location::geography,
        st_makepoint(p_lng, p_lat)::geography
      ) / 1000.0) * 1.3 as distance_km,
      -- whole days between arrival date and today in Asia/Kolkata
      (
        ( (now() at time zone 'Asia/Kolkata')::date - p.price_date )
      ) as price_age_days
    from mandis m
    join prices p on p.mandi_id = m.id and p.crop_id = p_crop_id
    where p.price_date >= ( (now() at time zone 'Asia/Kolkata')::date - p_stale_days )
    order by p.price_date desc, st_distance(m.location::geography, st_makepoint(p_lng, p_lat)::geography) asc
  )
  select
    mandi_id, mandi_name, district, crop_id, price_date,
    modal_price, price_age_days, commission_pct, distance_km
  from (
    select distinct on (mandi_id)
      mandi_id, mandi_name, district, crop_id, price_date,
      modal_price, price_age_days, commission_pct, distance_km
    from latest
    order by mandi_id, price_date desc
  ) t
  where distance_km <= p_max_km
  order by distance_km asc;
$$;
