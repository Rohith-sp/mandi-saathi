import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { CALC_CONFIG } from "../calc/config"
import { kolkataDate, MS_PER_DAY } from "../calc/time"

/**
 * Data access for the FPO dashboard. Uses Supabase server client (anon key + user session).
 * RLS policies enforce that operators see only their own FPO's data.
 */

export async function getOperatorFpoId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: operator } = await supabase
    .from("operators")
    .select("fpo_id")
    .eq("user_id", user.id)
    .maybeSingle()

  return operator?.fpo_id ?? null
}

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
  farmer_phone: string | null
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

export interface DashboardPoolMember {
  id: string
  response: string
  responded_at: string | null
  sale_request_id: string | null
  quantity_qtl: number
  farmer_phone: string | null
  village_name: string
}

export interface DashboardPoolDetail {
  pool: {
    id: string
    type: string
    total_qtl: number
    status: string
    pickup_date: string | null
    pickup_place: string | null
    vehicle_note: string | null
    target_mandi_name: string | null
  }
  members: DashboardPoolMember[]
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
      farmers (phone, villages (name))
    `
    )
    .eq("fpo_id", fpoId)
    .order("created_at", { ascending: false })

  if (crop) query = query.eq("crop_id", crop)
  if (week) query = query.eq("sale_week", week)
  if (status && status !== "all") query = query.eq("status", status)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row: Record<string, unknown>) => {
    const crops = row.crops as { name_en?: string; name_kn?: string } | null
    const farmers = row.farmers as {
      phone?: string | null
      villages?: { name?: string } | null
    } | null
    return {
      id: String(row.id),
      crop_id: String(row.crop_id),
      crop_name_en: crops?.name_en ?? "",
      crop_name_kn: crops?.name_kn ?? "",
      quantity_qtl: Number(row.quantity_qtl),
      debt_rupees: Number(row.debt_rupees ?? 0),
      village_name: farmers?.villages?.name ?? "",
      status: String(row.status),
      pool_interest: (row.pool_interest as boolean | null) ?? null,
      created_at: String(row.created_at),
      farmer_phone: farmers?.phone ?? null,
    }
  })
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

  return (data ?? []).map((row: Record<string, unknown>) => {
    const mandis = row.mandis as { name?: string } | null
    const members = row.pool_members as unknown[] | null
    return {
      id: String(row.id),
      type: String(row.type),
      total_qtl: Number(row.total_qtl),
      status: String(row.status),
      pickup_date: (row.pickup_date as string | null) ?? null,
      pickup_place: (row.pickup_place as string | null) ?? null,
      vehicle_note: (row.vehicle_note as string | null) ?? null,
      created_at: String(row.created_at),
      member_count: members?.length ?? 0,
      target_mandi_name: mandis?.name ?? null,
    }
  })
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
}): Promise<DashboardPoolDetail | null> {
  const { data: pool, error: poolError } = await supabase
    .from("pools")
    .select("id, type, total_qtl, status, pickup_date, pickup_place, vehicle_note, mandis (name)")
    .eq("id", poolId)
    .eq("fpo_id", fpoId)
    .single()
  if (poolError || !pool) return null

  const { data: members, error: membersError } = await supabase
    .from("pool_members")
    .select(
      `
      id, response, responded_at,
      sale_requests (id, quantity_qtl, farmers (phone, villages (name)))
    `
    )
    .eq("pool_id", poolId)

  const mandis = (pool as Record<string, unknown>).mandis as { name?: string } | null
  const formattedPool: DashboardPoolDetail["pool"] = {
    id: String(pool.id),
    type: String(pool.type),
    total_qtl: Number(pool.total_qtl),
    status: String(pool.status),
    pickup_date: (pool.pickup_date as string | null) ?? null,
    pickup_place: (pool.pickup_place as string | null) ?? null,
    vehicle_note: (pool.vehicle_note as string | null) ?? null,
    target_mandi_name: mandis?.name ?? null,
  }

  if (membersError || !members) {
    return { pool: formattedPool, members: [] }
  }

  const formattedMembers: DashboardPoolMember[] = members.map((m: Record<string, unknown>) => {
    const sr = Array.isArray(m.sale_requests)
      ? (m.sale_requests[0] as Record<string, unknown> | undefined)
      : (m.sale_requests as Record<string, unknown> | null)
    const farmer = sr?.farmers as {
      phone?: string | null
      villages?: { name?: string } | null
    } | null
    return {
      id: String(m.id),
      response: String(m.response),
      responded_at: (m.responded_at as string | null) ?? null,
      sale_request_id: sr?.id ? String(sr.id) : null,
      quantity_qtl: Number(sr?.quantity_qtl ?? 0),
      farmer_phone: farmer?.phone ?? null,
      village_name: farmer?.villages?.name ?? "",
    }
  })

  return { pool: formattedPool, members: formattedMembers }
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
  const latest = new Map<string, Record<string, unknown>>()
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = `${row.mandi_id}|${row.crop_id}`
    const existing = latest.get(key)
    if (!existing || String(row.price_date) > String(existing.price_date)) {
      latest.set(key, row)
    }
  }

  const todayStr = kolkataDate(new Date())
  const todayUtc = Date.parse(`${todayStr}T00:00:00Z`)

  return Array.from(latest.values()).map((row) => {
    const mandis = row.mandis as { name?: string; district?: string } | null
    const crops = row.crops as { name_en?: string; name_kn?: string } | null
    const priceDateStr = String(row.price_date)
    const priceUtc = Date.parse(`${priceDateStr}T00:00:00Z`)
    const ageDays = Math.max(0, Math.round((todayUtc - priceUtc) / MS_PER_DAY))
    return {
      mandi_name: mandis?.name ?? "",
      district: mandis?.district ?? "",
      crop_id: String(row.crop_id),
      crop_name_en: crops?.name_en ?? "",
      crop_name_kn: crops?.name_kn ?? "",
      modal_price: Number(row.modal_price),
      price_date: priceDateStr,
      price_age_days: ageDays,
      is_stale: ageDays > CALC_CONFIG.PRICE_STALE_DAYS,
    }
  })
}
