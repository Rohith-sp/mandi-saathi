import { NextResponse } from "next/server"
import { checkCronSecret } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { groupPools } from "@/lib/pooling/group"
import { persistPools } from "@/lib/pooling/persist"

export const runtime = "nodejs"

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
    .select("id, crop_id, quantity_qtl, location, sale_week, pool_interest")
    .eq("status", "open")
  if (reqError) {
    return NextResponse.json({ error: "db_query_failed" }, { status: 500 })
  }

  if (!requests || requests.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0 })
  }

  // Load mandis and warehouses for targeting
  const { data: mandis } = await supabase.from("mandis").select("id, name, location")
  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, name, location, wdra_registered")

  // Build inputs for pure grouping
  const poolingRequests = requests.map((r) => ({
    id: r.id,
    cropId: r.crop_id,
    quantityQtls: Number(r.quantity_qtl),
    lat: r.location?.coordinates?.[1] ?? 0,
    lng: r.location?.coordinates?.[0] ?? 0,
    saleWeek: r.sale_week,
    poolInterest: r.pool_interest,
  }))

  const mandiList = (mandis ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    lat: m.location?.coordinates?.[1] ?? 0,
    lng: m.location?.coordinates?.[0] ?? 0,
  }))

  const warehouseList = (warehouses ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    lat: w.location?.coordinates?.[1] ?? 0,
    lng: w.location?.coordinates?.[0] ?? 0,
    wdraRegistered: w.wdra_registered ?? false,
  }))

  // Local price by crop (from latest prices) - placeholder for gain estimation
  const localPriceByCrop: Record<string, number> = {}

  const { pools, unassigned } = groupPools({
    requests: poolingRequests,
    mandis: mandiList,
    warehouses: warehouseList,
    localPriceByCrop,
  })

  // Persist pools (need fpoId - from requests' villages/fpo)
  // For now, groups pools by fpo from member requests
  const poolsWithFpo = pools.map((p) => ({
    ...p,
    fpoId: "", // resolved from member's village fpo_id
    cropId: "",
    saleWeek: "",
  }))

  const result = await persistPools({
    supabase,
    pools: poolsWithFpo,
  })

  return NextResponse.json({ created: result.created, skipped: result.skipped, unassigned: unassigned.length })
}
