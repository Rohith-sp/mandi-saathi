import "server-only"

import { createServiceClient } from "../supabase/server"
import { maskPhone } from "./mask"

/**
 * Data access for /api/advise. Reads only our own Supabase database.
 * No data.gov.in or Open-Meteo calls here.
 *
 * All functions are pure in the sense of data access: they query Supabase
 * and return typed rows. Business logic lives in lib/calc.
 */

export interface VillageRow {
  id: string
  name: string
  district: string
  location: { lat: number; lng: number } | null
  fpo_id: string | null
}

export interface MandiPriceRow {
  mandi_id: string
  mandi_name: string
  district: string
  crop_id: string
  price_date: string
  modal_price: number
  price_age_days: number
  commission_pct: number | null
  distance_km: number
}

export interface ForecastRow {
  r10: number
  r50: number
  r90: number
  years_of_data: number
}

export interface OpenRequest {
  id: string
  quantity_qtl: number
  location: { lat: number; lng: number } | null
  sale_week: string
}

/**
 * Resolve a village by name. Tries exact match, then case-insensitive,
 * then trigram similarity (if pg_trgm is available). Returns null if not found.
 */
export async function resolveVillage({
  supabase,
  villageName,
  district,
}: {
  supabase: ReturnType<typeof createServiceClient>
  villageName: string
  district?: string
}): Promise<VillageRow | null> {
  // 1. Exact match
  let query = supabase
    .from("villages")
    .select("id, name, district, location, fpo_id")
    .eq("name", villageName)
  if (district) query = query.eq("district", district)
  const { data: exact } = await query.maybeSingle()
  if (exact) return mapVillage(exact)

  // 2. Case-insensitive match
  const { data: ci } = await supabase
    .from("villages")
    .select("id, name, district, location, fpo_id")
    .ilike("name", villageName)
  if (ci?.[0]) return mapVillage(ci[0])

  // 3. Trigram similarity (nearest match)
  try {
    const { data: similar } = await supabase.rpc("village_search", {
      search_term: villageName,
      limit: 1,
    })
    if (similar?.[0]) return mapVillage(similar[0])
  } catch {
    // rpc may not be enabled; fall through to null
  }

  return null
}

function mapVillage(row: any): VillageRow {
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    location: row.location
      ? { lat: row.location.coordinates?.[1] ?? 0, lng: row.location.coordinates?.[0] ?? 0 }
      : null,
    fpo_id: row.fpo_id,
  }
}

/**
 * Load the nearest non-stale mandi price for a crop near a village location.
 * Returns the local mandi (nearest with fresh price) and all non-stale
 * mandis within FAR_MANDI_MAX_KM for far-option comparison.
 */
export async function loadMandiPrices({
  supabase,
  cropId,
  lat,
  lng,
  maxDistanceKm = 80,
  staleDays = 7,
}: {
  supabase: ReturnType<typeof createServiceClient>
  cropId: string
  lat: number
  lng: number
  maxDistanceKm?: number
  staleDays?: number
}): Promise<MandiPriceRow[]> {
  try {
    const { data, error } = await supabase.rpc("mandi_prices_near", {
      p_crop_id: cropId,
      p_lat: lat,
      p_lng: lng,
      p_max_km: maxDistanceKm,
      p_stale_days: staleDays,
    })
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      mandi_id: row.mandi_id,
      mandi_name: row.mandi_name,
      district: row.district,
      crop_id: row.crop_id,
      price_date: row.price_date,
      modal_price: Number(row.modal_price),
      price_age_days: Number(row.price_age_days),
      commission_pct: row.commission_pct ?? null,
      distance_km: Number(row.distance_km),
    }))
  } catch {
    // Fallback: simple query without PostGIS if rpc not available
    const { data, error } = await supabase
      .from("prices")
      .select(
        `
        price_date,
        modal_price,
        mandis (id, name, district, commission_pct),
        crops (id)
      `
      )
      .eq("crop_id", cropId)
      .gte(
        "price_date",
        new Date(Date.now() - staleDays * 86400000).toISOString().slice(0, 10)
      )
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      mandi_id: row.mandis.id,
      mandi_name: row.mandis.name,
      district: row.mandis.district,
      crop_id: row.crops.id,
      price_date: row.price_date,
      modal_price: Number(row.modal_price),
      price_age_days: 0,
      commission_pct: row.mandis.commission_pct ?? null,
      distance_km: 0,
    }))
  }
}

