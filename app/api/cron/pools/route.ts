import { NextResponse } from "next/server"
import { checkCronSecret } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { groupPools } from "@/lib/pooling/group"
import { persistPools } from "@/lib/pooling/persist"

export const runtime = "nodejs"

interface GeoPoint {
  coordinates?: [number, number]
}

function extractLatLng(location: unknown): { lat: number; lng: number } | null {
  if (!location || typeof location !== "object") return null
  const coords = (location as GeoPoint).coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords
  if (typeof lat !== "number" || typeof lng !== "number") return null
  return { lat, lng }
}

export async function POST(req: Request) {
  // Auth: Cron secret
  const authHeader = req.headers.get("authorization")
  const secret = (authHeader?.replace(/^Bearer\s/i, "") ?? "") || null
  if (!checkCronSecret(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Load open requests with pool_interest not false
  const { data: requests, error: reqError } = await supabase
    .from("sale_requests")
    .select("id, fpo_id, crop_id, quantity_qtl, location, sale_week, pool_interest")
    .eq("status", "open")
  if (reqError) {
    return NextResponse.json({ error: "db_query_failed" }, { status: 500 })
  }

  if (!requests || requests.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0 })
  }

  // Load mandis, warehouses, and latest prices for targeting & warehouse pool threshold
  const [{ data: mandis }, { data: warehouses }, { data: prices }] = await Promise.all([
    supabase.from("mandis").select("id, name, location"),
    supabase.from("warehouses").select("id, name, location, wdra_registered"),
    supabase
      .from("prices")
      .select("crop_id, modal_price, price_date")
      .order("price_date", { ascending: false }),
  ])

  // Build inputs for pure grouping (skip any row without valid coordinates)
  const poolingRequests = requests.flatMap((r) => {
    const pt = extractLatLng(r.location)
    if (!pt) return []
    return [
      {
        id: r.id,
        fpoId: r.fpo_id ?? null,
        cropId: r.crop_id,
        quantityQtls: Number(r.quantity_qtl),
        lat: pt.lat,
        lng: pt.lng,
        saleWeek: r.sale_week,
        poolInterest: r.pool_interest,
      },
    ]
  })

  const mandiList = (mandis ?? []).flatMap((m) => {
    const pt = extractLatLng(m.location)
    if (!pt) return []
    return [{ id: m.id, name: m.name, lat: pt.lat, lng: pt.lng }]
  })

  const warehouseList = (warehouses ?? []).flatMap((w) => {
    const pt = extractLatLng(w.location)
    if (!pt) return []
    return [
      {
        id: w.id,
        name: w.name,
        lat: pt.lat,
        lng: pt.lng,
        wdraRegistered: w.wdra_registered ?? false,
      },
    ]
  })

  // Latest modal price per crop for warehouse loan threshold check
  const localPriceByCrop: Record<string, number> = {}
  for (const row of prices ?? []) {
    if (localPriceByCrop[row.crop_id] === undefined) {
      localPriceByCrop[row.crop_id] = Number(row.modal_price)
    }
  }

  const { pools, unassigned } = groupPools({
    requests: poolingRequests,
    mandis: mandiList,
    warehouses: warehouseList,
    localPriceByCrop,
  })

  const result = await persistPools({
    supabase,
    pools,
  })

  return NextResponse.json({
    created: result.created,
    skipped: result.skipped,
    unassigned: unassigned.length,
  })
}
