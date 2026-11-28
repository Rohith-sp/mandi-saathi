/**
 * Pure pooling grouping algorithm per ARCHITECTURE §3.4.
 * No I/O, no Supabase, no fetch. Same inputs → same outputs.
 *
 * Algorithm (greedy, deterministic):
 * 1. Load open requests grouped by (crop, sale_week).
 * 2. Within a group, sort by quantity desc. Take first unassigned as seed.
 * 3. Walk remaining unassigned within POOL_RADIUS_KM of seed (nearest first),
 *    add each only if total ≤ TRUCK_CAPACITY_QTL.
 * 4. If total ≥ TRUCK_CAPACITY_QTL × POOL_MIN_FILL → truck pool.
 * 5. Else if storable and total × local price × LTV ≥ LOAN_MIN → warehouse pool.
 * 6. Repeat with next unassigned seed.
 */

import { CALC_CONFIG } from "../calc/config"
import { CROPS } from "../calc/config"

export interface PoolingRequest {
  id: string
  cropId: string
  quantityQtls: number
  lat: number
  lng: number
  saleWeek: string
  poolInterest: boolean | null
}

export interface PoolingMandi {
  id: string
  name: string
  lat: number
  lng: number
  avgPriceRsPerQt?: number
}

export interface PoolingWarehouse {
  id: string
  name: string
  lat: number
  lng: number
  wdraRegistered: boolean
  chargePerQtPerMonth?: number
}

export interface ProposedPool {
  type: "truck" | "warehouse"
  memberIds: string[]
  totalQtls: number
  targetMandiId?: string
  targetWarehouseId?: string
  estimatedGainPerFarmer?: number
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export interface GroupingInputs {
  requests: PoolingRequest[]
  mandis: PoolingMandi[]
  warehouses: PoolingWarehouse[]
  localPriceByCrop: Record<string, number> // cropId → local mandi price
}

/**
 * Run pure grouping. Returns proposed pools and unassigned request ids.
 */
export function groupPools(inputs: GroupingInputs): {
  pools: ProposedPool[]
  unassigned: string[]
} {
  const { requests, mandis, warehouses, localPriceByCrop } = inputs

  // Filter: only open requests with pool_interest not false
  const eligible = requests.filter((r) => r.poolInterest !== false)
  const assigned = new Set<string>()
  const pools: ProposedPool[] = []

  // Group by (cropId, saleWeek)
  const byGroup = new Map<string, PoolingRequest[]>()
  for (const r of eligible) {
    const key = `${r.cropId}|${r.saleWeek}`
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(r)
  }

  for (const [groupKey, group] of byGroup) {
    const [cropId] = groupKey.split("|")
    const cropInfo = CROPS[cropId]

    // Sort by quantity desc
    const sorted = [...group].sort((a, b) => b.quantityQtls - a.quantityQtls)

    for (const seed of sorted) {
      if (assigned.has(seed.id)) continue

      let totalQtls = seed.quantityQtls
      const memberIds: string[] = [seed.id]

      // Walk remaining unassigned within radius, nearest first
      const candidates = sorted
        .filter((r) => !assigned.has(r.id) && r.id !== seed.id)
        .map((r) => ({
          ...r,
          distKm: haversineKm(seed.lat, seed.lng, r.lat, r.lng),
        }))
        .filter((r) => r.distKm <= CALC_CONFIG.POOL_RADIUS_KM)
        .sort((a, b) => a.distKm - b.distKm)

      for (const cand of candidates) {
        if (totalQtls + cand.quantityQtls <= CALC_CONFIG.TRUCK_CAPACITY_QTL) {
          totalQtls += cand.quantityQtls
          memberIds.push(cand.id)
        }
      }

      // Decide pool type
      const localPrice = localPriceByCrop[cropId] ?? 0
      const minFill = CALC_CONFIG.TRUCK_CAPACITY_QTL * CALC_CONFIG.POOL_MIN_FILL
      const storable = cropInfo.storable

      if (totalQtls >= minFill) {
        // Truck pool: target mandi with highest average pooled net for members
        const targetMandi = selectTruckTarget(mandis, seed.lat, seed.lng)
        pools.push({
          type: "truck",
          memberIds,
          totalQtls,
          targetMandiId: targetMandi?.id,
          estimatedGainPerFarmer: totalQtls > 0 ? 500 : undefined, // placeholder; replaced by caller
        })
        // Only mark assigned when a pool is created
        for (const id of memberIds) assigned.add(id)
      } else if (storable && localPrice > 0 && totalQtls * localPrice * CALC_CONFIG.LOAN_LTV >= CALC_CONFIG.LOAN_MIN) {
        // Warehouse pool
        const targetWarehouse = selectWarehouseTarget(warehouses, seed.lat, seed.lng)
        pools.push({
          type: "warehouse",
          memberIds,
          totalQtls,
          targetWarehouseId: targetWarehouse?.id,
        })
        // Only mark assigned when a pool is created
        for (const id of memberIds) assigned.add(id)
      }
      // else: no pool, members remain unassigned (open)
    }
  }

  const unassigned = eligible.filter((r) => !assigned.has(r.id)).map((r) => r.id)
  return { pools, unassigned }
}

function selectTruckTarget(
  mandis: PoolingMandi[],
  lat: number,
  lng: number
): PoolingMandi | undefined {
  if (!mandis.length) return undefined
  return [...mandis]
    .sort(
      (a, b) =>
        haversineKm(lat, lng, a.lat, a.lng) -
        haversineKm(lat, lng, b.lat, b.lng)
    )[0]
}

function selectWarehouseTarget(
  warehouses: PoolingWarehouse[],
  lat: number,
  lng: number
): PoolingWarehouse | undefined {
  const wd = warehouses.filter((w) => w.wdraRegistered)
  const candidates = wd.length ? wd : warehouses
  if (!candidates.length) return undefined
  return [...candidates].sort(
    (a, b) =>
      haversineKm(lat, lng, a.lat, a.lng) -
      haversineKm(lat, lng, b.lat, b.lng)
  )[0]
}