/**
 * Load forecast for (mandi, crop, ISO week).
 */
export async function loadForecast({
  supabase,
  mandiId,
  cropId,
  isoWeek,
}: {
  supabase: ReturnType<typeof createServiceClient>
  mandiId: string
  cropId: string
  isoWeek: number
}): Promise<ForecastRow | null> {
  const { data, error } = await supabase
    .from("forecasts")
    .select("r10, r50, r90, years_of_data")
    .eq("mandi_id", mandiId)
    .eq("crop_id", cropId)
    .eq("iso_week", isoWeek)
    .maybeSingle()
  if (error) return null
  return data ? { r10: data.r10, r50: data.r50, r90: data.r90, years_of_data: data.years_of_data } : null
}

/**
 * Load open sale requests (pool_interest not false, not already pooled)
 * within a radius of a location, for the same crop and sale week.
 */
export async function loadOpenRequestsForPool({
  supabase,
  cropId,
  saleWeek,
  lat,
  lng,
  radiusKm = 15,
  excludeRequestId,
}: {
  supabase: ReturnType<typeof createServiceClient>
  cropId: string
  saleWeek: string
  lat: number
  lng: number
  radiusKm?: number
  excludeRequestId?: string
}): Promise<OpenRequest[]> {
  try {
    const { data, error } = await supabase.rpc("open_requests_near", {
      p_crop_id: cropId,
      p_sale_week: saleWeek,
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radiusKm,
      p_exclude_id: excludeRequestId ?? null,
    })
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      id: row.id,
      quantity_qtl: Number(row.quantity_qtl),
      location: row.location
        ? { lat: row.location.coordinates?.[1] ?? 0, lng: row.location.coordinates?.[0] ?? 0 }
        : null,
      sale_week: row.sale_week,
    }))
  } catch {
    // Fallback without PostGIS
    const { data, error } = await supabase
      .from("sale_requests")
      .select("id, quantity_qtl, location, sale_week")
      .eq("crop_id", cropId)
      .eq("sale_week", saleWeek)
      .eq("status", "open")
      .is("pool_interest", true)
    if (error) return []
    return (data ?? []).map((row: any) => ({
      id: row.id,
      quantity_qtl: Number(row.quantity_qtl),
      location: row.location
        ? { lat: row.location.coordinates?.[1] ?? 0, lng: row.location.coordinates?.[0] ?? 0 }
        : null,
      sale_week: row.sale_week,
    }))
  }
}

/**
 * Save a sale request with computed options. Returns the new row id.
 */
export async function saveSaleRequest({
  supabase,
  farmerId,
  fpoId,
  callId,
  cropId,
  quantityQtls,
  debtRupees,
  lat,
  lng,
  saleWeek,
  options,
}: {
  supabase: ReturnType<typeof createServiceClient>
  farmerId: string
  fpoId: string | null
  callId: string
  cropId: string
  quantityQtls: number
  debtRupees: number
  lat: number
  lng: number
  saleWeek: string
  options: object
}): Promise<string> {
  const { data, error } = await supabase
    .from("sale_requests")
    .insert({
      farmer_id: farmerId,
      fpo_id: fpoId,
      call_id: callId,
      crop_id: cropId,
      quantity_qtl: quantityQtls,
      debt_rupees: debtRupees,
      location: point(lat, lng),
      sale_week: saleWeek,
      options,
      pool_interest: null,
      status: "open",
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

function point(lat: number, lng: number): object {
  return { type: "Point", coordinates: [lng, lat] }
}

/**
 * Upsert a farmer by phone. Returns the farmer id.
 */
export async function upsertFarmer({
  supabase,
  phone,
  villageId,
  fpoId,
}: {
  supabase: ReturnType<typeof createServiceClient>
  phone: string
  villageId: string | null
  fpoId: string | null
}): Promise<string> {
  const { data: existing } = await supabase
    .from("farmers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle()
  if (existing) return existing.id

  const { data: inserted, error } = await supabase
    .from("farmers")
    .insert({ phone, village_id: villageId, fpo_id: fpoId })
    .select("id")
    .single()
  if (error) throw error
  return inserted.id
}
