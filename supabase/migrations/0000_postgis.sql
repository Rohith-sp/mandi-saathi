-- Enable PostGIS + pgcrypto in the `extensions` schema (Supabase convention)
-- and put `extensions` on search_path so `geography` + `st_*` resolve.
-- New numbered migration; applied before 0001_init.sql. Does NOT edit applied migrations.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

alter role postgres set search_path = public, extensions;

-- Fallbacks if PostGIS was already enabled in `public` or not available in `extensions`:
--   create extension if not exists postgis;  -- no-op if already on
