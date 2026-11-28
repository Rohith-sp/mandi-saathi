import "server-only"

import { createServiceClient } from "../lib/supabase/server"

/**
 * Seed reference data structure.
 *
 * This file provides idempotent upsert helpers for reference tables
 * (crops, fpos, operators, villages, mandis, warehouses). It does NOT
 * insert any random or invented data — real mandi names, coordinates,
 * and CSVs must be supplied by the user (see T0.3 in docs/TASKS.md).
 *
 * Mandi names must match data.gov.in `market` strings exactly.
 * Real coordinates must be looked up from OpenStreetMap / Google Maps.
 */

export interface SeedVillage {
  name: string
  name_kn?: string
  taluk?: string
  district: string
  lat: number
  lng: number
  fpo_id?: string
}

export interface SeedMandi {
  name: string // must match data.gov.in "market" exactly
  district: string
  lat: number
  lng: number
  commission_pct?: number
}

export interface SeedWarehouse {
  name: string
  lat: number
  lng: number
  wdra_registered?: boolean
  charge_per_qtl_month?: number
  capacity_qtl?: number
}

export interface SeedFPO {
  name: string
  district: string
}

function point(lat: number, lng: number): object {
  return {
    type: "Point",
    coordinates: [lng, lat], // GeoJSON: [longitude, latitude]
  }
}

export async function seedReferenceData({
  supabase,
  fpo,
  villages = [],
  mandis = [],
  warehouses = [],
  log = console.log,
}: {
  supabase: ReturnType<typeof createServiceClient>
  fpo: SeedFPO
  villages?: SeedVillage[]
  mandis?: SeedMandi[]
  warehouses?: SeedWarehouse[]
  log?: (msg: string) => void
}): Promise<{ fpoId: string; villages: number; mandis: number; warehouses: number }> {
  // Upsert FPO by name + district (idempotent)
  const { data: existingFpo, error: fpoError } = await supabase
    .from("fpos")
    .select("id")
    .eq("name", fpo.name)
    .eq("district", fpo.district)
    .maybeSingle()
  if (fpoError) throw fpoError

  let fpoId: string
  if (existingFpo) {
    fpoId = existingFpo.id
    log(`FPO already exists: ${fpo.name} (${fpoId})`)
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("fpos")
      .insert({ name: fpo.name, district: fpo.district })
      .select("id")
      .single()
    if (insertError) throw insertError
    fpoId = inserted.id
    log(`FPO created: ${fpo.name} (${fpoId})`)
  }

  let villageCount = 0
  for (const v of villages) {
    const { error } = await supabase
      .from("villages")
      .upsert(
        {
          name: v.name,
          name_kn: v.name_kn ?? null,
          taluk: v.taluk ?? null,
          district: v.district,
          location: point(v.lat, v.lng),
          fpo_id: fpoId,
        },
        { onConflict: "name,district" }
      )
    if (error) {
      log(`Village upsert failed ${v.name}: ${error.message}`)
      continue
    }
    villageCount++
  }

  let mandiCount = 0
  for (const m of mandis) {
    const { error } = await supabase
      .from("mandis")
      .upsert(
        {
          name: m.name,
          district: m.district,
          location: point(m.lat, m.lng),
          commission_pct: m.commission_pct ?? null,
        },
        { onConflict: "name,district" }
      )
    if (error) {
      log(`Mandi upsert failed ${m.name}: ${error.message}`)
      continue
    }
    mandiCount++
  }

  let warehouseCount = 0
  for (const w of warehouses) {
    const { error } = await supabase
      .from("warehouses")
      .upsert(
        {
          name: w.name,
          location: point(w.lat, w.lng),
          wdra_registered: w.wdra_registered ?? false,
          charge_per_qtl_month: w.charge_per_qtl_month ?? null,
          capacity_qtl: w.capacity_qtl ?? null,
        },
        { onConflict: "name" }
      )
    if (error) {
      log(`Warehouse upsert failed ${w.name}: ${error.message}`)
      continue
    }
    warehouseCount++
  }

  log(`Seed complete: fpo=${fpoId} villages=${villageCount} mandis=${mandiCount} warehouses=${warehouseCount}`)
  return { fpoId, villages: villageCount, mandis: mandiCount, warehouses: warehouseCount }
}

if (require.main === module) {
  console.error(
    "seed.ts is a library. Import seedReferenceData and call it with real data from T0.3."
  )
  process.exit(1)
}
