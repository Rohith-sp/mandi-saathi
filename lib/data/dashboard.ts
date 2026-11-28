import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Data access for the FPO dashboard. Uses Supabase service client (server-side).
 * RLS policies enforce that operators see only their own FPO's data when using
 * the anon key; here we use service client for server routes but filter by fpo_id.
 */

export interface DashboardRequest {
  id: string
  crop_id: string
  crop_name_en: string
  crop_name_kn: string
  quantity_qtl: number
  debt_rupees: number
  village_name: string
  status: string
  pool_interest: boolean | null
  created_at: string
}

export interface DashboardPool {
  id: string
  type: string
  total_qtl: number
  status: string
  pickup_date: string | null
  pickup_place: string | null
  vehicle_note: string | null
  created_at: string
  member_count: number
  target_mandi_name: string | null
}

export interface DashboardPrice {
  mandi_name: string
  district: string
  crop_id: string
  crop_name_en: string
  crop_name_kn: string
  modal_price: number
  price_date: string
  price_age_days: number
  is_stale: boolean
}

/**
 * List sale requests for an FPO, with optional filters.
 */
export async function listRequests({
  supabase,
  fpoId,
  crop,
  week,
  status,
}: {
  supabase: SupabaseClient
  fpoId: string
  crop?: string
  week?: string
  status?: string
}): Promise<DashboardRequest[]> {
  let query = supabase
    .from("sale_requests")
    .select(
      `
      id, crop_id, quantity_qtl, debt_rupees, status, pool_interest, created_at,
      crops (id, name_en, name_kn),
      villages (name)
    `
    )
    .eq("fpo_id", fpoId)
    .order("created_at", { ascending: false })

  if (crop) query = query.eq("crop_id", crop)
  if (week) query = eqSafe(query, "sale_week", week)
  if (status) query = query.eq("status", status)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row: any) => ({
    id: row.id,
    crop_id: row.crop_id,
    crop_name_en: row.crops?.name_en ?? "",
    crop_name_kn: row.crops?.name_kn ?? "",
    quantity_qtl: Number(row.quantity_qtl),
    debt_rupees: row.debt_rupees ?? 0,
    village_name: row.villages?.name ?? "",
    status: row.status,
    pool_interest: row.pool_interest,
    created_at: row.created_at,
  }))
}

function eqSafe(query: any, key: string, value: string) {
  return query.eq(key, value)
}

/**
 * List pools for an FPO.
 */
export async function listPools({
  supabase,
  fpoId,
}: {
  supabase: SupabaseClient
  fpoId: string
}): Promise<DashboardPool[]> {
  const { data, error } = await supabase
    .from("pools")
    .select(
      `
      id, type, total_qtl, status, pickup_date, pickup_place, vehicle_note,
      created_at, target_mandi_id,
      mandis (name),
      pool_members (id)
    `
    )
    .eq("fpo_id", fpoId)
    .order("created_at", { ascending: false })
  if (error) throw error

  return (data ?? []).map((row: any) => ({
    id: row.id,
    type: row.type,
    total_qtl: Number(row.total_qtl),
    status: row.status,
    pickup_date: row.pickup_date,
    pickup_place: row.pickup_place,
    vehicle_note: row.vehicle_note,
    created_at: row.created_at,
    member_count: row.pool_members?.length ?? 0,
    target_mandi_name: row.mandis?.name ?? null,
  }))
}

/**
 * Get a single pool with members.
 */
export async function getPoolWithMembers({
  supabase,
  poolId,
  fpoId,
}: {
  supabase: SupabaseClient
  poolId: string
  fpoId: string
}) {
  const { data: pool, error: poolError } = await supabase
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .eq("fpo_id", fpoId)
    .single()
  if (poolError) return null

  const { data: members, error: membersError } = await supabase
    .from("pool_members")
    .select(
      `
      id, response, responded_at,
      sale_requests (id, crop_id, quantity_qtl, farmers (phone, village_id), villages (name))
    `
    )
    .eq("pool_id", poolId)
  if (membersError) return { pool, members: [] }

  return { pool, members: members ?? [] }
}

/**
 * Latest prices per mandi/crop with staleness badge.
 */
export async function listLatestPrices({
  supabase,
}: {
  supabase: SupabaseClient
}): Promise<DashboardPrice[]> {
  const { data, error } = await supabase
    .from("prices")
    .select(
      `
      mandi_id, crop_id, modal_price, price_date,
      mandis (name, district),
      crops (id, name_en, name_kn)
    `
    )
    .order("price_date", { ascending: false })
  if (error) throw error

  // Group by (mandi_id, crop_id) and take the latest
  const latest = new Map<string, any>()
  for (const row of data ?? []) {
    const key = `${row.mandi_id}|${row.crop_id}`
    if (!latest.has(key) || row.price_date > latest.get(key).price_date) {
      latest.set(key, row)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Array.from(latest.values()).map((row: any) => {
    const priceDate = new Date(`${row.price_date}T12:00:00`)
    const ageDays = Math.round((today.getTime() - priceDate.getTime()) / 86400000)
    return {
      mandi_name: row.mandis?.name ?? "",
      district: row.mandis?.district ?? "",
      crop_id: row.crop_id,
      crop_name_en: row.crops?.name_en ?? "",
      crop_name_kn: row.crops?.name_kn ?? "",
      modal_price: Number(row.modal_price),
      price_date: row.price_date,
      price_age_days: ageDays,
      is_stale: ageDays > 7,
    }
  })
}
