-- Fix reference-data keys + live data.gov.in commodity names.
--
-- 1. data.gov.in spells two commodities differently from the 0001 seeds:
--      "Ragi(Finger Millet)"          (no space)
--      "Red gram/Arhar/Tur(whole)"    (not "Arhar (Tur/Red Gram)(Whole)")
--    Verified against live API rows on 2026-11-28 (state=Karnataka).
--    Old aliases are kept so existing data keeps resolving.
-- 2. scripts/seed.ts upserts villages/warehouses with onConflict columns that
--    0001 never made unique, so seeding failed with "no unique constraint".
--    Add the missing unique indexes without editing the applied migration.

insert into crop_aliases (alias, crop_id) values
  ('Ragi(Finger Millet)', 'ragi'),
  ('Red gram/Arhar/Tur(whole)', 'tur')
on conflict (alias) do nothing;

create unique index if not exists villages_name_district
  on villages (name, district);

create unique index if not exists warehouses_name
  on warehouses (name);
